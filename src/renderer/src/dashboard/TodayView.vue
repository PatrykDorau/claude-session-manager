<script setup lang="ts">
import { computed } from 'vue'
import type { TodayItem, TodayTarget } from './today'
import { ago } from '../display'
import Icon from './Icon.vue'

const props = defineProps<{
  items: { onMe: TodayItem[]; onClaude: TodayItem[]; onOthers: TodayItem[] }
}>()
const emit = defineEmits<{ open: [target: TodayTarget] }>()

const columns = computed(() => [
  {
    id: 'me',
    title: 'On me',
    hint: 'Waiting for your answer, review or start',
    edge: 'var(--warn)',
    items: props.items.onMe
  },
  {
    id: 'claude',
    title: 'On Claude',
    hint: 'Sessions working right now',
    edge: 'var(--accent)',
    items: props.items.onClaude
  },
  {
    id: 'others',
    title: 'On others',
    hint: 'Waiting for reviewers or testers',
    edge: 'var(--text-4)',
    items: props.items.onOthers
  }
])
</script>

<template>
  <main class="today">
    <section v-for="c in columns" :key="c.id" class="column" :style="{ '--edge': c.edge }">
      <header class="chead">
        <h2>{{ c.title }}</h2>
        <span class="count">{{ c.items.length }}</span>
      </header>
      <p class="hint">{{ c.hint }}</p>
      <div v-if="!c.items.length" class="note"><Icon name="check" :size="14" />Nothing here</div>
      <article
        v-for="i in c.items"
        :key="i.id"
        class="tile"
        :title="i.title"
        tabindex="0"
        @click="emit('open', i.target)"
        @keydown.enter="emit('open', i.target)"
      >
        <div class="top">
          <span class="key">{{ i.label }}</span>
          <span class="detail">{{ i.detail }}</span>
          <span class="grow" />
          <span v-if="i.since" class="meta">{{ ago(i.since) }}</span>
        </div>
        <p class="summary">{{ i.title || 'No title' }}</p>
      </article>
    </section>
  </main>
</template>

<style scoped>
.today {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  min-width: 0;
  padding: 16px;
  overflow: hidden;
  background: var(--bg-1);
}
.column {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
}
.chead {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding-bottom: 6px;
  border-bottom: 2px solid var(--edge);
}
.chead h2 {
  margin: 0;
  font: 600 14px var(--font-ui);
  color: var(--text);
}
.count {
  color: var(--text-3);
  font-size: 12px;
}
.hint {
  margin: 6px 0 10px;
  color: var(--text-4);
  font-size: 11.5px;
}
.note {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 2px;
  color: var(--text-4);
  font-size: 12px;
}
.tile {
  margin-bottom: 6px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-left: 3px solid var(--edge);
  border-radius: 6px;
  background: var(--bg-2);
  cursor: pointer;
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
.detail {
  color: var(--edge);
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
@media (max-width: 900px) {
  .today {
    grid-template-columns: minmax(0, 1fr);
    overflow-y: auto;
  }
}
</style>
