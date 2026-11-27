<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import type { AgentGroup, DevServer, LocalHost, MrRow, MyMrs, MyTasks, Session, TaskMeta, UsageResult } from '../types'
import { buildCards, splitSections } from '../cards'
import { buildTaskRows } from '../taskview'
import type { DashboardPage } from './dashboard'
import Sidebar from './Sidebar.vue'
import TicketList from './TicketList.vue'
import TicketView from './TicketView.vue'
import MrList from './MrList.vue'
import MrView from './MrView.vue'
import Splitter from './Splitter.vue'
import Icon from './Icon.vue'
import SettingsPanel from '../components/SettingsPanel.vue'
import AgentList from './AgentList.vue'
import AgentView from './AgentView.vue'
import HostsView from './HostsView.vue'
import CatalogView from './CatalogView.vue'
import InsightsView from './InsightsView.vue'
import TimesheetView from './TimesheetView.vue'
import FlowView from './FlowView.vue'
import OrchestratorView from './OrchestratorView.vue'
import { mrOfSession } from './commandpanel'
import StartJobsDialog from './StartJobsDialog.vue'
import type { Job, OrchestratorState } from '../../../main/orchestrator'
import { attentionCount } from './orchestrator'
import InboxPopup from './InboxPopup.vue'
import { buildInboxRows, buildLiveRows, dispatcherRows, nextInboxId, type InboxRow, type LiveOrder } from './inbox'
import StatusBar from './StatusBar.vue'
import PromptSearch from './PromptSearch.vue'
import { treeCounts, filterGroups } from './agenttree'
import { clampSize, readSize, writeSize, readFlag } from './dashboard'
import { useEscapeClose } from './escape'
import { routeMr, type TabRequest } from './mrroute'
import { findReviewSession } from './mrs'
import { FOCUS_PING_MS, startFocusPing, type ActivitySurface } from './activity'
import { countOpenHosts } from './hosts'
import { onVisible, whenVisible } from './visibility'
import { appShortcut } from './shortcuts'
import DispatcherOverlay from './DispatcherOverlay.vue'

