<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AutonomyChoice } from '../../../main/orchestrator'
import { AUTONOMY_LEVELS } from './orchestrator'
import { useEscapeClose } from './escape'
import Icon from './Icon.vue'

const props = defineProps<{ value: AutonomyChoice | null; isDisabled?: boolean; disabledHint?: string; isCompact?: boolean }>()
const emit = defineEmits<{ change: [choice: AutonomyChoice] }>()

const LIST_WIDTH = 300
const LIST_HEIGHT = 190
const EDGE = 8
const GAP = 4

const isOpen = ref(false)
const anchor = ref<HTMLButtonElement | null>(null)
const listStyle = ref<Record<string, string>>({})
const current = computed(() => AUTONOMY_LEVELS.find((l) => l.value === props.value) ?? null)
const close = (): void => {
  isOpen.value = false
}
const placeList = (): void => {
  const rect = anchor.value?.getBoundingClientRect()
  if (!rect) return
  const left = Math.max(EDGE, Math.min(rect.right - LIST_WIDTH, window.innerWidth - LIST_WIDTH - EDGE))
  const isAbove = window.innerHeight - rect.bottom < LIST_HEIGHT && rect.top > LIST_HEIGHT
  listStyle.value = isAbove ? { left: `${left}px`, bottom: `${window.innerHeight - rect.top + GAP}px` } : { left: `${left}px`, top: `${rect.bottom + GAP}px` }
}
const toggle = (): void => {
  if (props.isDisabled) return
  placeList()
  isOpen.value = !isOpen.value
}
const pick = (autonomy: AutonomyChoice): void => {
  close()
  emit('change', autonomy)
}
useEscapeClose(isOpen, close)
</script>

<template>
  <span class="menu">
    <button
      ref="anchor"
      class="btn"
      :class="{ on: !!current && current.value !== 'off', compact: isCompact }"
      :disabled="isDisabled"
      :title="isDisabled ? disabledHint : `Orchestrator: ${current ? current.hint : 'not orchestrated'}`"
      @click="toggle"
    >
      <Icon name="bot" :size="isCompact ? 12 : 14" />{{ current ? current.label : 'Orchestrator' }}<span class="caret">▾</span>
    </button>
    <span v-if="isOpen" class="scrim" @click="close" />
    <span v-if="isOpen" class="list" :style="listStyle">
      <button v-for="level in AUTONOMY_LEVELS" :key="level.value" class="item" :class="{ on: level.value === value }" @click="pick(level.value)">
        <b>{{ level.label }}</b>
        <span>{{ level.hint }}</span>
      </button>
    </span>
  </span>
</template>

<style scoped>
.menu {
  position: relative;
  display: inline-flex;
  flex: none;
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  font: 12px var(--font-ui);
  color: var(--text-2);
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  border-radius: 7px;
  cursor: pointer;
}
.btn:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--accent);
}
.btn.on {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 50%, transparent);
}
.btn.compact {
  box-sizing: border-box;
  gap: 4px;
  height: 22px;
  padding: 0 7px;
  font-size: 11px;
  background: var(--bg-3);
  border-radius: 5px;
}
.btn:disabled {
  opacity: 0.45;
  cursor: default;
}
.caret {
  font-size: 9px;
  color: var(--text-4);
}
.scrim {
  position: fixed;
  inset: 0;
  z-index: 20;
}
.list {
  position: fixed;
  z-index: 21;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 300px;
  padding: 6px;
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}
.item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  text-align: left;
  color: var(--text-2);
  background: none;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
}
.item:hover {
  background: var(--bg-2);
}
.item.on {
  border-color: color-mix(in srgb, var(--accent) 50%, transparent);
}
.item b {
  font: 600 12px var(--font-ui);
  color: var(--text);
}
.item.on b {
  color: var(--accent);
}
.item span {
  font-size: 11px;
  color: var(--text-4);
}
</style>
