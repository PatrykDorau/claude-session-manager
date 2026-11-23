<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, onActivated, onDeactivated, toRef } from 'vue'
import { followId } from './follow'
import type { DevServer, MenuItem, MrDraftNote, MrFile, MrRow, QuickAction, Session, Stage, TerminalMode } from '../types'
import { plainSession } from '../cards'
import { reviewLabel, findReviewSession, findWorkSession, findAddressSession } from './mrs'
import { useMrState, PIPELINE_COLOR, flashElement } from './mrstate'
import Icon from './Icon.vue'
import MrOverview from './MrOverview.vue'
import MrHeaderControls from './MrHeaderControls.vue'
import MrDraftsBar from './MrDraftsBar.vue'
import ClaudeTerminal from './ClaudeTerminal.vue'
import CodeView from './CodeView.vue'
import Splitter from './Splitter.vue'
import ContextChip from './ContextChip.vue'
import { clampSize, readSize, writeSize, readFlag } from './dashboard'
import QuickActions from './QuickActions.vue'
import ServerPanel from './ServerPanel.vue'

const props = defineProps<{ row: MrRow; sessions: Session[]; isGone: boolean; myName?: string | null; servers?: DevServer[]; taskStage?: Stage | null }>()
const emitViewing = defineEmits<{ viewing: [id: string | null] }>()

const REVIEW_ACTIONS: QuickAction[] = [
  {
    label: 'Save findings as draft notes',
    prompt:
      'Zapisz potwierdzone uwagi z review jako draft notes w tym MR (gitlab.js mr draft-note). Najpierw pokaż mi listę do potwierdzenia.'
  }
]

const tab = ref<'overview' | 'changes' | 'server'>('overview')
const isCodeOpen = ref(!readFlag('dash.mrCodeHidden'))
const isClaudeOpen = ref(!readFlag('dash.mrClaudeHidden'))
const isBothOpen = computed(() => isCodeOpen.value && isClaudeOpen.value)
const savePanes = (): void => {
  writeSize('dash.mrCodeHidden', !isCodeOpen.value)
  writeSize('dash.mrClaudeHidden', !isClaudeOpen.value)
}
const toggleCode = (): void => {
  isCodeOpen.value = !isCodeOpen.value
  if (!isCodeOpen.value) isClaudeOpen.value = true
  savePanes()
}
const toggleClaude = (): void => {
  isClaudeOpen.value = !isClaudeOpen.value
  if (!isClaudeOpen.value) isCodeOpen.value = true
  savePanes()
}
const panes = ref<HTMLDivElement | null>(null)
const codeWidth = ref(readSize('dash.mrCodeWidth', 760))
const resizeCode = (delta: number): void => {
  const total = panes.value?.clientWidth ?? 1400
  codeWidth.value = clampSize(codeWidth.value + delta, 320, total - 360)
}
const saveCodeWidth = (): void => writeSize('dash.mrCodeWidth', codeWidth.value)
const isOverviewClaudeOpen = ref(readFlag('dash.mrOverviewClaude'))
const toggleOverviewClaude = (): void => {
  isOverviewClaudeOpen.value = !isOverviewClaudeOpen.value
  writeSize('dash.mrOverviewClaude', isOverviewClaudeOpen.value)
}
const docWidth = ref(readSize('dash.mrDocWidth', 820))
const isClaudeShown = computed(() => (tab.value === 'changes' && isClaudeOpen.value) || (tab.value === 'overview' && isOverviewClaudeOpen.value))
const isSplit = computed(() => (tab.value === 'changes' && isBothOpen.value) || (tab.value === 'overview' && isOverviewClaudeOpen.value))
const resizeLeft = (delta: number): void => {
  if (tab.value === 'changes') {
    resizeCode(delta)
    return
  }
  const total = panes.value?.clientWidth ?? 1400
  docWidth.value = clampSize(docWidth.value + delta, 420, total - 360)
}
const saveLeftWidth = (): void => {
  if (tab.value === 'changes') saveCodeWidth()
  else writeSize('dash.mrDocWidth', docWidth.value)
}
const files = ref<MrFile[] | null | undefined>(undefined)
const mode = ref<TerminalMode | null>(null)
const isStarting = ref(false)
const startError = ref<string | null>(null)
const terminalTick = ref(0)
let remountTimer: ReturnType<typeof setTimeout> | null = null

