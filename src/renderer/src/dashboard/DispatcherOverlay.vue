<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Session } from '../types'
import Icon from './Icon.vue'
import DispatcherPane from './DispatcherPane.vue'
import type { InboxRow } from './inbox'

defineProps<{ session: Session | null; error: string | null; isStarting: boolean; rows: InboxRow[]; isOff?: boolean }>()
const emit = defineEmits<{ close: []; open: [row: InboxRow]; 'turn-on': [] }>()

interface WindowRect {
  x: number
  y: number
  w: number
  h: number
}

const RECT_KEY = 'dash.dispatcherRect'
const STATUS_BAR_PX = 22
const MIN_W = 360
const MIN_H = 220
const VISIBLE_PX = 80

const defaultRect = (): WindowRect => {
  const w = Math.min(620, Math.round(window.innerWidth * 0.92))
  return { x: window.innerWidth - w - 16, y: 56, w, h: window.innerHeight - STATUS_BAR_PX - 72 }
}

const clampRect = (r: WindowRect): WindowRect => {
  const w = Math.min(Math.max(r.w, MIN_W), window.innerWidth)
  const h = Math.min(Math.max(r.h, MIN_H), window.innerHeight - STATUS_BAR_PX)
  const x = Math.min(Math.max(r.x, VISIBLE_PX - w), window.innerWidth - VISIBLE_PX)
  const y = Math.min(Math.max(r.y, 0), window.innerHeight - STATUS_BAR_PX - 44)
  return { x, y, w, h }
}

const readRect = (): WindowRect => {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECT_KEY) ?? 'null') as WindowRect | null
    const isValid = !!parsed && [parsed.x, parsed.y, parsed.w, parsed.h].every(Number.isFinite)
    return clampRect(isValid ? parsed! : defaultRect())
  } catch {
    return clampRect(defaultRect())
  }
}

const rect = ref<WindowRect>(readRect())
const saveRect = (): void => localStorage.setItem(RECT_KEY, JSON.stringify(rect.value))
const rectStyle = (): Record<string, string> => ({
  left: `${rect.value.x}px`,
  top: `${rect.value.y}px`,
  width: `${rect.value.w}px`,
  height: `${rect.value.h}px`
})
const windowStyle = computed(rectStyle)

let gesture: { kind: 'move' | 'resize'; startX: number; startY: number; from: WindowRect } | null = null
const isDragging = ref(false)

const onPointerMove = (e: PointerEvent): void => {
  if (!gesture) return
  const dx = e.clientX - gesture.startX
  const dy = e.clientY - gesture.startY
  const { from } = gesture
  rect.value = clampRect(
    gesture.kind === 'move' ? { ...from, x: from.x + dx, y: from.y + dy } : { ...from, w: from.w + dx, h: from.h + dy }
  )
}
const onPointerUp = (): void => {
  if (!gesture) return
  gesture = null
  isDragging.value = false
  saveRect()
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
}
const startGesture = (kind: 'move' | 'resize', e: PointerEvent): void => {
  if (e.button !== 0) return
  if (kind === 'move' && (e.target as HTMLElement).closest('button')) return
  e.preventDefault()
  gesture = { kind, startX: e.clientX, startY: e.clientY, from: { ...rect.value } }
  isDragging.value = true
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}
const startMove = (e: PointerEvent): void => startGesture('move', e)
const startResize = (e: PointerEvent): void => startGesture('resize', e)
const resetRect = (): void => {
  rect.value = clampRect(defaultRect())
  saveRect()
}
const keepInside = (): void => {
  rect.value = clampRect(rect.value)
}
const watchViewport = (): void => window.addEventListener('resize', keepInside)
const stopWatching = (): void => {
  window.removeEventListener('resize', keepInside)
  onPointerUp()
}
onMounted(watchViewport)
onBeforeUnmount(stopWatching)
</script>

<template>
  <aside class="dispatcher" :class="{ dragging: isDragging }" :style="windowStyle">
    <header class="head" title="Drag to move, double-click to reset" @pointerdown="startMove" @dblclick="resetRect">
      <Icon name="message" :size="14" />
      <h2>Dispatcher</h2>
      <span v-if="session" class="state">{{ session.status }}</span>
      <span class="grow" />
      <kbd>Ctrl+Shift+D</kbd>
      <button class="iconbtn" title="Close the dispatcher (Ctrl+Shift+D)" @click="emit('close')"><Icon name="close" /></button>
    </header>
    <DispatcherPane
      :session="session"
      :error="error"
      :is-starting="isStarting"
      :is-off="isOff"
      :rows="rows"
      @open="emit('open', $event)"
      @turn-on="emit('turn-on')"
    />
    <span class="grip" title="Drag to resize" @pointerdown="startResize" />
  </aside>
</template>

<style scoped>
.dispatcher {
  position: fixed;
  z-index: 30;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-1);
  border: 1px solid var(--line-2);
  border-radius: 10px;
  box-shadow: var(--shadow);
}
.dispatcher.dragging {
  user-select: none;
}
.dispatcher.dragging :deep(*) {
  pointer-events: none;
}
.grip {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  background: linear-gradient(135deg, transparent 50%, var(--line-2) 50%, var(--line-2) 60%, transparent 60%, transparent 75%, var(--line-2) 75%, var(--line-2) 85%, transparent 85%);
}
.head {
  flex: none;
  cursor: move;
  user-select: none;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 8px 0 14px;
  color: var(--text-3);
  border-bottom: 1px solid var(--line);
}
.head h2 {
  margin: 0;
  font: 600 14px var(--font-ui);
  color: var(--text);
}
.state {
  font-size: 11px;
  color: var(--text-4);
}
.grow {
  flex: 1;
}
kbd {
  padding: 0 4px;
  border: 1px solid var(--line);
  border-radius: 3px;
  background: var(--bg-2);
  color: var(--text-4);
  font: 10px var(--font-mono);
}
.iconbtn {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  color: var(--text-4);
  background: none;
  border: none;
  border-radius: 7px;
  cursor: pointer;
}
.iconbtn:hover,
.iconbtn:focus-visible {
  color: var(--text);
  background: var(--bg-3);
  outline: none;
}
</style>
