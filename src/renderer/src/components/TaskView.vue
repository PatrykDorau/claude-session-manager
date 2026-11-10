<script setup lang="ts">
import { ref, computed } from 'vue'
import type { JiraTicket, Session, Status } from '../types'
import { buildTaskRows, laneGroups, splitTag, statusLane, type TaskRow } from '../taskview'
import { plainSession } from '../cards'
import { ago } from '../display'
import StartSessionPopover from './StartSessionPopover.vue'

const props = defineProps<{
  tickets: JiraTicket[]
  sessions: Session[]
  finishedKeys: string[]
  titles: Record<string, string | null>
  jiraError: 'no-token' | 'failed' | null
}>()

const JIRA_HINT = {
  'no-token': 'Add a Jira token in Settings to see your tickets',
  failed: 'Jira search failed. Check the token and the JQL in Settings'
}
const SESSION_STATE: Record<Status, { label: string; color: string }> = {
  working: { label: 'working', color: '#58a6ff' },
  waiting: { label: 'needs you', color: '#d29922' },
  checkout: { label: 'check output', color: '#5ec8ff' },
  idle: { label: 'idle', color: '#737373' },
  closed: { label: 'closed', color: '#555555' }
}
const OTHER_LANE = { key: 'outside', label: 'Not in your Jira query', color: '#555555' }

const startFor = ref<string | null>(null)
const isOtherOpen = ref(false)
const rows = computed(() => buildTaskRows(props.tickets, props.sessions, props.finishedKeys, props.titles))
const groups = computed(() => {
  const others = rows.value.filter((r) => !r.isFromJira)
  return [...laneGroups(rows.value), ...(others.length ? [{ lane: OTHER_LANE, rows: others }] : [])]
})
const hasJiraRows = computed(() => rows.value.some((r) => r.isFromJira))

const liveSession = (row: TaskRow): Session | undefined => row.sessions.find((s) => s.isLive)
const rowColor = (row: TaskRow): string => (row.isFromJira ? statusLane(row.status).color : OTHER_LANE.color)
const sessionLabel = (s: Session): string => s.name ?? s.projectName
const openSession = (s: Session): void => window.api.openSession(plainSession(s))
const focusRow = (row: TaskRow): void => openSession(liveSession(row) as Session)
const openCode = (row: TaskRow): void => window.api.openTaskCode(row.key)
const openJira = (row: TaskRow): void => window.api.openTicket(row.key)
const startedAt = ref<Record<string, number>>({})
const markStarted = (row: TaskRow): void => {
  const at = Date.now()
  startedAt.value = { ...startedAt.value, [row.key]: at }
  setTimeout(() => {
    if (startedAt.value[row.key] !== at) return
    const rest = { ...startedAt.value }
    delete rest[row.key]
    startedAt.value = rest
  }, 90000)
}
const isStarting = (row: TaskRow): boolean => {
  const at = startedAt.value[row.key]
  return !!at && !row.sessions.some((s) => s.lastActive >= at - 5000)
}
const toggleStart = (row: TaskRow): void => {
  startFor.value = startFor.value === row.key ? null : row.key
}
</script>

