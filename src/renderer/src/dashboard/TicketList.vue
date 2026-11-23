<script setup lang="ts">
import { ref, computed } from 'vue'
import { laneGroups, splitTag, statusLane, type TaskRow } from '../taskview'
import type { MrRow } from '../types'
import { ago } from '../display'
import { filterRows, rowChip, lastActivity, uncommittedCount, readFlag, writeSize } from './dashboard'
import { isActiveToday } from './workday'
import { useWorkday } from './useWorkday'
import PriorityIcon from './PriorityIcon.vue'
import Icon from './Icon.vue'
import { useManualOrder } from './useOrder'
import { splitStarred, starredBlock, sortByStatus } from './order'
import SessionBadge from './SessionBadge.vue'
import SessionWorkList from './SessionWorkList.vue'
import { sessionWorkRows, WITH_SESSION_FLAG } from './sessionwork'
import type { Session } from '../types'

const props = defineProps<{
  rows: TaskRow[]
  starred: string[]
  selectedKey: string | null
  jiraError: 'no-token' | 'failed' | null
  mrs?: MrRow[]
  myName?: string | null
  sessions?: Session[]
}>()
const emit = defineEmits<{ select: [key: string]; settings: []; 'open-mr': [key: string] }>()

const JIRA_HINT = {
  'no-token': 'Add a Jira token in Settings to see your tickets.',
  failed: 'Jira search failed. Check the token and the JQL in Settings.'
}
const OUTSIDE = { key: 'outside', label: 'Not in your Jira query', color: '#4b525c' }
const FINISHED = { key: 'finished', label: 'Finished today', color: '#4b525c' }

const query = ref('')
const isOutsideOpen = ref(false)
const isFinishedOpen = ref(false)
const isTodayOnly = ref(readFlag('dash.todayTickets'))
const setTodayOnly = (next: boolean): void => {
  isTodayOnly.value = next
  writeSize('dash.todayTickets', next)
}
const isWithSession = ref(readFlag(WITH_SESSION_FLAG))
const setWithSession = (next: boolean): void => {
  isWithSession.value = next
  writeSize(WITH_SESSION_FLAG, next)
}
const workRows = computed(() => sessionWorkRows(props.rows, props.mrs ?? [], props.sessions ?? [], props.myName ?? null))
const { now, finished, toggleFinish } = useWorkday()
const isFinished = (row: TaskRow): boolean => isTodayOnly.value && finished.value.includes(row.key)
const matching = computed(() => filterRows(props.rows, query.value).filter((r) => !isTodayOnly.value || isActiveToday(r.sessions, now.value)))
const visible = computed(() => matching.value.filter((r) => !isFinished(r)))
const liveSession = (r: TaskRow): Session | null => {
  const live = r.sessions.filter((s) => s.isLive)
  if (!live.length) return null
  return live.find((s) => s.status === 'waiting') ?? live.find((s) => s.status === 'working') ?? live[0]
}
const order = useManualOrder('dash.order.tickets')
const rankTicket = (r: TaskRow): { isActive: boolean; priority: string | undefined } => ({ isActive: r.sessions.some((s) => s.isLive), priority: r.priority })
const groups = computed(() => {
  const outside = visible.value.filter((r) => !r.isFromJira)
  const done = matching.value.filter(isFinished)
  return [
    ...laneGroups(visible.value),
    ...(outside.length ? [{ lane: OUTSIDE, rows: outside }] : []),
    ...(done.length ? [{ lane: FINISHED, rows: done }] : [])
  ].map((g) => ({
    ...g,
    rows: orderLane(g.lane.key, g.rows)
  }))
})
const orderLane = (key: string, rows: TaskRow[]): TaskRow[] => {
  const split = splitStarred(rows, props.starred)
  const ordered = [...order.ordered(starredBlock(key), split.starred, rankTicket), ...order.ordered(key, split.rest, rankTicket)]
  return isStatusSort.value ? sortByStatus(ordered, (r) => liveSession(r)?.status ?? null) : ordered
}
const isStatusSort = ref(readFlag('dash.statusSortTickets'))
const setStatusSort = (next: boolean): void => {
  isStatusSort.value = next
  writeSize('dash.statusSortTickets', next)
}
const blockOf = (key: string, row: TaskRow): string => (isStarred(row) ? starredBlock(key) : key)
const blockKeys = (key: string, rows: TaskRow[], row: TaskRow): string[] =>
  rows.filter((r) => blockOf(key, r) === blockOf(key, row)).map((r) => r.key)
