<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import type { JiraTicket, MrRow, Session } from '../types'
import { LOG_LIMIT, jobId, type Autonomy, type Job, type OrchestratorState } from '../../../main/orchestrator'
import { activityFeed, activityTone, attentionCount, mrPickRows, repoChoices, stateLabel, ticketPickRows, type PickRow } from './orchestrator'
import { gridColumns, groupByStatus, isDoneStatus, matchesQuery, mrOfSession, needsYou, panelSessions, pinStarted, pinnedSessions, readPins, resolvePins, startableRows, togglePin, writePins } from './commandpanel'
import { splitTag } from '../taskview'
import { reviewLabel } from './mrs'
import PriorityIcon from './PriorityIcon.vue'
import StartJobsDialog from './StartJobsDialog.vue'
import PanelCell from './PanelCell.vue'
import AutonomySwitch from './AutonomySwitch.vue'
import Icon from './Icon.vue'

const props = defineProps<{ tickets: JiraTicket[]; mrs: MrRow[]; myName: string | null; sessions: Session[] }>()
const emit = defineEmits<{ open: [job: Job]; 'open-task': [session: Session] }>()

const jobs = ref<Job[]>([])
const isDialogOpen = ref(false)

const pins = ref<string[]>(readPins())
const savePins = (next: string[]): void => {
  pins.value = next
  writePins(next)
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
const waitingCount = computed(() => live.value.filter(needsYou).length)
const loose = computed(() => jobs.value.filter((j) => !j.sessionId || !live.value.some((s) => s.id === j.sessionId)))

const jobOf = (s: Session): Job | null => jobs.value.find((j) => j.sessionId === s.id) ?? null
const ticketOf = (s: Session): JiraTicket | null => (s.ticket ? (props.tickets.find((t) => t.key === s.ticket?.toUpperCase()) ?? null) : null)
const reviewOf = (s: Session): MrRow | null => mrOfSession(s, props.mrs)
const mrForTicket = (key: string | undefined): MrRow | null => {
  const list = key ? props.mrs.filter((m) => m.ticket === key) : []
  return list.find((m) => m.author === props.myName) ?? list[0] ?? null
}
const mrOf = (s: Session): MrRow | null => reviewOf(s) ?? mrForTicket(s.ticket?.toUpperCase())
const titleOf = (s: Session): string => reviewOf(s)?.title ?? ticketOf(s)?.summary ?? jobOf(s)?.title ?? s.name ?? s.firstPrompt ?? ''
const labelOf = (s: Session): string => {
  const review = reviewOf(s)
  return review ? `!${review.iid}` : (s.ticket ?? s.name ?? s.id.slice(0, 8))
}
const jiraStatusOf = (s: Session): string | null => ticketOf(s)?.status ?? s.jiraStatus ?? null

const pin = (s: Session): void => savePins(togglePin(pins.value, s.id))
const unpin = (id: string): void => savePins(pins.value.filter((p) => p !== id))
const openTask = (s: Session): void => {
  const job = jobOf(s)
  if (job) emit('open', job)
  else emit('open-task', s)
}
const notice = ref<string | null>(null)
const setAutonomy = async (s: Session, autonomy: Autonomy): Promise<void> => {
  notice.value = (await window.api.setSessionAutonomy(s.id, autonomy)).error
}
const remove = (job: Job): void => {
  void window.api.removeJob(job.id)
}
const stop = (s: Session): void => {
  if (window.confirm(`Stop the session ${labelOf(s)}?`)) void window.api.closeSession(s.id)
}

const { roots, repoFor } = repoChoices(window.api.getTaskRepos())
const liveTickets = computed(() => new Set(live.value.flatMap((s) => (s.ticket ? [s.ticket.toUpperCase()] : []))))
const liveMrs = computed(() => new Set(props.mrs.filter((m) => live.value.some((s) => mrOfSession(s, [m]))).map((m) => m.key)))
const ticketRows = computed(() =>
  startableRows(ticketPickRows(props.tickets.map((t) => ({ key: t.key, summary: t.summary, type: t.type ?? null })), repoFor, liveTickets.value), jobs.value)
)
const mrRows = computed(() => startableRows(mrPickRows(props.mrs, props.myName, liveMrs.value), jobs.value))
const view = ref<'grid' | 'activity'>('grid')
const activityJob = ref<string | null>(null)
const feed = computed(() => activityFeed(jobs.value, activityJob.value))
const askCount = computed(() => attentionCount(jobs.value))
const formatTime = (at: number): string => new Date(at).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
const openJobById = (id: string): void => {
  const job = jobs.value.find((j) => j.id === id)
  if (job) emit('open', job)
}
const isNotStartedOpen = ref(true)
const query = ref('')
const doneCsv = window.api.getSettings().jiraDoneStatuses
const shownTicketRows = computed(() =>
  ticketRows.value.filter((r) => !isDoneStatus(ticketRowOf(r)?.status, doneCsv) && matchesQuery(query.value, [r.key, r.title, ticketRowOf(r)?.status]))
)
const ticketGroups = computed(() => groupByStatus(shownTicketRows.value, (r) => ticketRowOf(r)?.status))
const shownMrRows = computed(() =>
  mrRows.value.filter((r) => matchesQuery(query.value, [r.key, r.title, mrRowOf(r)?.projectName, mrRowOf(r)?.author, `!${mrRowOf(r)?.iid}`]))
)
const collapsedGroups = ref<Set<string>>(new Set())
const toggleGroup = (status: string): void => {
  const next = new Set(collapsedGroups.value)
  if (!next.delete(status)) next.add(status)
  collapsedGroups.value = next
}
const repoPicks = ref<Record<string, string>>({})
const autonomyPicks = ref<Record<string, Autonomy>>({})
const repoOf = (r: PickRow): string | null => repoPicks.value[r.key] ?? r.repo
const autonomyOf = (r: PickRow): Autonomy => autonomyPicks.value[r.key] ?? r.autonomy
const ticketRowOf = (r: PickRow): JiraTicket | null => props.tickets.find((t) => t.key === r.key) ?? null
const mrRowOf = (r: PickRow): MrRow | null => props.mrs.find((m) => m.key === r.key) ?? null
const pickAutonomy = (r: PickRow, autonomy: Autonomy): void => {
  autonomyPicks.value = { ...autonomyPicks.value, [r.key]: autonomy }
}

const awaiting = ref<string[]>([])
const pinAwaiting = (): void => {
  const next = pinStarted(pins.value, awaiting.value, jobs.value)
  awaiting.value = next.awaiting
  if (next.pins.length !== pins.value.length) savePins(next.pins)
}
const startRow = async (r: PickRow): Promise<void> => {
  const repo = r.kind === 'ticket' ? repoOf(r) : null
  const result = await window.api.startJobs([{ kind: r.kind, key: r.key, title: r.title, repo, autonomy: autonomyOf(r) }])
  notice.value = result.error
  if (result.error || r.kind === 'watch') return
  awaiting.value = [...awaiting.value, jobId(r.kind, r.key)]
  pinAwaiting()
}

const applyState = (state: OrchestratorState): void => {
  jobs.value = state.jobs
  pinAwaiting()
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
      <span class="tabs">
        <button :class="{ on: view === 'grid' }" @click="view = 'grid'">Grid</button>
        <button :class="{ on: view === 'activity' }" @click="view = 'activity'">Activity<span v-if="askCount" class="badge">{{ askCount }}</span></button>
      </span>
      <span class="grow" />
      <button class="primary" @click="isDialogOpen = true"><Icon name="plus" :size="13" />Start jobs…</button>
    </header>
    <div class="body">
      <aside class="side">
        <p v-if="notice" class="note warn">{{ notice }}</p>
        <p v-if="!live.length" class="note">No live sessions.</p>
        <div v-for="s in live" :key="s.id" class="row" :class="{ asks: needsYou(s), pinned: gridIds.has(s.id) }">
          <div class="line">
            <span class="dot" :class="s.status" :title="s.status" />
            <PriorityIcon v-if="ticketOf(s)" :name="ticketOf(s)?.priority" />
            <span v-if="reviewOf(s)" class="chip kind">review</span>
            <button class="key" :title="`Open ${labelOf(s)}`" @click="openTask(s)">{{ labelOf(s) }}</button>
            <span class="status">{{ needsYou(s) ? 'needs you' : s.status }}</span>
          </div>
          <div class="sub" :title="titleOf(s)">{{ splitTag(titleOf(s)).text || titleOf(s) }}</div>
          <div class="chips">
            <span v-if="splitTag(titleOf(s)).tag" class="chip">{{ splitTag(titleOf(s)).tag }}</span>
            <span v-if="reviewOf(s)" class="chip">{{ reviewOf(s)?.projectName }}</span>
            <span v-if="reviewOf(s)?.author" class="chip dim">{{ reviewOf(s)?.author }}</span>
            <span v-if="jiraStatusOf(s)" class="chip status">{{ jiraStatusOf(s) }}</span>
            <span v-if="mrOf(s)" class="chip" :title="`Merge request !${mrOf(s)?.iid}`">
              <Icon name="pr" :size="10" />!{{ mrOf(s)?.iid }}<template v-if="mrOf(s)?.isDraft"> draft</template>
            </span>
            <span v-if="mrOf(s)" class="chip" :class="{ attn: (mrOf(s)?.openThreads ?? 0) > 0 }" title="Unresolved threads / all comments">
              <Icon name="message" :size="10" />{{ mrOf(s)?.openThreads ?? 0 }}/{{ mrOf(s)?.notes ?? 0 }}
            </span>
            <span v-if="mrOf(s)" class="chip" :class="{ ok: (mrOf(s)?.approvals ?? 0) >= 2 }" title="Approvals"><Icon name="check" :size="10" />{{ mrOf(s)?.approvals ?? 0 }}</span>
            <span v-if="s.contextTokens" class="chip dim" title="Context">{{ Math.round(s.contextTokens / 1000) }}k</span>
            <span v-if="s.model" class="chip dim">{{ s.model.replace(/^claude-/, '') }}</span>
          </div>
          <div class="actions">
            <button class="act" :class="{ on: gridIds.has(s.id) }" :title="gridIds.has(s.id) ? 'Unpin from the grid' : 'Pin to the grid'" @click="gridIds.has(s.id) ? unpin(s.id) : pin(s)">
              <Icon name="dashboard" :size="12" />{{ gridIds.has(s.id) ? 'Pinned' : 'Pin' }}
            </button>
            <AutonomySwitch :value="jobOf(s)?.autonomy ?? null" :is-disabled="!jobOf(s) && !s.ticket" disabled-hint="Only a session with a ticket can be orchestrated" @change="(a) => setAutonomy(s, a)" />
            <span class="grow" />
            <button v-if="jobOf(s)" class="act" title="Stop orchestrating, keep the session" @click="remove(jobOf(s)!)">Release</button>
            <button class="act danger" title="Stop the session" @click="stop(s)"><Icon name="stop" :size="12" /></button>
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
        <h3 class="fold" @click="isNotStartedOpen = !isNotStartedOpen">{{ isNotStartedOpen ? '▾' : '▸' }} Not started ({{ shownTicketRows.length + shownMrRows.length }})</h3>
        <template v-if="isNotStartedOpen">
          <input v-model="query" class="search" type="search" placeholder="Search key, title, status, project…" />
          <template v-for="g in ticketGroups" :key="g.status">
          <h4 class="fold" @click="toggleGroup(g.status)">{{ collapsedGroups.has(g.status) ? '▸' : '▾' }} {{ g.status }} <span>{{ g.rows.length }}</span></h4>
          <template v-if="!collapsedGroups.has(g.status)">
          <div v-for="r in g.rows" :key="`t:${r.key}`" class="row idle">
            <div class="line">
              <PriorityIcon :name="ticketRowOf(r)?.priority" />
              <span class="key plain">{{ r.key }}</span>
              <span v-if="ticketRowOf(r)?.type" class="chip dim">{{ ticketRowOf(r)?.type }}</span>
            </div>
            <div class="sub" :title="r.title">{{ splitTag(r.title).text || r.title }}</div>
            <div class="chips">
              <span v-if="splitTag(r.title).tag" class="chip">{{ splitTag(r.title).tag }}</span>
              <span v-if="ticketRowOf(r)?.status" class="chip status">{{ ticketRowOf(r)?.status }}</span>
              <template v-if="mrForTicket(r.key)">
                <span class="chip"><Icon name="pr" :size="10" />!{{ mrForTicket(r.key)?.iid }}<template v-if="mrForTicket(r.key)?.isDraft"> draft</template></span>
                <span class="chip" :class="{ attn: (mrForTicket(r.key)?.openThreads ?? 0) > 0 }" title="Unresolved threads / all comments">
                  <Icon name="message" :size="10" />{{ mrForTicket(r.key)?.openThreads ?? 0 }}/{{ mrForTicket(r.key)?.notes ?? 0 }}
                </span>
                <span class="chip" :class="{ ok: (mrForTicket(r.key)?.approvals ?? 0) >= 2 }" title="Approvals"><Icon name="check" :size="10" />{{ mrForTicket(r.key)?.approvals ?? 0 }}</span>
              </template>
            </div>
            <div class="actions">
              <select class="repo" :value="repoOf(r) ?? ''" title="Repository" @change="repoPicks = { ...repoPicks, [r.key]: ($event.target as HTMLSelectElement).value }">
                <option v-for="p in roots" :key="p.path" :value="p.path">{{ p.name }}</option>
              </select>
              <AutonomySwitch :value="autonomyOf(r)" @change="(a) => pickAutonomy(r, a)" />
              <span class="grow" />
              <button class="act start" :disabled="!repoOf(r)" title="Start the task and pin its session" @click="startRow(r)"><Icon name="play" :size="12" />Start</button>
            </div>
          </div>
          </template>
          </template>
          <h4 v-if="shownMrRows.length" class="fold" @click="toggleGroup('mrs')">{{ collapsedGroups.has('mrs') ? '▸' : '▾' }} Merge requests <span>{{ shownMrRows.length }}</span></h4>
          <template v-if="!collapsedGroups.has('mrs')">
          <div v-for="r in shownMrRows" :key="`m:${r.key}`" class="row idle">
            <div class="line">
              <span class="chip kind">{{ r.kind === 'watch' ? 'mine' : 'review' }}</span>
              <span class="key plain">!{{ mrRowOf(r)?.iid }}</span>
              <span v-if="mrRowOf(r)?.isDraft" class="chip dim">draft</span>
            </div>
            <div class="sub" :title="r.title">{{ r.title }}</div>
            <div class="chips">
              <span class="chip">{{ mrRowOf(r)?.projectName }}</span>
              <span v-if="mrRowOf(r)?.author" class="chip dim">{{ mrRowOf(r)?.author }}</span>
              <span v-if="mrRowOf(r)" class="chip" :style="{ color: reviewLabel(mrRowOf(r)!.review).color, borderColor: reviewLabel(mrRowOf(r)!.review).color }">{{ reviewLabel(mrRowOf(r)!.review).label }}</span>
              <span class="chip" :class="{ attn: (mrRowOf(r)?.openThreads ?? 0) > 0 }" title="Unresolved threads / all comments">
                <Icon name="message" :size="10" />{{ mrRowOf(r)?.openThreads ?? 0 }}/{{ mrRowOf(r)?.notes ?? 0 }}
              </span>
              <span class="chip" :class="{ ok: (mrRowOf(r)?.approvals ?? 0) >= 2 }" title="Approvals"><Icon name="check" :size="10" />{{ mrRowOf(r)?.approvals ?? 0 }}</span>
            </div>
            <div class="actions">
              <span class="grow" />
              <button class="act start" :title="r.kind === 'watch' ? 'Watch new comments' : 'Start a review session and pin it'" @click="startRow(r)">
                <Icon name="play" :size="12" />{{ r.kind === 'watch' ? 'Watch' : 'Review' }}
              </button>
            </div>
          </div>
          </template>
          <p v-if="!shownTicketRows.length && !shownMrRows.length" class="note">Nothing matches.</p>
        </template>
      </aside>
      <section v-if="view === 'activity'" class="activity">
        <div class="filter">
          <select v-model="activityJob">
            <option :value="null">All jobs</option>
            <option v-for="j in jobs" :key="j.id" :value="j.id">{{ j.key }} · {{ stateLabel(j.state, j.kind) }} · {{ j.autonomy }}</option>
          </select>
          <span class="note">The orchestrator keeps the last {{ LOG_LIMIT }} events per job.</span>
        </div>
        <p v-if="!feed.length" class="note">Nothing yet. Start or adopt a job to see what the orchestrator does.</p>
        <div v-for="(e, i) in feed" :key="`${e.jobId}:${e.at}:${i}`" class="event" :class="activityTone(e.text)">
          <time>{{ formatTime(e.at) }}</time>
          <button class="key" @click="openJobById(e.jobId)">{{ e.key }}</button>
          <span class="kind">{{ e.kind }}</span>
          <span class="text">{{ e.text }}</span>
        </div>
      </section>
      <section v-show="view === 'grid'" v-if="grid.length" class="grid" :style="{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }">
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
      <section v-else-if="view === 'grid'" class="empty">
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
.row.asks {
  border-color: var(--warn);
}
.row.pinned {
  border-left: 3px solid var(--accent);
  padding-left: 7px;
}
.line {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
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
.dot.waiting {
  background: var(--warn);
}
.key {
  flex: none;
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
.status {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-4);
}
.row.asks .status {
  color: var(--warn);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 17px;
  padding: 0 6px;
  font-size: 10.5px;
  color: var(--text-3);
  border: 1px solid var(--line-2);
  border-radius: 9px;
}
.chip.dim {
  color: var(--text-4);
}
.chip.status {
  color: #6aa9ff;
  border-color: color-mix(in srgb, #6aa9ff 45%, transparent);
}
.chip.attn {
  color: var(--warn);
  border-color: var(--warn);
}
.chip.ok {
  color: #3dd68c;
  border-color: color-mix(in srgb, #3dd68c 50%, transparent);
}
.chip.kind {
  color: #a371f7;
  border-color: color-mix(in srgb, #a371f7 50%, transparent);
}
.sub {
  overflow: hidden;
  font-size: 11.5px;
  color: var(--text-3);
  white-space: nowrap;
  text-overflow: ellipsis;
}
.actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
}
.act {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  margin: 0;
  padding: 0 7px;
  font: 11px/1 var(--font-ui);
  color: var(--text-3);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 5px;
  cursor: pointer;
}
.act:hover {
  color: var(--text);
  border-color: var(--accent);
}
.act.on {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 50%, transparent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}
.act.start {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 50%, transparent);
}
.act:disabled {
  opacity: 0.45;
  cursor: default;
}
.row.idle {
  background: var(--bg-1);
}
.key.plain {
  cursor: default;
}
.fold {
  cursor: pointer;
  user-select: none;
}
.side h4 {
  margin: 10px 0 5px;
  font: 600 11.5px var(--font-ui);
  color: var(--text-3);
}
.side h4 span {
  margin-left: 4px;
  color: var(--text-4);
  font-weight: 400;
}
.actions {
  flex-wrap: wrap;
}
.tabs {
  display: inline-flex;
  gap: 2px;
  margin-left: 8px;
}
.tabs button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  font: 12px var(--font-ui);
  color: var(--text-3);
  background: none;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
}
.tabs button.on {
  color: var(--text);
  background: var(--bg-3);
  border-color: var(--line-2);
}
.badge {
  padding: 0 5px;
  font-size: 10.5px;
  color: var(--bg-1);
  background: var(--warn);
  border-radius: 8px;
}
.activity {
  flex: 1;
  min-width: 0;
  padding: 10px 14px;
  overflow-y: auto;
}
.filter {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.filter select {
  height: 26px;
  font: 12px var(--font-ui);
  color: var(--text);
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  border-radius: 6px;
}
.event {
  display: grid;
  grid-template-columns: 130px 120px 60px 1fr;
  align-items: baseline;
  gap: 8px;
  padding: 5px 8px;
  font-size: 12px;
  border-left: 3px solid var(--line-2);
  border-bottom: 1px solid var(--line);
}
.event time {
  font: 11px var(--font-mono);
  color: var(--text-4);
}
.event .kind {
  font-size: 11px;
  color: var(--text-4);
}
.event .text {
  color: var(--text-2);
  overflow-wrap: anywhere;
}
.event.auto {
  border-left-color: var(--accent);
}
.event.ask {
  border-left-color: var(--warn);
}
.event.ask .text {
  color: var(--warn);
}
.event.fail {
  border-left-color: var(--danger);
}
.event.fail .text {
  color: var(--danger);
}
.search {
  box-sizing: border-box;
  width: 100%;
  height: 26px;
  margin-bottom: 4px;
  padding: 0 8px;
  font: 12px var(--font-ui);
  color: var(--text);
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  border-radius: 6px;
}
.search:focus {
  outline: none;
  border-color: var(--accent);
}
.repo {
  box-sizing: border-box;
  height: 22px;
  max-width: 120px;
  font: 11px var(--font-ui);
  color: var(--text-2);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 5px;
}
.act.danger:hover {
  color: var(--danger);
  border-color: var(--danger);
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