const state = useMrState(toRef(props, 'row'), toRef(props, 'myName'))
const {
  isMine,
  status,
  actionError,
  notice,
  approvalText,
  threads,
  openThreads,
  branchUrl,
  isDraftMr,
  revealDraft,
  openVersion,
  codeComments,
  runReview,
  commentable,
  checkCommentable,
  scheduleStatus,
  addressSessionId,
  startAddressing,
  isAddressPendingIn
} = state
const actionValues = computed(() => ({
  ticket: props.row.ticket,
  title: props.row.title,
  branch: props.row.sourceBranch,
  worktree: session.value?.projectPath ?? null,
  mr: `!${props.row.iid}`,
  mrUrl: props.row.url,
  server: server.value ? `http://localhost:${server.value.port}` : null
}))
const addressSession = computed(
  () =>
    props.sessions.find((s) => s.id === addressSessionId.value) ??
    (isMine.value ? findAddressSession(props.sessions, props.row) : undefined)
)
const isAddressPending = computed(() => isAddressPendingIn(props.sessions))
const baseSession = computed(() =>
  isMine.value ? findWorkSession(props.sessions, props.row.ticket) : findReviewSession(props.sessions, followId(props.sessions, props.row.sessionId))
)
const paneSessions = computed(() =>
  [
    baseSession.value ? { label: 'Task', session: baseSession.value } : null,
    addressSession.value && addressSession.value.id !== baseSession.value?.id ? { label: 'Comments', session: addressSession.value } : null
  ].filter((t): t is { label: string; session: Session } => !!t)
)
const pickedSessionId = ref<string | null>(null)
const followTabs = (): void => {
  addressSessionId.value = followId(props.sessions, addressSessionId.value)
  pickedSessionId.value = followId(props.sessions, pickedSessionId.value)
}
watch(() => props.sessions, followTabs)
const session = computed(
  () =>
    paneSessions.value.find((t) => t.session.id === pickedSessionId.value)?.session ??
    (addressSession.value?.isLive ? addressSession.value : null) ??
    baseSession.value ??
    addressSession.value
)
watch(() => session.value?.id ?? null, (id) => emitViewing('viewing', id), { immediate: true })
onActivated(() => emitViewing('viewing', session.value?.id ?? null))
onDeactivated(() => emitViewing('viewing', null))
const repoPath = ref<string | null>(null)
const loadRepo = async (): Promise<void> => {
  repoPath.value = await window.api.getMrRepo(props.row.key)
}
void loadRepo()
const codeCwd = computed(() => session.value?.projectPath ?? repoPath.value)
const openJira = (key: string): void => window.api.openTicket(key)
const addressComments = async (): Promise<void> => {
  startError.value = null
  tab.value = 'changes'
  if (!isClaudeOpen.value) toggleClaude()
  const result = await startAddressing()
  startError.value = result.error
  if (result.sessionId) pickedSessionId.value = result.sessionId
}
const chip = computed(() => reviewLabel(props.row.review))
const facts = computed(() => {
  const list: string[] = []
  if (session.value?.model) list.push(session.value.model.replace(/^claude-/, ''))
  return list
})

