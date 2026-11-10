<script setup lang="ts">
const props = defineProps<{ isVertical?: boolean }>()
const emit = defineEmits<{ resize: [delta: number]; done: [] }>()

let last = 0

const positionOf = (e: PointerEvent): number => (props.isVertical ? e.clientY : e.clientX)
const onMove = (e: PointerEvent): void => {
  emit('resize', positionOf(e) - last)
  last = positionOf(e)
}
const onUp = (e: PointerEvent): void => {
  const el = e.currentTarget as HTMLElement
  el.releasePointerCapture(e.pointerId)
  el.removeEventListener('pointermove', onMove)
  el.removeEventListener('pointerup', onUp)
  document.body.classList.remove('is-resizing', 'is-resizing-rows')
  emit('done')
}
const onDown = (e: PointerEvent): void => {
  const el = e.currentTarget as HTMLElement
  last = positionOf(e)
  el.setPointerCapture(e.pointerId)
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp)
  document.body.classList.add('is-resizing', ...(props.isVertical ? ['is-resizing-rows'] : []))
}
</script>

<template>
  <div class="splitter" :class="{ rows: isVertical }" title="Drag to resize" @pointerdown.prevent="onDown" />
</template>

<style scoped>
.splitter {
  flex: none;
  width: 5px;
  margin: 0 -2px;
  z-index: 5;
  cursor: col-resize;
  background: transparent;
  transition: background 0.15s;
}
.splitter.rows {
  width: auto;
  height: 5px;
  margin: -2px 0;
  cursor: row-resize;
}
.splitter:hover {
  background: var(--accent);
}
:global(body.is-resizing) {
  cursor: col-resize;
  user-select: none;
}
:global(body.is-resizing.is-resizing-rows) {
  cursor: row-resize;
}
:global(body.is-resizing iframe),
:global(body.is-resizing .xterm) {
  pointer-events: none;
}
</style>