const isLaneManual = (key: string): boolean => order.isManual(key) || order.isManual(starredBlock(key))
const resetLane = (key: string): void => {
  order.resetOrder(key)
  order.resetOrder(starredBlock(key))
}
const isStarred = (row: TaskRow): boolean => props.starred.includes(row.key)
const toggleStar = (row: TaskRow): void => window.api.setStarred(row.key, !isStarred(row))
const edgeOf = (row: TaskRow): string => (row.isFromJira ? statusLane(row.status).color : OUTSIDE.color)
const mrOf = (row: TaskRow): MrRow | undefined => {
  const list = (props.mrs ?? []).filter((m) => m.ticket === row.key)
  return list.find((m) => m.author === props.myName) ?? list[0]
}
const activityOf = (row: TaskRow): string => {
  const at = lastActivity(row)
  return at === null ? '' : ago(at)
}
const isFolded = (key: string): boolean => key === 'outside' || key === 'finished'
const isLaneOpen = (key: string): boolean => (key === 'finished' ? isFinishedOpen.value : isOutsideOpen.value)
const rowsOf = (g: { lane: { key: string }; rows: TaskRow[] }): TaskRow[] => (isFolded(g.lane.key) && !isLaneOpen(g.lane.key) ? [] : g.rows)
const toggleOutside = (key: string): void => {
  if (key === 'outside') isOutsideOpen.value = !isOutsideOpen.value
  if (key === 'finished') isFinishedOpen.value = !isFinishedOpen.value
}
</script>

<template>
  <section class="list">
    <label class="search">
      <Icon name="search" :size="14" />
      <input v-model="query" placeholder="Search tickets" spellcheck="false" />
    </label>
    <div class="filters">
      <label title="Only tickets with a Claude session active since midnight"><input :checked="isTodayOnly" type="checkbox" @change="setTodayOnly(($event.target as HTMLInputElement).checked)" />Today</label>
      <label title="Sort by session status: needs you, working, idle, then tickets without a session"><input :checked="isStatusSort" type="checkbox" @change="setStatusSort(($event.target as HTMLInputElement).checked)" />By status</label>
      <label title="One list of tickets, your merge requests and other people's merge requests that have a running Claude session"><input :checked="isWithSession" type="checkbox" @change="setWithSession(($event.target as HTMLInputElement).checked)" />With session</label>
    </div>
    <SessionWorkList v-if="isWithSession" :rows="workRows" :selected-key="selectedKey" @select-ticket="emit('select', $event)" @select-mr="emit('open-mr', $event)" />
    <template v-else>
    <div v-if="jiraError" class="note">
      {{ JIRA_HINT[jiraError] }}
      <button class="link" @click="emit('settings')">Open Settings</button>
    </div>
    <div v-else-if="!matching.length" class="note">{{ isTodayOnly ? 'No tickets worked on today' : 'No tickets match' }}</div>

    <div v-for="g in groups" :key="g.lane.key" class="lane" :style="{ '--lane': g.lane.color }">
      <h3 class="lhead" :class="{ fold: isFolded(g.lane.key) }" @click="toggleOutside(g.lane.key)">
        <Icon v-if="isFolded(g.lane.key)" :name="isLaneOpen(g.lane.key) ? 'chevronDown' : 'chevronRight'" :size="12" />
        <span v-else class="ldot" />
        <span>{{ g.lane.label }}</span>
        <span class="lcount">{{ g.rows.length }}</span>
        <span v-if="isFolded(g.lane.key)" class="fold-lbl">{{ isLaneOpen(g.lane.key) ? 'Hide' : 'Show' }}</span>
        <button v-else-if="isLaneManual(g.lane.key)" class="autoorder" title="Drop your order and sort by running sessions, then priority" @click.stop="resetLane(g.lane.key)">Auto order</button>
      </h3>
      <article
        v-for="r in rowsOf(g)"
        :key="r.key"
        class="tile"
        :class="{
          sel: selectedKey === r.key,
          'has-session': r.sessions.some((s) => s.isLive),
          'needs-input': r.sessions.some((s) => s.isLive && s.status === 'waiting'),
          'drop-before': order.dropTarget.value?.key === r.key && !order.dropTarget.value.isAfter,
          'drop-after': order.dropTarget.value?.key === r.key && order.dropTarget.value.isAfter
        }"
        :style="{ '--edge': edgeOf(r) }"
        tabindex="0"
        draggable="true"
        @dragstart="order.onDragStart($event, blockOf(g.lane.key, r), r.key)"
        @dragover="order.onDragOver($event, blockOf(g.lane.key, r), r.key)"
        @drop="order.onDrop(blockOf(g.lane.key, r), blockKeys(g.lane.key, g.rows, r))"
        @dragend="order.onDragEnd"
        @click="emit('select', r.key)"
        @keydown.enter="emit('select', r.key)"
      >
        <SessionBadge v-if="liveSession(r)" :status="liveSession(r)?.status ?? 'idle'" :model="liveSession(r)?.model" :context-tokens="liveSession(r)?.contextTokens" />
        <p class="summary">{{ splitTag(r.summary).text || 'No title' }}</p>
        <div
          v-if="mrOf(r)"
          class="mrinfo"
          :class="{ attn: (mrOf(r)?.openThreads ?? 0) > 0 }"
          title="Open the merge request"
          @click.stop="emit('open-mr', mrOf(r)?.key ?? '')"
        >
          <Icon name="pr" :size="12" />!{{ mrOf(r)?.iid }}
          <span v-if="mrOf(r)?.isDraft" class="dr">Draft</span>
          <span v-if="(mrOf(r)?.openThreads ?? 0) > 0" class="thr" title="Unresolved threads to address"><Icon name="message" :size="11" />{{ mrOf(r)?.openThreads }}</span>
          <span v-if="mrOf(r)?.approvals" class="ap"><Icon name="check" :size="11" />{{ mrOf(r)?.approvals }}</span>
        </div>
        <div class="top">
          <PriorityIcon :name="r.priority" />
          <span class="key">{{ r.key }}</span>
          <span v-if="r.sessions.some((s) => s.isLive && s.status === 'waiting')" class="live needs" title="Claude is waiting for your answer"><i />needs you</span>
          <span v-else-if="r.sessions.some((s) => s.isLive)" class="live" title="A Claude session for this ticket is running"><i />session</span>
          <span v-if="splitTag(r.summary).tag" class="tag">{{ splitTag(r.summary).tag }}</span>
          <span v-if="rowChip(r)" class="chip" :style="{ color: rowChip(r)?.color, borderColor: rowChip(r)?.color }">
            {{ rowChip(r)?.label }}
          </span>
          <span v-if="uncommittedCount(r.sessions)" class="unc" :title="`${uncommittedCount(r.sessions)} uncommitted ${uncommittedCount(r.sessions) === 1 ? 'file' : 'files'} in this ticket's folder`"><Icon name="diff" :size="11" />{{ uncommittedCount(r.sessions) }}</span>
          <span v-if="activityOf(r)" class="meta">{{ activityOf(r) }}</span>
          <button
            v-if="isTodayOnly"
            class="star finish"
            :class="{ on: isFinished(r) }"
            :title="isFinished(r) ? 'Not finished yet' : 'Finished for today'"
            @click.stop="toggleFinish(r.key)"
          >
            <Icon name="check" :size="14" />
          </button>
          <button
            class="star"
            :class="{ on: isStarred(r) }"
            :title="isStarred(r) ? 'Unstar' : 'Star'"
            @click.stop="toggleStar(r)"
          >
            <Icon name="star" :size="14" />
          </button>
        </div>
      </article>
    </div>
    </template>
  </section>
