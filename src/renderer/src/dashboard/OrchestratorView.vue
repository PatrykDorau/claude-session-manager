<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import type { JiraTicket, MrRow, Session } from '../types'
import type { Autonomy, Job, OrchestratorState } from '../../../main/orchestrator'
import { stateLabel } from './orchestrator'
import { PIN_KEY, gridColumns, panelSessions, pinnedSessions, resolvePins, togglePin } from './commandpanel'
import StartJobsDialog from './StartJobsDialog.vue'
import PanelCell from './PanelCell.vue'
import Icon from './Icon.vue'

const props = defineProps<{ tickets: JiraTicket[]; mrs: MrRow[]; myName: string | null; sessions: Session[] }>()
const emit = defineEmits<{ open: [job: Job]; 'open-task': [session: Session] }>()

const jobs = ref<Job[]>([])
const isDialogOpen = ref(false)

const readPins = (): string[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PIN_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : []
  } catch {
    return []
  }
}
const pins = ref<string[]>(readPins())
const savePins = (next: string[]): void => {
  pins.value = next
  try {
    localStorage.setItem(PIN_KEY, JSON.stringify(next))
  } catch {
    return
  }
}

const syncPins = (): void => {
  const next = resolvePins(pins.value, props.sessions)
  if (next.join() !== pins.value.join()) savePins(next)
}
watch(() => props.sessions, syncPins, { immediate: true })

const live = computed(() => panelSessions(props.sessions))
const grid = computed(() => pinnedSessions(pins.value, props.sessions))
const gridIds = computed(() => new Set(grid.value.map((s) => s.id)))
const columns = computed(() => gridColumns(grid.value.length))
const waitingCount = computed(() => live.value.filter((s) => s.status === 'waiting' || s.status === 'checkout').length)
const loose = computed(() => jobs.value.filter((j) => !j.sessionId || !live.value.some((s) => s.id === j.sessionId)))

const jobOf = (s: Session): Job | null => jobs.value.find((j) => j.sessionId === s.id) ?? null
const ticketOf = (s: Session): JiraTicket | null => (s.ticket ? (props.tickets.find((t) => t.key === s.ticket?.toUpperCase()) ?? null) : null)
const titleOf = (s: Session): string => ticketOf(s)?.summary ?? jobOf(s)?.title ?? s.name ?? s.firstPrompt ?? ''
const labelOf = (s: Session): string => s.ticket ?? s.name ?? s.id.slice(0, 8)
const jiraStatusOf = (s: Session): string | null => ticketOf(s)?.status ?? s.jiraStatus ?? null

const pin = (s: Session): void => savePins(togglePin(pins.value, s.id))
const unpin = (id: string): void => savePins(pins.value.filter((p) => p !== id))
const openTask = (s: Session): void => {
  const job = jobOf(s)
  if (job) emit('open', job)
  else emit('open-task', s)
}
const notice = ref<string | null>(null)
const adopt = async (s: Session): Promise<void> => {
  notice.value = (await window.api.adoptSession(s.id)).error
}
const setAutonomy = (job: Job, autonomy: Autonomy): void => {
  void window.api.setJobAutonomy(job.id, autonomy)
}
const remove = (job: Job): void => {
  void window.api.removeJob(job.id)
}
const stop = (s: Session): void => {
  if (window.confirm(`Stop the session ${labelOf(s)}?`)) void window.api.closeSession(s.id)
}

const applyState = (state: OrchestratorState): void => {
  jobs.value = state.jobs
}
let stopListening: (() => void) | null = null
const load = async (): Promise<void> => {
  stopListening = window.api.onOrchestrator(applyState)
  applyState(await window.api.getOrchestrator())
}
const unload = (): void => stopListening?.()
onMounted(load)
onBeforeUnmount(unload)
</script>

