<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import type { JiraTicket, MrRow, Session } from '../types'
import type { Autonomy, Job, OrchestratorState } from '../../../main/orchestrator'
import { stateLabel } from './orchestrator'
import StartJobsDialog from './StartJobsDialog.vue'

defineProps<{ tickets: JiraTicket[]; mrs: MrRow[]; myName: string | null; sessions: Session[] }>()
const emit = defineEmits<{ open: [job: Job] }>()

const jobs = ref<Job[]>([])
const isDialogOpen = ref(false)
const LOG_LINES = 3

const lastLog = (job: Job): string[] => job.log.slice(-LOG_LINES).map((l) => l.text)
const setAutonomy = (job: Job, autonomy: Autonomy): void => {
  void window.api.setJobAutonomy(job.id, autonomy)
}
const remove = (job: Job): void => {
  void window.api.removeJob(job.id)
}

const applyState = (state: OrchestratorState): void => {
  jobs.value = state.jobs
}
let stopListening: (() => void) | null = null
const load = async (): Promise<void> => {
  stopListening = window.api.onOrchestrator(applyState)
  applyState(await window.api.getOrchestrator())
}
onMounted(load)
onBeforeUnmount(() => stopListening?.())
</script>

<template>
  <main class="orch">
    <header class="head">
      <h2>Orchestrator</h2>
      <span class="count">{{ jobs.length }}</span>
      <span class="grow" />
      <button class="primary" @click="isDialogOpen = true">Start jobs…</button>
    </header>
    <p v-if="!jobs.length" class="note">No jobs yet. Use "Start jobs…" to queue tickets and merge requests.</p>
    <article
      v-for="j in jobs"
      :key="j.id"
      class="job"
      :class="j.state"
      tabindex="0"
      @click="emit('open', j)"
      @keydown.enter="emit('open', j)"
    >
      <div class="top">
        <span class="key">{{ j.key }}</span>
        <span class="kind">{{ j.kind }}</span>
        <span class="state">{{ stateLabel(j.state, j.kind) }}</span>
        <span class="title" :title="j.title">{{ j.title }}</span>
        <span v-if="j.kind === 'ticket'" class="seg" @click.stop>
          <button :class="{ on: j.autonomy !== 'autonomous' }" @click="setAutonomy(j, 'manual')">I decide</button>
          <button :class="{ on: j.autonomy === 'autonomous' }" @click="setAutonomy(j, 'autonomous')">Autonomous</button>
        </span>
        <span v-else class="kind">{{ j.autonomy }}</span>
        <button class="ghost" @click.stop="remove(j)">Remove</button>
      </div>
      <ul class="log">
        <li v-for="(line, i) in lastLog(j)" :key="i">{{ line }}</li>
      </ul>
    </article>
    <StartJobsDialog
      v-if="isDialogOpen"
      :tickets="tickets"
      :mrs="mrs"
      :my-name="myName"
      :sessions="sessions"
      @close="isDialogOpen = false"
    />
  </main>
</template>

<style scoped>
.orch {
  flex: 1;
  min-width: 0;
  padding: 16px;
  overflow-y: auto;
  background: var(--bg-1);
}
.head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding-bottom: 8px;
}
.head h2 {
  margin: 0;
  font: 600 14px var(--font-ui);
  color: var(--text);
}
.count {
  color: var(--text-3);
  font-size: 12px;
}
.grow {
  flex: 1;
}
.note {
  color: var(--text-4);
  font-size: 12px;
}
.job {
  margin-bottom: 6px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-left: 3px solid var(--text-4);
  border-radius: 6px;
  background: var(--bg-2);
  cursor: pointer;
}
.job.waiting,
.job.handoff,
.job.failed {
  border-left-color: var(--warn);
}
.job.working,
.job.starting {
  border-left-color: var(--accent);
}
.job:hover,
.job:focus-visible {
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
.kind {
  color: var(--text-4);
}
.state {
  color: var(--accent);
}
.title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--text-3);
  white-space: nowrap;
  text-overflow: ellipsis;
}
.seg {
  display: flex;
  gap: 2px;
}
.seg button {
  padding: 2px 8px;
  font: 11px var(--font-ui);
  color: var(--text-3);
  background: none;
  border: 1px solid var(--line-2);
  border-radius: 6px;
  cursor: pointer;
}
.seg button.on {
  color: var(--text);
  background: var(--bg-4);
}
.log {
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
  color: var(--text-4);
  font: 11px var(--font-mono);
}
.log li {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
button.primary,
button.ghost {
  padding: 4px 12px;
  font: 12px var(--font-ui);
  border-radius: 7px;
  cursor: pointer;
}
.primary {
  font-weight: 600;
  color: var(--on-accent);
  background: var(--accent);
  border: 1px solid var(--accent);
}
.ghost {
  color: var(--text-2);
  background: none;
  border: 1px solid var(--line-2);
}
.ghost:hover {
  border-color: var(--accent);
  color: var(--text);
}
</style>
