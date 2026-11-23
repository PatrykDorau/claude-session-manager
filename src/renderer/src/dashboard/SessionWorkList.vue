<script setup lang="ts">
import type { SessionWorkRow } from './sessionwork'
import SessionBadge from './SessionBadge.vue'

defineProps<{ rows: SessionWorkRow[]; selectedKey: string | null }>()
const emit = defineEmits<{ 'select-ticket': [key: string]; 'select-mr': [key: string] }>()

const openRow = (r: SessionWorkRow): void => {
  if (r.kind === 'ticket') emit('select-ticket', r.key)
  else emit('select-mr', r.key)
}
const tagOf = (r: SessionWorkRow): string => (r.kind === 'ticket' ? 'ticket' : r.isMine ? 'mine' : 'review')
const labelOf = (r: SessionWorkRow): string => (r.kind === 'ticket' ? r.key : `!${r.mr.iid}${r.mr.ticket ? ` ${r.mr.ticket}` : ''}`)
</script>

<template>
  <div v-if="!rows.length" class="note">No tickets or merge requests with a running session</div>
  <article
    v-for="r in rows"
    :key="`${r.kind}:${r.key}`"
    class="tile"
    :class="{ sel: selectedKey === r.key, 'needs-input': r.session.status === 'waiting' || r.session.status === 'checkout' }"
    tabindex="0"
    @click="openRow(r)"
    @keydown.enter="openRow(r)"
  >
    <SessionBadge :status="r.session.status" :model="r.session.model" :context-tokens="r.session.contextTokens" />
    <p class="summary">{{ r.title || 'No title' }}</p>
    <div class="top">
      <span class="key">{{ labelOf(r) }}</span>
      <span class="tag">{{ tagOf(r) }}</span>
    </div>
  </article>
</template>

<style scoped>
.note {
  padding: 8px 10px;
  color: var(--text-3);
  font: 12px var(--font-ui);
}
.tile {
  position: relative;
  margin: 0 2px 6px;
  padding: 10px 30px 9px 14px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 9px;
  cursor: pointer;
  outline: none;
}
.tile:hover,
.tile:focus-visible {
  border-color: var(--line-3);
}
.tile.sel {
  border-color: var(--accent);
}
.tile.needs-input {
  border-left: 3px solid var(--warn, #e0a33b);
}
.summary {
  margin: 0 0 6px;
  font: 13px var(--font-ui);
  color: var(--text-1);
}
.top {
  display: flex;
  gap: 8px;
  align-items: center;
  font: 11px var(--font-ui);
  color: var(--text-3);
}
.key {
  font-family: var(--font-mono);
}
.tag {
  padding: 0 6px;
  border: 1px solid var(--line);
  border-radius: 6px;
}
</style>
