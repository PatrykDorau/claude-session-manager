<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import type { UsageResult } from '../types'
import type { DashboardPage } from './dashboard'
import { formatReset, severityColor } from '../usage'
import Icon from './Icon.vue'
import type { IconName } from './icons'

const props = defineProps<{
  page: DashboardPage
  counts: Record<DashboardPage, number>
  alerts?: Partial<Record<DashboardPage, number>>
  usage: UsageResult | null
  isListOpen: boolean
}>()
const emit = defineEmits<{ select: [page: DashboardPage]; settings: []; startJobs: [] }>()

type Entry = { page: DashboardPage; label: string; icon: IconName; isSoon: boolean }
const TOP_ENTRIES: Entry[] = [
  { page: 'inbox', label: 'Inbox', icon: 'bell', isSoon: false },
  { page: 'today', label: 'Orchestrator', icon: 'dashboard', isSoon: false },
  { page: 'tickets', label: 'My tickets', icon: 'ticket', isSoon: false },
  { page: 'mrs', label: 'Merge requests to review', icon: 'pr', isSoon: false },
  { page: 'hosts', label: 'Local servers', icon: 'server', isSoon: false }
]
const BOTTOM_ENTRIES: Entry[] = [
  { page: 'tree', label: 'Agent tree', icon: 'tree', isSoon: false },
  { page: 'insights', label: 'Insights', icon: 'sparkles', isSoon: false },
  { page: 'timesheet', label: 'Timesheet', icon: 'gauge', isSoon: false },
  { page: 'flow', label: 'Flow', icon: 'flow', isSoon: false },
  { page: 'catalog', label: 'Catalog', icon: 'fileText', isSoon: false }
]
const select = (entry: Entry): void => {
  if (!entry.isSoon) emit('select', entry.page)
}
const SHORT_LABELS: Record<string, string> = { session: '5h', weekly_all: '7d' }
const now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  clock = setInterval(() => (now.value = Date.now()), 30000)
})
onBeforeUnmount(() => {
  if (clock) clearInterval(clock)
})
const meters = computed(() =>
  props.usage?.ok
    ? props.usage.gauges
        .filter((g) => g.key in SHORT_LABELS)
        .map((g) => ({
          key: g.key,
          short: SHORT_LABELS[g.key],
          percent: Math.min(100, Math.max(0, Math.round(g.percent))),
          color: g.severity === 'normal' ? 'var(--accent)' : severityColor(g.severity),
          reset: g.resetsAt ? formatReset(g.resetsAt, now.value) : ''
        }))
    : []
)
const usageTitle = computed(() => {
  const usage = props.usage
  if (!usage) return 'Usage limits are loading'
  if (!usage.ok) return 'Usage unavailable. Open Claude Code to sign in'
  return usage.gauges
    .map((g) => `${g.label}: ${g.percent}%${g.resetsAt ? `, resets in ${formatReset(g.resetsAt, now.value)}` : ''}`)
    .join('\n')
})
const showSidebar = (): void => window.api.showSidebar()
</script>

<template>
  <nav class="rail">
    <div class="mark" title="Claude Cockpit"><Icon name="dashboard" :size="17" /></div>
    <template v-for="(entries, groupIndex) in [TOP_ENTRIES, BOTTOM_ENTRIES]" :key="groupIndex">
      <button
        v-for="e in entries"
        :key="e.page"
        class="nav"
        :class="{ on: page === e.page && isListOpen, active: page === e.page, ringing: e.page === 'inbox' && !!alerts?.inbox }"
        :disabled="e.isSoon"
        :title="e.label"
        @click="select(e)"
      >
        <Icon :name="e.icon" :size="20" />
        <span v-if="!e.isSoon && counts[e.page]" class="badge">{{ counts[e.page] > 99 ? '99+' : counts[e.page] }}</span>
        <i v-if="alerts?.[e.page]" class="alert" :title="`${alerts[e.page]} waiting for your answer`" />
      </button>
      <template v-if="groupIndex === 0">
        <button class="nav" title="Start jobs…" @click="emit('startJobs')"><Icon name="play" :size="19" /></button>
        <span class="grow" />
      </template>
    </template>
    <div v-if="meters.length" class="usage" :title="usageTitle">
      <div v-for="m in meters" :key="m.key" class="meter">
        <span class="mlabel">{{ m.short }}</span>
        <b :style="{ color: m.color }">{{ m.percent }}%</b>
        <span class="mbar"><i :style="{ width: `${m.percent}%`, background: m.color }" /></span>
        <span v-if="m.reset" class="mreset">{{ m.reset === 'now' ? 'reset now' : m.reset }}</span>
      </div>
    </div>
    <div v-else-if="usage && !usage.ok" class="usage off" :title="usageTitle"><Icon name="gauge" :size="16" /><b>–</b></div>
    <button class="nav" title="Open the compact sidebar" @click="showSidebar"><Icon name="sidebar" :size="19" /></button>
    <button class="nav" title="Settings" @click="emit('settings')"><Icon name="settings" :size="19" /></button>
  </nav>
</template>

<style scoped>
.rail {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 52px;
  padding: 10px 0 10px;
  background: var(--bg-0);
  border-right: 1px solid var(--line);
}
.mark {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  margin-bottom: 10px;
  color: var(--accent);
  background: var(--accent-soft);
  border-radius: 9px;
}
.nav {
  position: relative;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  padding: 0;
  color: var(--text-4);
  background: none;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}
.nav:hover:not(:disabled),
.nav:focus-visible {
  color: var(--text);
  background: var(--bg-3);
  outline: none;
}
.nav.active {
  color: var(--text-2);
}
.nav.on {
  color: var(--accent);
  background: var(--accent-soft);
}
.nav.on::before {
  content: '';
  position: absolute;
  left: -6px;
  top: 10px;
  bottom: 10px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--accent);
}
.nav:disabled {
  opacity: 0.35;
  cursor: default;
}
.nav:has(.badge) {
  height: 48px;
  align-content: center;
  gap: 3px;
}
.badge {
  font: 600 10px/1 var(--font-ui);
  color: inherit;
  opacity: 0.85;
}
.nav.ringing {
  color: var(--warn);
}
.alert {
  position: absolute;
  top: 5px;
  right: 6px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--warn);
  box-shadow: 0 0 0 2px var(--bg-0);
  animation: blink 1.6s ease-in-out infinite;
}
@keyframes blink {
  50% {
    opacity: 0.35;
  }
}
@media (prefers-reduced-motion: reduce) {
  .alert {
    animation: none;
  }
}
.grow {
  flex: 1;
}
.usage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin-bottom: 8px;
  padding: 8px 0 2px;
  color: var(--text-4);
  border-top: 1px solid var(--line);
  cursor: default;
}
.usage b {
  font: 700 13px/1 var(--font-ui);
}
.usage.off {
  gap: 2px;
}
.meter {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  width: 44px;
}
.mlabel {
  font: 600 9.5px/1 var(--font-ui);
  letter-spacing: 0.04em;
  color: var(--text-4);
}
.mbar {
  display: block;
  width: 34px;
  height: 4px;
  overflow: hidden;
  background: var(--bg-3);
  border-radius: 2px;
}
.mbar i {
  display: block;
  height: 100%;
  border-radius: 2px;
}
.mreset {
  font: 500 9.5px/1 var(--font-ui);
  color: var(--text-3);
  white-space: nowrap;
}
.usage.off b {
  color: var(--text-5);
}
</style>