const loadFiles = async (): Promise<void> => {
  files.value = undefined
  files.value = await window.api.getMrFiles(props.row.key)
}
const review = async (): Promise<void> => {
  isStarting.value = true
  startError.value = null
  try {
    const result = await window.api.startReview(props.row.key)
    startError.value = result.error
    if (!result.error) tab.value = 'changes'
  } catch (e) {
    startError.value = String(e)
  } finally {
    isStarting.value = false
  }
}
const terminal = ref<{ takeOver: () => Promise<boolean>; paste: (text: string) => void } | null>(null)
const askClaude = (text: string): void => {
  tab.value = 'changes'
  if (!isClaudeOpen.value) toggleClaude()
  terminal.value?.paste(text)
}
const takeOverHere = async (): Promise<boolean> => (terminal.value ? terminal.value.takeOver() : false)
const remountTerminal = (): void => {
  mode.value = null
  terminalTick.value += 1
}
const stopTurn = (): void => {
  if (session.value) window.api.stopTurn(session.value.id)
}
const openInVscode = async (): Promise<void> => {
  if (!session.value) return
  await window.api.openInVscode(session.value.id)
  remountTimer = setTimeout(remountTerminal, 1500)
}
const focusVscode = (): void => {
  if (session.value) window.api.openSession(plainSession(session.value))
}

const serverKey = computed(() => props.row.ticket ?? `MR-${props.row.iid}`)
const server = computed(() => (props.servers ?? []).find((sv) => sv.key === serverKey.value) ?? null)
const serverCwd = ref<string | null>(null)
const loadServerCwd = async (): Promise<void> => {
  const place = await window.api.getMrBranchFolder(props.row.key)
  serverCwd.value = place.folder ?? session.value?.projectPath ?? place.repo
}
const codeView = ref<{ goToFileLine: (path: string, line: number) => Promise<void> } | null>(null)
const openLine = async (path: string, line: number): Promise<void> => {
  tab.value = 'changes'
  if (!isCodeOpen.value) toggleCode()
  await nextTick()
  await codeView.value?.goToFileLine(path, line)
}
const openDraft = async (d: MrDraftNote): Promise<void> => {
  if (d.anchor) {
    await openLine(d.anchor.path, d.anchor.line)
    return
  }
  tab.value = 'overview'
  const target = revealDraft(d)
  await nextTick()
  flashElement(target)
}
const openItems = computed<MenuItem[]>(() => [
  { label: 'GitLab', hint: props.row.url, icon: 'external', run: () => window.open(props.row.url, '_blank') },
  { label: 'VS Code with the review session', hint: 'Moves the session to VS Code', icon: 'code', isDisabled: !session.value, run: () => void openInVscode() }
])

onMounted(() => {
  void loadServerCwd()
  void loadFiles()
})
watch(
  () => props.row.sha,
  () => {
    void loadFiles()
  }
)
watch(
  () => paneSessions.value.map((t) => `${t.session.id}:${t.session.status}:${t.session.lastActive}`).join('|'),
  scheduleStatus
)
onBeforeUnmount(() => {
  if (remountTimer) clearTimeout(remountTimer)
})
</script>

