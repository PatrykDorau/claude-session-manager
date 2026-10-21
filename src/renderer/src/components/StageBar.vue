<script setup lang="ts">
import { computed } from 'vue'
import { STAGES, type Stage } from '../types'
import { STAGE_LABEL } from '../display'

const props = defineProps<{ stage: Stage | null; reached: Stage[] }>()

const currentIndex = computed(() => (props.stage ? STAGES.indexOf(props.stage) : -1))
const segmentClass = (st: Stage, i: number): string => {
  if (props.reached.includes(st)) return 'done'
  return i < currentIndex.value ? 'skipped' : ''
}
const tooltip = computed(() =>
  STAGES.map((st) => `${props.reached.includes(st) ? '✓' : '·'} ${STAGE_LABEL[st]}`).join('\n')
)
</script>

<template>
  <div v-if="stage" class="stagebar" :title="tooltip">
    <div class="segs">
      <span v-for="(st, i) in STAGES" :key="st" class="seg" :class="segmentClass(st, i)" />
    </div>
    <span class="lbl">{{ STAGE_LABEL[stage] }}</span>
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
  grid-template-columns: repeat(8, 1fr);
  gap: 2px;
  max-width: 160px;
}
.seg {
  height: 4px;
  border-radius: 2px;
  background: #21262d;
}
.seg.done {
  background: #58a6ff;
}
.seg.skipped {
  background: #30363d;
  opacity: 0.5;
}
.lbl {
  flex: none;
  font-size: 10px;
  color: #8b949e;
}
</style>
