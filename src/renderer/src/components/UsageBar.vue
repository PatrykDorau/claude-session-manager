<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { Gauge, UsageResult } from '../types'
import { formatReset, severityColor } from '../usage'

defineProps<{ result: UsageResult | null }>()

const SHORT: Record<string, string> = {
  session: 'Session',
  weekly_all: 'Weekly',
  weekly_opus: 'Opus',
  weekly_sonnet: 'Sonnet'
}
function shortLabel(g: Gauge): string {
  return SHORT[g.key] ?? g.label
}

const now = ref(Date.now())
let timer: number | undefined
onMounted(() => {
  timer = window.setInterval(() => (now.value = Date.now()), 30000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div v-if="result && !result.ok" class="ubar unavail">Usage unavailable — open Claude Code</div>
  <div v-else-if="result && result.ok && result.gauges.length" class="ubar">
    <span v-for="g in result.gauges" :key="g.key" class="g">
      <span class="gt">{{ shortLabel(g) }}</span>
      <span class="gp" :style="{ color: severityColor(g.severity) }">{{ g.percent }}%</span>
      <span v-if="g.resetsAt" class="gr">{{ formatReset(g.resetsAt, now) }}</span>
    </span>
  </div>
</template>

<style scoped>
.ubar {
  padding: 6px 10px;
  border-bottom: 1px solid #21262d;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 14px;
  font-size: 10px;
}
.unavail {
  display: block;
  color: #6e7681;
}
.g {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}
.gt {
  color: #8b949e;
}
.gp {
  font-weight: 600;
}
.gr {
  color: #6e7681;
}
</style>