const sessions = ref<Session[]>([])
const tasks = ref<Record<string, TaskMeta>>({})
const usage = ref<UsageResult | null>(window.api.getUsage())
const myTasks = ref<MyTasks>(window.api.getMyTasks())
const starred = ref<string[]>(window.api.getStarred())
const page = ref<DashboardPage>('today')
const selectedKey = ref<string | null>(null)
const myMrs = ref<MyMrs>(window.api.getMyMrs())
const selectedMrKey = ref<string | null>(null)
const servers = ref<DevServer[]>(window.api.getServers())
const localHosts = ref<LocalHost[] | null>(null)
const HOSTS_POLL_MS = 15000
let hostsTimer: ReturnType<typeof setTimeout> | null = null
let isHostsLoading = false
let isHostsReloadQueued = false
let isUnmounted = false
const armHostsPoll = (): void => {
  if (hostsTimer) clearTimeout(hostsTimer)
  hostsTimer = isUnmounted ? null : setTimeout(pollHosts, HOSTS_POLL_MS)
}
const loadHosts = async (): Promise<void> => {
  if (isHostsLoading) {
    isHostsReloadQueued = true
    return
  }
  isHostsLoading = true
  try {
    do {
      isHostsReloadQueued = false
      localHosts.value = await window.api.getLocalHosts()
    } while (isHostsReloadQueued && !isUnmounted)
  } finally {
    isHostsLoading = false
    armHostsPoll()
  }
}
const reloadHosts = (): void => void loadHosts()
const pollHosts = whenVisible(reloadHosts)
const adoptHosts = (list: LocalHost[]): void => {
  localHosts.value = list
  if (!isHostsLoading) armHostsPoll()
}
watch(servers, () => void loadHosts())
const agentGroups = ref<AgentGroup[]>([])
const selectedSupervisor = ref<string | null>(null)
const isMovingOnly = ref(false)
const isFinishedHidden = ref(false)
const isTreePage = computed(() => page.value === 'tree')
const isHostsPage = computed(() => page.value === 'hosts' || page.value === 'insights' || page.value === 'timesheet' || page.value === 'flow' || page.value === 'today' || page.value === 'catalog')
const visibleGroups = computed(() =>
  filterGroups(agentGroups.value, { isMovingOnly: isMovingOnly.value, isFinishedHidden: isFinishedHidden.value })
)
const agentCounts = computed(() => treeCounts(agentGroups.value, sessions.value))
const selectedGroup = computed(() => agentGroups.value.find((g) => g.sessionId === selectedSupervisor.value) ?? null)
const TREE_FAST_MS = 5000
const TREE_SLOW_MS = 30000
let treeTimer: ReturnType<typeof setTimeout> | null = null
const loadTree = async (): Promise<void> => {
  if (treeTimer) clearTimeout(treeTimer)
  agentGroups.value = (await window.api.getAgentTree()) ?? []
  treeTimer = setTimeout(pollTree, isTreePage.value ? TREE_FAST_MS : TREE_SLOW_MS)
}
const reloadTree = (): void => void loadTree()
const pollTree = whenVisible(reloadTree)
const mrForTicket = (key: string): MrRow | null => {
  const list = myMrs.value.items.filter((m) => m.ticket === key)
  return list.find((m) => m.author === myMrs.value.myName) ?? list[0] ?? null
}
const tabRequest = ref<TabRequest | null>(null)
const openTicket = (key: string): void => {
  page.value = 'tickets'
  selectedKey.value = key
}
const openMr = (key: string, sessionId: string | null = null): void => {
  if (!key) return
  const route = routeMr(myMrs.value.items.find((m) => m.key === key) ?? null, myMrs.value.myName ?? null, rows.value.map((r) => r.key))
  if (route.page === 'tickets') {
    openTicket(route.key)
    tabRequest.value = { key: route.key, tab: sessionId ? 'work' : 'mr', sessionId, at: Date.now() }
    return
  }
  page.value = 'mrs'
  selectedMrKey.value = key
}

const focusSession = (target: { ticket: string | null; sessionId: string }): void => {
  if (dispatcherId.value && target.sessionId.startsWith(dispatcherId.value)) {
    isDispatcherOpen.value = true
    return
  }
  if (target.ticket) {
    openTicket(target.ticket)
    tabRequest.value = { key: target.ticket, tab: 'work', sessionId: target.sessionId, at: Date.now() }
    return
  }
  const mr = myMrs.value.items.find((m) => m.sessionId === target.sessionId)
  if (mr) {
    openMr(mr.key, target.sessionId)
    return
  }
  page.value = 'tree'
  selectedSupervisor.value = target.sessionId
}

