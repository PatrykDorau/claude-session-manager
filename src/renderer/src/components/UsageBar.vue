<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { UsageResult } from '../types'
import { formatReset, severityColor } from '../usage'

defineProps<{ result: UsageResult | null }>()

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
    <div v-for="g in result.gauges" :key="g.key" class="urow">
      <span class="ulbl">{{ g.label }}</span>
      <span class="utrack">
        <span class="ufill" :style="{ width: g.percent + '%', background: severityColor(g.severity) }" />
      </span>
      <span class="upct">{{ g.percent }}%</span>
      <span class="ureset">{{ formatReset(g.resetsAt, now) }}</span>
    </div>
  </div>
</template>

<style scoped>
.ubar {
  padding: 6px 10px;
  border-bottom: 1px solid #21262d;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.unavail {
  color: #6e7681;
  font-size: 10px;
}
.urow {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 10px;
}
.ulbl {
  flex: none;
  width: 96px;
  color: #8b949e;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.utrack {
  flex: 1;
  min-width: 0;
  height: 5px;
  background: #21262d;
  border-radius: 3px;
  overflow: hidden;
}
.ufill {
  display: block;
  height: 100%;
  border-radius: 3px;
}
.upct {
  flex: none;
  width: 30px;
  text-align: right;
  color: #e6edf3;
  font-weight: 600;
}
.ureset {
  flex: none;
  width: 48px;
  text-align: right;
  color: #6e7681;
}
</style>
