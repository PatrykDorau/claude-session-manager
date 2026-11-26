<script setup lang="ts">
import { ref } from 'vue'
import type { AutonomyChoice } from '../../../main/orchestrator'
import { useEscapeClose } from './escape'
import AutonomyMenu from './AutonomyMenu.vue'
import Icon from './Icon.vue'

defineProps<{
  color: string | null
  isPinned?: boolean
  isPinShown?: boolean
  autonomy?: AutonomyChoice | null
  isAutonomyShown?: boolean
  isAutonomyDisabled?: boolean
  autonomyHint?: string
  isSleepShown?: boolean
  isStopDisabled: boolean
}>()
const emit = defineEmits<{ pin: []; autonomy: [choice: AutonomyChoice]; sleep: []; stop: [] }>()

const LIST_WIDTH = 240
const LIST_HEIGHT = 190
const EDGE = 8
const GAP = 4

const isOpen = ref(false)
const anchor = ref<HTMLButtonElement | null>(null)
const listStyle = ref<Record<string, string>>({})
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
  placeList()
  isOpen.value = !isOpen.value
}
const pick = (action: 'pin' | 'sleep' | 'stop'): void => {
  close()
  if (action === 'pin') emit('pin')
  else if (action === 'sleep') emit('sleep')
  else emit('stop')
}
const pickAutonomy = (choice: AutonomyChoice): void => {
  close()
  emit('autonomy', choice)
}
useEscapeClose(isOpen, close)
</script>

<template>
  <span class="menu">
    <button ref="anchor" class="btn" :class="{ on: isOpen }" title="Session controls" @click="toggle">
      <span class="dot" :style="{ background: color ?? 'var(--text-4)' }" />Session<span class="caret">▾</span>
    </button>
    <span v-if="isOpen" class="scrim" @click="close" />
    <span v-if="isOpen" class="list" :style="listStyle">
      <button v-if="isPinShown" class="item" :title="isPinned ? 'Unpin from the command panel grid' : 'Pin this session to the command panel grid'" @click="pick('pin')">
        <Icon name="dashboard" :size="14" />{{ isPinned ? 'Unpin' : 'Pin to panel' }}
      </button>
      <span v-if="isAutonomyShown" class="row">
        <AutonomyMenu :value="autonomy ?? null" :is-disabled="isAutonomyDisabled" :disabled-hint="autonomyHint" is-compact @change="pickAutonomy" />
      </span>
      <button v-if="isSleepShown" class="item" title="Put this session to sleep: the Claude process stops and the session stays on the list" @click="pick('sleep')">
        <Icon name="moon" :size="14" />Sleep
      </button>
      <button class="item danger" :disabled="isStopDisabled" title="Interrupt Claude's current turn (Esc)" @click="pick('stop')">
        <Icon name="stop" :size="12" />Stop turn
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
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  font: 12px var(--font-ui);
  color: var(--text-2);
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  border-radius: 7px;
  cursor: pointer;
}
.btn:hover,
.btn.on {
  color: var(--text);
  border-color: var(--accent);
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
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
  width: 240px;
  padding: 6px;
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}
.item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  font: 12px var(--font-ui);
  text-align: left;
  color: var(--text-2);
  background: none;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
}
.item:hover:not(:disabled) {
  color: var(--text);
  background: var(--bg-2);
}
.item.danger:hover:not(:disabled) {
  color: var(--danger);
}
.item:disabled {
  opacity: 0.45;
  cursor: default;
}
.row {
  display: flex;
  padding: 3px 4px;
}
</style>