const titles = computed(() => Object.fromEntries(Object.values(tasks.value).map((t) => [t.ticket, t.title])))
const finishedKeys = computed(() =>
  splitSections(buildCards(sessions.value, tasks.value), []).finishedCards.map((c) => c.ticket)
)
const rows = computed(() => buildTaskRows(myTasks.value.tickets, sessions.value, finishedKeys.value, titles.value))
const selectedRow = computed(() => rows.value.find((r) => r.key === selectedKey.value) ?? null)
const lastSelectedMr = ref<MrRow | null>(null)
const liveSelectedMr = computed(() => myMrs.value.items.find((m) => m.key === selectedMrKey.value) ?? null)
const selectedMr = computed(() => liveSelectedMr.value ?? (lastSelectedMr.value?.key === selectedMrKey.value ? lastSelectedMr.value : null))
watch(liveSelectedMr, (row) => {
  if (row) lastSelectedMr.value = row
})
const isMrPage = computed(() => page.value === 'mrs')
const inboxRows = computed(() => buildInboxRows(sessions.value, titles.value, myMrs.value.items))
const isInboxOpen = ref(false)
const inboxOrder = ref<LiveOrder>(readFlag('dash.inboxNewest') ? 'newest' : 'attention')
const setInboxOrder = (next: LiveOrder): void => {
  inboxOrder.value = next
  writeSize('dash.inboxNewest', next === 'newest')
}
const liveRows = computed(() => buildLiveRows(sessions.value, titles.value, myMrs.value.items, inboxOrder.value))
const lastJumpId = ref<string | null>(null)
const viewedTabId = ref<string | null>(null)
const viewingId = computed(() => {
  return page.value === 'tickets' || page.value === 'mrs' ? viewedTabId.value : null
})
watch(viewingId, (id) => window.api.setViewingSession(id), { immediate: true })
const isPromptSearchOpen = ref(false)
const onGlobalKey = (ev: KeyboardEvent): void => {
  const shortcut = appShortcut(ev)
  if (!shortcut) return
  ev.preventDefault()
  ev.stopPropagation()
  if (ev.repeat) return
  if (shortcut === 'dispatcher') {
    void toggleDispatcher()
    return
  }
  promptTargetId.value = viewingId.value
  isPromptSearchOpen.value = !isPromptSearchOpen.value
}
const dispatcherId = ref<string | null>(null)
const isDispatcherOpen = ref(false)
const isDispatcherStarting = ref(false)
const dispatcherError = ref<string | null>(null)
const isDispatcherSession = (s: Session): boolean => !!dispatcherId.value && s.id.startsWith(dispatcherId.value)
const dispatcherSession = computed(() => sessions.value.find(isDispatcherSession) ?? null)
const isPanelSession = (s: Session): boolean => !isDispatcherSession(s)
const dispatcherCards = computed(() => dispatcherRows(inboxRows.value, dispatcherId.value))
const isCardWaiting = (r: InboxRow): boolean => r.status === 'waiting'
const dispatcherCount = computed(() => ({ total: dispatcherCards.value.length, isWaiting: dispatcherCards.value.some(isCardWaiting) }))
const panelSessionList = computed(() => sessions.value.filter(isPanelSession))
const toggleDispatcher = async (): Promise<void> => {
  if (isDispatcherOpen.value) {
    isDispatcherOpen.value = false
    return
  }
  isDispatcherOpen.value = true
  isDispatcherStarting.value = true
  try {
    const result = await window.api.openDispatcher()
    dispatcherError.value = result.error
    dispatcherId.value = result.sessionId ?? dispatcherId.value
  } finally {
    isDispatcherStarting.value = false
  }
}
const promptTargetId = ref<string | null>(null)
const promptTargetLabel = computed(() => {
  const s = sessions.value.find((x) => x.id === promptTargetId.value)
  return s ? (s.name ?? s.ticket ?? s.id.slice(0, 8)) : null
})
const openPage = (next: DashboardPage): void => {
  if (next === 'inbox') {
    isInboxOpen.value = !isInboxOpen.value
    return
  }
  page.value = next
  if (isListHidden.value) toggleList()
}
const openInboxRow = (row: InboxRow): void => {
  isInboxOpen.value = false
  if (isListHidden.value) toggleList()
  if (row.mrKey) {
    openMr(row.mrKey, row.sessionId)
    return
  }
  focusSession({ sessionId: row.sessionId, ticket: row.ticket })
  if (isTreePage.value) void loadTree()
}
const jumpToNext = (): void => {
  lastJumpId.value = nextInboxId(inboxRows.value, lastJumpId.value)
  const row = inboxRows.value.find((r) => r.sessionId === lastJumpId.value)
  if (row) openInboxRow(row)
}
const openJob = (job: Job): void => {
  if (isListHidden.value) toggleList()
  if (job.kind === 'ticket') openTicket(job.key)
  else openMr(job.key, job.sessionId)
}
const openSessionTask = (session: Session): void => {
  const review = mrOfSession(session, myMrs.value.items)
  if (isListHidden.value) toggleList()
  if (review) return openMr(review.key, session.id)
  const key = session.ticket?.toUpperCase()
  if (!key) return
  openTicket(key)
  tabRequest.value = { key, tab: 'work', sessionId: session.id, at: Date.now() }
}
const orchestratorJobs = ref<Job[]>([])
const isStartJobsOpen = ref(false)
const applyOrchestrator = (state: OrchestratorState): void => {
  orchestratorJobs.value = state.jobs
  dispatcherId.value = state.dispatcherSessionId
}
let stopOrchestrator: (() => void) | null = null
const counts = computed<Record<DashboardPage, number>>(() => ({
  today: attentionCount(orchestratorJobs.value),
  inbox: inboxRows.value.length,
  tickets: rows.value.length,
  mrs: myMrs.value.items.length,
  tree: agentGroups.value.length,
  hosts: localHosts.value ? countOpenHosts(localHosts.value) : servers.value.length,
  insights: 0,
  timesheet: 0,
  flow: 0,
  catalog: 0
}))

