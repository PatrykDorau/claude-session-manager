<script setup lang="ts">
import { ref, computed, onMounted, provide } from 'vue'
import type { CloseCandidate, MyTasks, Session, TaskMeta, UsageResult, WorktreeRow } from './types'
import SessionList from './components/SessionList.vue'
import StatsPanel from './components/StatsPanel.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import SetupGuide from './components/SetupGuide.vue'
import TicketPicker from './components/TicketPicker.vue'
import TaskCard from './components/TaskCard.vue'
import CloseFinishedDialog from './components/CloseFinishedDialog.vue'
import WorktreesDialog from './components/WorktreesDialog.vue'
import TaskView from './components/TaskView.vue'
import UsageBar from './components/UsageBar.vue'
import { sortSessions, type SortMode } from './sort'
import { buildCards, splitSections, sortCards, sortNoTask, cardMatches } from './cards'
import { matchesQuery, matchesFilter, type StatusFilter } from './filter'
import { playSound, type SoundName } from './sound'

type View = 'list' | 'stats' | 'settings' | 'guide'

const sessions = ref<Session[]>([])
const tasks = ref<Record<string, TaskMeta>>({})
const usage = ref<UsageResult | null>(window.api.getUsage())
const loaded = ref(false)
const minElapsed = ref(false)
const ready = computed(() => loaded.value && minElapsed.value)
const version = ((): string => {
  try {
    return window.api.getVersion()
  } catch {
    return ''
  }
})()
const view = ref<View>('list')
const tasksOpen = ref(true)
const noTaskOpen = ref(true)
const finishedOpen = ref(false)
const controlsOpen = ref(localStorage.getItem('controlsOpen') !== '0')
const search = ref('')
const statusFilter = ref<StatusFilter>('all')
const sortMode = ref<SortMode>((localStorage.getItem('sortMode') as SortMode) || 'status')
const groupBy = ref(localStorage.getItem('groupBy') === '1')
const colorblind = ref(localStorage.getItem('colorblind') === '1')
provide('colorblind', colorblind)
const resumeFail = ref<{ label: string; command: string } | null>(null)
const copied = ref(false)
const cliStatus = ref<{ claude: boolean; editor: boolean }>({ claude: true, editor: true })
const menuOpen = ref(false)
const ticketPicker = ref<Session | null>(null)
const dock = ref(window.api.getDockState())
const restoreCount = ref(0)
const restoreSessions = (): void => window.api.restoreSessions()
const dismissRestore = (): void => window.api.dismissRestore()
const closeCandidates = ref<CloseCandidate[]>([])
const closeDialog = ref<CloseCandidate[] | null>(null)
const openCloseDialog = (): void => {
  closeDialog.value = [...closeCandidates.value]
}
const worktrees = ref<WorktreeRow[]>([])
const isWorktreesOpen = ref(false)
const myTasks = ref<MyTasks>(window.api.getMyTasks())
const viewMode = ref<'sessions' | 'tasks'>(localStorage.getItem('viewMode') === 'tasks' ? 'tasks' : 'sessions')
const openDashboard = (): void => window.api.openDashboard()
const setViewMode = (mode: 'sessions' | 'tasks'): void => {
  viewMode.value = mode
  localStorage.setItem('viewMode', mode)
}

const cliBanner = computed(() => {
  if (!cliStatus.value.claude) return 'Claude Code not detected on PATH — open Setup'
  if (!cliStatus.value.editor) return 'VS Code not detected — sessions will open in a terminal'
  return ''
})
const notSignedIn = computed(
  () => !!usage.value && !usage.value.ok && usage.value.error === 'no-credentials'
)

onMounted(() => {
  setTimeout(() => (minElapsed.value = true), 600)
  window.api.onTasks((t) => (tasks.value = t))
  window.api.onDockState((s) => (dock.value = s))
  window.api.onSessions((s) => {
    sessions.value = s
    loaded.value = true
  })
  window.api.onClaudeStatus((s) => (cliStatus.value = s))
  window.api.onUsage((u) => (usage.value = u))
  window.api.onResumeFailed((info) => {
    resumeFail.value = info
    copied.value = false
  })
  window.api.onRestoreState((r) => (restoreCount.value = r.count))
  window.api.onCloseCandidates((list) => (closeCandidates.value = list))
  window.api.onWorktrees((rows) => (worktrees.value = rows))
  window.api.onMyTasks((result) => (myTasks.value = result))
  window.api.onPlayAlert(playChime)
  window.api.onMenuState((open) => (menuOpen.value = open))
  window.api.onOpenTicketPicker((s) => (ticketPicker.value = s))
  if (!localStorage.getItem('guideSeen')) {
    view.value = 'guide'
    localStorage.setItem('guideSeen', '1')
  }
})

