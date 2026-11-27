<script setup lang="ts">
import { computed } from 'vue'
import type { Autonomy } from '../../../main/orchestrator'
import { GATE_LABELS, stageState, type BarStatus, type BarStep, type CoordinatorBar } from './coordinator'
import type { IconName } from './icons'
import Icon from './Icon.vue'

const props = defineProps<{ bar: CoordinatorBar; isSelected: boolean; stageInfo: (label: string) => string }>()
const emit = defineEmits<{
  select: [bar: CoordinatorBar]
  gate: [bar: CoordinatorBar, autonomy: Autonomy]
  open: [bar: CoordinatorBar]
}>()

const GATE_ORDER: Autonomy[] = ['manual', 'autonomous']
const ONLY_ROUTINE: Autonomy[] = ['routine']
const STATUS_ICONS: Record<BarStatus, IconName> = {
  queued: 'circle',
  working: 'refresh',
  waiting: 'bell',
  'turn-done': 'check',
  idle: 'terminal',
  handoff: 'send',
  finished: 'check',
  failed: 'close'
}

const isRoutineOnly = computed(() => props.bar.track === 'review' || props.bar.track === 'watch')
const gateOptions = computed(() => (isRoutineOnly.value ? ONLY_ROUTINE : GATE_ORDER))
const gateValue = computed(() => (isRoutineOnly.value ? 'routine' : (props.bar.autonomy ?? 'manual')))
const toOption = (autonomy: Autonomy): { value: Autonomy; label: string } => ({ value: autonomy, label: GATE_LABELS[autonomy] })
const options = computed(() => gateOptions.value.map(toOption))
const statusIcon = computed(() => STATUS_ICONS[props.bar.status])
const isOver = computed(() => props.bar.status === 'finished' || props.bar.status === 'failed')
const isWorking = computed(() => props.bar.status === 'working')
const isLastStep = (index: number): boolean => index === props.bar.steps.length - 1
const selectBar = (): void => emit('select', props.bar)
const openSession = (): void => emit('open', props.bar)
const changeGate = (e: Event): void => emit('gate', props.bar, (e.target as HTMLSelectElement).value as Autonomy)
const stopClick = (e: Event): void => e.stopPropagation()
const stateOf = (step: BarStep): string => stageState(step)
const stateClassOf = (step: BarStep): string => stageState(step).replace(' ', '-')
</script>

