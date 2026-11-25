<script setup lang="ts">
import { ref, shallowRef, computed, watch, nextTick, onMounted, onBeforeUnmount, onActivated, onDeactivated } from 'vue'
import { followId, followIds, isSuperseded, visibleTabs } from './follow'
import { sessionRole, roleLabel, type SessionRole } from './tabs'
import { findAddressSession } from './mrs'
import { flashElement, type MrState } from './mrstate'
import type { DevServer, MrDraftNote, MrRow, Session, SessionDetail, TerminalMode, TicketMr, Stage } from '../types'
import type { TaskRow } from '../taskview'
import { splitTag, statusLane } from '../taskview'
import { plainSession } from '../cards'
import { ago } from '../display'
import { rowChip } from './dashboard'
import type { TabRequest, TicketTab } from './mrroute'
import { readiness, CREATE_MR_PROMPT } from './readiness'
import ClaudeTerminal from './ClaudeTerminal.vue'
import QuickActions from './QuickActions.vue'
import TicketPanel from './TicketPanel.vue'
import CodeView from './CodeView.vue'
import MrOverview from './MrOverview.vue'
import MrDraftsBar from './MrDraftsBar.vue'
import MrStateHost from './MrStateHost.vue'
import TestCasesDialog from './TestCasesDialog.vue'
import ServerPanel from './ServerPanel.vue'
import StatusMenu from './StatusMenu.vue'
import Splitter from './Splitter.vue'
import ContextChip from './ContextChip.vue'
import AutonomyMenu from './AutonomyMenu.vue'
import { choiceOf } from './orchestrator'
import type { AutonomyChoice, Job, OrchestratorState } from '../../../main/orchestrator'
import { readPins, togglePin, writePins } from './commandpanel'
import { clampSize, readSize, writeSize, readFlag, uncommittedCount } from './dashboard'
import MenuButton from './MenuButton.vue'
import Icon from './Icon.vue'
import type { MenuItem } from '../types'
import StartSessionPopover from '../components/StartSessionPopover.vue'

const props = defineProps<{ row: TaskRow; servers: DevServer[]; mrUrl: string | null; mr?: MrRow | null; myName?: string | null; mrSession?: Session | null; stage?: Stage | null; reached?: Stage[]; tabRequest?: TabRequest | null }>()
const emit = defineEmits<{ 'open-mr': [key: string]; viewing: [id: string | null] }>()
const emitViewing = (name: 'viewing', id: string | null): void => emit(name, id)

const DETAIL_INTERVAL_MS = 5000

const tab = ref<TicketTab>('work')
const ownMr = computed(() => (props.mr && props.myName && props.mr.author === props.myName ? props.mr : null))
const availableTabs = computed<TicketTab[]>(() => (ownMr.value ? ['work', 'mr', 'server', 'ticket'] : ['work', 'server', 'ticket']))
watch(availableTabs, (tabs) => {
  if (!tabs.includes(tab.value)) tab.value = 'work'
})
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
const showCode = (): void => {
  tab.value = 'work'
  if (!isCodeOpen.value) toggleCode()
}
const changes = computed(() => uncommittedCount(props.row.sessions))
const panes = ref<HTMLDivElement | null>(null)
const codeWidth = ref(readSize('dash.codeWidth', 760))
const resizeCode = (delta: number): void => {
  const total = panes.value?.clientWidth ?? 1400
  codeWidth.value = clampSize(codeWidth.value + delta, 320, total - 360)
}
const saveCodeWidth = (): void => writeSize('dash.codeWidth', codeWidth.value)
const pickedId = ref<string | null>(null)
watch(
  () => props.tabRequest,
  (request) => {
    if (!request || request.key !== props.row.key) return
    tab.value = availableTabs.value.includes(request.tab) ? request.tab : 'work'
    if (request.sessionId) pickedId.value = request.sessionId
  },
  { immediate: true }
)
const modes = ref<Record<string, TerminalMode | null>>({})
const ticks = ref<Record<string, number>>({})
const openedIds = ref<string[]>([])
const detail = ref<SessionDetail | null>(null)
const isStartOpen = ref(false)
const isTestCasesOpen = ref(false)
let detailLoadedAt = 0
let detailTimer: ReturnType<typeof setTimeout> | null = null
let remountTimer: ReturnType<typeof setTimeout> | null = null

