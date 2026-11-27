<script setup lang="ts">
import type { Session } from '../types'
import ClaudeTerminal from './ClaudeTerminal.vue'
import DispatcherCards from './DispatcherCards.vue'
import type { InboxRow } from './inbox'

defineProps<{ session: Session | null; error: string | null; isStarting: boolean; rows: InboxRow[]; isOff?: boolean }>()
const emit = defineEmits<{ open: [row: InboxRow]; 'turn-on': [] }>()
const openRow = (row: InboxRow): void => emit('open', row)
const turnOn = (): void => emit('turn-on')
</script>

<template>
  <div v-if="isOff" class="pane">
    <div class="empty">
      <span>Coordinator is off</span>
      <button class="on-btn" @click="turnOn">Turn on</button>
    </div>
  </div>
  <div v-else class="pane">
    <DispatcherCards :rows="rows" @open="openRow" />
    <ClaudeTerminal v-if="session" :key="session.id" :session-id="session.id" :project-name="session.projectName" />
    <div v-else class="empty">
      <span v-if="error" class="warn">{{ error }}</span>
      <span v-else-if="isStarting"><span class="spin" />Starting the dispatcher session…</span>
      <span v-else>Waiting for the dispatcher session to show up in the session list…</span>
    </div>
  </div>
</template>

<style scoped>
.pane {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.empty {
  flex: 1;
  display: grid;
  place-items: center;
  padding: 24px;
  color: var(--text-4);
  text-align: center;
}
.empty > span {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.on-btn {
  height: 28px;
  padding: 0 14px;
  font: 12px var(--font-ui);
  color: var(--accent);
  background: var(--bg-2);
  border: 1px solid color-mix(in srgb, var(--accent) 50%, transparent);
  border-radius: 7px;
  cursor: pointer;
}
.warn {
  color: var(--warn);
}
.spin {
  width: 10px;
  height: 10px;
  border: 2px solid var(--line-2);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
