<script setup lang="ts">
import { computed } from 'vue'
import { STAGES, type Stage } from '../types'
import { STAGE_LABEL, PHASES, REJECTED_COLOR, filledSegments, phaseOf } from '../display'

const props = defineProps<{ stage: Stage | null; reached: Stage[]; isRejected?: boolean }>()

const filled = computed(() => filledSegments(props.stage))
const color = computed(() => {
  if (props.isRejected) return REJECTED_COLOR
  return props.stage ? phaseOf(props.stage).color : ''
})
const tooltip = computed(() =>
  STAGES.map((st) => `${props.reached.includes(st) ? '✓' : '·'} ${STAGE_LABEL[st]}`).join('\n')
)
</script>

<template>
  <div v-if="stage || isRejected" class="stagebar" :title="tooltip">
    <div class="segs">
      <span
        v-for="(phase, i) in PHASES"
        :key="phase.key"
        class="seg"
        :style="filled[i] ? { background: color } : {}"
      />
    </div>
    <span class="lbl" :style="{ color }">{{ isRejected ? 'Rejected' : phaseOf(stage!).label }}</span>
  </div>
</template>

<style scoped>
.stagebar {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 5px;
}
.segs {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 2px;
  max-width: 160px;
}
.seg {
  height: 4px;
  border-radius: 2px;
  background: #21262d;
}
.lbl {
  flex: none;
  font-size: 10px;
  font-weight: 600;
}
</style>
