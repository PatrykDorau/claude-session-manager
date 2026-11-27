<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { JiraTicket, MrRow, Session } from '../types'
import type { Autonomy, AutonomyChoice, Job } from '../../../main/orchestrator'
import type { InboxRow } from './inbox'
import { coordinatorBars, stageInfo, type CoordinatorBar as Bar } from './coordinator'
import type { FlowMapStep } from '../../../main/flow'
import OrchestratorView from './OrchestratorView.vue'
import DispatcherPane from './DispatcherPane.vue'
import CoordinatorBar from './CoordinatorBar.vue'
import BarPreview from './BarPreview.vue'

type CoordinatorTab = 'coordinator' | 'sessions'

const props = defineProps<{
  tickets: JiraTicket[]
  mrs: MrRow[]
  myName: string | null
  sessions: Session[]
  jobs: Job[]
  isCoordinatorOn: boolean
  dispatcherSession: Session | null
  dispatcherId: string | null
  dispatcherError: string | null
  isDispatcherStarting: boolean
  dispatcherCards: InboxRow[]
  focusRequest: number
}>()
const emit = defineEmits<{
  open: [job: Job]
  'open-task': [session: Session]
  'full-screen': [isOn: boolean]
  dispatcher: []
  'open-mr': [key: string]
  'open-row': [row: InboxRow]
  coordinator: [isOn: boolean]
}>()

const TABS: { key: CoordinatorTab; label: string }[] = [
  { key: 'coordinator', label: 'Coordinator' },
  { key: 'sessions', label: 'Sessions' }
]

const tab = ref<CoordinatorTab>('coordinator')
const selectedId = ref<string | null>(null)
const notice = ref<string | null>(null)

const titleOf = (key: string): string => {
  const isKey = (item: { key: string }): boolean => item.key === key
  return props.tickets.find(isKey)?.summary ?? props.mrs.find(isKey)?.title ?? props.jobs.find(isKey)?.title ?? key
}
const bars = computed(() => coordinatorBars(props.jobs, props.sessions, titleOf, props.dispatcherId))
const isSelectedId = (bar: Bar): boolean => bar.id === selectedId.value
const selectedBar = computed(() => bars.value.find(isSelectedId) ?? null)
const isSelectedJob = (job: Job): boolean => job.id === selectedBar.value?.jobId
const isSelectedSession = (session: Session): boolean => session.id === selectedBar.value?.sessionId
const isBarWaiting = (bar: Bar): boolean => bar.isWaiting
const selectedJob = computed(() => props.jobs.find(isSelectedJob) ?? null)
const selectedSession = computed(() => props.sessions.find(isSelectedSession) ?? null)
const waitingCount = computed(() => bars.value.filter(isBarWaiting).length)

const selectTab = (next: CoordinatorTab): void => {
  tab.value = next
}
const selectBar = (bar: Bar): void => {
  selectedId.value = selectedId.value === bar.id ? null : bar.id
}
const closePreview = (): void => {
  selectedId.value = null
}
const toggleCoordinator = (): void => emit('coordinator', !props.isCoordinatorOn)
const turnOn = (): void => emit('coordinator', true)
const gateResets = ref(0)
const revertGates = (): void => {
  gateResets.value += 1
}
const applyGate = async (bar: Bar, autonomy: Autonomy): Promise<string | null> => {
  if (bar.jobId) {
    await window.api.setJobAutonomy(bar.jobId, autonomy)
    return null
  }
  if (!bar.sessionId) return null
  const choice: AutonomyChoice = autonomy === 'manual' ? 'off' : autonomy
  return (await window.api.setSessionAutonomy(bar.sessionId, choice)).error
}
const changeGate = async (bar: Bar, autonomy: Autonomy): Promise<void> => {
  try {
    notice.value = await applyGate(bar, autonomy)
  } catch (e) {
    notice.value = e instanceof Error ? e.message : String(e)
  }
  if (notice.value) revertGates()
}
const focusCoordinatorTab = (): void => {
  tab.value = 'coordinator'
}
const focusRequestOf = (): number => props.focusRequest
watch(focusRequestOf, focusCoordinatorTab)
const forwardOpen = (job: Job): void => emit('open', job)
const forwardOpenTask = (session: Session): void => emit('open-task', session)
const isFullScreen = ref(false)
const forwardFullScreen = (isOn: boolean): void => {
  isFullScreen.value = isOn
  emit('full-screen', isOn)
}
const forwardDispatcher = (): void => emit('dispatcher')
const forwardOpenMr = (key: string): void => emit('open-mr', key)
const forwardOpenRow = (row: InboxRow): void => emit('open-row', row)
const flowSteps = ref<FlowMapStep[]>([])
const loadFlowSteps = async (): Promise<void> => {
  try {
    flowSteps.value = (await window.api.getFlow([])).skill.steps
  } catch {
    flowSteps.value = []
  }
}
onMounted(loadFlowSteps)
const stageSummary = (label: string): string => stageInfo(label, flowSteps.value)
const openBar = (bar: Bar): void => {
  const isBarJob = (item: Job): boolean => item.id === bar.jobId
  const isBarSession = (item: Session): boolean => item.id === bar.sessionId
  const job = props.jobs.find(isBarJob)
  const session = props.sessions.find(isBarSession)
  if (job) forwardOpen(job)
  else if (session) forwardOpenTask(session)
}
</script>