const alerts = computed(() => ({
  inbox: inboxRows.value.filter((r) => r.status === 'waiting').length,
  tickets: rows.value.filter((r) => r.sessions.some((s) => s.isLive && s.status === 'waiting')).length,
  mrs: myMrs.value.items.filter((m) => sessions.value.some((s) => s.isLive && s.status === 'waiting' && (s.id === m.sessionId || (!!m.ticket && s.ticket === m.ticket)))).length
}))
const isRefreshing = ref(false)
const refreshLists = async (): Promise<void> => {
  isRefreshing.value = true
  try {
    await Promise.all([window.api.refreshLists(), loadTree()])
  } finally {
    isRefreshing.value = false
  }
}
const isPanelFullScreen = ref(false)
const setPanelFullScreen = (isOn: boolean): void => {
  isPanelFullScreen.value = isOn
}
const isListHidden = ref(readFlag('dash.listHidden'))
const isSettingsOpen = ref(false)
const closeSettings = (): void => {
  isSettingsOpen.value = false
}
useEscapeClose(isSettingsOpen, closeSettings)
const PAGE_TITLES: Record<DashboardPage, string> = {
  today: 'Orchestrator',
  inbox: 'Inbox',
  tickets: 'My tickets',
  mrs: 'Merge requests',
  tree: 'Agent tree',
  hosts: 'Local servers',
  insights: 'Insights',
  timesheet: 'Timesheet',
  flow: 'Flow',
  catalog: 'Catalog'
}
const listWidth = ref(clampSize(readSize('dash.listWidth', 320), 220, 640))
const toggleList = (): void => {
  isListHidden.value = !isListHidden.value
  writeSize('dash.listHidden', isListHidden.value)
}
const resizeList = (delta: number): void => {
  listWidth.value = clampSize(listWidth.value + delta, 220, 640)
}
const saveListWidth = (): void => writeSize('dash.listWidth', listWidth.value)

const selectPage = (next: DashboardPage): void => {
  if (next === 'inbox') {
    openPage(next)
    return
  }
  if (next === page.value) {
    toggleList()
    return
  }
  page.value = next
  if (isListHidden.value) toggleList()
  if (next === 'tree') void loadTree()
}
const selectTicket = (key: string): void => {
  selectedKey.value = key
}
const selectMr = (key: string): void => {
  page.value = 'mrs'
  selectedMrKey.value = key
}
const focusedTerminalSurface = (): ActivitySurface => {
  const term = document.activeElement?.closest<HTMLElement>('[data-activity-ticket]')
  return term ? { kind: 'session', ticket: term.dataset.activityTicket || null } : null
}
const currentSurface = (): ActivitySurface => {
  const terminal = focusedTerminalSurface()
  if (terminal) return terminal
  const mr = selectedMr.value
  if (isMrPage.value) return mr ? { kind: 'mr', ticket: mr.ticket } : null
  const row = selectedRow.value
  if (!isTreePage.value && !isHostsPage.value && row) return { kind: 'ticket', key: row.key }
  return null
}
const isAppFocused = (): boolean => document.hasFocus()
let stopPing: (() => void) | null = null
let stopVisible: (() => void) | null = null
const catchUpPolls = (): void => {
  void loadTree()
  void loadHosts()
}

