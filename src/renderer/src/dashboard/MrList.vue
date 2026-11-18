<script setup lang="ts">
import { ref, computed } from 'vue'
import type { MrRow, Session } from '../types'
import { ago } from '../display'
import { filterMrs, reviewLabel, groupMrs, findMineSession, findReviewSession } from './mrs'
import { readFlag, writeSize } from './dashboard'
import { isActiveToday } from './workday'
import { useWorkday } from './useWorkday'
import Icon from './Icon.vue'
import PriorityIcon from './PriorityIcon.vue'
import { useManualOrder } from './useOrder'
import { splitStarred, starredBlock } from './order'
import SessionBadge from './SessionBadge.vue'

const props = defineProps<{
  rows: MrRow[]
  starred: string[]
  selectedKey: string | null
  error: 'no-token' | 'failed' | null
  errorDetail?: string | null
  myName?: string | null
  isAllProjects: boolean
  sessions?: Session[]
  isLoading?: boolean
}>()
const emit = defineEmits<{ select: [key: string]; settings: [] }>()

const ERROR_HINT = {
  'no-token': 'Add a GitLab token in Settings to see your merge requests.',
  failed: 'GitLab refused both the to-do list and the merge requests you review. Check the token permissions in Settings.'
}

const query = ref('')
const project = ref('')
const author = ref('')
const isUnreviewedOnly = ref(false)
const isMineMode = ref(readFlag('dash.mineMrs'))
const setMineMode = (next: boolean): void => {
  isMineMode.value = next
  writeSize('dash.mineMrs', next)
}
const mineCount = computed(() => (props.myName ? props.rows.filter((r) => r.author === props.myName).length : 0))
const isToAddress = (r: MrRow): boolean => r.openThreads > 0
const sessionOf = (r: MrRow): Session | undefined => {
  const list = props.sessions ?? []
  return props.myName && r.author === props.myName ? findMineSession(list, r) : findReviewSession(list, r.sessionId)
}
const isLive = (r: MrRow): boolean => !!sessionOf(r)?.isLive
const isWaiting = (r: MrRow): boolean => isLive(r) && sessionOf(r)?.status === 'waiting'
const mineToAddress = computed(() => (props.myName ? props.rows.filter((r) => r.author === props.myName && isToAddress(r)).length : 0))
const GROUP_TITLE = { 'new-changes': 'New changes since your review', 'not-reviewed': 'Not reviewed', reviewed: 'Reviewed', approved: 'Approved by me' }
const PROJECT_COLORS = ['#6aa9ff', '#c586c0', '#4ec9b0', '#e8b84a', '#f2706a', '#9cdcfe']
const projectColor = (name: string): string =>
  PROJECT_COLORS[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % PROJECT_COLORS.length]
const initials = (name: string): string =>
  name
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()

const projects = computed(() => [...new Set(props.rows.map((r) => r.projectName))].sort())
const authors = computed(() => [...new Set(props.rows.map((r) => r.author))].sort())
const isTodayOnly = ref(readFlag('dash.todayMrs'))
const setTodayOnly = (next: boolean): void => {
  isTodayOnly.value = next
  writeSize('dash.todayMrs', next)
}
const isFinishedOpen = ref(false)
const { now, finished, toggleFinish } = useWorkday()
const isFinished = (row: MrRow): boolean => isTodayOnly.value && finished.value.includes(row.key)
const visible = computed(() => matching.value.filter((r) => !isFinished(r)))
const matching = computed(() =>
  filterMrs(props.rows, {
    query: query.value,
    project: project.value,
    author: author.value,
    isUnreviewedOnly: isUnreviewedOnly.value,
    myName: props.myName ?? null,
    isMineHidden: !isMineMode.value,
    isMineOnly: isMineMode.value
  }).filter((r) => !isTodayOnly.value || isActiveToday([sessionOf(r)], now.value))
)
const order = useManualOrder('dash.order.mrs')
const rankMr = (r: MrRow): { isActive: boolean; priority: string | undefined } => ({ isActive: isLive(r), priority: r.priority })
const groups = computed(() =>
  (isMineMode.value
    ? [
        { key: 'address', title: 'Threads to address', color: '#e8b84a', rows: visible.value.filter(isToAddress) },
        { key: 'quiet', title: 'No open threads', color: '#3dd68c', rows: visible.value.filter((r) => !isToAddress(r)) }
      ].filter((g) => g.rows.length)
    : groupMrs(visible.value).map((g) => ({ key: g.state, title: GROUP_TITLE[g.state], color: reviewLabel(g.state).color, rows: g.rows }))
  )
    .concat(matching.value.some(isFinished) ? [{ key: 'finished', title: 'Finished today', color: '#4b525c', rows: matching.value.filter(isFinished) }] : [])
    .map((g) => ({ ...g, rows: orderGroup(g.key, g.rows) }))
)