function playChime(): void {
  if (localStorage.getItem('alertSound') === '0') return
  playSound((localStorage.getItem('alertSoundName') as SoundName) || 'chime')
}

function copyResumeCmd(): void {
  if (!resumeFail.value) return
  window.api.copyText(resumeFail.value.command)
  copied.value = true
}

const filtered = computed(() =>
  sessions.value.filter(
    (s) => matchesQuery(s, search.value) && matchesFilter(s, statusFilter.value)
  )
)
const cards = computed(() =>
  buildCards(sessions.value, tasks.value).filter(
    (c) => cardMatches(c, search.value) && c.sessions.some((s) => matchesFilter(s, statusFilter.value))
  )
)
const sections = computed(() =>
  splitSections(
    cards.value,
    filtered.value.filter((s) => !s.ticket)
  )
)
const taskCards = computed(() => sortCards(sections.value.tasks, sortMode.value))
const noTaskSorted = computed(() => sortNoTask(sections.value.noTask, sortMode.value))
const finishedCards = computed(() => sortCards(sections.value.finishedCards, 'recency'))
const finishedSorted = computed(() => sortSessions(sections.value.finishedSessions, 'recency'))
const taskTitles = computed(() =>
  Object.fromEntries(Object.values(tasks.value).map((t) => [t.ticket, t.title]))
)
const finishedKeys = computed(() =>
  splitSections(buildCards(sessions.value, tasks.value), []).finishedCards.map((c) => c.ticket)
)
const finishedCount = computed(() => finishedCards.value.length + finishedSorted.value.length)
const activeFilterCount = computed(
  () => (search.value.trim() ? 1 : 0) + (statusFilter.value !== 'all' ? 1 : 0)
)

function setSort(m: SortMode): void {
  sortMode.value = m
  localStorage.setItem('sortMode', m)
}
function toggleGroup(): void {
  groupBy.value = !groupBy.value
  localStorage.setItem('groupBy', groupBy.value ? '1' : '0')
}
function show(v: View): void {
  view.value = view.value === v ? 'list' : v
}
function toggleControls(): void {
  controlsOpen.value = !controlsOpen.value
  localStorage.setItem('controlsOpen', controlsOpen.value ? '1' : '0')
}
function toggleDock(): void {
  window.api.toggleDock()
}
function minimize(): void {
  window.api.minimizeWindow()
}
</script>