const followTabs = (): void => {
  const opened = followIds(props.row.sessions, openedIds.value)
  if (opened.join() !== openedIds.value.join()) openedIds.value = opened
  pickedId.value = followId(props.row.sessions, pickedId.value)
}
watch(() => props.row.sessions, followTabs)
const defaultSession = (): Session | undefined => {
  const current = props.row.sessions.filter((s) => !isSuperseded(props.row.sessions, s))
  const main = current.filter((s) => roleOf(s) === 'main')
  return main.find((s) => s.isLive) ?? current.find((s) => s.isLive) ?? main[0] ?? current[0] ?? props.row.sessions[0]
}
const mrSession = computed(() => (ownMr.value ? (props.mrSession ?? findAddressSession(props.row.sessions, ownMr.value) ?? null) : null))
const allSessions = computed(() =>
  mrSession.value && !props.row.sessions.some((s) => s.id === mrSession.value?.id) ? [...props.row.sessions, mrSession.value] : props.row.sessions
)
const roleOf = (s: Session): SessionRole => sessionRole(s, props.row.key, mrSession.value?.id ?? null)
const session = computed(() => allSessions.value.find((s) => s.id === followId(allSessions.value, pickedId.value)) ?? defaultSession())
const panelPins = ref<string[]>(readPins())
const isPinned = computed(() => !!session.value && panelPins.value.includes(session.value.id))
const refreshPins = (): void => {
  panelPins.value = readPins()
}
onActivated(refreshPins)
const markTicket = (): void => window.api.markActivity(props.row.key)
onMounted(markTicket)
onActivated(markTicket)
const markTerminal = (s: Session): void => window.api.markActivity(s.ticket)
const togglePanelPin = (): void => {
  if (!session.value) return
  if (isPinned.value && !window.confirm('Unpin this session from the command panel grid?')) return
  panelPins.value = togglePin(readPins(), session.value.id)
  writePins(panelPins.value)
}
const sleepCurrent = async (): Promise<void> => {
  if (!session.value || !window.confirm('Put this session to sleep? The Claude process stops and the session stays on the list.')) return
  const result = await window.api.sleepSession(session.value.id)
  if (result.error) window.alert(result.error)
}
const orchJobs = ref<Job[]>([])
const sessionJob = computed(() => orchJobs.value.find((j) => !!session.value && j.sessionId === session.value.id) ?? null)
const autonomyError = ref<string | null>(null)
const applyOrchestrator = (state: OrchestratorState): void => {
  orchJobs.value = state.jobs
}
const stopOrchestrator = window.api.onOrchestrator(applyOrchestrator)
void window.api.getOrchestrator().then(applyOrchestrator)
onBeforeUnmount(stopOrchestrator)
const setSessionAutonomy = async (autonomy: AutonomyChoice): Promise<void> => {
  if (!session.value) return
  autonomyError.value = (await window.api.setSessionAutonomy(session.value.id, autonomy)).error
}
watch(() => session.value?.id ?? null, (id) => emitViewing('viewing', id), { immediate: true })
onActivated(() => emitViewing('viewing', session.value?.id ?? null))
onDeactivated(() => emitViewing('viewing', null))
const mode = computed(() => (session.value ? (modes.value[session.value.id] ?? null) : null))
const setMode = (id: string, next: TerminalMode | null): void => {
  modes.value = { ...modes.value, [id]: next }
}
const openedSessions = computed(() =>
  openedIds.value.flatMap((id) => allSessions.value.find((s) => s.id === id) ?? [])
)
const STATUS_DOT: Record<string, string> = {
  working: '#6aa9ff',
  waiting: '#e8b84a',
  checkout: '#5ec8ff',
  idle: '#666d78',
  closed: '#3a414c'
}
const tabSessions = computed(() => {
  const shown = visibleTabs(allSessions.value, openedIds.value)
  const fallback = defaultSession()
  return shown.length ? shown : fallback ? [fallback] : []
})
const sessionLabel = (s: Session): string => roleLabel(roleOf(s), s, props.row.key)
const implementingSessionId = computed(
  () => props.row.sessions.find((s) => roleOf(s) === 'main')?.id ?? session.value?.id ?? null
)
const chip = computed(() => rowChip(props.row))
const server = computed(() => props.servers.find((s) => s.key === props.row.key) ?? null)
const lane = computed(() => statusLane(props.row.status))
const title = computed(() => splitTag(props.row.summary))
const actionValues = computed(() => ({
  ticket: props.row.key,
  title: title.value.text,
  branch: session.value?.gitBranch ?? null,
  worktree: session.value?.projectPath ?? null,
  mr: props.mr ? `!${props.mr.iid}` : null,
  mrUrl: props.mr?.url ?? props.mrUrl,
  server: server.value ? `http://localhost:${server.value.port}` : null
}))
const facts = computed(() => {
  const list: string[] = []
  if (session.value?.model) list.push(session.value.model.replace(/^claude-/, ''))
  if (detail.value) list.push(`${detail.value.turns} turns`)
  return list
})