</template>

<style scoped>
.list {
  overflow-y: auto;
  padding: 0 8px 16px;
  background: var(--bg-1);
  border-right: 1px solid var(--line);
}
.search {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  margin: 0 4px 6px;
  padding: 0 10px;
  color: var(--text-4);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 8px;
  box-shadow: 0 -8px 0 var(--bg-1);
}
.search:focus-within {
  border-color: var(--accent);
  color: var(--text-3);
}
.search input {
  flex: 1;
  min-width: 0;
  padding: 0;
  font: 13px var(--font-ui);
  color: var(--text);
  background: none;
  border: none;
  outline: none;
}
.search input::placeholder {
  color: var(--text-4);
}
.note {
  margin: 10px 6px;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-3);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.link {
  display: block;
  margin-top: 6px;
  padding: 0;
  font: 600 12px var(--font-ui);
  color: var(--accent);
  background: none;
  border: none;
  cursor: pointer;
}
.lane {
  margin-top: 10px;
}
.autoorder {
  margin-left: auto;
  padding: 0;
  font: 400 11.5px var(--font-ui);
  color: var(--text-4);
  background: none;
  border: none;
  cursor: pointer;
}
.autoorder:hover {
  color: var(--text-2);
}
.tile.drop-before {
  box-shadow: 0 -2px 0 var(--accent);
}
.tile.drop-after {
  box-shadow: 0 2px 0 var(--accent);
}
.lhead {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 4px;
  padding: 4px 8px;
  font: 600 12px var(--font-ui);
  color: var(--text-3);
}
.lhead.fold {
  cursor: pointer;
  border-radius: 6px;
}
.lhead.fold:hover {
  color: var(--text-2);
  background: var(--bg-2);
}
.ldot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--lane);
}
.lcount,
.fold-lbl {
  color: var(--text-4);
  font-weight: 400;
}
.fold-lbl {
  margin-left: auto;
}
.tile {
  position: relative;
  margin: 0 2px 6px;
  padding: 10px 30px 9px 14px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 9px;
  cursor: pointer;
  outline: none;
}
.tile:hover {
  border-color: var(--line-3);
}
.tile:focus-visible {
  border-color: var(--text-4);
}
.tile::before {
  content: '';
  position: absolute;
  left: -1px;
  top: 10px;
  bottom: 10px;
  width: 3px;
  border-radius: 0 2px 2px 0;
  background: var(--edge);
}
.tile.sel {
  background: var(--bg-3);
  border-color: var(--accent);
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.tile.sel::before {
  background: var(--accent);
}
.top {
  display: flex;
  flex-wrap: wrap;
  row-gap: 4px;
  align-items: center;
  gap: 8px;
  min-width: 0;
  margin-top: 8px;
}
.key {
  flex: none;
  font: 600 11.5px var(--font-mono);
  color: var(--text-3);
}
.tag {
  flex: none;
  padding: 1px 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
  background: var(--bg-4);
  border-radius: 5px;
}
.chip {
  flex: none;
  padding: 0 7px;
  font-size: 11px;
  line-height: 18px;
  border: 1px solid;
  border-radius: 9px;
}
.star {
  position: absolute;
  top: 7px;
  right: 7px;
  display: grid;
  place-items: center;
  flex: none;
  width: 22px;
  height: 22px;
  padding: 0;
  color: var(--text-5);
  background: none;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  opacity: 0;
}
.tile:hover .star,
.star.on {
  opacity: 1;
}
.star:hover {
  color: var(--warn);
  background: var(--bg-4);
}
.star.on {
  color: var(--warn);
}
.star.finish {
  right: 31px;
}
.star.finish:hover,
.star.finish.on {
  color: var(--accent);
}
.star.finish.on :deep(path) {
  fill: none;
}
.filters {
  display: flex;
  align-items: center;
  gap: 6px 10px;
  margin: 0 4px 8px;
  font-size: 12px;
  color: var(--text-3);
}
.filters label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.filters input[type='checkbox'] {
  margin: 0;
  accent-color: var(--accent);
}
.star.on :deep(path) {
  fill: currentColor;
}
.summary {
  margin: 0;
  font: 500 13.5px/1.4 var(--font-ui);
  color: var(--text);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.live {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 7px 0 6px;
  font: 600 11px/18px var(--font-ui);
  color: var(--ok);
  background: rgba(61, 214, 140, 0.1);
  border: 1px solid var(--ok-line);
  border-radius: 9px;
}
.live i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ok);
  box-shadow: 0 0 0 2px rgba(61, 214, 140, 0.25);
}
.tile.has-session {
  border-color: var(--ok-line);
  box-shadow: inset 0 0 0 1px rgba(61, 214, 140, 0.18);
}
.tile.needs-input {
  border-color: var(--warn);
  animation: attn 1.6s ease-in-out infinite;
}
@keyframes attn {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(232, 184, 74, 0);
  }
  50% {
    background-color: rgba(232, 184, 74, 0.07);
    box-shadow: 0 0 0 3px rgba(232, 184, 74, 0.35);
  }
}
@media (prefers-reduced-motion: reduce) {
  .tile.needs-input {
    animation: none;
    box-shadow: 0 0 0 2px rgba(232, 184, 74, 0.35);
  }
}
.live.needs {
  color: var(--warn);
  background: var(--warn-soft);
  border-color: rgba(232, 184, 74, 0.5);
}
.live.needs i {
  background: var(--warn);
  box-shadow: 0 0 0 2px rgba(232, 184, 74, 0.3);
}
.mrinfo:hover {
  filter: brightness(1.25);
}
.mrinfo {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 7px;
  padding: 1px 8px;
  font: 600 11.5px/18px var(--font-ui);
  color: var(--text-3);
  background: var(--bg-4);
  border-radius: 9px;
}
.mrinfo.attn {
  color: var(--warn);
  background: var(--warn-soft);
}
.mrinfo .thr,
.mrinfo .ap {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.mrinfo .ap {
  color: var(--ok);
}
.mrinfo .dr {
  padding: 0 5px;
  font-size: 10px;
  line-height: 15px;
  color: var(--bg-0);
  background: var(--warn);
  border-radius: 4px;
}
.unc {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0 5px;
  font: 600 11px/16px var(--font-ui);
  color: var(--warn);
  border: 1px solid var(--warn);
  border-radius: 4px;
}
.meta {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--text-4);
}
</style>