<template>
  <div class="wrap">
    <header>
      <span class="title" title="Back to sessions" @click="view = 'list'"
        >Claude Cockpit <span v-if="version" class="ver">v{{ version }}</span></span
      >
      <div class="hbtns">
        <button
          v-if="view === 'list'"
          class="hb"
          :class="{ on: controlsOpen, active: activeFilterCount }"
          :title="controlsOpen ? 'Hide search & filters' : 'Show search & filters'"
          @click="toggleControls"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          <span v-if="activeFilterCount" class="badge">{{ activeFilterCount }}</span>
        </button>
        <button
          class="hb"
          :class="{ on: dock.isDocked }"
          :title="dock.isDocked ? 'Undock' : 'Dock to the nearest screen edge'"
          @click="toggleDock"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <line v-if="dock.isDocked && dock.edge === 'left'" x1="9" y1="4" x2="9" y2="20" />
            <line v-else x1="15" y1="4" x2="15" y2="20" />
          </svg>
        </button>
        <button class="hb" :class="{ on: view === 'stats' }" title="Statistics" @click="show('stats')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="6" y1="20" x2="6" y2="13" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="18" y1="20" x2="18" y2="9" />
          </svg>
        </button>
        <button class="hb" :class="{ on: view === 'guide' }" title="Setup guide" @click="show('guide')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </button>
        <button
          class="hb"
          :class="{ on: view === 'settings' }"
          title="Settings"
          @click="show('settings')"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        <button class="hb" title="Minimize" @click="minimize">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
    </header>
    <div
      v-if="cliBanner"
      class="banner"
      :class="{ warn: !cliStatus.claude }"
      title="Open the setup guide"
      @click="view = 'guide'"
    >
      {{ cliBanner }}
    </div>
    <div v-if="!ready" class="loading">
      <div class="spinner" />
    </div>
    <div v-else-if="view === 'stats'" class="scroll">
      <StatsPanel :sessions="sessions" :usage="usage" />
    </div>
    <div v-else-if="view === 'settings'" class="scroll">
      <SettingsPanel />
    </div>
    <div v-else-if="view === 'guide'" class="scroll">
      <SetupGuide />
    </div>
    <template v-else>
      <UsageBar :result="usage" />
      <div v-if="notSignedIn" class="signin" @click="view = 'settings'">
        Not signed in — open Settings to switch account
      </div>
      <div v-show="controlsOpen" class="filterbar">
        <input v-model="search" class="search" placeholder="Search project, ticket, prompt…" />
        <div class="chips">
          <button :class="{ on: statusFilter === 'all' }" @click="statusFilter = 'all'">All</button>
          <button :class="{ on: statusFilter === 'needs' }" @click="statusFilter = 'needs'">
            Needs you
          </button>
          <button :class="{ on: statusFilter === 'working' }" @click="statusFilter = 'working'">
            Working
          </button>
          <button :class="{ on: statusFilter === 'live' }" @click="statusFilter = 'live'">Live</button>
        </div>
      </div>
      <div v-show="controlsOpen" class="toolbar">
        <div class="sortbtns">
          <button :class="{ on: sortMode === 'status' }" @click="setSort('status')">Status</button>
          <button :class="{ on: sortMode === 'recency' }" @click="setSort('recency')">Recent</button>
          <button :class="{ on: sortMode === 'project' }" @click="setSort('project')">Project</button>
        </div>
        <button class="grp" :class="{ on: groupBy }" title="Group by project" @click="toggleGroup">
          ⊞ group
        </button>
      </div>
      <div class="scroll">
        <div class="viewtoggle">
          <button :class="{ on: viewMode === 'sessions' }" @click="setViewMode('sessions')">Sessions</button>
          <button :class="{ on: viewMode === 'tasks' }" @click="setViewMode('tasks')">Tasks</button>
          <button class="dash" title="Open the dashboard" @click="openDashboard">
            <svg viewBox="0 0 16 16"><rect x="2" y="2" width="5" height="5" /><rect x="9" y="2" width="5" height="5" /><rect x="2" y="9" width="5" height="5" /><rect x="9" y="9" width="5" height="5" /></svg>
            Dashboard
          </button>
        </div>
        <div v-if="restoreCount" class="restore">
          <span>Restore {{ restoreCount }} {{ restoreCount === 1 ? 'session' : 'sessions' }} from last work</span>
          <button class="primary" @click="restoreSessions">Restore</button>
          <button @click="dismissRestore">Dismiss</button>
        </div>
        <TaskView
          v-if="viewMode === 'tasks'"
          :tickets="myTasks.tickets"
          :jira-error="myTasks.error"
          :sessions="sessions"
          :finished-keys="finishedKeys"
          :titles="taskTitles"
        />
        <template v-else>
        <div class="shead" @click="tasksOpen = !tasksOpen">
          <span class="chev">{{ tasksOpen ? '▾' : '▸' }}</span>
          Tasks <span class="count">{{ taskCards.length }}</span>
          <button
            v-if="closeCandidates.length"
            class="closefin"
            title="Close the sessions of finished tickets"
            @click.stop="openCloseDialog"
          >
            <svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" /></svg>
            <span class="cflabel">Finished</span>
            <span class="cfcount">{{ closeCandidates.length }}</span>
          </button>
          <button
            v-if="worktrees.length"
            class="closefin"
            title="Open or delete worktrees"
            @click.stop="isWorktreesOpen = true"
          >
            <svg viewBox="0 0 16 16"><path d="M5 3v10M5 8c4 0 6-1 6-5M11 3v0" /><circle cx="11" cy="3" r="1.5" /></svg>
            <span class="cflabel">Worktrees</span>
            <span class="cfcount">{{ worktrees.length }}</span>
          </button>
        </div>
        <ul v-show="tasksOpen">
          <TaskCard v-for="c in taskCards" :key="c.ticket" :card="c" />
          <li v-if="!taskCards.length" class="empty">No tasks</li>
        </ul>

        <div class="shead" @click="noTaskOpen = !noTaskOpen">
          <span class="chev">{{ noTaskOpen ? '▾' : '▸' }}</span>
          No task <span class="count">{{ noTaskSorted.length }}</span>
        </div>
        <SessionList
          v-show="noTaskOpen"
          :sessions="noTaskSorted"
          :group-by="groupBy"
          empty-text="No sessions without a task"
        />

        <div v-if="finishedCount" class="shead" @click="finishedOpen = !finishedOpen">
          <span class="chev">{{ finishedOpen ? '▾' : '▸' }}</span>
          Finished <span class="count">{{ finishedCount }}</span>
        </div>
        <ul v-show="finishedOpen">
          <TaskCard v-for="c in finishedCards" :key="c.ticket" :card="c" />
        </ul>
        <SessionList
          v-show="finishedOpen"
          :sessions="finishedSorted"
          :group-by="groupBy"
          empty-text=""
        />
        </template>
      </div>
    </template>

    <div v-if="menuOpen" class="clickblock" @click.stop @contextmenu.prevent />

    <div v-if="resumeFail" class="modal" @click.self="resumeFail = null">
      <div class="dialog">
        <div class="dtitle">Couldn't auto-resume</div>
        <p class="dmsg">
          Couldn't focus VS Code to type the command for <b>{{ resumeFail.label }}</b
          >. Paste this into a terminal to resume it:
        </p>
        <code class="cmd">{{ resumeFail.command }}</code>
        <div class="dbtns">
          <button class="db" @click="copyResumeCmd">{{ copied ? 'Copied ✓' : 'Copy' }}</button>
          <button class="db ghost" @click="resumeFail = null">Close</button>
        </div>
      </div>
    </div>

    <TicketPicker v-if="ticketPicker" :session="ticketPicker" @close="ticketPicker = null" />
    <CloseFinishedDialog
      v-if="closeDialog"
      :candidates="closeDialog"
      @close="closeDialog = null"
    />
    <WorktreesDialog v-if="isWorktreesOpen" :rows="worktrees" @close="isWorktreesOpen = false" />
  </div>