const openJira = (): void => window.api.openTicket(props.row.key)
const openCode = (): void => window.api.openTaskCode(props.row.key)
const ticketMr = ref<TicketMr | null>(null)
const readyTimes = ref<{ handoffAt: number | null; lastCommitAt: number | null }>({ handoffAt: null, lastCommitAt: null })
const ready = computed(() => readiness(props.reached ?? [], readyTimes.value))
const isReadyOpen = ref(false)
const isReadyConfirming = ref(false)
const readyConfirmAt = ref(0)
const isMrRequested = ref(false)
const isMrSending = ref(false)
const mrSendError = ref<string | null>(null)
const isMrMissing = computed(() => !props.mr && !ticketMr.value)
const taskFiles = ref<{ name: string; kind: 'video' | 'image' }[] | null>(null)
const openFolder = (): void => window.api.openTaskFolder(props.row.key)
const openFile = (name: string): void => window.api.openTaskFile(props.row.key, name)
const fileItems = computed<MenuItem[]>(() => [
  { label: 'Open the task folder', icon: 'folder', run: openFolder },
  ...(taskFiles.value ?? []).map((f): MenuItem => ({ label: f.name, icon: f.kind === 'video' ? 'play' : 'file', run: () => openFile(f.name) }))
])
const loadReadiness = async (): Promise<void> => {
  void window.api.getTaskFiles(props.row.key).then((files) => (taskFiles.value = files))
  const cwd = session.value?.projectPath ?? null
  const times = await window.api.getTicketReadiness(props.row.key, cwd)
  if (cwd === (session.value?.projectPath ?? null)) readyTimes.value = times
}
watch([() => props.row.key, () => props.reached?.length, changes, () => session.value?.projectPath], () => void loadReadiness(), { immediate: true })
const toggleReady = (): void => {
  isReadyOpen.value = !isReadyOpen.value
  isReadyConfirming.value = false
  mrSendError.value = null
}
const createMr = async (): Promise<void> => {
  const id = session.value?.id
  if (!id || isMrSending.value || isMrRequested.value || mode.value !== 'attach') return
  if (ready.value.done < ready.value.total && !isReadyConfirming.value) {
    isReadyConfirming.value = true
    readyConfirmAt.value = Date.now()
    return
  }
  if (isReadyConfirming.value && Date.now() - readyConfirmAt.value < 600) return
  isMrSending.value = true
  mrSendError.value = null
  try {
    mrSendError.value = (await window.api.sendPrompt(id, CREATE_MR_PROMPT.replace('{ticket}', props.row.key))).error
    if (!mrSendError.value) {
      isReadyOpen.value = false
      isMrRequested.value = true
    }
  } finally {
    isMrSending.value = false
    isReadyConfirming.value = false
  }
}
const knownMrUrl = computed(() => props.mr?.url ?? ticketMr.value?.url ?? null)
const openMr = (): void => {
  if (knownMrUrl.value) window.open(knownMrUrl.value, '_blank')
  else window.api.openMr(props.row.key)
}
const loadTicketMr = async (): Promise<void> => {
  if (props.mr) return
  ticketMr.value = await window.api.getTicketMr(props.row.key)
}
void loadTicketMr()
const openTicketMr = (): void => {
  if (ticketMr.value) window.open(ticketMr.value.url, '_blank')
}
const pick = (id: string): void => {
  pickedId.value = id
}
const pickFromSelect = (e: Event): void => pick((e.target as HTMLSelectElement).value)
const forgetTab = (id: string): void => {
  openedIds.value = openedIds.value.filter((o) => o !== id)
  if (pickedId.value === id) pickedId.value = null
}
const closingIds = ref<string[]>([])
const closeTab = async (s: Session): Promise<void> => {
  if (closingIds.value.includes(s.id)) return
  if (s.isLive) {
    closingIds.value = [...closingIds.value, s.id]
    const result = await window.api.closeSession(s.id).finally(() => {
      closingIds.value = closingIds.value.filter((c) => c !== s.id)
    })
    if (result.error === 'cancelled') return
    if (result.error) {
      window.alert(result.error)
      return
    }
  }
  forgetTab(s.id)
}
const onTerminalExited = (id: string): void => {
  if (!closingIds.value.includes(id)) remountSession(id)
}
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
const sendToMainSession = (text: string): boolean => {
  const id = implementingSessionId.value
  const terminal = id && modes.value[id] === 'attach' ? terminals.get(id) : undefined
  if (!id || !terminal) return false
  pick(id)
  showClaude()
  terminal.paste(text)
  return true
}
const askReviewSession = async (text: string): Promise<boolean> => {
  const found = allSessions.value.filter((s) => roleOf(s) === 'review' && !isSuperseded(allSessions.value, s)).sort((a, b) => b.lastActive - a.lastActive)[0]
  if (!found) return false
  pick(found.id)
  showClaude()
  await nextTick()
  const terminal = terminals.get(found.id)
  if (!terminal) return false
  if (modes.value[found.id] !== 'attach' && !(await terminal.takeOver())) return false
  terminal.paste(text)
  setTimeout(() => window.api.writeTerminal(found.id, '\r'), 150)
  return true
}
const mrState = shallowRef<MrState | null>(null)
const mrStateId = ref(0)
const onMrState = (state: MrState): void => {
  mrState.value = state
  mrStateId.value += 1
}
const onMrGone = (state: MrState): void => {
  if (mrState.value === state) mrState.value = null
}
const pushedMr = computed(() => (ownMr.value ? { iid: ownMr.value.iid, source: ownMr.value.sourceBranch, target: ownMr.value.targetBranch } : null))
const codeComments = computed(() => mrState.value?.codeComments.value)
const commentable = computed(() => mrState.value?.commentable.value ?? null)
const onFileShown = (path: string, folder: string | null, isReadOnly: boolean): void => {
  markTicket()
  if (isReadOnly) void mrState.value?.checkCommentable(path, folder, isReadOnly)
}
const onVersion = (href: string, path: string | null, line: number | null): void => void mrState.value?.openVersion(href, path, line)
const codeView = ref<{ goToFileLine: (path: string, line: number) => Promise<void>; showPushed: () => Promise<boolean> } | null>(null)
const openLine = async (path: string, line: number): Promise<void> => {
  showCode()
  await nextTick()
  if (await codeView.value?.showPushed()) await codeView.value?.goToFileLine(path, line)
}
const openDraft = async (d: MrDraftNote): Promise<void> => {
  if (d.anchor) {
    await openLine(d.anchor.path, d.anchor.line)
    return
  }
  if (!mrState.value) return
  tab.value = 'mr'
  const target = mrState.value.revealDraft(d)
  await nextTick()
  flashElement(target)
}
const addressError = ref<string | null>(null)
const isAddressPending = computed(() => mrState.value?.isAddressPendingIn(allSessions.value) ?? false)
const addressComments = async (): Promise<void> => {
  const state = mrState.value
  if (!state) return
  addressError.value = null
  showClaude()
  const result = await state.startAddressing()
  addressError.value = result.error
  if (result.sessionId) onStarted(result.sessionId)
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
  { label: 'Merge request', hint: knownMrUrl.value ?? props.mrUrl ?? 'No merge request yet', icon: 'pr', isDisabled: !knownMrUrl.value && !props.mrUrl, run: openMr },
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
watch(
  () => tabSessions.value.map((s) => `${s.id}:${s.status}:${s.lastActive}`).join('|'),
  () => mrState.value?.scheduleStatus()
)
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
        <button v-else-if="ticketMr" class="mrlink" :title="`Open !${ticketMr.iid} in GitLab`" @click="openTicketMr">
          <Icon name="pr" :size="13" />!{{ ticketMr.iid }}<span class="dr">{{ ticketMr.state === 'merged' ? 'merged' : ticketMr.state }}</span>
        </button>
        <h1 class="title" :title="title.text">{{ title.text || 'No title' }}</h1>
        <button v-if="changes" class="unc" :title="`${changes} uncommitted ${changes === 1 ? 'file' : 'files'}. Show the code`" @click="showCode"><Icon name="diff" :size="13" />{{ changes }} uncommitted</button>
        <template v-if="taskFiles">
          <button v-if="!taskFiles.length" class="file" title="Open the task folder" @click="openFolder"><Icon name="folder" :size="13" />Folder</button>
          <MenuButton v-else :label="`Files ${taskFiles.length}`" icon="folder" title="Task folder, videos and screenshots" :items="fileItems" />
        </template>
        <button v-if="isMrMissing" class="ready" :class="{ full: ready.done === ready.total }" title="What is done before the merge request" @click="toggleReady">
          <Icon name="check" :size="13" />Ready for MR {{ ready.done }}/{{ ready.total }}
        </button>
        <button v-if="server" class="srv" title="Show the dev server" @click="tab = 'server'"><i />localhost:{{ server.port }}</button>
        <span v-if="chip" class="state" :style="{ color: chip.color }"><i :style="{ background: chip.color }" />{{ chip.label }}</span>
      </div>
      <MrDraftsBar v-if="mrState" :key="mrStateId" :state="mrState" :is-gone="false" @open-draft="openDraft" />
      <div class="bar">
        <nav class="tabs">
          <button :class="{ on: tab === 'work' }" @click="tab = 'work'"><Icon name="code" :size="15" />Work</button>
          <button v-if="ownMr" :class="{ on: tab === 'mr' }" @click="tab = 'mr'"><Icon name="pr" :size="15" />MR !{{ ownMr.iid }}<span v-if="ownMr.openThreads" class="count">{{ ownMr.openThreads }}</span></button>
          <button :class="{ on: tab === 'server' }" @click="tab = 'server'"><Icon name="server" :size="15" />Server<span v-if="server" class="dot" /></button>
          <button :class="{ on: tab === 'ticket' }" @click="tab = 'ticket'"><Icon name="fileText" :size="15" />Ticket</button>
        </nav>
        <span class="grow" />
        <span v-if="facts.length" class="facts">{{ facts.join('  ·  ') }}</span>
        <ContextChip v-if="session" :session="session" :mode="mode" />
        <button v-if="session" class="btn" :class="{ on: isPinned }" :title="isPinned ? 'Unpin from the command panel grid' : 'Pin this session to the command panel grid'" @click="togglePanelPin"><Icon name="dashboard" :size="14" />{{ isPinned ? 'Pinned' : 'Pin' }}</button>
        <AutonomyMenu
          v-if="session?.isLive"
          :value="choiceOf(sessionJob)"
          :is-disabled="!sessionJob && !session.ticket"
          :disabled-hint="autonomyError ?? 'Only a session with a ticket can be orchestrated'"
          :title="autonomyError ?? 'Orchestrator autonomy for this session'"
          @change="setSessionAutonomy"
        />
        <button v-if="session?.isLive" class="btn" title="Put this session to sleep: the Claude process stops and the session stays on the list" @click="sleepCurrent"><Icon name="moon" :size="14" />Sleep</button>
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
      <div v-if="addressError" class="warn">{{ addressError }}</div>
      <template v-if="isReadyOpen && isMrMissing">
        <div class="scrim" @click="isReadyOpen = false" />
        <div class="readybox">
          <ul>
            <li v-for="item in ready.items" :key="item.id" :class="{ done: item.isDone }">{{ item.isDone ? '✓' : '○' }} {{ item.label }}</li>
          </ul>
          <p v-if="isReadyConfirming" class="open">Still open: {{ ready.items.filter((i) => !i.isDone).map((i) => i.label).join(', ') }}</p>
          <p v-if="mode !== 'attach'" class="open">{{ session ? 'Attach the session here to send from the dashboard.' : 'Start a session to ask Claude for the MR.' }}</p>
          <p v-if="mrSendError" class="open">{{ mrSendError }}</p>
          <div class="readybtns">
            <button class="btn" @click="isReadyOpen = false">Cancel</button>
            <button class="btn primary" :disabled="isMrSending || isMrRequested || mode !== 'attach'" @click="createMr">
              <Icon name="pr" :size="13" />{{ isMrRequested ? 'MR requested' : isReadyConfirming ? 'Create anyway' : 'Create MR' }}
            </button>
          </div>
        </div>
      </template>
      <template v-if="isStartOpen">
        <div class="scrim" @click="isStartOpen = false" />
        <div class="startbox">
          <StartSessionPopover :row="row" is-background-only @started="onStarted" @close="isStartOpen = false" />
        </div>
      </template>
    </header>

    <div v-show="tab === 'work'" ref="panes" class="panes">
      <section v-show="isCodeOpen" class="pane code" :style="isBothOpen ? { flex: 'none', width: `${codeWidth}px`, maxWidth: 'calc(100% - 360px)' } : undefined">
        <CodeView
          ref="codeView"
          :cwd="session?.projectPath ?? null"
          :ticket-key="row.key"
          :ticket-title="title.text"
          :can-ask="mode === 'attach'"
          :source-session-id="implementingSessionId"
          :pushed-mr="pushedMr"
          :comments="codeComments"
          :commentable="commentable"
          :review="mrState?.runReview"
          :send-to-session="sendToMainSession"
          :ask-review="askReviewSession"
          @ask="askClaude"
          @explain="explainInSession"
          @version="onVersion"
          @file-shown="onFileShown"
        />
      </section>
      <Splitter v-if="isBothOpen" @resize="resizeCode" @done="saveCodeWidth" />
      <section v-show="isClaudeOpen" class="pane claude">
        <div class="chead">
          <div class="stabs">
            <button
              v-for="s in tabSessions"
              :key="s.id"
              :class="{ on: s.id === session?.id, closing: closingIds.includes(s.id) }"
              :title="`${s.name ?? s.projectName} · ${s.status}`"
              @click="pick(s.id)"
            >
              <span v-if="closingIds.includes(s.id)" class="spin" />
              <Icon v-else-if="roleOf(s) === 'explain'" name="sparkles" :size="13" />
              <i v-else :style="{ background: STATUS_DOT[s.status] ?? '#666d78' }" />{{ closingIds.includes(s.id) ? 'Closing…' : sessionLabel(s) }}
              <span v-if="!closingIds.includes(s.id)" class="x" role="button" :title="s.isLive ? 'Close this session (stops the Claude process)' : 'Hide this tab'" @click.stop="closeTab(s)">×</span>
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
          :slept-at="s.sleptAt"
          @pointerdown.capture="markTerminal(s)"
          @keydown.capture="markTerminal(s)"
          @mode="setMode(s.id, $event)"
          @exited="onTerminalExited(s.id)"
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
        <QuickActions :session-id="session?.id ?? null" :mode="mode" :take-over="takeOverHere" :values="actionValues" :stage="stage ?? null" />
      </section>
    </div>

    <section v-if="ownMr && mrState" v-show="tab === 'mr'" class="pane doc">
      <MrOverview :key="mrStateId" :row="ownMr" :state="mrState" :is-gone="false" is-header-shown :is-address-pending="isAddressPending" @open-line="openLine" @address-comments="addressComments" />
    </section>
    <MrStateHost v-if="ownMr" :key="ownMr.key" :row="ownMr" :my-name="myName ?? null" @state="onMrState" @gone="onMrGone" />

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
.file {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 150px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 8px;
  font: 600 11.5px var(--font-ui);
  color: var(--text-2);
  background: none;
  border: 1px solid var(--line-2);
  border-radius: 11px;
  cursor: pointer;
}
.fname {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file:hover {
  color: var(--text);
  border-color: var(--text-2);
}
.unc {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  padding: 0 9px;
  font: 600 11.5px var(--font-ui);
  color: var(--warn);
  background: none;
  border: 1px solid var(--warn);
  border-radius: 11px;
  cursor: pointer;
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
.warn {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--warn);
}
.count {
  padding: 0 6px;
  font-size: 11px;
  line-height: 16px;
  color: var(--text-3);
  background: var(--bg-4);
  border-radius: 8px;
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
.ready {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  padding: 0 9px;
  font: 600 11.5px var(--font-ui);
  color: var(--text-3);
  background: none;
  border: 1px solid var(--line-2);
  border-radius: 11px;
  cursor: pointer;
}
.ready.full {
  color: var(--ok);
  border-color: var(--ok);
}
.readybox {
  position: absolute;
  top: calc(100% - 4px);
  right: 16px;
  z-index: 20;
  width: 320px;
  padding: 12px 14px;
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  border-radius: 8px;
  font-size: 12px;
}
.readybox ul {
  margin: 0 0 8px;
  padding: 0;
  list-style: none;
  color: var(--text-4);
}
.readybox li {
  padding: 2px 0;
}
.readybox li.done {
  color: var(--ok);
}
.readybox .open {
  margin: 0 0 8px;
  color: var(--warn);
}
.readybtns {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
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
.stabs .x {
  margin: 0 -5px 0 -2px;
  padding: 0 4px;
  font-size: 14px;
  line-height: 18px;
  color: var(--text-4);
  border-radius: 4px;
  opacity: 0;
}
.stabs button:hover .x,
.stabs button.on .x {
  opacity: 1;
}
.stabs button.closing {
  color: var(--text-3);
  pointer-events: none;
}
.stabs .x:hover {
  color: var(--text);
  background: var(--bg-2);
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
.pane.doc {
  overflow-y: auto;
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
