<script setup lang="ts">
import { ref, computed, onMounted, provide } from 'vue'
import type { Session, UsageResult } from './types'
import SessionList from './components/SessionList.vue'
import StatsPanel from './components/StatsPanel.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import SetupGuide from './components/SetupGuide.vue'
import UsageBar from './components/UsageBar.vue'
import { sortSessions, type SortMode } from './sort'
import { matchesQuery, matchesFilter, type StatusFilter } from './filter'
import { playSound, type SoundName } from './sound'

type View = 'list' | 'stats' | 'settings' | 'guide'

const sessions = ref<Session[]>([])
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
const watchedOpen = ref(true)
const othersOpen = ref(true)
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
  window.api.onPlayAlert(playChime)
  window.api.onMenuState((open) => (menuOpen.value = open))
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
const watchedList = computed(() =>
  filtered.value.filter((s) => !s.finished && (s.watched || s.isLive))
)
const otherList = computed(() =>
  filtered.value.filter((s) => !s.finished && !(s.watched || s.isLive))
)
const finishedList = computed(() => filtered.value.filter((s) => s.finished))
const watchedSorted = computed(() => sortSessions(watchedList.value, sortMode.value))
const otherSorted = computed(() => sortSessions(otherList.value, 'recency'))
const finishedSorted = computed(() => sortSessions(finishedList.value, 'recency'))

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
function minimize(): void {
  window.api.minimizeWindow()
}
</script>

<template>
  <div class="wrap">
    <header>
      <span class="title" title="Back to sessions" @click="view = 'list'"
        >Claude Sessions <span v-if="version" class="ver">v{{ version }}</span></span
      >
      <div class="hbtns">
        <button
          v-if="view === 'list'"
          class="hb"
          :class="{ on: controlsOpen }"
          title="Search & filters"
          @click="toggleControls"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
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
        <div class="shead" @click="watchedOpen = !watchedOpen">
          <span class="chev">{{ watchedOpen ? '▾' : '▸' }}</span>
          Watched <span class="count">{{ watchedList.length }}</span>
        </div>
        <SessionList
          v-show="watchedOpen"
          :sessions="watchedSorted"
          :group-by="groupBy"
          empty-text="Nothing watched or live"
        />

        <div class="shead" @click="othersOpen = !othersOpen">
          <span class="chev">{{ othersOpen ? '▾' : '▸' }}</span>
          Other <span class="count">{{ otherList.length }}</span>
        </div>
        <SessionList
          v-show="othersOpen"
          :sessions="otherSorted"
          :group-by="groupBy"
          empty-text="No matching sessions"
        />

        <div v-if="finishedList.length" class="shead" @click="finishedOpen = !finishedOpen">
          <span class="chev">{{ finishedOpen ? '▾' : '▸' }}</span>
          Finished <span class="count">{{ finishedList.length }}</span>
        </div>
        <SessionList
          v-show="finishedOpen"
          :sessions="finishedSorted"
          :group-by="groupBy"
          empty-text=""
        />
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
  </div>
</template>

<style scoped>
.wrap {
  font: 12px system-ui;
  color: #e6edf3;
  background: #0d1117;
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
  border-bottom: 1px solid #21262d;
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
  color: #58a6ff;
}
.ver {
  color: #6e7681;
  font-size: 10px;
  font-weight: 400;
}
.banner {
  flex: none;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  color: #c9d1d9;
  background: #21262d;
  border-bottom: 1px solid #30363d;
}
.banner.warn {
  color: #f0e3c2;
  background: #3d2c10;
  border-bottom-color: #6b4e16;
}
.banner:hover {
  filter: brightness(1.2);
}
.signin {
  flex: none;
  padding: 5px 10px;
  font-size: 10px;
  color: #e69f00;
  cursor: pointer;
  border-bottom: 1px solid #21262d;
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
  border: 3px solid #21262d;
  border-top-color: #58a6ff;
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
  border: 1px solid #30363d;
  color: #8b949e;
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
  color: #e6edf3;
}
.hb.on {
  color: #58a6ff;
  border-color: #58a6ff;
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
  background: #0d1117;
}
.scroll::-webkit-scrollbar-thumb {
  background: #30363d;
  border: 2px solid #0d1117;
  border-radius: 6px;
}
.scroll::-webkit-scrollbar-thumb:hover {
  background: #484f58;
}
.shead {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 600;
  color: #8b949e;
  background: #0d1117;
  cursor: pointer;
  position: sticky;
  top: 0;
}
.chev {
  width: 10px;
}
.count {
  color: #6e7681;
  font-weight: 400;
}
.filterbar {
  padding: 6px 8px;
  border-bottom: 1px solid #21262d;
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
  border: 1px solid #30363d;
  color: #8b949e;
  border-radius: 12px;
  cursor: pointer;
  font: 10px system-ui;
  padding: 3px 9px;
}
.chips button:hover {
  color: #e6edf3;
}
.chips button.on {
  color: #fff;
  background: #1f6feb;
  border-color: #1f6feb;
}
.search {
  width: 100%;
  box-sizing: border-box;
  font: 11px system-ui;
  background: #0d1117;
  color: #e6edf3;
  border: 1px solid #30363d;
  border-radius: 5px;
  padding: 4px 7px;
  outline: none;
}
.search:focus {
  border-color: #58a6ff;
}
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 5px 8px;
  border-bottom: 1px solid #21262d;
}
.sortbtns {
  display: flex;
  gap: 2px;
}
.sortbtns button,
.grp {
  background: none;
  border: 1px solid #30363d;
  color: #8b949e;
  border-radius: 5px;
  cursor: pointer;
  font: 10px system-ui;
  padding: 3px 7px;
}
.sortbtns button:hover,
.grp:hover {
  color: #e6edf3;
}
.sortbtns button.on,
.grp.on {
  color: #58a6ff;
  border-color: #58a6ff;
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.empty {
  color: #8b949e;
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
  background: rgba(1, 4, 9, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 10;
}
.dialog {
  background: #161b22;
  border: 1px solid #30363d;
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
  color: #8b949e;
  font-size: 11px;
  line-height: 1.4;
}
.cmd {
  display: block;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: 7px 9px;
  font: 11px ui-monospace, monospace;
  color: #e6edf3;
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
  background: #1f6feb;
  color: #fff;
  border: 1px solid #1f6feb;
  border-radius: 6px;
  padding: 5px 12px;
  cursor: pointer;
}
.db.ghost {
  background: none;
  color: #8b949e;
  border-color: #30363d;
}
.db.ghost:hover {
  color: #e6edf3;
}
</style>
