<script setup lang="ts">
import type { Session } from '../types'
import Icon from './Icon.vue'
import ClaudeTerminal from './ClaudeTerminal.vue'

defineProps<{ session: Session | null; error: string | null; isStarting: boolean }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <aside class="dispatcher">
    <header class="head">
      <Icon name="message" :size="14" />
      <h2>Dispatcher</h2>
      <span v-if="session" class="state">{{ session.status }}</span>
      <span class="grow" />
      <kbd>Ctrl+Shift+D</kbd>
      <button class="iconbtn" title="Close the dispatcher (Ctrl+Shift+D)" @click="emit('close')"><Icon name="close" /></button>
    </header>
    <ClaudeTerminal v-if="session" :key="session.id" :session-id="session.id" :project-name="session.projectName" />
    <div v-else class="empty">
      <span v-if="error" class="warn">{{ error }}</span>
      <span v-else-if="isStarting"><span class="spin" />Starting the dispatcher session…</span>
      <span v-else>Waiting for the dispatcher session to show up in the session list…</span>
    </div>
  </aside>
</template>

<style scoped>
.dispatcher {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 22px;
  z-index: 30;
  display: flex;
  flex-direction: column;
  width: min(620px, 92vw);
  background: var(--bg-1);
  border-left: 1px solid var(--line-2);
  box-shadow: var(--shadow);
}
.head {
  flex: none;
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