</template>

<style scoped>
.wrap {
  font: 12px system-ui;
  color: #ededed;
  background: #1b1b1b;
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  font-weight: 600;
  border-bottom: 1px solid #2b2b2b;
  -webkit-app-region: drag;
}
.title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  -webkit-app-region: no-drag;
}
.title:hover {
  color: #2ef05a;
}
.ver {
  color: #737373;
  font-size: 10px;
  font-weight: 400;
}
.banner {
  flex: none;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  color: #d4d4d4;
  background: #2b2b2b;
  border-bottom: 1px solid #3a3a3a;
}
.banner.warn {
  color: #f0e3c2;
  background: #3d2c10;
  border-bottom-color: #6b4e16;
}
.banner:hover {
  filter: brightness(1.2);
}
.restore {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 6px 8px;
  padding: 6px 8px;
  font-size: 11px;
  color: #d4d4d4;
  background: #1c1530;
  border: 1px solid #00e62e;
  border-radius: 6px;
}
.restore span {
  flex: 1;
}
.restore button {
  font-size: 11px;
  padding: 2px 8px;
  color: #d4d4d4;
  background: #2b2b2b;
  border: 1px solid #3a3a3a;
  border-radius: 4px;
  cursor: pointer;
}
.restore button.primary {
  background: #00e62e;
  border-color: #00e62e;
  color: #111111;
}
.viewtoggle {
  display: flex;
  gap: 4px;
  margin: 6px 8px 0;
}
.viewtoggle button {
  flex: 1;
  font-size: 11px;
  padding: 3px 0;
  color: #9a9a9a;
  background: #1b1b1b;
  border: 1px solid #3a3a3a;
  border-radius: 4px;
  cursor: pointer;
}
.viewtoggle button.on {
  color: #111111;
  background: #00e62e;
  border-color: #00e62e;
}
.viewtoggle button.dash {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
}
.viewtoggle button.dash:hover {
  color: #ededed;
  border-color: #00e62e;
}
.viewtoggle button.dash svg {
  width: 10px;
  height: 10px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
}
.closefin {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  height: 20px;
  padding: 0 4px 0 6px;
  font-size: 10px;
  font-weight: 500;
  color: #d4d4d4;
  background: #232323;
  border: 1px solid #3a3a3a;
  border-radius: 6px;
  cursor: pointer;
}
.closefin:hover {
  color: #ededed;
  border-color: #00e62e;
}
.closefin svg {
  flex: none;
  width: 10px;
  height: 10px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
}
.cflabel {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cfcount {
  flex: none;
  min-width: 14px;
  padding: 0 4px;
  border-radius: 4px;
  font-weight: 700;
  text-align: center;
  color: #111111;
  background: #00e62e;
}
.closefin:first-of-type {
  margin-left: auto;
}
.signin {
  flex: none;
  padding: 5px 10px;
  font-size: 10px;
  color: #e69f00;
  cursor: pointer;
  border-bottom: 1px solid #2b2b2b;
}
.signin:hover {
  text-decoration: underline;
}
.loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.spinner {
  width: 26px;
  height: 26px;
  border: 3px solid #2b2b2b;
  border-top-color: #2ef05a;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.hbtns {
  flex: none;
  display: flex;
  gap: 4px;
  -webkit-app-region: no-drag;
}
.hb {
  background: none;
  border: 1px solid #3a3a3a;
  color: #9a9a9a;
  border-radius: 5px;
  cursor: pointer;
  line-height: 1;
  padding: 4px 7px;
  display: inline-flex;
  align-items: center;
}
.hb svg {
  width: 15px;
  height: 15px;
  display: block;
}
.hb:hover {
  color: #ededed;
}
.hb.on {
  color: #2ef05a;
  border-color: #2ef05a;
}
.hb.active {
  color: #f0883e;
  border-color: #f0883e;
}
.badge {
  margin-left: 3px;
  font-size: 10px;
  font-weight: 700;
}
.scroll {
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-gutter: stable;
  flex: 1;
}
.scroll::-webkit-scrollbar {
  width: 10px;
}
.scroll::-webkit-scrollbar-track {
  background: #1b1b1b;
}
.scroll::-webkit-scrollbar-thumb {
  background: #3a3a3a;
  border: 2px solid #1b1b1b;
  border-radius: 6px;
}
.scroll::-webkit-scrollbar-thumb:hover {
  background: #555555;
}
.shead {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 600;
  color: #9a9a9a;
  background: #1b1b1b;
  cursor: pointer;
  position: sticky;
  top: 0;
  z-index: 3;
}
.chev {
  width: 10px;
}
.count {
  color: #737373;
  font-weight: 400;
}
.filterbar {
  padding: 6px 8px;
  border-bottom: 1px solid #2b2b2b;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}
.chips button {
  background: none;
  border: 1px solid #3a3a3a;
  color: #9a9a9a;
  border-radius: 12px;
  cursor: pointer;
  font: 10px system-ui;
  padding: 3px 9px;
}
.chips button:hover {
  color: #ededed;
}
.chips button.on {
  color: #111111;
  background: #00e62e;
  border-color: #00e62e;
}
.search {
  width: 100%;
  box-sizing: border-box;
  font: 11px system-ui;
  background: #1b1b1b;
  color: #ededed;
  border: 1px solid #3a3a3a;
  border-radius: 5px;
  padding: 4px 7px;
  outline: none;
}
.search:focus {
  border-color: #2ef05a;
}
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 5px 8px;
  border-bottom: 1px solid #2b2b2b;
}
.sortbtns {
  display: flex;
  gap: 2px;
}
.sortbtns button,
.grp {
  background: none;
  border: 1px solid #3a3a3a;
  color: #9a9a9a;
  border-radius: 5px;
  cursor: pointer;
  font: 10px system-ui;
  padding: 3px 7px;
}
.sortbtns button:hover,
.grp:hover {
  color: #ededed;
}
.sortbtns button.on,
.grp.on {
  color: #2ef05a;
  border-color: #2ef05a;
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.empty {
  color: #9a9a9a;
  padding: 7px 10px;
  text-align: center;
}
.clickblock {
  position: fixed;
  inset: 0;
  z-index: 100;
  -webkit-app-region: no-drag;
}
.modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 10;
}
.dialog {
  background: #232323;
  border: 1px solid #3a3a3a;
  border-radius: 10px;
  padding: 14px;
  width: 100%;
  max-width: 320px;
}
.dtitle {
  font-weight: 600;
  margin-bottom: 6px;
}
.dmsg {
  margin: 0 0 8px;
  color: #9a9a9a;
  font-size: 11px;
  line-height: 1.4;
}
.cmd {
  display: block;
  background: #1b1b1b;
  border: 1px solid #3a3a3a;
  border-radius: 6px;
  padding: 7px 9px;
  font: 11px ui-monospace, monospace;
  color: #ededed;
  word-break: break-all;
  user-select: all;
}
.dbtns {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 10px;
}
.db {
  font: 11px system-ui;
  background: #00e62e;
  color: #111111;
  border: 1px solid #00e62e;
  border-radius: 6px;
  padding: 5px 12px;
  cursor: pointer;
}
.db.ghost {
  background: none;
  color: #9a9a9a;
  border-color: #3a3a3a;
}
.db.ghost:hover {
  color: #ededed;
}
</style>