onMounted(() => {
  window.api.onSessions((s) => (sessions.value = s))
  window.api.onTasks((t) => (tasks.value = t))
  window.api.onUsage((u) => (usage.value = u))
  window.api.onMyTasks((result) => (myTasks.value = result))
  window.api.onStarred((keys) => (starred.value = keys))
  window.api.onMyMrs((mrs) => (myMrs.value = mrs))
  window.api.onServers((list) => (servers.value = list))
  window.api.onFocusSession(focusSession)
  window.api.onInboxNext(jumpToNext)
  window.addEventListener('keydown', onGlobalKey, true)
  stopOrchestrator = window.api.onOrchestrator(applyOrchestrator)
  void window.api.getOrchestrator().then(applyOrchestrator)
  void loadTree()
  void loadHosts()
  stopPing = startFocusPing(currentSurface, isAppFocused, window.api.markActivity, FOCUS_PING_MS)
  stopVisible = onVisible(catchUpPolls)
})
onBeforeUnmount(() => {
  stopOrchestrator?.()
  stopPing?.()
  stopVisible?.()
  window.removeEventListener('keydown', onGlobalKey, true)
  if (treeTimer) clearTimeout(treeTimer)
  isUnmounted = true
  if (hostsTimer) clearTimeout(hostsTimer)
})
</script>