<template>
  <div class="view">
    <header class="head">
      <div class="line">
        <span class="proj">{{ row.projectName }}</span>
        <a class="iid" :href="row.url" target="_blank" title="Open in GitLab">!{{ row.iid }}</a>
        <span v-if="!isMine" class="pill" :style="{ '--c': chip.color }">{{ chip.label }}</span>
        <span v-if="isGone" class="pill" style="--c: #666d78">no longer in your to-do</span>
        <span v-if="isDraftMr" class="draftbadge">Draft</span>
        <MrHeaderControls part="title" :row="row" :state="state" :is-gone="isGone" :is-address-pending="isAddressPending" :open-items="openItems" @address-comments="addressComments" />
        <button v-if="row.ticket" class="fact jira" title="Open in Jira" @click="openJira(row.ticket)">{{ row.ticket }}</button>
      </div>
      <div v-if="status?.state || approvalText" class="status">
        <span v-if="status?.state?.pipeline" class="st" :style="{ color: PIPELINE_COLOR[status.state.pipeline] ?? '#9d9d9d' }">
          <i :style="{ background: PIPELINE_COLOR[status.state.pipeline] ?? '#9d9d9d' }" />Pipeline {{ status.state.pipeline }}
        </span>
        <span v-if="approvalText" class="st" :class="{ ok: status?.approvals?.isApprovedByMe }"><Icon name="check" :size="13" />{{ approvalText }}</span>
        <span v-if="status?.state?.hasConflicts" class="st bad">Conflicts with {{ row.targetBranch }}</span>
        <span v-else-if="status?.state?.behind" class="st">{{ status.state.behind }} commits behind {{ row.targetBranch }}</span>
        <span v-if="openThreads" class="st warn"><Icon name="message" :size="13" />{{ openThreads }} open threads</span>
        <span v-if="status?.state && status.state.state !== 'opened'" class="st">{{ status.state.state }}</span>
        <span v-if="status?.problem" class="st bad" :title="status.problem">GitLab: {{ status.problem }}</span>
      </div>
      <div class="bar">
        <nav class="tabs">
          <button :class="{ on: tab === 'overview' }" @click="tab = 'overview'"><Icon name="fileText" :size="15" />Overview<span v-if="threads.length" class="count">{{ threads.filter((d) => !d.isSystem).length }}</span></button>
          <button :class="{ on: tab === 'server' }" @click="tab = 'server'"><Icon name="server" :size="15" />Server<span v-if="server" class="dot" /></button>
          <button :class="{ on: tab === 'changes' }" @click="tab = 'changes'">
            <Icon name="code" :size="15" />Changes<span v-if="files" class="count">{{ files.length }}</span>
          </button>
        </nav>
        <span class="sub">
          <Icon name="user" :size="13" />{{ row.author }}
          <Icon name="branch" :size="13" /><a class="bref" :href="branchUrl(row.sourceBranch)" target="_blank" :title="`Open ${row.sourceBranch} in GitLab`">{{ row.sourceBranch }}</a><span class="arrow">→</span><a class="bref" :href="branchUrl(row.targetBranch)" target="_blank">{{ row.targetBranch }}</a>
        </span>
        <span class="grow" />
        <ContextChip v-if="session" :session="session" :mode="mode" />
        <div v-if="tab === 'changes'" class="seg" :title="['Show or hide the panes', ...facts].join(' · ')">
          <button :class="{ on: isCodeOpen }" @click="toggleCode"><Icon name="code" :size="14" />Code</button>
          <button :class="{ on: isClaudeOpen }" @click="toggleClaude"><Icon name="terminal" :size="14" />Claude</button>
        </div>
        <div v-if="tab === 'overview'" class="seg" :title="['Show Claude next to the overview', ...facts].join(' · ')">
          <button :class="{ on: isOverviewClaudeOpen }" @click="toggleOverviewClaude"><Icon name="terminal" :size="14" />Claude</button>
        </div>
        <button v-if="isClaudeShown" class="stop" :disabled="mode !== 'attach'" title="Interrupt Claude's current turn (Esc)" @click="stopTurn"><Icon name="stop" :size="12" />Stop</button>
        <MrHeaderControls part="actions" :row="row" :state="state" :is-gone="isGone" :is-address-pending="isAddressPending" :open-items="openItems" @address-comments="addressComments" />
        <button v-if="!isMine" class="btn primary" :disabled="isStarting || isGone" @click="review">
          <Icon name="play" :size="13" />{{ isStarting ? 'Starting review…' : row.review === 'not-reviewed' ? 'Review' : 'Review again' }}
        </button>
      </div>
      <div v-if="startError" class="warn">{{ startError }}</div>
      <div v-if="actionError" class="warn">GitLab: {{ actionError }}</div>
      <div v-if="notice" class="notice">{{ notice }}<button class="linkbtn" @click="notice = null">Dismiss</button></div>
      <MrDraftsBar :state="state" :is-gone="isGone" @open-draft="openDraft" />
    </header>

    <div v-show="tab !== 'server'" ref="panes" class="panes">
      <section v-show="tab === 'changes' && isCodeOpen" class="pane code" :style="isBothOpen ? { flex: 'none', width: `${codeWidth}px`, maxWidth: 'calc(100% - 360px)' } : undefined">
        <CodeView
          ref="codeView"
          :cwd="codeCwd"
          :ticket-key="row.ticket ?? `MR-${row.iid}`"
          :branch-ref="{ source: row.sourceBranch, target: row.targetBranch }"
          :mr="{ iid: row.iid, source: row.sourceBranch, target: row.targetBranch }"
          :is-others-mr="!isMine"
          :ticket-title="row.title"
          :can-ask="mode === 'attach'"
          :source-session-id="session?.id ?? null"
          :comments="codeComments"
          :commentable="commentable"
          :review="runReview"
          @ask="askClaude"
          @version="openVersion"
          @file-shown="checkCommentable"
        />
      </section>
      <section v-show="tab === 'overview'" class="pane doc" :style="isOverviewClaudeOpen ? { flex: 'none', width: `${docWidth}px`, maxWidth: 'calc(100% - 360px)' } : undefined">
        <MrOverview :row="row" :state="state" :is-gone="isGone" @open-line="openLine" @address-comments="addressComments" />
      </section>
      <Splitter v-if="isSplit" @resize="resizeLeft" @done="saveLeftWidth" />
    <section v-show="isClaudeShown" class="pane claude">
      <div v-if="paneSessions.length > 1" class="stabs">
        <button
          v-for="t in paneSessions"
          :key="t.session.id"
          :class="{ on: t.session.id === session?.id }"
          :title="`${t.session.name ?? t.session.projectName} · ${t.session.status}`"
          @click="pickedSessionId = t.session.id"
        >
          <i :class="{ live: t.session.isLive }" />{{ t.label }}
        </button>
      </div>
      <div v-if="isAddressPending" class="pending"><span class="spin" />Starting a Claude session for the review comments. It opens here when it is ready.</div>
      <ClaudeTerminal
        v-if="session"
        ref="terminal"
        :key="`${session.id}-${terminalTick}`"
        :session-id="session.id"
        :project-name="session.projectName"
        @mode="mode = $event"
        @exited="remountTerminal"
        @focus-vscode="focusVscode"
      />
      <div v-else-if="isMine" class="empty">
        <Icon name="bot" :size="34" />
        <p>No Claude session worked on {{ row.ticket ?? 'this ticket' }}. Start one from the ticket in My tickets.</p>
      </div>
      <div v-else-if="row.sessionId" class="empty"><span class="spin" />Waiting for the review session to appear…</div>
      <div v-else class="empty">
        <Icon name="pr" :size="34" />
        <p>No review yet. Claude reviews this MR in its own worktree, so your checkout stays untouched.</p>
        <button class="btn primary" :disabled="isStarting || isGone" @click="review"><Icon name="play" :size="13" />Review</button>
      </div>
      <QuickActions :session-id="session?.id ?? null" :mode="mode" :take-over="takeOverHere" :extra="isMine ? [] : REVIEW_ACTIONS" :values="actionValues" :stage="isMine ? (taskStage ?? 'mr') : null" />
    </section>
    </div>

    <section v-show="tab === 'server'" class="pane">
      <ServerPanel v-if="serverCwd" :key="serverCwd" :ticket-key="serverKey" :cwd="serverCwd" :servers="servers ?? []" />
      <p v-else class="muted pad">Looking for the folder with {{ row.sourceBranch }}…</p>
    </section>
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
.proj {
  flex: none;
  color: var(--text-3);
}
.iid {
  flex: none;
  font: 600 13px var(--font-mono);
  color: var(--text-2);
  text-decoration: none;
}
.iid:hover {
  color: var(--accent);
}
.pill {
  flex: none;
  padding: 0 8px;
  font-size: 11px;
  line-height: 18px;
  color: var(--c);
  border: 1px solid var(--c);
  border-radius: 9px;
}
.grow {
  flex: 1;
}
.fact {
  flex: none;
  font-size: 12px;
  color: var(--text-4);
  white-space: nowrap;
}
.line .fact {
  font-family: var(--font-mono);
  color: var(--text-3);
}
.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-height: 42px;
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
.count {
  padding: 0 6px;
  font-size: 11px;
  line-height: 16px;
  color: var(--text-3);
  background: var(--bg-4);
  border-radius: 8px;
}
.sub {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  margin-left: 10px;
  overflow: hidden;
  white-space: nowrap;
  font-size: 12px;
  color: var(--text-4);
}
.sub .icon:not(:first-child) {
  margin-left: 8px;
}
.sub code {
  font: 12px var(--font-mono);
  color: var(--text-3);
}
.arrow {
  color: var(--text-5);
}
.btn {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  box-sizing: border-box;
  font: 500 12.5px var(--font-ui);
  color: var(--text-2);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 7px;
  cursor: pointer;
  text-decoration: none;
}
.btn:hover:not(:disabled),
.btn:focus-visible {
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
}
.btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.stop {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 10px;
  font: 500 12.5px var(--font-ui);
  color: var(--danger);
  background: none;
  border: 1px solid var(--danger-line);
  border-radius: 7px;
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
.warn {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--warn);
}
.status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 16px;
  margin: -6px 0 8px;
  font-size: 12px;
  color: var(--text-3);
}
.st {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.st i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.st.ok {
  color: var(--ok);
}
.st.bad {
  color: var(--danger);
}
.st.warn {
  color: var(--warn);
}
.btn.merge:not(:disabled) {
  color: var(--accent);
  border-color: rgba(61, 214, 140, 0.4);
}
.srvchip {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  max-width: 260px;
  padding: 0 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 12px var(--font-mono);
  color: var(--ok);
  background: rgba(61, 214, 140, 0.08);
  border: 1px solid var(--ok-line);
  border-radius: 13px;
  cursor: pointer;
}
.srvchip i {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ok);
}
.srvchip:hover {
  border-color: var(--ok);
}
.draftbadge {
  flex: none;
  padding: 0 7px;
  font: 700 11px/19px var(--font-ui);
  color: var(--bg-0);
  background: var(--warn);
  border-radius: 5px;
}
.fact.jira {
  padding: 0;
  font: 600 12px var(--font-mono);
  color: var(--info);
  background: none;
  border: none;
  cursor: pointer;
}
.fact.jira:hover {
  text-decoration: underline;
}
.bref {
  font: 12px var(--font-mono);
  color: var(--text-3);
  text-decoration: none;
}
.bref:hover {
  color: var(--info);
  text-decoration: underline;
}
.panes {
  flex: 1;
  min-height: 0;
  display: flex;
}
.pane.claude {
  background: var(--bg-editor);
}
.stabs {
  flex: none;
  display: flex;
  gap: 2px;
  padding: 4px 6px;
  border-bottom: 1px solid var(--line);
}
.stabs button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 26px;
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
  background: #666d78;
}
.stabs i.live {
  background: var(--ok, #3fb950);
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
.pane {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  text-align: center;
  color: var(--text-3);
}
.pending {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--text-2);
  background: var(--bg-2);
  border-bottom: 1px solid var(--line);
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
.doc {
  overflow-y: auto;
}
.docbody {
  max-width: 900px;
  padding: 20px 24px 40px;
}
h3 {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--text-3);
}
h3:not(:first-child) {
  margin-top: 22px;
}
.tot {
  margin-left: 6px;
  font-weight: 400;
}
.desc {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.55;
  font-size: 13px;
  color: var(--text-2);
}
.muted {
  color: var(--text-4);
}
.files {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--bg-4);
  border-radius: 8px;
}
.files li {
  display: flex;
  gap: 10px;
  padding: 6px 10px;
  font-size: 12px;
  border-top: 1px solid var(--bg-4);
}
.files li:first-child {
  border-top: none;
}
.path {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  font-family: var(--font-mono);
  color: var(--text-2);
}
.add {
  color: var(--ok);
}
.del {
  color: var(--danger);
}
.linkbtn {
  padding: 0;
  font: 12px var(--font-ui);
  color: var(--text-4);
  background: none;
  border: none;
  cursor: pointer;
}
.linkbtn:hover:not(:disabled) {
  color: var(--text);
}
.tabs .dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-left: 2px;
  border-radius: 50%;
  background: var(--ok);
}
.muted.pad {
  padding: 24px;
}
.notice {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  padding: 7px 12px;
  font-size: 12.5px;
  color: var(--text-2);
  background: var(--accent-soft);
  border-radius: 8px;
}
</style>
