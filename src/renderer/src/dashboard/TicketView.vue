<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import type { DevServer, MrRow, Session, SessionDetail, TerminalMode } from '../types'
import type { TaskRow } from '../taskview'
import { splitTag, statusLane } from '../taskview'
import { plainSession } from '../cards'
import { ago } from '../display'
import { rowChip } from './dashboard'
import ClaudeTerminal from './ClaudeTerminal.vue'
import QuickActions from './QuickActions.vue'
import TicketPanel from './TicketPanel.vue'
import CodeView from './CodeView.vue'
import TestCasesDialog from './TestCasesDialog.vue'
import ServerPanel from './ServerPanel.vue'
import StatusMenu from './StatusMenu.vue'
import Splitter from './Splitter.vue'
import { clampSize, readSize, writeSize, readFlag } from './dashboard'
import MenuButton from './MenuButton.vue'
import Icon from './Icon.vue'
import type { MenuItem } from '../types'
import StartSessionPopover from '../components/StartSessionPopover.vue'

const props = defineProps<{ row: TaskRow; servers: DevServer[]; mrUrl: string | null; mr?: MrRow | null }>()
const emit = defineEmits<{ 'open-mr': [key: string] }>()

const DETAIL_INTERVAL_MS = 5000

const tab = ref<'work' | 'server' | 'ticket'>('work')
const isCodeOpen = ref(!readFlag('dash.codeHidden'))
const isClaudeOpen = ref(!readFlag('dash.claudeHidden'))
const isBothOpen = computed(() => isCodeOpen.value && isClaudeOpen.value)
const toggleCode = (): void => {
  isCodeOpen.value = !isCodeOpen.value
  if (!isCodeOpen.value) isClaudeOpen.value = true
  writeSize('dash.codeHidden', !isCodeOpen.value)
  writeSize('dash.claudeHidden', !isClaudeOpen.value)
}
const toggleClaude = (): void => {
  isClaudeOpen.value = !isClaudeOpen.value
  if (!isClaudeOpen.value) isCodeOpen.value = true
  writeSize('dash.codeHidden', !isCodeOpen.value)
  writeSize('dash.claudeHidden', !isClaudeOpen.value)
}
const showClaude = (): void => {
  tab.value = 'work'
  if (!isClaudeOpen.value) toggleClaude()
}
const panes = ref<HTMLDivElement | null>(null)
const codeWidth = ref(readSize('dash.codeWidth', 760))
const resizeCode = (delta: number): void => {
  const total = panes.value?.clientWidth ?? 1400
  codeWidth.value = clampSize(codeWidth.value + delta, 320, total - 320)
}
const saveCodeWidth = (): void => writeSize('dash.codeWidth', codeWidth.value)
const pickedId = ref<string | null>(null)
const modes = ref<Record<string, TerminalMode | null>>({})
const ticks = ref<Record<string, number>>({})
const openedIds = ref<string[]>([])
const detail = ref<SessionDetail | null>(null)
const isStartOpen = ref(false)
const isTestCasesOpen = ref(false)
let detailLoadedAt = 0
let detailTimer: ReturnType<typeof setTimeout> | null = null
let remountTimer: ReturnType<typeof setTimeout> | null = null