<template>
  <div class="tv">
    <div v-if="jiraError" class="note">{{ JIRA_HINT[jiraError] }}</div>
    <div v-else-if="!hasJiraRows" class="note">No open tickets match your Jira query</div>

    <section v-for="g in groups" :key="g.lane.key" class="lane" :style="{ '--lane': g.lane.color }">
      <h3 class="lhead" :class="{ fold: g.lane.key === 'outside' }" @click="g.lane.key === 'outside' && (isOtherOpen = !isOtherOpen)">
        <span class="ldot" />
        <span class="lname">{{ g.lane.label }}</span>
        <span class="lcount">{{ g.rows.length }}</span>
        <span v-if="g.lane.key === 'outside'" class="chev">{{ isOtherOpen ? 'Hide' : 'Show' }}</span>
      </h3>

      <article v-for="r in g.lane.key === 'outside' && !isOtherOpen ? [] : g.rows" :key="r.key" class="tile" :style="{ '--edge': rowColor(r) }">
        <div class="top">
          <button class="key" title="Open in Jira" @click="openJira(r)">{{ r.key }}</button>
          <span v-if="splitTag(r.summary).tag" class="tag">{{ splitTag(r.summary).tag }}</span>
          <span class="acts">
            <button v-if="liveSession(r)" class="ib" title="Focus the live session" @click="focusRow(r)">
              <svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" /><circle cx="8" cy="8" r="2" class="fill" /></svg>
            </button>
            <button
              v-else
              class="ib go"
              :class="{ on: startFor === r.key }"
              title="Start a session for this ticket"
              @click="toggleStart(r)"
            >
              <svg viewBox="0 0 16 16"><path d="M5 3.5v9l7-4.5z" class="fill" /></svg>
            </button>
            <button class="ib" title="Open the ticket's code in VS Code" @click="openCode(r)">
              <svg viewBox="0 0 16 16"><path d="M6 4 2 8l4 4M10 4l4 4-4 4" /></svg>
            </button>
          </span>
        </div>
        <p class="summary">{{ splitTag(r.summary).text || 'No title' }}</p>

        <StartSessionPopover v-if="startFor === r.key" :row="r" @started="markStarted(r)" @close="startFor = null" />
        <div v-else-if="isStarting(r)" class="starting"><span class="spin" />Starting session…</div>

        <ul v-if="r.sessions.length" class="sess">
          <li v-for="s in r.sessions.slice(0, 3)" :key="s.id" @click="openSession(s)">
            <span class="sdot" :style="{ background: SESSION_STATE[s.status].color }" />
            <span class="sname">{{ sessionLabel(s) }}</span>
            <span class="sstate" :style="{ color: SESSION_STATE[s.status].color }">{{ SESSION_STATE[s.status].label }}</span>
            <span class="sago">{{ ago(s.lastActive) }}</span>
          </li>
          <li v-if="r.sessions.length > 3" class="more">+{{ r.sessions.length - 3 }} older</li>
        </ul>
      </article>
    </section>
  </div>
</template>

<style scoped>
.tv {
  padding: 2px 0 8px;
}
.note {
  margin: 8px 10px;
  font-size: 11px;
  color: #9a9a9a;
}
.lane {
  margin-top: 8px;
}
.lhead {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  color: #d4d4d4;
}
.ldot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: var(--lane);
}
.lhead.fold {
  cursor: pointer;
}
.chev {
  margin-left: auto;
  font-weight: 400;
  color: #737373;
}
.lcount {
  color: #737373;
  font-weight: 400;
}
.tile {
  margin: 0 6px 2px;
  padding: 6px 8px 6px 9px;
  border-left: 3px solid var(--edge);
  border-radius: 2px 6px 6px 2px;
  background: #202020;
}
.tile:hover {
  background: #262626;
}
.top {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.key {
  flex: none;
  padding: 0;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  color: #ededed;
  white-space: nowrap;
  background: none;
  border: none;
  cursor: pointer;
}
.key:hover,
.key:focus-visible {
  color: #00e62e;
  text-decoration: underline;
  outline: none;
}
.tag {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  color: #8c8c8c;
}
.acts {
  display: flex;
  gap: 2px;
  margin-left: auto;
  flex: none;
}
.ib {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  background: none;
  border: 1px solid transparent;
  border-radius: 5px;
  color: #9a9a9a;
  cursor: pointer;
}
.ib svg {
  width: 13px;
  height: 13px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.ib svg .fill {
  fill: currentColor;
  stroke: none;
}
.ib:hover,
.ib:focus-visible {
  color: #ededed;
  border-color: #3a3a3a;
  outline: none;
}
.ib.go {
  color: #2ef05a;
}
.ib.go.on,
.ib.go:hover {
  color: #111111;
  background: #00e62e;
  border-color: #00e62e;
}
.summary {
  margin: 2px 0 0;
  font-size: 12px;
  line-height: 1.35;
  color: #bdbdbd;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.starting {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 5px;
  font-size: 11px;
  color: #2ef05a;
}
.spin {
  width: 10px;
  height: 10px;
  border: 2px solid #3a3a3a;
  border-top-color: #00e62e;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.sess {
  list-style: none;
  margin: 5px 0 0;
  padding: 4px 0 0;
  border-top: 1px solid #2e2e2e;
}
.sess li {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px;
  font-size: 11px;
  border-radius: 4px;
  cursor: pointer;
}
.sess li:hover {
  background: #2c2c2c;
}
.sdot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.sname {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #d4d4d4;
}
.sstate {
  flex: none;
  font-size: 10px;
}
.sago {
  flex: none;
  font-size: 10px;
  color: #737373;
}
.sess li.more {
  color: #737373;
  cursor: default;
  padding-left: 14px;
}
.sess li.more:hover {
  background: none;
}
</style>
