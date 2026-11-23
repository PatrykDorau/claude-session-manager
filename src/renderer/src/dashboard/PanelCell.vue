<script setup lang="ts">
import { ref } from 'vue'
import type { Session, TerminalMode } from '../types'
import type { Job } from '../../../main/orchestrator'
import ClaudeTerminal from './ClaudeTerminal.vue'
import ContextChip from './ContextChip.vue'

const props = defineProps<{ session: Session; title: string; jiraStatus: string | null; job: Job | null }>()
const emit = defineEmits<{ 'open-task': [session: Session]; unpin: [id: string] }>()

const mode = ref<TerminalMode | null>(null)
const setMode = (next: TerminalMode | null): void => {
  mode.value = next
}
const openTask = (): void => emit('open-task', props.session)
const unpin = (): void => emit('unpin', props.session.id)
</script>

<template>
  <section class="cell" :class="session.status">
    <header class="bar">
      <button class="key" :title="`Open ${session.ticket ?? session.name ?? 'session'}`" @click="openTask">{{ session.ticket ?? session.name ?? session.id.slice(0, 8) }}</button>
      <span class="title" :title="title">{{ title }}</span>
      <span v-if="jiraStatus" class="jira">{{ jiraStatus }}</span>
      <span class="pill" :class="session.status">{{ session.status }}</span>
      <span v-if="job" class="auto" :title="`Orchestrated: ${job.autonomy}`">{{ job.autonomy }}</span>
      <ContextChip :session="session" :mode="mode" />
      <button class="x" title="Unpin from the grid" @click="unpin">×</button>
    </header>
    <div class="term">
      <ClaudeTerminal :session-id="session.id" :project-name="session.projectName" @mode="setMode" />
    </div>
  </section>
</template>

<style scoped>
.cell {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  border-radius: 8px;
  overflow: hidden;
}
.cell.waiting,
.cell.checkout {
  border-color: var(--warn);
}
.bar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 8px;
  background: var(--bg-3);
  border-bottom: 1px solid var(--line-2);
  font-size: 12px;
  color: var(--text-2);
}
.key {
  flex: none;
  padding: 0;
  font: 600 12px var(--font-mono, monospace);
  color: var(--accent);
  background: none;
  border: 0;
  cursor: pointer;
}
.key:hover {
  text-decoration: underline;
}
.title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.jira,
.auto {
  flex: none;
  padding: 0 6px;
  font-size: 11px;
  color: var(--text-3);
  border: 1px solid var(--line-2);
  border-radius: 9px;
}
.pill {
  flex: none;
  padding: 0 7px;
  font-size: 11px;
  border-radius: 9px;
  color: var(--text-3);
  background: var(--bg-2);
}
.pill.working {
  color: var(--accent);
}
.pill.waiting,
.pill.checkout {
  color: var(--bg-1);
  background: var(--warn);
}
.x {
  flex: none;
  padding: 0 4px;
  font-size: 16px;
  line-height: 1;
  color: var(--text-3);
  background: none;
  border: 0;
  cursor: pointer;
}
.x:hover {
  color: var(--text);
}
.term {
  flex: 1;
  min-height: 0;
  display: flex;
}
.term > * {
  flex: 1;
  min-width: 0;
}
</style>