<template>
  <div class="root">
    <nav v-if="!isFullScreen" class="strip">
      <span class="tabs">
        <button v-for="t in TABS" :key="t.key" :class="{ on: tab === t.key }" @click="selectTab(t.key)">{{ t.label }}</button>
      </span>
      <span v-if="waitingCount" class="stat">{{ waitingCount }} need you</span>
    </nav>
    <KeepAlive>
      <OrchestratorView
        v-if="tab === 'sessions'"
        :tickets="tickets"
        :mrs="mrs"
        :my-name="myName"
        :sessions="sessions"
        @open="forwardOpen"
        @open-task="forwardOpenTask"
        @full-screen="forwardFullScreen"
        @dispatcher="forwardDispatcher"
        @open-mr="forwardOpenMr"
      />
    </KeepAlive>
    <main v-if="tab === 'coordinator'" class="coordinator">
    <header class="head">
      <h2>Coordinator</h2>
      <span class="grow" />
      <button class="switch" :class="{ on: isCoordinatorOn }" role="switch" :aria-checked="isCoordinatorOn" @click="toggleCoordinator">
        <span class="knob" />
        <span class="label">{{ isCoordinatorOn ? 'On' : 'Off' }}</span>
      </button>
    </header>
    <div class="body">
      <DispatcherPane
        class="left"
        :session="dispatcherSession"
        :error="dispatcherError"
        :is-starting="isDispatcherStarting"
        :is-off="!isCoordinatorOn"
        :rows="dispatcherCards"
        @open="forwardOpenRow"
        @turn-on="turnOn"
      />
      <template v-if="isCoordinatorOn">
        <section class="bars">
          <p v-if="notice" class="note warn">{{ notice }}</p>
          <p v-if="!bars.length" class="note">No sessions or jobs to coordinate.</p>
          <CoordinatorBar
            v-for="bar in bars"
            :key="`${bar.id}:${gateResets}`"
            :bar="bar"
            :is-selected="bar.id === selectedId"
            :stage-info="stageSummary"
            @select="selectBar"
            @gate="changeGate"
            @open="openBar"
          />
        </section>
        <BarPreview
          v-if="selectedBar"
          :bar="selectedBar"
          :job="selectedJob"
          :session="selectedSession"
          @open-task="forwardOpenTask"
          @open="forwardOpen"
          @close="closePreview"
        />
      </template>
    </div>
    </main>
  </div>
</template>

<style scoped>
.root {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-1);
}
.strip {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 14px;
  border-bottom: 1px solid var(--line);
}
.coordinator {
  position: relative;
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
.tabs {
  display: inline-flex;
  gap: 2px;
}
.tabs button {
  height: 26px;
  padding: 0 10px;
  font: 12px var(--font-ui);
  color: var(--text-3);
  background: none;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
}
.tabs button.on {
  color: var(--text);
  background: var(--bg-3);
}
.stat {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 12px;
  font: 12px var(--font-ui);
  color: var(--bg-1);
  background: var(--warn);
  border-radius: 14px;
}
.grow {
  flex: 1;
}
.switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 28px;
  padding: 0 10px 0 4px;
  font: 12px var(--font-ui);
  color: var(--text-3);
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  border-radius: 14px;
  cursor: pointer;
}
.knob {
  width: 18px;
  height: 18px;
  background: var(--text-4);
  border-radius: 50%;
}
.switch.on {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 50%, transparent);
}
.switch.on .knob {
  background: var(--accent);
}
.body {
  flex: 1;
  min-height: 0;
  display: flex;
}
.left {
  flex: 1.2;
}
.bars {
  flex: 1;
  min-width: 300px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  overflow-y: auto;
  border-left: 1px solid var(--line);
}
.note {
  margin: 0;
  color: var(--text-4);
  font-size: 12px;
}
.note.warn {
  color: var(--warn);
}
</style>