const isStarred = (row: MrRow): boolean => props.starred.includes(row.key)
const orderGroup = (key: string, rows: MrRow[]): MrRow[] => {
  const split = splitStarred(rows, props.starred)
  return [...order.ordered(starredBlock(key), split.starred, rankMr), ...order.ordered(key, split.rest, rankMr)]
}
const blockOf = (key: string, row: MrRow): string => (isStarred(row) ? starredBlock(key) : key)
const blockKeys = (key: string, rows: MrRow[], row: MrRow): string[] =>
  rows.filter((r) => blockOf(key, r) === blockOf(key, row)).map((r) => r.key)
const isGroupManual = (key: string): boolean => order.isManual(key) || order.isManual(starredBlock(key))
const resetGroup = (key: string): void => {
  order.resetOrder(key)
  order.resetOrder(starredBlock(key))
}
const toggleStar = (row: MrRow): void => window.api.setStarred(row.key, !isStarred(row))
const toggleAllProjects = (): void => window.api.setAllProjects(!props.isAllProjects)
const updatedAgo = (row: MrRow): string => {
  const at = Date.parse(row.updatedAt)
  return Number.isNaN(at) ? '' : ago(at)
}
</script>

<template>
  <section class="list">
    <label class="search">
      <Icon name="search" :size="14" />
      <input v-model="query" placeholder="Search title, !iid, branch, ticket" spellcheck="false" />
    </label>
    <div class="filters">
      <select v-model="project">
        <option value="">All projects</option>
        <option v-for="p in projects" :key="p" :value="p">{{ p }}</option>
      </select>
      <select v-model="author">
        <option value="">All authors</option>
        <option v-for="a in authors" :key="a" :value="a">{{ a }}</option>
      </select>
    </div>
    <div class="modes">
      <button :class="{ on: !isMineMode }" @click="setMineMode(false)">To review</button>
      <button :class="{ on: isMineMode }" :disabled="!myName" :title="myName ? '' : 'Your GitLab name is not known yet'" @click="setMineMode(true)">
        Mine<span v-if="mineCount" class="mcount">{{ mineCount }}</span><i v-if="mineToAddress" class="attn" :title="`${mineToAddress} with threads to address`" />
      </button>
    </div>
    <div class="filters">
      <label v-if="!isMineMode"><input v-model="isUnreviewedOnly" type="checkbox" />Not reviewed</label>
      <label title="Only merge requests with a Claude session active since midnight"><input :checked="isTodayOnly" type="checkbox" @change="setTodayOnly(($event.target as HTMLInputElement).checked)" />Today</label>
      <button class="toggle" :class="{ on: isAllProjects }" @click="toggleAllProjects">
        {{ isAllProjects ? 'My projects' : 'All projects' }}
      </button>
    </div>

    <div v-if="error" class="note">
      {{ ERROR_HINT[error] }}
      <code v-if="errorDetail" class="detail">{{ errorDetail }}</code>
      <button class="link" @click="emit('settings')">Open Settings</button>
    </div>
    <div v-else-if="isLoading && !rows.length" class="note">Loading merge requests…</div>
    <div v-else-if="!matching.length" class="note">{{ isTodayOnly ? 'No merge requests worked on today' : 'No merge requests to review' }}</div>

    <div v-for="g in groups" :key="g.key" class="group">
      <h3 class="ghead" :class="{ fold: g.key === 'finished' }" @click="g.key === 'finished' && (isFinishedOpen = !isFinishedOpen)">
        <Icon v-if="g.key === 'finished'" :name="isFinishedOpen ? 'chevronDown' : 'chevronRight'" :size="12" />
        <i v-else :style="{ background: g.color }" />{{ g.title }}<span>{{ g.rows.length }}</span>
        <button v-if="isGroupManual(g.key)" class="autoorder" title="Drop your order and sort by running sessions, then priority" @click.stop="resetGroup(g.key)">Auto order</button>
      </h3>
      <article
        v-for="r in g.key === 'finished' && !isFinishedOpen ? [] : g.rows"
        :key="r.key"
        class="tile"
        :class="{
          sel: selectedKey === r.key,
          'has-session': isLive(r),
          'needs-input': isWaiting(r),
          'drop-before': order.dropTarget.value?.key === r.key && !order.dropTarget.value.isAfter,
          'drop-after': order.dropTarget.value?.key === r.key && order.dropTarget.value.isAfter
        }"
        tabindex="0"
        draggable="true"
        @dragstart="order.onDragStart($event, blockOf(g.key, r), r.key)"
        @dragover="order.onDragOver($event, blockOf(g.key, r), r.key)"
        @drop="order.onDrop(blockOf(g.key, r), blockKeys(g.key, g.rows, r))"
        @dragend="order.onDragEnd"
        @click="emit('select', r.key)"
        @keydown.enter="emit('select', r.key)"
      >
        <SessionBadge v-if="isLive(r)" :status="sessionOf(r)?.status ?? 'idle'" :model="sessionOf(r)?.model" :context-tokens="sessionOf(r)?.contextTokens" />
        <p class="summary"><span v-if="r.isDraft" class="draft">Draft</span>{{ r.title }}</p>
        <div v-if="isMineMode && isToAddress(r)" class="attnrow" :title="`${r.openThreads} unresolved ${r.openThreads === 1 ? 'thread' : 'threads'} to address`"><Icon name="message" :size="12" />{{ r.openThreads }}</div>
        <div class="meta">
          <PriorityIcon :name="r.priority" />
          <span class="proj" :style="{ color: projectColor(r.projectName), background: `${projectColor(r.projectName)}1f` }">{{ r.projectName }}</span>
          <span class="iid">!{{ r.iid }}</span>
          <span v-if="isWaiting(r)" class="live needs" title="Claude is waiting for your answer"><i />needs you</span>
          <span v-else-if="isLive(r)" class="live" title="A Claude session for this merge request is running"><i /></span>
          <span class="who"><span class="av">{{ initials(r.author) }}</span>{{ r.author }}</span>
          <span v-if="r.approvals" class="appr" :title="`${r.approvals} ${r.approvals === 1 ? 'approval' : 'approvals'}`"><Icon name="check" :size="11" />{{ r.approvals }}</span>
          <span v-if="sessionOf(r)?.changes" class="unc" :title="`${sessionOf(r)?.changes} uncommitted ${sessionOf(r)?.changes === 1 ? 'file' : 'files'} in this merge request's folder`"><Icon name="diff" :size="11" />{{ sessionOf(r)?.changes }}</span>
          <span class="ago">{{ updatedAgo(r) }}</span>
          <button v-if="isTodayOnly" class="star finish" :class="{ on: isFinished(r) }" :title="isFinished(r) ? 'Not finished yet' : 'Finished for today'" @click.stop="toggleFinish(r.key)">
            <Icon name="check" :size="14" />
          </button>
          <button class="star" :class="{ on: isStarred(r) }" :title="isStarred(r) ? 'Unstar' : 'Star'" @click.stop="toggleStar(r)">
            <Icon name="star" :size="14" />
          </button>
        </div>
      </article>
    </div>
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
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  margin: 0 4px;
  padding: 0 10px;
  color: var(--text-4);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 8px;
}
.search:focus-within {
  border-color: var(--accent);
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
select {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 6px;
  font: 12px var(--font-ui);
  color: var(--text-2);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 7px;
  outline: none;
}
select:focus {
  border-color: var(--accent);
}
.filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 10px;
  margin: 6px 4px 0;
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
.toggle {
  margin-left: auto;
  height: 24px;
  padding: 0 8px;
  font: 12px var(--font-ui);
  color: var(--text-3);
  background: none;
  border: 1px solid var(--line-2);
  border-radius: 6px;
  cursor: pointer;
}
.toggle.on,
.toggle:hover {
  color: var(--text);
  border-color: var(--line-3);
  background: var(--bg-3);
}
.note {
  margin: 10px 4px;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-3);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.detail {
  display: block;
  margin-top: 6px;
  font: 11.5px var(--font-mono);
  color: var(--danger);
  word-break: break-word;
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
.modes {
  display: flex;
  gap: 2px;
  margin: 8px 4px 0;
  padding: 2px;
  background: var(--bg-0);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.modes button {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 26px;
  font: 500 12.5px var(--font-ui);
  color: var(--text-4);
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.modes button.on {
  color: var(--text);
  background: var(--bg-4);
}
.modes button:disabled {
  opacity: 0.4;
  cursor: default;
}
.mcount {
  font-size: 11px;
  color: var(--text-3);
}
.attn {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--warn);
}
.draft {
  display: inline-block;
  margin-right: 6px;
  padding: 0 6px;
  font: 700 10.5px/17px var(--font-ui);
  vertical-align: 1px;
  color: var(--bg-0);
  background: var(--warn);
  border-radius: 4px;
}
.attnrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  padding: 1px 8px;
  font-size: 11.5px;
  color: var(--warn);
  background: var(--warn-soft);
  border-radius: 9px;
}
.group {
  margin-top: 14px;
}
.ghead {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 4px 6px;
  font: 600 12px var(--font-ui);
  color: var(--text-3);
}
.ghead i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.ghead span {
  font-weight: 400;
  color: var(--text-4);
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
.tile {
  position: relative;
  margin: 0 2px 6px;
  padding: 10px 11px 9px;
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
.tile.sel {
  background: var(--bg-3);
  border-color: var(--accent);
  box-shadow: inset 3px 0 0 var(--accent);
}
.summary {
  margin: 0;
  font: 500 13.5px/1.4 var(--font-ui);
  color: var(--text);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  min-width: 0;
  font-size: 11.5px;
  color: var(--text-4);
}
.proj {
  flex: none;
  max-width: 120px;
  padding: 1px 7px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  border-radius: 5px;
}
.iid {
  flex: none;
  font: 600 11.5px var(--font-mono);
  color: var(--text-3);
}
.who {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-3);
}
.av {
  flex: none;
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  font: 600 8.5px var(--font-ui);
  color: var(--text-2);
  background: var(--bg-4);
  border-radius: 50%;
}
.live {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 5px;
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
  padding: 0 7px 0 6px;
  color: var(--warn);
  background: var(--warn-soft);
  border-color: rgba(232, 184, 74, 0.5);
}
.live.needs i {
  background: var(--warn);
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
.appr {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0 6px 0 3px;
  font: 600 11px/18px var(--font-ui);
  color: var(--ok);
  border: 1px solid var(--ok-line);
  border-radius: 9px;
}
.appr .icon {
  padding: 1px;
  border: 1.5px solid currentColor;
  border-radius: 50%;
}
.ago {
  flex: none;
  margin-left: auto;
}
.star {
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
.star.finish:hover,
.star.finish.on {
  color: var(--accent);
}
.star.finish.on :deep(path) {
  fill: none;
}
.ghead.fold {
  cursor: pointer;
}
.ghead.fold:hover {
  color: var(--text-2);
}
.star.on :deep(path) {
  fill: currentColor;
}
</style>