<template>
  <main class="panel">
    <header class="head">
      <h2>Command panel</h2>
      <span class="stat">{{ live.length }} live</span>
      <span v-if="waitingCount" class="stat warn">{{ waitingCount }} need you</span>
      <span v-if="loose.length" class="stat">{{ loose.length }} jobs</span>
      <span class="grow" />
      <button class="primary" @click="isDialogOpen = true"><Icon name="plus" :size="13" />Start jobs…</button>
    </header>
    <div class="body">
      <aside class="side">
        <p v-if="notice" class="note warn">{{ notice }}</p>
        <p v-if="!live.length" class="note">No live sessions.</p>
        <div v-for="s in live" :key="s.id" class="row" :class="[s.status, { pinned: gridIds.has(s.id) }]">
          <div class="line">
            <span class="dot" :class="s.status" :title="s.status" />
            <button class="key" @click="openTask(s)">{{ labelOf(s) }}</button>
            <span class="grow" />
            <button class="icon" :class="{ on: gridIds.has(s.id) }" :title="gridIds.has(s.id) ? 'Unpin from the grid' : 'Pin to the grid'" @click="gridIds.has(s.id) ? unpin(s.id) : pin(s)">
              <Icon name="dashboard" :size="13" />
            </button>
            <button class="icon" title="Stop the session" @click="stop(s)"><Icon name="stop" :size="13" /></button>
          </div>
          <div class="sub" :title="titleOf(s)">{{ titleOf(s) }}</div>
          <div class="line">
            <template v-if="jobOf(s)">
              <span class="seg">
                <button :class="{ on: jobOf(s)?.autonomy !== 'autonomous' }" @click="setAutonomy(jobOf(s)!, 'manual')">I decide</button>
                <button :class="{ on: jobOf(s)?.autonomy === 'autonomous' }" @click="setAutonomy(jobOf(s)!, 'autonomous')">Autonomous</button>
              </span>
              <button class="link" title="Stop orchestrating, keep the session" @click="remove(jobOf(s)!)">Release</button>
            </template>
            <button v-else-if="s.ticket" class="link" title="Let the orchestrator watch this session" @click="adopt(s)"><Icon name="bot" :size="12" />Adopt</button>
          </div>
        </div>
        <template v-if="loose.length">
          <h3>Jobs</h3>
          <div v-for="j in loose" :key="j.id" class="job" :class="j.state" @click="emit('open', j)">
            <span class="key">{{ j.key }}</span>
            <span class="state">{{ stateLabel(j.state, j.kind) }}</span>
            <span class="grow" />
            <button class="link" @click.stop="remove(j)">Remove</button>
          </div>
        </template>
      </aside>
      <section v-if="grid.length" class="grid" :style="{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }">
        <PanelCell
          v-for="s in grid"
          :key="s.id"
          :session="s"
          :title="titleOf(s)"
          :jira-status="jiraStatusOf(s)"
          :job="jobOf(s)"
          @open-task="openTask"
          @unpin="unpin"
        />
      </section>
      <section v-else class="empty">
        <Icon name="dashboard" :size="28" />
        <p>Pin sessions from the list to watch and drive them here side by side.</p>
      </section>
    </div>
    <StartJobsDialog v-if="isDialogOpen" :tickets="tickets" :mrs="mrs" :my-name="myName" :sessions="sessions" @close="isDialogOpen = false" />
  </main>
</template>

<style scoped>
.panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-1);
}
.head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--line);
}
.head h2 {
  margin: 0;
  font: 600 14px var(--font-ui);
  color: var(--text);
}
.stat {
  padding: 1px 8px;
  font-size: 11.5px;
  color: var(--text-3);
  background: var(--bg-3);
  border-radius: 9px;
}
.stat.warn {
  color: var(--bg-1);
  background: var(--warn);
}
.grow {
  flex: 1;
}
.body {
  flex: 1;
  min-height: 0;
  display: flex;
}
.side {
  flex: none;
  width: 290px;
  padding: 10px;
  overflow-y: auto;
  border-right: 1px solid var(--line);
}
.side h3 {
  margin: 14px 0 6px;
  font: 600 11px var(--font-ui);
  color: var(--text-4);
  text-transform: uppercase;
}
.note {
  color: var(--text-4);
  font-size: 12px;
}
.note.warn {
  color: var(--warn);
}
.row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 6px;
  padding: 8px 9px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.row.waiting,
.row.checkout {
  border-color: var(--warn);
}
.row.pinned {
  box-shadow: inset 3px 0 0 var(--accent);
}
.line {
  display: flex;
  align-items: center;
  gap: 6px;
}
.dot {
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: 50%;
  background: var(--text-4);
}
.dot.working {
  background: var(--accent);
}
.dot.waiting,
.dot.checkout {
  background: var(--warn);
}
.key {
  padding: 0;
  font: 600 12px var(--font-mono);
  color: var(--text);
  background: none;
  border: 0;
  cursor: pointer;
}
.key:hover {
  color: var(--accent);
}
.sub {
  overflow: hidden;
  font-size: 11.5px;
  color: var(--text-3);
  white-space: nowrap;
  text-overflow: ellipsis;
}
.icon {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 22px;
  color: var(--text-3);
  background: none;
  border: 1px solid transparent;
  border-radius: 5px;
  cursor: pointer;
}
.icon:hover {
  color: var(--text);
  border-color: var(--line-2);
}
.icon.on {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 45%, transparent);
}
.seg {
  display: flex;
  gap: 2px;
}
.seg button {
  padding: 1px 7px;
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
.link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  font: 11px var(--font-ui);
  color: var(--text-3);
  background: none;
  border: 1px solid var(--line-2);
  border-radius: 6px;
  cursor: pointer;
}
.link:hover {
  color: var(--text);
  border-color: var(--accent);
}
.job {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  padding: 5px 8px;
  font-size: 12px;
  border: 1px solid var(--line);
  border-radius: 6px;
  cursor: pointer;
}
.job:hover {
  background: var(--bg-3);
}
.state {
  color: var(--text-3);
}
.job.failed .state {
  color: var(--warn);
}
.grid {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-auto-rows: minmax(320px, 1fr);
  gap: 8px;
  padding: 8px;
  overflow-y: auto;
}
.empty {
  flex: 1;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 8px;
  color: var(--text-4);
  font-size: 12.5px;
}
button.primary {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  font: 600 12px var(--font-ui);
  color: var(--on-accent);
  background: var(--accent);
  border: 1px solid var(--accent);
  border-radius: 7px;
  cursor: pointer;
}
</style>
