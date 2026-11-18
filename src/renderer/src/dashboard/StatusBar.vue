<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import type { DevServer, MyMrs, MyTasks, Session } from '../types'
import type { DashboardPage } from './dashboard'
import { statusCounts } from './statuscounts'
import { ago } from '../display'

const props = defineProps<{ sessions: Session[]; servers: DevServer[]; myTasks: MyTasks; myMrs: MyMrs }>()
const emit = defineEmits<{ open: [page: DashboardPage] }>()

const isJumpKeyReady = window.api.isJumpKeyReady()
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  timer = setInterval(() => (now.value = Date.now()), 30_000)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})

const counts = computed(() => statusCounts(props.sessions, props.servers))
const syncText = (at: number | null | undefined): string => {
  void now.value
  return at ? ago(at) : 'not synced yet'
}
</script>

<template>
  <footer class="bar">
    <button v-if="counts.waiting || counts.finished" class="item" title="Open the Inbox" @click="emit('open', 'inbox')">
      <span v-if="counts.waiting" class="warn"><i />{{ counts.waiting }} need you</span>
      <span v-if="counts.waiting && counts.finished">·</span>
      <span v-if="counts.finished">{{ counts.finished }} finished</span>
    </button>
    <span class="item">{{ counts.working }} working</span>
    <button class="item" title="Show local servers" @click="emit('open', 'hosts')">{{ counts.servers }} servers</button>
    <span class="item" :title="myTasks.error ?? ''"><i v-if="myTasks.error" class="err" />Jira {{ syncText(myTasks.syncedAt) }}</span>
    <span class="item" :title="myMrs.errorDetail ?? myMrs.error ?? ''"><i v-if="myMrs.error" class="err" />GitLab {{ syncText(myMrs.syncedAt) }}</span>
    <span class="grow" />
    <span v-if="isJumpKeyReady" class="hint"><kbd>Ctrl+Alt+Space</kbd>next session that needs you</span>
    <span class="hint"><kbd>Ctrl+K</kbd>prompts</span>
    <span class="hint"><kbd>Ctrl+Shift+Space</kbd>show/hide</span>
    <span class="hint"><kbd>Esc</kbd>close dialogs</span>
  </footer>
</template>

<style scoped>
.bar {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 15;
  display: flex;
  align-items: center;
  gap: 14px;
  height: 22px;
  padding: 0 10px;
  overflow: hidden;
  border-top: 1px solid var(--line);
  background: var(--bg-2);
  color: var(--text-4);
  font: 11px var(--font-ui);
  white-space: nowrap;
}
.item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
}
button.item {
  cursor: pointer;
}
button.item:hover {
  color: var(--text-2);
}
.warn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--warn);
}
.warn i,
.err {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--warn);
}
.err {
  background: #f2706a;
}
.grow {
  flex: 1;
}
.hint {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
kbd {
  padding: 0 4px;
  border: 1px solid var(--line);
  border-radius: 3px;
  background: var(--bg-1);
  color: var(--text-3);
  font: 10px var(--font-mono);
}
</style>
