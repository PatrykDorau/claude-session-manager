<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import type { AgentGroup, DevServer, MrRow, MyMrs, MyTasks, Session, TaskMeta, UsageResult } from '../types'
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
import { treeCounts, filterGroups } from './agenttree'
import { clampSize, readSize, writeSize, readFlag } from './dashboard'

const sessions = ref<Session[]>([])
const tasks = ref<Record<string, TaskMeta>>({})
const usage = ref<UsageResult | null>(window.api.getUsage())
const myTasks = ref<MyTasks>(window.api.getMyTasks())
const starred = ref<string[]>(window.api.getStarred())
const page = ref<DashboardPage>('tickets')
const selectedKey = ref<string | null>(null)
const myMrs = ref<MyMrs>(window.api.getMyMrs())
const selectedMrKey = ref<string | null>(null)
const starredTab = ref<'tickets' | 'mrs'>('tickets')
const servers = ref<DevServer[]>(window.api.getServers())
const agentGroups = ref<AgentGroup[]>([])
const selectedSupervisor = ref<string | null>(null)
const isMovingOnly = ref(false)
const isFinishedHidden = ref(false)
const isTreePage = computed(() => page.value === 'tree')
const isHostsPage = computed(() => page.value === 'hosts')
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
  treeTimer = setTimeout(loadTree, isTreePage.value ? TREE_FAST_MS : TREE_SLOW_MS)
}
const mrForTicket = (key: string): MrRow | null => {
  const list = myMrs.value.items.filter((m) => m.ticket === key)
  return list.find((m) => m.author === myMrs.value.myName) ?? list[0] ?? null
}
const openMr = (key: string): void => {
  if (!key) return
  page.value = 'mrs'
  selectedMrKey.value = key
}
const openTicket = (key: string): void => {
  page.value = 'tickets'
  selectedKey.value = key
}

const titles = computed(() => Object.fromEntries(Object.values(tasks.value).map((t) => [t.ticket, t.title])))
const finishedKeys = computed(() =>
  splitSections(buildCards(sessions.value, tasks.value), []).finishedCards.map((c) => c.ticket)
)
const rows = computed(() => buildTaskRows(myTasks.value.tickets, sessions.value, finishedKeys.value, titles.value))
const selectedRow = computed(() => rows.value.find((r) => r.key === selectedKey.value) ?? null)
const lastSelectedMr = ref<MrRow | null>(null)
const liveSelectedMr = computed(() => myMrs.value.items.find((m) => m.key === selectedMrKey.value) ?? null)
const selectedMr = computed(() =>
  liveSelectedMr.value ?? (lastSelectedMr.value?.key === selectedMrKey.value ? lastSelectedMr.value : null)
)
watch(liveSelectedMr, (row) => {
  if (row) lastSelectedMr.value = row
})
const isMrPage = computed(() => page.value === 'mrs' || (page.value === 'starred' && starredTab.value === 'mrs'))
const counts = computed<Record<DashboardPage, number>>(() => ({
  tickets: rows.value.length,
  mrs: myMrs.value.items.length,
  starred:
    rows.value.filter((r) => starred.value.includes(r.key)).length +
    myMrs.value.items.filter((m) => starred.value.includes(m.key)).length,
  tree: agentGroups.value.length,
  hosts: servers.value.length
}))

const alerts = computed(() => ({
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
const isListHidden = ref(readFlag('dash.listHidden'))
const isSettingsOpen = ref(false)
const PAGE_TITLES: Record<DashboardPage, string> = {
  tickets: 'My tickets',
  mrs: 'Merge requests',
  starred: 'Starred',
  tree: 'Agent tree',
  hosts: 'Local servers'
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
  selectedMrKey.value = key
}

onMounted(() => {
  window.api.onSessions((s) => (sessions.value = s))
  window.api.onTasks((t) => (tasks.value = t))
  window.api.onUsage((u) => (usage.value = u))
  window.api.onMyTasks((result) => (myTasks.value = result))
  window.api.onStarred((keys) => (starred.value = keys))
  window.api.onMyMrs((mrs) => (myMrs.value = mrs))
  window.api.onServers((list) => (servers.value = list))
  void loadTree()
})
onBeforeUnmount(() => {
  if (treeTimer) clearTimeout(treeTimer)
})
</script>

<template>
  <div class="dash">
    <Sidebar
      :page="page"
      :counts="counts"
      :alerts="alerts"
      :usage="usage"
      :is-list-open="!isListHidden"
      @select="selectPage"
      @settings="isSettingsOpen = true"
    />
    <div v-if="!isListHidden && !isHostsPage" class="col" :style="{ width: `${listWidth}px` }">
      <header class="colhead">
        <h2>{{ PAGE_TITLES[page] }}</h2>
        <span class="ccount">{{ counts[page] }}</span>
        <span class="grow" />
        <button class="iconbtn" :class="{ spinning: isRefreshing }" title="Refresh tickets and merge requests now" :disabled="isRefreshing" @click="refreshLists"><Icon name="refresh" /></button>
        <button class="iconbtn" title="Hide the list" @click="toggleList"><Icon name="panelClose" /></button>
      </header>
      <div v-if="page === 'starred'" class="tabs">
        <button :class="{ on: starredTab === 'tickets' }" @click="starredTab = 'tickets'">Tickets</button>
        <button :class="{ on: starredTab === 'mrs' }" @click="starredTab = 'mrs'">Merge requests</button>
      </div>
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
        :is-starred-only="page === 'starred'"
        :selected-key="selectedMrKey"
        :error="myMrs.error"
        :error-detail="myMrs.errorDetail"
        :my-name="myMrs.myName"
        :sessions="sessions"
        :is-loading="myMrs.isLoading"
        :is-all-projects="myMrs.isAllProjects"
        @select="selectMr"
        @settings="isSettingsOpen = true"
      />
      <TicketList
        v-else
        :rows="rows"
        :starred="starred"
        :is-starred-only="page === 'starred'"
        :selected-key="selectedKey"
        :jira-error="myTasks.error"
        :mrs="myMrs.items"
        :my-name="myMrs.myName"
        @select="selectTicket"
        @open-mr="openMr"
        @settings="isSettingsOpen = true"
      />
    </div>
    <Splitter v-if="!isListHidden && !isHostsPage" @resize="resizeList" @done="saveListWidth" />
    <HostsView v-if="isHostsPage" :sessions="sessions" @open-ticket="openTicket" />
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
    <KeepAlive :max="10">
      <MrView
        v-if="isMrPage && selectedMr"
        :key="`mr-${selectedMr.key}`"
        :row="selectedMr"
        :sessions="sessions"
        :is-gone="!liveSelectedMr"
        :my-name="myMrs.myName"
        :servers="servers"
      />
      <TicketView
        v-else-if="!isMrPage && !isTreePage && !isHostsPage && selectedRow"
        :key="`t-${selectedRow.key}`"
        :row="selectedRow"
        :servers="servers"
        :mr-url="tasks[selectedRow.key]?.mrUrl ?? null"
        :mr="mrForTicket(selectedRow.key)"
        @open-mr="openMr"
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
  height: 100vh;
  overflow: hidden;
  background: var(--bg-1);
  color: var(--text-2);
  font: 13px/1.45 var(--font-ui);
  -webkit-font-smoothing: antialiased;
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
