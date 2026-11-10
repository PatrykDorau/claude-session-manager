<script setup lang="ts">
import { ref, computed } from 'vue'
import { laneGroups, splitTag, statusLane, type TaskRow } from '../taskview'
import type { MrRow } from '../types'
import { ago } from '../display'
import { filterRows, rowChip, lastActivity } from './dashboard'
import PriorityIcon from './PriorityIcon.vue'
import Icon from './Icon.vue'

const props = defineProps<{
  rows: TaskRow[]
  starred: string[]
  isStarredOnly: boolean
  selectedKey: string | null
  jiraError: 'no-token' | 'failed' | null
  mrs?: MrRow[]
  myName?: string | null
}>()
const emit = defineEmits<{ select: [key: string]; settings: []; 'open-mr': [key: string] }>()

const JIRA_HINT = {
  'no-token': 'Add a Jira token in Settings to see your tickets.',
  failed: 'Jira search failed. Check the token and the JQL in Settings.'
}
const OUTSIDE = { key: 'outside', label: 'Not in your Jira query', color: '#4b525c' }

const query = ref('')
const isOutsideOpen = ref(false)
const visible = computed(() => filterRows(props.rows, query.value, props.starred, props.isStarredOnly))
const groups = computed(() => {
  const outside = visible.value.filter((r) => !r.isFromJira)
  return [...laneGroups(visible.value), ...(outside.length ? [{ lane: OUTSIDE, rows: outside }] : [])]
})
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
const rowsOf = (g: { lane: { key: string }; rows: TaskRow[] }): TaskRow[] =>
  g.lane.key === 'outside' && !isOutsideOpen.value ? [] : g.rows
const toggleOutside = (key: string): void => {
  if (key === 'outside') isOutsideOpen.value = !isOutsideOpen.value
}
</script>

<template>
  <section class="list">
    <label class="search">
      <Icon name="search" :size="14" />
      <input v-model="query" placeholder="Search tickets" spellcheck="false" />
    </label>
    <div v-if="jiraError" class="note">
      {{ JIRA_HINT[jiraError] }}
      <button class="link" @click="emit('settings')">Open Settings</button>
    </div>
    <div v-else-if="!visible.length" class="note">{{ isStarredOnly ? 'Star a ticket to see it here' : 'No tickets match' }}</div>

    <div v-for="g in groups" :key="g.lane.key" class="lane" :style="{ '--lane': g.lane.color }">
      <h3 class="lhead" :class="{ fold: g.lane.key === 'outside' }" @click="toggleOutside(g.lane.key)">
        <Icon v-if="g.lane.key === 'outside'" :name="isOutsideOpen ? 'chevronDown' : 'chevronRight'" :size="12" />
        <span v-else class="ldot" />
        <span>{{ g.lane.label }}</span>
        <span class="lcount">{{ g.rows.length }}</span>
        <span v-if="g.lane.key === 'outside'" class="fold-lbl">{{ isOutsideOpen ? 'Hide' : 'Show' }}</span>
      </h3>
      <article
        v-for="r in rowsOf(g)"
        :key="r.key"
        class="tile"
        :class="{ sel: selectedKey === r.key, 'has-session': r.sessions.some((s) => s.isLive), 'needs-input': r.sessions.some((s) => s.isLive && s.status === 'waiting') }"
        :style="{ '--edge': edgeOf(r) }"
        tabindex="0"
        @click="emit('select', r.key)"
        @keydown.enter="emit('select', r.key)"
      >
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
          <span v-if="activityOf(r)" class="meta">{{ activityOf(r) }}</span>
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
.meta {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--text-4);
}
</style>