<template>
  <div
    class="bar"
    :class="{ 'needs-input': bar.isWaiting, selected: isSelected, over: isOver, working: isWorking }"
    role="button"
    tabindex="0"
    :data-bar-id="bar.id"
    @click="selectBar"
    @keydown.enter.self="selectBar"
  >
    <div class="who">
      <span class="status-icon" :class="bar.status"><Icon :name="statusIcon" :size="15" /></span>
      <span class="key">{{ bar.key }}</span>
      <span class="title" :title="bar.title">{{ bar.title }}</span>
    </div>
    <ol v-if="bar.steps.length" class="track">
      <li
        v-for="(step, index) in bar.steps"
        :key="step.label"
        class="node"
        :class="{ done: step.isDone, current: step.isCurrent, last: isLastStep(index) }"
        tabindex="0"
        @click="stopClick"
        @keydown.enter.stop
      >
        <span class="dot">
          <Icon v-if="step.isDone" name="check" :size="9" :stroke-width="3.5" />
          <span v-else-if="step.isCurrent" class="spark" />
        </span>
        <span class="label">{{ step.label }}</span>
        <span class="tip" role="tooltip">
          <span class="tip-head">
            <strong>{{ step.label }}</strong>
            <em :class="stateClassOf(step)">{{ stateOf(step) }}</em>
          </span>
          <span class="tip-body">{{ stageInfo(step.label) }}</span>
          <button class="tip-link" type="button" @click.stop="openSession">Open session</button>
        </span>
      </li>
    </ol>
    <div class="side">
      <span class="chip" :class="bar.status">{{ bar.status }}</span>
      <select class="gate" :value="gateValue" :disabled="isRoutineOnly" title="How far the coordinator may go alone" @click="stopClick" @change="changeGate">
        <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
      <button class="open" type="button" title="Open session" aria-label="Open session" @click.stop="openSession">
        <Icon name="external" :size="14" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 16px;
  padding: 12px 14px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 10px;
  cursor: pointer;
}
.bar:hover,
.bar:focus-visible {
  border-color: var(--line-2);
  outline: none;
}
.bar.working {
  border-left: 3px solid var(--info);
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
.who {
  flex: 1 1 200px;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.status-icon {
  flex: none;
  display: inline-flex;
  color: var(--text-4);
}
.status-icon.working {
  color: var(--info);
}
.status-icon.waiting {
  color: var(--warn);
}
.status-icon.finished,
.status-icon.turn-done {
  color: var(--ok, var(--accent));
}
.status-icon.failed {
  color: var(--danger);
}
.key {
  flex: none;
  font: 700 12px var(--font-mono);
  color: var(--text);
}
.title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font: 12px var(--font-ui);
  color: var(--text-3);
  white-space: nowrap;
  text-overflow: ellipsis;
}
.track {
  flex: 0 1 auto;
  display: flex;
  margin: 0;
  padding: 0;
  list-style: none;
}
.node {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 44px;
  outline: none;
}
.node::before {
  content: '';
  position: absolute;
  top: 7px;
  right: 50%;
  width: 100%;
  border-top: 2px dotted var(--line-3);
}
.node:first-child::before {
  display: none;
}
.node.done::before,
.node.current::before {
  border-top-color: var(--ok, var(--accent));
}
.dot {
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  color: var(--bg-1);
  background: var(--bg-2);
  border: 2px solid var(--line-3);
  border-radius: 50%;
}
.node.last .dot {
  border-radius: 4px;
}
.node.done .dot {
  background: var(--ok, var(--accent));
  border-color: var(--ok, var(--accent));
}
.node.current .dot {
  border-color: var(--accent);
  animation: pulse 2s ease-in-out infinite;
}
.node:focus-visible .dot {
  outline: 2px solid var(--info);
  outline-offset: 2px;
}
.spark {
  width: 6px;
  height: 6px;
  background: var(--accent);
  border-radius: 50%;
}
@keyframes pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 45%, transparent);
  }
  50% {
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 0%, transparent);
  }
}
.label {
  margin-top: 4px;
  font: 10px var(--font-ui);
  color: var(--text-4);
  white-space: nowrap;
}
.node.current .label {
  color: var(--accent);
}
.tip {
  position: absolute;
  top: 100%;
  left: 50%;
  z-index: 20;
  display: none;
  flex-direction: column;
  gap: 6px;
  width: 210px;
  margin-top: 2px;
  padding: 9px 11px;
  text-align: left;
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 8px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
  transform: translateX(-50%);
  cursor: default;
}
.node:hover .tip,
.node:focus-within .tip {
  display: flex;
}
.tip-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font: 12px var(--font-ui);
  color: var(--text);
}
.tip-head em {
  font-style: normal;
  font-size: 10.5px;
  color: var(--text-4);
}
.tip-head em.done {
  color: var(--ok, var(--accent));
}
.tip-head em.current {
  color: var(--accent);
}
.tip-body {
  font: 11px/1.4 var(--font-ui);
  color: var(--text-3);
}
.tip-link {
  align-self: flex-start;
  padding: 0;
  font: 11px var(--font-ui);
  color: var(--info);
  background: none;
  border: 0;
  cursor: pointer;
}
.tip-link:hover {
  text-decoration: underline;
}
.side {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
.chip {
  flex: none;
  height: 18px;
  padding: 0 8px;
  font: 10.5px/18px var(--font-ui);
  color: var(--text-3);
  border: 1px solid var(--line-2);
  border-radius: 9px;
}
.chip.working {
  color: var(--info);
  border-color: color-mix(in srgb, var(--info) 45%, transparent);
}
.chip.waiting {
  color: var(--warn);
  border-color: var(--warn);
}
.chip.failed {
  color: var(--danger);
  border-color: var(--danger-line);
}
.gate {
  height: 24px;
  max-width: 170px;
  padding: 0 4px;
  font: 11px var(--font-ui);
  color: var(--text-2);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 6px;
}
.gate:disabled {
  opacity: 0.7;
}
.open {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 24px;
  color: var(--text-3);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 6px;
  cursor: pointer;
}
.open:hover {
  color: var(--text);
  border-color: var(--line-3);
}
@media (prefers-reduced-motion: reduce) {
  .bar.needs-input {
    animation: none;
    box-shadow: 0 0 0 2px rgba(232, 184, 74, 0.35);
  }
  .node.current .dot {
    animation: none;
  }
}
</style>
