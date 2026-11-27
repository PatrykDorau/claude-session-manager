<script setup lang="ts">
import { computed } from 'vue'
import type { Autonomy } from '../../../main/orchestrator'
import { GATE_LABELS, type CoordinatorBar } from './coordinator'

const props = defineProps<{ bar: CoordinatorBar; isSelected: boolean }>()
const emit = defineEmits<{ select: [bar: CoordinatorBar]; gate: [bar: CoordinatorBar, autonomy: Autonomy] }>()

const GATE_ORDER: Autonomy[] = ['manual', 'autonomous']
const ONLY_ROUTINE: Autonomy[] = ['routine']

const isRoutineOnly = computed(() => props.bar.track === 'review' || props.bar.track === 'watch')
const gateOptions = computed(() => (isRoutineOnly.value ? ONLY_ROUTINE : GATE_ORDER))
const gateValue = computed(() => (isRoutineOnly.value ? 'routine' : (props.bar.autonomy ?? 'manual')))
const toOption = (autonomy: Autonomy): { value: Autonomy; label: string } => ({ value: autonomy, label: GATE_LABELS[autonomy] })
const options = computed(() => gateOptions.value.map(toOption))
const selectBar = (): void => emit('select', props.bar)
const changeGate = (e: Event): void => emit('gate', props.bar, (e.target as HTMLSelectElement).value as Autonomy)
const stopClick = (e: Event): void => e.stopPropagation()
</script>

<template>
  <div
    class="bar"
    :class="{ 'needs-input': bar.isWaiting, selected: isSelected, over: bar.status === 'finished' || bar.status === 'failed' }"
    role="button"
    tabindex="0"
    :data-bar-id="bar.id"
    @click="selectBar"
    @keydown.enter.self="selectBar"
  >
    <div class="line">
      <span class="key">{{ bar.key }}</span>
      <span class="title" :title="bar.title">{{ bar.title }}</span>
      <span class="chip" :class="bar.status">{{ bar.status }}</span>
    </div>
    <div class="line">
      <span class="steps">
        <span
          v-for="step in bar.steps"
          :key="step.label"
          class="step"
          :class="{ done: step.isDone, current: step.isCurrent }"
          :title="step.label"
        />
      </span>
      <span class="grow" />
      <select class="gate" :value="gateValue" :disabled="isRoutineOnly" title="How far the coordinator may go alone" @click="stopClick" @change="changeGate">
        <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
    </div>
  </div>
</template>

<style scoped>
.bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 9px 10px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 8px;
  cursor: pointer;
}
.bar:hover,
.bar:focus-visible {
  border-color: var(--line-2);
  outline: none;
}
.bar.selected {
  border-color: var(--accent);
}
.bar.over {
  opacity: 0.6;
}
.bar.needs-input {
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
  .bar.needs-input {
    animation: none;
    box-shadow: 0 0 0 2px rgba(232, 184, 74, 0.35);
  }
}
.line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.key {
  flex: none;
  font: 600 12px var(--font-mono);
  color: var(--text);
}
.title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
  text-overflow: ellipsis;
}
.chip {
  flex: none;
  height: 17px;
  padding: 0 7px;
  font: 10.5px/17px var(--font-ui);
  color: var(--text-3);
  border: 1px solid var(--line-2);
  border-radius: 9px;
}
.chip.working {
  color: var(--ok);
}
.chip.waiting {
  color: var(--warn);
  border-color: var(--warn);
}
.chip.failed {
  color: var(--warn);
}
.steps {
  display: inline-flex;
  gap: 4px;
}
.step {
  width: 12px;
  height: 12px;
  box-sizing: border-box;
  border: 1px solid var(--line-2);
  border-radius: 2px;
}
.step.done {
  background: var(--text-3);
  border-color: var(--text-3);
}
.step.current {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 45%, transparent);
}
.grow {
  flex: 1;
}
.gate {
  height: 22px;
  max-width: 190px;
  padding: 0 4px;
  font: 11px var(--font-ui);
  color: var(--text-2);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 5px;
}
.gate:disabled {
  opacity: 0.7;
}
</style>
