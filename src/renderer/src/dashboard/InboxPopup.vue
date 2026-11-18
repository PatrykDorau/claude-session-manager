<script setup lang="ts">
import { ref } from 'vue'
import type { InboxRow, LiveOrder } from './inbox'
import { ago } from '../display'
import Icon from './Icon.vue'
import { useEscapeClose } from './escape'

defineProps<{ rows: InboxRow[]; order: LiveOrder }>()
const emit = defineEmits<{ open: [row: InboxRow]; close: []; order: [order: LiveOrder] }>()

const REASON: Record<string, string> = { waiting: 'needs you', checkout: 'turn finished', working: 'working', idle: 'idle' }
const isOpen = ref(true)
const close = (): void => emit('close')
useEscapeClose(isOpen, close)
</script>

<template>
  <div class="backdrop" @click="close" />
  <section class="popup" role="dialog" aria-label="Inbox">
    <header class="head">
      <Icon name="bell" :size="14" />
      <span>Inbox</span>
      <span class="count">{{ rows.length }}</span>
      <span class="grow" />
      <div class="modes">
        <button :class="{ on: order === 'attention' }" @click="emit('order', 'attention')">Needs me</button>
        <button :class="{ on: order === 'newest' }" @click="emit('order', 'newest')">Newest</button>
      </div>
    </header>
    <div v-if="!rows.length" class="note"><Icon name="check" :size="14" />No live sessions</div>
    <div class="rows">
      <article
        v-for="r in rows"
        :key="r.sessionId"
        class="tile"
        :class="r.status"
        tabindex="0"
        :title="r.title"
        @click="emit('open', r)"
        @keydown.enter="emit('open', r)"
      >
        <div class="top">
          <span class="key">{{ r.label }}</span>
          <span class="reason"><i />{{ REASON[r.status] ?? r.status }}</span>
          <span class="grow" />
          <span class="meta">{{ ago(r.since) }}</span>
        </div>
        <p class="summary">{{ r.title || 'No title' }}</p>
      </article>
    </div>
  </section>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
}
.popup {
  position: fixed;
  top: 52px;
  left: 56px;
  z-index: 41;
  display: flex;
  flex-direction: column;
  width: 360px;
  max-height: min(520px, calc(100vh - 80px));
  background: var(--bg-1);
  border: 1px solid var(--line-2);
  border-radius: 8px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
}
.head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px 8px;
  font: 600 13px var(--font-ui);
  color: var(--text);
  border-bottom: 1px solid var(--line);
}
.count {
  color: var(--text-3);
  font-weight: 400;
}
.rows {
  overflow-y: auto;
  padding: 8px;
}
.note {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 14px 12px;
  color: var(--text-4);
  font-size: 12px;
}
.tile {
  --edge: var(--accent);
  margin-bottom: 6px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-left: 3px solid var(--edge);
  border-radius: 6px;
  background: var(--bg-2);
  cursor: pointer;
}
.tile:last-child {
  margin-bottom: 0;
}
.tile.waiting {
  --edge: var(--warn);
}
.tile.checkout {
  --edge: var(--accent);
}
.tile.working {
  --edge: #6aa9ff;
}
.tile.idle {
  --edge: var(--text-4);
}
.modes {
  display: flex;
  gap: 2px;
  padding: 2px;
  background: var(--bg-3);
  border-radius: 6px;
}
.modes button {
  height: 22px;
  padding: 0 8px;
  font: 400 11.5px var(--font-ui);
  color: var(--text-3);
  background: none;
  border: none;
  border-radius: 5px;
  cursor: pointer;
}
.modes button.on {
  color: var(--text);
  background: var(--bg-4);
}
.tile:hover,
.tile:focus-visible {
  background: var(--bg-4);
  outline: none;
}
.top {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.key {
  font: 600 12px var(--font-mono);
  color: var(--text-2);
}
.reason {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--edge);
}
.reason i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--edge);
}
.grow {
  flex: 1;
}
.meta {
  color: var(--text-4);
}
.summary {
  margin: 4px 0 0;
  overflow: hidden;
  color: var(--text-3);
  font-size: 12px;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