const defaultSession = (): Session | undefined => props.row.sessions.find((s) => s.isLive) ?? props.row.sessions[0]
const session = computed(() => props.row.sessions.find((s) => s.id === pickedId.value) ?? defaultSession())
const mode = computed(() => (session.value ? (modes.value[session.value.id] ?? null) : null))
const setMode = (id: string, next: TerminalMode | null): void => {
  modes.value = { ...modes.value, [id]: next }
}
const openedSessions = computed(() =>
  openedIds.value.flatMap((id) => props.row.sessions.find((s) => s.id === id) ?? [])
)
const STATUS_DOT: Record<string, string> = {
  working: '#6aa9ff',
  waiting: '#e8b84a',
  checkout: '#5ec8ff',
  idle: '#666d78',
  closed: '#3a414c'
}
const tabSessions = computed(() => {
  const shown = props.row.sessions.filter((s) => s.isLive || openedIds.value.includes(s.id))
  return shown.length ? shown : props.row.sessions.slice(0, 1)
})
const isExplain = (s: Session): boolean => /\bexplain$/.test(s.name ?? '')
const sessionLabel = (s: Session): string => {
  const name = s.name ?? ''
  if (/\bexplain$/.test(name)) return 'Explain'
  return name.replace(new RegExp(`^${props.row.key}\\s*`), '') || props.row.key
}
const implementingSessionId = computed(
  () => props.row.sessions.find((s) => !/\bexplain$/.test(s.name ?? ''))?.id ?? session.value?.id ?? null
)
const chip = computed(() => rowChip(props.row))
const server = computed(() => props.servers.find((s) => s.key === props.row.key) ?? null)
const lane = computed(() => statusLane(props.row.status))
const title = computed(() => splitTag(props.row.summary))
const facts = computed(() => {
  const list: string[] = []
  if (session.value?.model) list.push(session.value.model.replace(/^claude-/, ''))
  if (session.value?.contextTokens) list.push(`${Math.round(session.value.contextTokens / 1000)}k context`)
  if (detail.value) list.push(`${detail.value.turns} turns`)
  return list
})

const openJira = (): void => window.api.openTicket(props.row.key)
const openCode = (): void => window.api.openTaskCode(props.row.key)
const openMr = (): void => window.api.openMr(props.row.key)
const pick = (id: string): void => {
  pickedId.value = id
}
const pickFromSelect = (e: Event): void => pick((e.target as HTMLSelectElement).value)
const stopTurn = (): void => {
  if (session.value) window.api.stopTurn(session.value.id)
}
const copyResume = (): void => {
  if (session.value) window.api.copyResume(session.value.id)
}
interface TerminalHandle {
  takeOver: () => Promise<boolean>
  paste: (text: string) => void
}
const terminals = new Map<string, TerminalHandle>()
const bindTerminal =
  (id: string) =>
  (el: unknown): void => {
    if (el) terminals.set(id, el as TerminalHandle)
    else terminals.delete(id)
  }
const activeTerminal = (): TerminalHandle | undefined => (session.value ? terminals.get(session.value.id) : undefined)
const explainInSession = (sessionId: string): void => {
  pick(sessionId)
  showClaude()
}
const askClaude = (text: string): void => {
  showClaude()
  activeTerminal()?.paste(text)
}
const openItems = computed<MenuItem[]>(() => [
  { label: 'VS Code — code only', hint: "The ticket's worktree, no Claude session", icon: 'code', run: openCode },
  {
    label: 'VS Code — with this session',
    icon: 'terminal',
    hint: 'Moves the session to the right pane in VS Code',
    isDisabled: !session.value,
    run: () => void openInVscode()
  },
  { label: 'Merge request', hint: props.mrUrl ?? 'No merge request yet', icon: 'pr', isDisabled: !props.mrUrl, run: openMr },
  { label: 'Jira', hint: props.row.key, icon: 'ticket', run: openJira }
])
const moreItems = computed<MenuItem[]>(() => [
  { label: 'Test cases to Jira', hint: 'Write test cases and post them as a comment', icon: 'clipboard', run: () => (isTestCasesOpen.value = true) },
  { label: 'Copy resume command', hint: 'claude --resume … for a terminal', icon: 'copy', isDisabled: !session.value, run: copyResume }
])
const takeOverHere = async (): Promise<boolean> => activeTerminal()?.takeOver() ?? false
const remountSession = (id: string): void => {
  setMode(id, null)
  ticks.value = { ...ticks.value, [id]: (ticks.value[id] ?? 0) + 1 }
}
const remountTerminal = (): void => {
  if (session.value) remountSession(session.value.id)
}
const openInVscode = async (): Promise<void> => {
  if (!session.value) return
  await window.api.openInVscode(session.value.id)
  remountTimer = setTimeout(remountTerminal, 1500)
}
const focusVscode = (): void => {
  if (session.value) window.api.openSession(plainSession(session.value))
}
const loadDetail = async (): Promise<void> => {
  const id = session.value?.id ?? null
  detailLoadedAt = Date.now()
  const next = id ? await window.api.getSessionDetail(id) : null
  if ((session.value?.id ?? null) === id) detail.value = next
}
const scheduleDetail = (): void => {
  if (detailTimer) return
  detailTimer = setTimeout(
    () => {
      detailTimer = null
      void loadDetail()
    },
    Math.max(0, DETAIL_INTERVAL_MS - (Date.now() - detailLoadedAt))
  )
}

