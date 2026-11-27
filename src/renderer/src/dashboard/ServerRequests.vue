<script setup lang="ts">
import { ref, onMounted } from 'vue'

const keys = ref<string[]>(window.api.getServerRequests())

const setKeys = (next: string[]): void => {
  keys.value = next
}
const start = (key: string): void => window.api.answerServerRequest(key, true)
const keepStopped = (key: string): void => window.api.answerServerRequest(key, false)

const subscribe = (): void => window.api.onServerRequests(setKeys)
onMounted(subscribe)
</script>

<template>
  <div v-if="keys.length" class="requests">
    <div v-for="key in keys" :key="key" class="request">
      <p>Agent wants the <b>{{ key }}</b> dev server. Start it?</p>
      <span class="hint">You stopped it earlier.</span>
      <div class="actions">
        <button class="db" @click="start(key)">Start</button>
        <button class="db ghost" @click="keepStopped(key)">Keep stopped</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.requests {
  position: fixed;
  right: 16px;
  bottom: 36px;
  z-index: 39;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(360px, 92vw);
}
.request {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  background: var(--bg-1);
  border: 1px solid var(--accent);
  border-radius: 10px;
  box-shadow: var(--shadow);
}
.request p {
  margin: 0;
  font: 600 13px var(--font-ui);
  color: var(--text);
}
.hint {
  font-size: 12px;
  color: var(--text-3);
}
.actions {
  display: flex;
  gap: 8px;
}
.db {
  padding: 6px 14px;
  font: 600 12px var(--font-ui);
  color: var(--on-accent);
  background: var(--accent);
  border: 1px solid var(--accent);
  border-radius: 8px;
  cursor: pointer;
}
.db.ghost {
  color: var(--text-2);
  background: var(--line);
  border-color: var(--line-2);
}
</style>
