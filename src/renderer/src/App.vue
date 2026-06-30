<script setup lang="ts">
import { ref, computed, onMounted, provide } from 'vue'
import type { Session, UsageResult } from './types'
import SessionList from './components/SessionList.vue'
import StatsPanel from './components/StatsPanel.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import UsageBar from './components/UsageBar.vue'
import { sortSessions, type SortMode } from './sort'
import { matchesQuery, matchesFilter, type StatusFilter } from './filter'

type View = 'list' | 'stats' | 'settings'

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
const controlsOpen = ref(localStorage.getItem('controlsOpen') !== '0')
const search = ref('')
const statusFilter = ref<StatusFilter>('all')
const sortMode = ref<SortMode>((localStorage.getItem('sortMode') as SortMode) || 'status')
const groupBy = ref(localStorage.getItem('groupBy') === '1')
const colorblind = ref(localStorage.getItem('colorblind') === '1')
provide('colorblind', colorblind)

onMounted(() => {
  setTimeout(() => (minElapsed.value = true), 600)
  window.api.onSessions((s) => {
    sessions.value = s
    loaded.value = true
  })
  window.api.onUsage((u) => (usage.value = u))
})

const filtered = computed(() =>
  sessions.value.filter(
    (s) => matchesQuery(s, search.value) && matchesFilter(s, statusFilter.value)
  )
)
const watchedList = computed(() => filtered.value.filter((s) => s.watched || s.isLive))
const otherList = computed(() => filtered.value.filter((s) => !(s.watched || s.isLive)))
const watchedSorted = computed(() => sortSessions(watchedList.value, sortMode.value))
const otherSorted = computed(() => sortSessions(otherList.value, sortMode.value))

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
</script>

<template>
  <div class="wrap">
    <header>
      <span class="title">Claude Sessions <span v-if="version" class="ver">v{{ version }}</span></span>
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
      </div>
    </header>
    <div v-if="!ready" class="loading">
      <div class="spinner" />
    </div>
    <div v-else-if="view === 'stats'" class="scroll">
      <StatsPanel :sessions="sessions" :usage="usage" />
    </div>
    <div v-else-if="view === 'settings'" class="scroll">
      <SettingsPanel />
    </div>
    <template v-else>
      <UsageBar :result="usage" />
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
      </div>
    </template>
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
}
.ver {
  color: #6e7681;
  font-size: 10px;
  font-weight: 400;
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
</style>