onMounted(async () => {
  void loadDetail()
})
const START_WAIT_MS = 90000
const pendingStart = ref<{ id: string | null; at: number; isLate: boolean } | null>(null)
let pendingTimer: ReturnType<typeof setTimeout> | null = null
const onStarted = (id: string | null): void => {
  pendingStart.value = { id, at: Date.now(), isLate: false }
  showClaude()
  if (pendingTimer) clearTimeout(pendingTimer)
  pendingTimer = setTimeout(() => {
    if (pendingStart.value) pendingStart.value = { ...pendingStart.value, isLate: true }
  }, START_WAIT_MS)
}
const findStarted = (): Session | undefined => {
  const pending = pendingStart.value
  if (!pending) return undefined
  const fresh = props.row.sessions.filter((s) => s.lastActive >= pending.at - 60000)
  return pending.id ? props.row.sessions.find((s) => s.id.startsWith(pending.id as string)) : fresh.sort((a, b) => b.lastActive - a.lastActive)[0]
}
watch(
  () => props.row.sessions.map((s) => s.id).join(','),
  () => {
    const found = findStarted()
    if (!found) return
    pendingStart.value = null
    if (pendingTimer) clearTimeout(pendingTimer)
    pick(found.id)
  }
)
watch(() => session.value?.id, loadDetail)
watch(
  () => session.value?.id,
  (id) => {
    if (id && !openedIds.value.includes(id)) openedIds.value = [...openedIds.value, id]
  },
  { immediate: true }
)
watch(() => session.value?.lastActive, scheduleDetail)
onBeforeUnmount(() => {
  if (detailTimer) clearTimeout(detailTimer)
  if (remountTimer) clearTimeout(remountTimer)
  if (pendingTimer) clearTimeout(pendingTimer)
})
</script>