<template>
  <div class="dash" :class="{ full: isPanelFullScreen }">
    <Sidebar
      v-show="!isPanelFullScreen"
      :page="page"
      :counts="counts"
      :alerts="alerts"
      :usage="usage"
      :is-list-open="!isListHidden"
      @select="selectPage"
      @settings="isSettingsOpen = true"
      @start-jobs="isStartJobsOpen = true"
    />
    <StartJobsDialog
      v-if="isStartJobsOpen"
      :tickets="myTasks.tickets"
      :mrs="myMrs.items"
      :my-name="myMrs.myName ?? null"
      :sessions="sessions"
      @close="isStartJobsOpen = false"
    />
    <div
      v-if="!isListHidden && !isHostsPage && !isPanelFullScreen"
      class="col"
      :style="{ width: `${listWidth}px` }"
    >
      <header class="colhead">
        <h2>{{ PAGE_TITLES[page] }}</h2>
        <span class="ccount">{{ counts[page] }}</span>
        <span class="grow" />
        <button class="iconbtn" :class="{ spinning: isRefreshing }" title="Refresh tickets and merge requests now" :disabled="isRefreshing" @click="refreshLists"><Icon name="refresh" /></button>
        <button class="iconbtn" title="Hide the list" @click="toggleList"><Icon name="panelClose" /></button>
      </header>
      <AgentList
        v-if="isTreePage"
        v-model:is-moving-only="isMovingOnly"
        v-model:is-finished-hidden="isFinishedHidden"
        :groups="visibleGroups"
        :sessions="sessions"
        :selected-id="selectedSupervisor"
        :counts="agentCounts"
        @select="selectedSupervisor = $event"
      />
      <MrList
        v-else-if="isMrPage"
        :rows="myMrs.items"
        :starred="starred"
        :selected-key="selectedMrKey"
        :error="myMrs.error"
        :error-detail="myMrs.errorDetail"
        :my-name="myMrs.myName"
        :sessions="sessions"
        :is-loading="myMrs.isLoading"
        :is-all-projects="myMrs.isAllProjects"
        :tasks="rows"
        @select="selectMr"
        @open-ticket="openTicket"
        @settings="isSettingsOpen = true"
      />
      <TicketList
        v-else
        :rows="rows"
        :starred="starred"
        :selected-key="selectedKey"
        :jira-error="myTasks.error"
        :mrs="myMrs.items"
        :my-name="myMrs.myName"
        :sessions="sessions"
        @select="selectTicket"
        @open-mr="openMr"
        @settings="isSettingsOpen = true"
      />
    </div>
    <Splitter
      v-if="!isListHidden && !isHostsPage && !isPanelFullScreen"
      @resize="resizeList"
      @done="saveListWidth"
    />
    <FlowView v-if="page === 'flow'" :rows="rows" @open-ticket="openTicket" />
    <InsightsView v-else-if="page === 'insights'" />
    <TimesheetView
      v-else-if="page === 'timesheet'"
      :sessions="sessions"
      :tickets="myTasks.tickets"
      @open-ticket="openTicket"
    />
    <CatalogView v-else-if="page === 'catalog'" />
    <HostsView v-else-if="page === 'hosts'" :sessions="sessions" @open-ticket="openTicket" @hosts-changed="adoptHosts" />
    <AgentView
      v-else-if="isTreePage && selectedGroup"
      :group="selectedGroup"
      :session="sessions.find((s) => s.id === selectedGroup?.sessionId)"
      @open-ticket="openTicket"
    />
    <div v-else-if="isTreePage" class="empty">
      <Icon name="tree" :size="36" />
      <h3>No supervisor selected</h3>
      <p>Pick a session on the left to see the agents it dispatched, what each one is doing and its full run.</p>
    </div>
    <KeepAlive :max="11">
      <OrchestratorView
        v-if="page === 'today'"
        key="command-panel"
        :tickets="myTasks.tickets"
        :mrs="myMrs.items"
        :my-name="myMrs.myName ?? null"
        :sessions="panelSessionList"
        @open="openJob"
        @open-task="openSessionTask"
        @full-screen="setPanelFullScreen"
        @dispatcher="toggleDispatcher"
        @open-mr="openMr"
      />
      <MrView
        v-else-if="isMrPage && selectedMr"
        :key="`mr-${selectedMr.key}`"
        :row="selectedMr"
        :sessions="sessions"
        :is-gone="!liveSelectedMr"
        :my-name="myMrs.myName"
        :servers="servers"
        :task-stage="selectedMr.ticket ? (tasks[selectedMr.ticket]?.stage ?? null) : null"
        @viewing="viewedTabId = $event"
      />
      <TicketView
        v-else-if="!isMrPage && !isTreePage && !isHostsPage && selectedRow"
        :key="`t-${selectedRow.key}`"
        :row="selectedRow"
        :servers="servers"
        :mr-url="tasks[selectedRow.key]?.mrUrl ?? null"
        :mr="mrForTicket(selectedRow.key)"
        :my-name="myMrs.myName ?? null"
        :mr-session="findReviewSession(sessions, mrForTicket(selectedRow.key)?.sessionId ?? null) ?? null"
        :stage="tasks[selectedRow.key]?.stage ?? null"
        :reached="tasks[selectedRow.key]?.reached ?? []"
        :tab-request="tabRequest"
        @open-mr="openMr"
        @viewing="viewedTabId = $event"
      />
    </KeepAlive>
    <div v-if="isMrPage && !selectedMr" class="empty">
      <Icon name="pr" :size="36" />
      <h3>No merge request selected</h3>
      <p>Pick one from the list to read the diff and review it with Claude.</p>
    </div>
    <div v-else-if="!isMrPage && !isTreePage && !isHostsPage && !selectedRow" class="empty">
      <Icon name="ticket" :size="36" />
      <h3>No ticket selected</h3>
      <p>Pick a ticket from the list to work on it with Claude, see the code and run its server.</p>
    </div>

    <InboxPopup v-if="isInboxOpen" :rows="liveRows" :order="inboxOrder" @open="openInboxRow" @close="isInboxOpen = false" @order="setInboxOrder" />
    <PromptSearch v-if="isPromptSearchOpen" :session-id="promptTargetId" :target-label="promptTargetLabel" @close="isPromptSearchOpen = false" />
    <DispatcherOverlay
      v-if="isDispatcherOpen"
      :session="dispatcherSession"
      :error="dispatcherError"
      :is-starting="isDispatcherStarting"
      :rows="dispatcherCards"
      @close="isDispatcherOpen = false"
      @open="openInboxRow"
    />
    <StatusBar
      v-show="!isPanelFullScreen"
      :sessions="sessions"
      :servers="servers"
      :my-tasks="myTasks"
      :my-mrs="myMrs"
      :is-panel-page="page === 'today'"
      :is-dispatcher-open="isDispatcherOpen"
      :dispatcher-count="dispatcherCount"
      @open="openPage"
      @dispatcher="toggleDispatcher"
    />
    <div v-if="isSettingsOpen" class="scrim" @click="isSettingsOpen = false" />
    <aside v-if="isSettingsOpen" class="drawer">
      <header class="dhead">
        <Icon name="settings" />
        <h2>Settings</h2>
        <span class="grow" />
        <button class="iconbtn" title="Close" @click="isSettingsOpen = false"><Icon name="close" /></button>
      </header>
      <div class="dbody">
        <SettingsPanel />
      </div>
    </aside>
  </div>
