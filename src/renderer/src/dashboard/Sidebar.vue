<script setup lang="ts">
import { computed } from 'vue'
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
const emit = defineEmits<{ select: [page: DashboardPage]; settings: [] }>()

const ENTRIES: { page: DashboardPage; label: string; icon: IconName; isSoon: boolean }[] = [
  { page: 'tickets', label: 'My tickets', icon: 'ticket', isSoon: false },
  { page: 'mrs', label: 'Merge requests to review', icon: 'pr', isSoon: false },
  { page: 'starred', label: 'Starred', icon: 'star', isSoon: false },
  { page: 'tree', label: 'Agent tree', icon: 'tree', isSoon: false },
  { page: 'hosts', label: 'Local servers', icon: 'server', isSoon: false }
]
const select = (entry: (typeof ENTRIES)[number]): void => {
  if (!entry.isSoon) emit('select', entry.page)
}
const sessionGauge = computed(() => (props.usage?.ok ? (props.usage.gauges.find((g) => g.key === 'session') ?? props.usage.gauges[0]) : null))
const usageTitle = computed(() => {
  const usage = props.usage
  if (!usage) return 'Usage limits are loading'
  if (!usage.ok) return 'Usage unavailable. Open Claude Code to sign in'
  return usage.gauges
    .map((g) => `${g.label}: ${g.percent}%${g.resetsAt ? `, resets ${formatReset(g.resetsAt, Date.now())}` : ''}`)
    .join('\n')
})
const showSidebar = (): void => window.api.showSidebar()
</script>

<template>
  <nav class="rail">
    <div class="mark" title="Claude Cockpit"><Icon name="dashboard" :size="17" /></div>
    <button
      v-for="e in ENTRIES"
      :key="e.page"
      class="nav"
      :class="{ on: page === e.page && isListOpen, active: page === e.page }"
      :disabled="e.isSoon"
      :title="e.label"
      @click="select(e)"
    >
      <Icon :name="e.icon" :size="20" />
      <span v-if="!e.isSoon && counts[e.page]" class="badge">{{ counts[e.page] > 99 ? '99+' : counts[e.page] }}</span>
      <i v-if="alerts?.[e.page]" class="alert" :title="`${alerts[e.page]} waiting for your answer`" />
    </button>
    <span class="grow" />
    <div v-if="sessionGauge" class="usage" :title="usageTitle">
      <Icon name="gauge" :size="16" />
      <b :style="{ color: severityColor(sessionGauge.severity) }">{{ sessionGauge.percent }}%</b>
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
  gap: 2px;
  margin-bottom: 6px;
  color: var(--text-4);
  cursor: default;
}
.usage b {
  font: 600 10px var(--font-ui);
}
.usage.off b {
  color: var(--text-5);
}
</style>