<template>
  <div class="view">
    <header class="head">
      <div class="line">
        <button class="key" title="Open in Jira" @click="openJira">{{ row.key }}</button>
        <StatusMenu :ticket-key="row.key" :status="row.status" :color="row.isFromJira ? lane.color : '#666d78'" :is-from-jira="row.isFromJira" />
        <span v-if="title.tag" class="tag">{{ title.tag }}</span>
        <button v-if="mr" class="mrlink" :class="{ attn: mr.openThreads > 0 }" title="Open this ticket's merge request" @click="emit('open-mr', mr.key)">
          <Icon name="pr" :size="13" />!{{ mr.iid }}<span v-if="mr.isDraft" class="dr">Draft</span><span v-if="mr.openThreads" class="thr"><Icon name="message" :size="11" />{{ mr.openThreads }}</span><span v-if="mr.approvals" class="ap"><Icon name="check" :size="11" />{{ mr.approvals }}</span>
        </button>
        <h1 class="title" :title="title.text">{{ title.text || 'No title' }}</h1>
        <button v-if="server" class="srv" title="Show the dev server" @click="tab = 'server'"><i />localhost:{{ server.port }}</button>
        <span v-if="chip" class="state" :style="{ color: chip.color }"><i :style="{ background: chip.color }" />{{ chip.label }}</span>
      </div>
      <div class="bar">
        <nav class="tabs">
          <button :class="{ on: tab === 'work' }" @click="tab = 'work'"><Icon name="code" :size="15" />Work</button>
          <button :class="{ on: tab === 'server' }" @click="tab = 'server'"><Icon name="server" :size="15" />Server<span v-if="server" class="dot" /></button>
          <button :class="{ on: tab === 'ticket' }" @click="tab = 'ticket'"><Icon name="fileText" :size="15" />Ticket</button>
        </nav>
        <span class="grow" />
        <span v-if="facts.length" class="facts">{{ facts.join('  ·  ') }}</span>
        <div v-if="tab === 'work'" class="seg" title="Show or hide the panes">
          <button :class="{ on: isCodeOpen }" @click="toggleCode"><Icon name="code" :size="14" />Code</button>
          <button :class="{ on: isClaudeOpen }" @click="toggleClaude"><Icon name="terminal" :size="14" />Claude</button>
        </div>
        <button class="btn" :class="{ primary: !row.sessions.length, on: isStartOpen }" @click="isStartOpen = !isStartOpen">
          <Icon name="plus" :size="15" />{{ row.sessions.length ? 'New session' : 'Start session' }}
        </button>
        <MenuButton label="Open in" icon="external" :items="openItems" />
        <MenuButton label="More actions" icon="more" is-icon title="More actions" :items="moreItems" />
      </div>
      <template v-if="isStartOpen">
        <div class="scrim" @click="isStartOpen = false" />
        <div class="startbox">
          <StartSessionPopover :row="row" is-background-only @started="onStarted" @close="isStartOpen = false" />
        </div>
      </template>
    </header>

    <div v-show="tab === 'work'" ref="panes" class="panes">
      <section v-show="isCodeOpen" class="pane code" :style="isBothOpen ? { flex: 'none', width: `${codeWidth}px` } : undefined">
        <CodeView
          :cwd="session?.projectPath ?? null"
          :ticket-key="row.key"
          :ticket-title="title.text"
          :can-ask="mode === 'attach'"
          :source-session-id="implementingSessionId"
          @ask="askClaude"
          @explain="explainInSession"
        />
      </section>
      <Splitter v-if="isBothOpen" @resize="resizeCode" @done="saveCodeWidth" />
      <section v-show="isClaudeOpen" class="pane claude">
        <div class="chead">
          <div class="stabs">
            <button
              v-for="s in tabSessions"
              :key="s.id"
              :class="{ on: s.id === session?.id }"
              :title="`${s.name ?? s.projectName} · ${s.status}`"
              @click="pick(s.id)"
            >
              <Icon v-if="isExplain(s)" name="sparkles" :size="13" />
              <i v-else :style="{ background: STATUS_DOT[s.status] ?? '#666d78' }" />{{ sessionLabel(s) }}
            </button>
            <select v-if="row.sessions.length > tabSessions.length" class="older" :value="''" @change="pickFromSelect">
              <option value="" disabled>Older sessions…</option>
              <option v-for="s in row.sessions" :key="s.id" :value="s.id">{{ s.name ?? s.projectName }} · {{ ago(s.lastActive) }}</option>
            </select>
          </div>
          <button class="stop" :disabled="mode !== 'attach'" title="Interrupt Claude's current turn (Esc)" @click="stopTurn"><Icon name="stop" :size="12" />Stop</button>
        </div>
        <ClaudeTerminal
          v-for="s in openedSessions"
          v-show="s.id === session?.id"
          :key="`${s.id}-${ticks[s.id] ?? 0}`"
          :ref="bindTerminal(s.id)"
          :session-id="s.id"
          :project-name="s.projectName"
          @mode="setMode(s.id, $event)"
          @exited="remountSession(s.id)"
          @focus-vscode="focusVscode"
        />
        <div v-if="pendingStart" class="starting">
          <div class="scard">
            <h3><Icon name="bot" :size="18" />Starting a Claude session for {{ row.key }}</h3>
            <ol>
              <li class="done"><Icon name="check" :size="14" />Claude started in the background in the ticket's worktree</li>
              <li :class="{ active: !pendingStart.isLate, late: pendingStart.isLate }">
                <span v-if="!pendingStart.isLate" class="spin" /><Icon v-else name="info" :size="14" />
                {{ pendingStart.isLate ? 'The session has not shown up yet. It may still be starting.' : 'Waiting for the session to show up' }}
              </li>
              <li><Icon name="terminal" :size="14" />Attaching it here, in the dashboard</li>
            </ol>
            <button v-if="pendingStart.isLate" class="btn" @click="pendingStart = null">Stop waiting</button>
          </div>
        </div>
        <div v-else-if="!session" class="empty">
          <Icon name="bot" :size="34" />
          <p>No Claude session for {{ row.key }} yet.</p>
          <button class="btn primary" @click="isStartOpen = true"><Icon name="play" :size="13" />Start session</button>
        </div>
        <QuickActions :session-id="session?.id ?? null" :mode="mode" :take-over="takeOverHere" />
      </section>
    </div>

    <section v-show="tab === 'server'" class="pane">
      <ServerPanel :ticket-key="row.key" :cwd="session?.projectPath ?? null" :servers="servers" />
    </section>

    <section v-show="tab === 'ticket'" class="pane">
      <TicketPanel
        :ticket-key="row.key"
        :status="row.status"
        :is-from-jira="row.isFromJira"
        :mr-url="mrUrl"
        @test-cases="isTestCasesOpen = true"
      />
    </section>

    <TestCasesDialog
      v-if="isTestCasesOpen"
      :ticket-key="row.key"
      :session-id="session?.id ?? null"
      :is-writable="mode === 'attach'"
      @close="isTestCasesOpen = false"
    />
  </div>