</template>

<style scoped>
.dash {
  display: flex;
  height: calc(100vh - 22px);
  overflow: hidden;
  background: var(--bg-1);
  color: var(--text-2);
  font: 13px/1.45 var(--font-ui);
  -webkit-font-smoothing: antialiased;
}
.dash.full {
  height: 100vh;
}
.col {
  flex: none;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--bg-1);
}
.col > :deep(.list) {
  flex: 1;
  min-height: 0;
  width: 100%;
}
.colhead {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 48px;
  padding: 0 8px 0 16px;
  box-sizing: border-box;
}
.colhead h2,
.dhead h2 {
  margin: 0;
  font: 600 14px var(--font-ui);
  color: var(--text);
}
.ccount {
  font-size: 12px;
  color: var(--text-4);
}
.grow {
  flex: 1;
}
.iconbtn {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
  color: var(--text-4);
  background: none;
  border: none;
  border-radius: 7px;
  cursor: pointer;
}
.iconbtn.spinning .icon {
  animation: turn 0.9s linear infinite;
}
@keyframes turn {
  to {
    transform: rotate(360deg);
  }
}
.iconbtn:hover,
.iconbtn:focus-visible {
  color: var(--text);
  background: var(--bg-3);
  outline: none;
}
.tabs {
  display: flex;
  gap: 2px;
  margin: 0 12px 4px;
  padding: 2px;
  background: var(--bg-0);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.tabs button {
  flex: 1;
  height: 26px;
  font: 12px var(--font-ui);
  color: var(--text-3);
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.tabs button.on {
  color: var(--text);
  background: var(--bg-4);
}
.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 24px;
  color: var(--text-5);
  text-align: center;
}
.empty h3 {
  margin: 8px 0 0;
  font: 600 15px var(--font-ui);
  color: var(--text-2);
}
.empty p {
  max-width: 340px;
  margin: 0;
  color: var(--text-4);
}
.scrim {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(5, 6, 8, 0.55);
}
.drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 41;
  display: flex;
  flex-direction: column;
  width: min(480px, 92vw);
  background: var(--bg-1);
  border-left: 1px solid var(--line-2);
  box-shadow: var(--shadow);
}
.dhead {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 52px;
  padding: 0 10px 0 18px;
  color: var(--text-3);
  border-bottom: 1px solid var(--line);
}
.dbody {
  flex: 1;
  overflow-y: auto;
  padding: 6px 6px 24px;
}
.dbody :deep(.settings) {
  padding: 14px 16px;
  font: 13px/1.45 var(--font-ui);
  color: var(--text-2);
}
.dbody :deep(.flbl) {
  font-weight: 600;
  color: var(--text);
}
.dbody :deep(.inp) {
  box-sizing: border-box;
  min-height: 32px;
  padding: 6px 10px;
  font: 13px var(--font-ui);
  color: var(--text);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 7px;
}
.dbody :deep(.inp:focus) {
  border-color: var(--accent);
}
.dbody :deep(.hint) {
  margin-top: 5px;
  font-size: 12px;
  line-height: 1.45;
  word-break: normal;
  overflow-wrap: anywhere;
  color: var(--text-4);
}
.dbody :deep(.btn) {
  min-height: 30px;
  padding: 0 12px;
  font: 500 12.5px var(--font-ui);
  color: var(--text-2);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 7px;
}
.dbody :deep(.btn:hover:not(:disabled)) {
  color: var(--text);
  border-color: var(--line-3);
}
.dbody :deep(.toggle) {
  border-color: var(--line);
}
</style>
