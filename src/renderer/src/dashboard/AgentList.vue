<script setup lang="ts">
import { computed } from 'vue'
import type { AgentGroup, Session } from '../types'
import { ago } from '../display'
import { STATE_LOOK, MODEL_LOOK, groupLabel, type TreeCounts } from './agenttree'
import Icon from './Icon.vue'

const props = defineProps<{
  groups: AgentGroup[]
  sessions: Session[]
  selectedId: string | null
  counts: TreeCounts
  isMovingOnly: boolean
  isFinishedHidden: boolean
}>()
const emit = defineEmits<{
  select: [sessionId: string]
  'update:isMovingOnly': [value: boolean]
  'update:isFinishedHidden': [value: boolean]
}>()

const sessionOf = (id: string): Session | undefined => props.sessions.find((s) => s.id === id)
const lastAtOf = (g: AgentGroup): number => Math.max(...g.agents.map((a) => a.lastAt ?? 0))
const sorted = computed(() => [...props.groups].sort((a, b) => lastAtOf(b) - lastAtOf(a)))
const stateMix = (g: AgentGroup): { state: keyof typeof STATE_LOOK; count: number }[] =>
  (Object.keys(STATE_LOOK) as (keyof typeof STATE_LOOK)[])
    .map((state) => ({ state, count: g.agents.filter((a) => a.state === state).length }))
    .filter((m) => m.count)
const models = (g: AgentGroup): (keyof typeof MODEL_LOOK)[] => [...new Set(g.agents.map((a) => a.model))]
const STATS: { key: keyof TreeCounts; label: string; color: string }[] = [
  { key: 'working', label: 'Working', color: '#6aa9ff' },
  { key: 'needsYou', label: 'Need you', color: '#e8b84a' },
  { key: 'stuck', label: 'Stuck', color: '#f2706a' },
  { key: 'finished', label: 'Finished', color: '#3dd68c' }
]
</script>

<template>
  <section class="list">
    <div class="stats">
      <div v-for="s in STATS" :key="s.key" class="stat" :class="{ dim: !counts[s.key] }">
        <b :style="{ color: counts[s.key] ? s.color : undefined }">{{ counts[s.key] }}</b>
        <span>{{ s.label }}</span>
      </div>
    </div>
    <div class="filters">
      <label><input type="checkbox" :checked="isMovingOnly" @change="emit('update:isMovingOnly', !isMovingOnly)" />Only working</label>
      <label><input type="checkbox" :checked="isFinishedHidden" @change="emit('update:isFinishedHidden', !isFinishedHidden)" />Hide finished</label>
    </div>

    <div v-if="!sorted.length" class="note">
      No subagents in the last 3 days{{ isMovingOnly || isFinishedHidden ? ' that match the filters' : '' }}. A session shows up here when it dispatches agents.
    </div>

    <article
      v-for="g in sorted"
      :key="g.sessionId"
      class="tile"
      :class="{ sel: selectedId === g.sessionId }"
      tabindex="0"
      @click="emit('select', g.sessionId)"
      @keydown.enter="emit('select', g.sessionId)"
    >
      <div class="top">
        <Icon name="bot" :size="14" />
        <span class="name">{{ groupLabel(g.sessionId, sessionOf(g.sessionId)) }}</span>
        <span v-if="sessionOf(g.sessionId)?.status === 'waiting'" class="needs">needs you</span>
      </div>
      <div class="mix">
        <span v-for="m in stateMix(g)" :key="m.state" class="ms">
          <i :style="{ background: STATE_LOOK[m.state].color }" />{{ m.count }} {{ STATE_LOOK[m.state].label }}
        </span>
      </div>
      <div class="meta">
        <span>{{ sessionOf(g.sessionId)?.projectName ?? 'session ended' }}</span>
        <span v-for="m in models(g)" :key="m" class="model" :style="{ color: MODEL_LOOK[m].color }">{{ MODEL_LOOK[m].label }}</span>
        <span class="ago">{{ ago(lastAtOf(g)) }}</span>
      </div>
    </article>
  </section>
</template>

<style scoped>
.list {
  overflow-y: auto;
  padding: 0 8px 16px;
  background: var(--bg-1);
  border-right: 1px solid var(--line);
}
.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  margin: 0 4px;
}
.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 7px 0 6px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.stat b {
  font: 600 16px var(--font-ui);
  color: var(--text-2);
}
.stat span {
  font-size: 11px;
  color: var(--text-4);
}
.stat.dim b {
  color: var(--text-5);
}
.filters {
  display: flex;
  gap: 14px;
  margin: 10px 6px 6px;
  font-size: 12px;
  color: var(--text-3);
}
.filters label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.filters input {
  margin: 0;
  accent-color: var(--accent);
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
.tile {
  margin-top: 2px;
  padding: 9px 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  outline: none;
}
.tile:hover {
  background: var(--bg-2);
}
.tile:focus-visible {
  border-color: var(--line-3);
}
.tile.sel {
  background: var(--bg-3);
  border-color: var(--line-2);
}
.top {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  color: var(--text-4);
}
.name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 600 13px var(--font-ui);
  color: var(--text);
}
.needs {
  flex: none;
  margin-left: auto;
  padding: 0 7px;
  font-size: 11px;
  line-height: 18px;
  color: var(--warn);
  border: 1px solid var(--warn);
  border-radius: 9px;
}
.mix {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 10px;
  margin-top: 5px;
  font-size: 12px;
  color: var(--text-2);
}
.ms {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.ms i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 8px;
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-4);
}
.model {
  font-weight: 600;
}
.ago {
  margin-left: auto;
}
</style>