</template>

<style scoped>
.view {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-1);
}
.head {
  position: relative;
  flex: none;
  padding: 0 16px;
  background: var(--bg-1);
  border-bottom: 1px solid var(--line);
}
.line {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  height: 48px;
  font-size: 12px;
}
.key {
  flex: none;
  padding: 0;
  font: 600 13px var(--font-mono);
  color: var(--text-2);
  background: none;
  border: none;
  cursor: pointer;
}
.key:hover {
  color: var(--accent);
}
.tag {
  flex: none;
  max-width: 160px;
  padding: 1px 7px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--text-3);
  background: var(--bg-3);
  border-radius: 5px;
}
.mrlink {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 22px;
  padding: 0 9px;
  font: 600 12px var(--font-ui);
  color: var(--text-2);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 11px;
  cursor: pointer;
}
.mrlink:hover {
  color: var(--text);
  border-color: var(--line-3);
}
.mrlink.attn {
  color: var(--warn);
  border-color: rgba(232, 184, 74, 0.5);
}
.mrlink .thr,
.mrlink .ap {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.mrlink .ap {
  color: var(--ok);
}
.mrlink .dr {
  padding: 0 5px;
  font-size: 10px;
  line-height: 15px;
  color: var(--bg-0);
  background: var(--warn);
  border-radius: 4px;
}
.title {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 600 15px var(--font-ui);
  color: var(--text);
}
.grow {
  flex: 1;
}
.srv {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 22px;
  padding: 0 9px;
  font: 11.5px var(--font-mono);
  color: var(--ok);
  background: rgba(61, 214, 140, 0.08);
  border: 1px solid var(--ok-line);
  border-radius: 11px;
  cursor: pointer;
}
.srv:hover {
  border-color: var(--ok);
}
.srv i,
.dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ok);
}
.dot {
  margin-left: 2px;
}
.state {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
  white-space: nowrap;
}
.state i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.bar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 42px;
}
.tabs {
  display: flex;
  gap: 4px;
  align-self: stretch;
}
.tabs button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  font: 500 13px var(--font-ui);
  color: var(--text-4);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
}
.tabs button:hover {
  color: var(--text-2);
}
.tabs button.on {
  color: var(--text);
  border-bottom-color: var(--accent);
}
.facts {
  margin-right: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: pre;
  font-size: 12px;
  color: var(--text-4);
}
.seg {
  flex: none;
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  background: var(--bg-0);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.seg button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 10px;
  font: 500 12.5px var(--font-ui);
  color: var(--text-4);
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.seg button:hover {
  color: var(--text-2);
}
.seg button.on {
  color: var(--text);
  background: var(--bg-4);
}
.btn {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  font: 500 12.5px var(--font-ui);
  color: var(--text-2);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 7px;
  cursor: pointer;
}
.btn:hover:not(:disabled),
.btn:focus-visible,
.btn.on {
  color: var(--text);
  background: var(--bg-4);
  border-color: var(--line-3);
  outline: none;
}
.btn.primary {
  font-weight: 600;
  color: var(--on-accent);
  background: var(--accent);
  border-color: var(--accent);
}
.btn.primary:hover:not(:disabled) {
  color: var(--on-accent);
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}
.btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.scrim {
  position: fixed;
  inset: 0;
  z-index: 19;
}
.startbox {
  position: absolute;
  top: calc(100% - 4px);
  right: 16px;
  z-index: 20;
  width: 420px;
  padding: 4px;
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  border-radius: 10px;
  box-shadow: var(--shadow);
}
.panes {
  flex: 1;
  min-height: 0;
  display: flex;
}
.chead {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 8px 0 6px;
  background: var(--bg-1);
  border-bottom: 1px solid var(--line);
}
.stabs {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  overflow: hidden;
}
.stabs button {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 28px;
  padding: 0 11px;
  font: 500 12.5px var(--font-ui);
  color: var(--text-4);
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.stabs button:hover {
  color: var(--text-2);
  background: var(--bg-2);
}
.stabs button.on {
  color: var(--text);
  background: var(--bg-3);
}
.stabs i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.older {
  max-width: 170px;
  height: 26px;
  margin-left: 4px;
  padding: 0 6px;
  font: 12px var(--font-ui);
  color: var(--text-3);
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 6px;
}
.stop {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  font: 500 12px var(--font-ui);
  color: var(--danger);
  background: none;
  border: 1px solid var(--danger-line);
  border-radius: 6px;
  cursor: pointer;
}
.stop:hover:not(:disabled) {
  background: var(--danger-soft);
  border-color: var(--danger);
}
.stop:disabled {
  color: var(--text-5);
  border-color: var(--line);
  cursor: default;
}
.pane {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.pane.claude {
  position: relative;
  background: var(--bg-editor);
}
.starting {
  position: absolute;
  inset: 38px 0 0;
  z-index: 5;
  display: grid;
  place-items: center;
  background: var(--bg-editor);
}
.scard {
  width: min(460px, 90%);
  padding: 18px 20px;
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  border-radius: 12px;
}
.scard h3 {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 14px;
  font: 600 14px var(--font-ui);
  color: var(--text);
}
.scard ol {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0 0 4px;
  padding: 0;
  list-style: none;
  font-size: 13px;
  color: var(--text-4);
}
.scard li {
  display: flex;
  align-items: center;
  gap: 10px;
}
.scard li.done {
  color: var(--ok);
}
.scard li.active {
  color: var(--text);
}
.scard li.late {
  color: var(--warn);
}
.scard .btn {
  margin-top: 12px;
}
.spin {
  flex: none;
  width: 12px;
  height: 12px;
  border: 2px solid var(--line-2);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-5);
}
.empty p {
  margin: 0;
  color: var(--text-3);
}
</style>
