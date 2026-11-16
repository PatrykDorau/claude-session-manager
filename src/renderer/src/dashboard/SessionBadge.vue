<script setup lang="ts">
import { computed } from 'vue'
import type { Status } from '../types'
import Icon from './Icon.vue'
import { CONTEXT_WARN, modelTag } from './context'

const props = defineProps<{ status: Status; model?: string | null; contextTokens?: number | null }>()
const TITLES: Partial<Record<Status, string>> = {
  working: 'Claude is working on this',
  waiting: 'Claude is waiting for your answer'
}
const tag = computed(() => modelTag(props.model ?? null))
const isHeavy = computed(() => tag.value === 'O' && (props.contextTokens ?? 0) >= CONTEXT_WARN)
const title = computed(() => {
  const base = TITLES[props.status] ?? 'A Claude session is open for this'
  return isHeavy.value ? `${base}. Opus with a large context — consider handoff and Sonnet` : base
})
</script>

<template>
  <span class="badge" :class="[status, { tagged: tag, heavy: isHeavy }]" :title="title"><Icon name="bot" :size="12" /><b v-if="tag" class="tag">{{ tag }}</b></span>
</template>

<style scoped>
.badge {
  position: absolute;
  top: -7px;
  left: -7px;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  color: #0d1117;
  background: var(--ok);
  border: 2px solid var(--bg-1);
  border-radius: 50%;
  pointer-events: none;
}
.badge.working {
  background: #6aa9ff;
  animation: work 1.4s ease-in-out infinite;
}
.badge.waiting {
  background: var(--warn);
}
.badge.tagged {
  width: auto;
  padding: 0 5px 0 4px;
  gap: 2px;
  grid-auto-flow: column;
  border-radius: 11px;
}
.tag {
  font: 700 10px/1 var(--font-ui);
}
.badge.heavy .tag {
  padding: 1px 3px;
  color: #0d1117;
  background: var(--warn);
  border-radius: 6px;
}
@keyframes work {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(106, 169, 255, 0.5);
  }
  50% {
    box-shadow: 0 0 0 4px rgba(106, 169, 255, 0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .badge.working {
    animation: none;
  }
}
</style>
