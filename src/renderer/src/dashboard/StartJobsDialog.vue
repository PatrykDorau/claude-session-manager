<script setup lang="ts">
import { ref, computed } from 'vue'
import type { JiraTicket, MrRow, Session } from '../types'
import type { Autonomy } from '../../../main/orchestrator'
import { ticketPickRows, mrPickRows, liveLast, repoChoices, autonomyOfChoice, choiceOfAutonomy, type PickRow } from './orchestrator'
import { splitTag } from '../taskview'
import { reviewLabel } from './mrs'
import PriorityIcon from './PriorityIcon.vue'
import AutonomySwitch from './AutonomySwitch.vue'
import Icon from './Icon.vue'

const props = defineProps<{ tickets: JiraTicket[]; mrs: MrRow[]; myName: string | null; sessions: Session[] }>()
const emit = defineEmits<{ close: []; started: [] }>()

const { roots, repoFor } = repoChoices(window.api.getTaskRepos())

const liveSessions = computed(() => props.sessions.filter((s) => s.isLive))
const liveTickets = computed(() => new Set(liveSessions.value.flatMap((s) => (s.ticket ? [s.ticket] : []))))
const liveMrs = computed(
  () => new Set(props.mrs.filter((m) => liveSessions.value.some((s) => s.id === m.sessionId)).map((m) => m.key))
)

const ticketRows = ref<PickRow[]>(ticketPickRows(props.tickets.map((t) => ({ key: t.key, summary: t.summary, type: t.type ?? null })), repoFor, liveTickets.value))
const mrRows = ref<PickRow[]>(mrPickRows(props.mrs, props.myName, liveMrs.value))
const ticketOf = (row: PickRow): JiraTicket | null => props.tickets.find((t) => t.key === row.key) ?? null
const mrOf = (row: PickRow): MrRow | null => props.mrs.find((m) => m.key === row.key) ?? null
const mrForTicket = (key: string): MrRow | null => {
  const list = props.mrs.filter((m) => m.ticket === key)
  return list.find((m) => m.author === props.myName) ?? list[0] ?? null
}
const picked = ref<Set<string>>(new Set())
const isStarting = ref(false)
const error = ref<string | null>(null)

const idOf = (row: PickRow): string => `${row.kind}:${row.key}`
const isPicked = (row: PickRow): boolean => picked.value.has(idOf(row))
const toggle = (row: PickRow): void => {
  const next = new Set(picked.value)
  if (!next.delete(idOf(row))) next.add(idOf(row))
  picked.value = next
}
const setAutonomy = (row: PickRow, autonomy: Autonomy): void => {
  row.autonomy = autonomy
}
const isBlocked = (row: PickRow): boolean => row.isLive || (row.kind === 'ticket' && !row.repo)
const selectedRows = computed(() => [...ticketRows.value, ...mrRows.value].filter((r) => !isBlocked(r) && isPicked(r)))

const start = async (): Promise<void> => {
  if (!selectedRows.value.length || isStarting.value) return
  isStarting.value = true
  error.value = null
  try {
    const result = await window.api.startJobs(
      selectedRows.value.map((r) => ({ kind: r.kind, key: r.key, title: r.title, repo: r.repo, autonomy: r.autonomy }))
    )
    error.value = result.error
  } catch (e) {
    error.value = String(e)
  } finally {
    isStarting.value = false
  }
  if (error.value) return
  emit('started')
  emit('close')
}
</script>

<template>
  <div class="modal" @click.self="emit('close')">
    <div class="dialog">
      <header>
        <h2>Start jobs</h2>
        <button class="x" title="Close" @click="emit('close')">✕</button>
      </header>
      <div class="lists">
        <section>
          <h3>Tickets</h3>
          <p v-if="!ticketRows.length" class="hint">No tickets.</p>
          <label v-for="r in liveLast(ticketRows)" :key="idOf(r)" class="row" :class="{ live: r.isLive, picked: isPicked(r) }">
            <input type="checkbox" :checked="isPicked(r)" :disabled="isBlocked(r)" @change="toggle(r)" />
            <span class="main">
              <span class="line">
                <PriorityIcon :name="ticketOf(r)?.priority" />
                <span class="key">{{ r.key }}</span>
                <span v-if="splitTag(r.title).tag" class="chip">{{ splitTag(r.title).tag }}</span>
                <span v-if="ticketOf(r)?.type" class="chip dim">{{ ticketOf(r)?.type }}</span>
                <span v-if="ticketOf(r)?.status" class="chip status">{{ ticketOf(r)?.status }}</span>
                <span v-if="mrForTicket(r.key)" class="chip mr" :class="{ attn: (mrForTicket(r.key)?.openThreads ?? 0) > 0 }">
                  <Icon name="pr" :size="11" />!{{ mrForTicket(r.key)?.iid }}
                  <span v-if="mrForTicket(r.key)?.isDraft">Draft</span>
                  <span v-if="(mrForTicket(r.key)?.openThreads ?? 0) > 0"><Icon name="message" :size="10" />{{ mrForTicket(r.key)?.openThreads }}</span>
                  <span v-if="mrForTicket(r.key)?.approvals"><Icon name="check" :size="10" />{{ mrForTicket(r.key)?.approvals }}</span>
                </span>
                <span v-if="r.isLive" class="chip live-chip"><i />live session</span>
              </span>
              <span class="title" :title="r.title">{{ splitTag(r.title).text || r.title }}</span>
            </span>
            <span v-if="!r.isLive" class="ctrls">
              <span v-if="!r.repo" class="hint">pick a repo</span>
              <select v-model="r.repo" :disabled="isStarting">
                <option v-for="p in roots" :key="p.path" :value="p.path">{{ p.name }}</option>
              </select>
              <AutonomySwitch :value="choiceOfAutonomy(r.autonomy)" @change="(a) => setAutonomy(r, autonomyOfChoice(a))" />
            </span>
          </label>
        </section>
        <section>
          <h3>Merge requests</h3>
          <p v-if="!mrRows.length" class="hint">No merge requests.</p>
          <label v-for="r in liveLast(mrRows)" :key="idOf(r)" class="row" :class="{ live: r.isLive, picked: isPicked(r) }">
            <input type="checkbox" :checked="isPicked(r)" :disabled="r.isLive" @change="toggle(r)" />
            <span class="main">
              <span class="line">
                <span class="chip project">{{ mrOf(r)?.projectName }}</span>
                <span class="key">!{{ mrOf(r)?.iid }}</span>
                <span v-if="mrOf(r)?.isDraft" class="chip dim">Draft</span>
                <span v-if="mrOf(r)?.author" class="author">{{ mrOf(r)?.author }}</span>
                <span v-if="mrOf(r)" class="chip" :style="{ color: reviewLabel(mrOf(r)!.review).color, borderColor: reviewLabel(mrOf(r)!.review).color }">{{ reviewLabel(mrOf(r)!.review).label }}</span>
                <span v-if="(mrOf(r)?.openThreads ?? 0) > 0" class="chip attn"><Icon name="message" :size="10" />{{ mrOf(r)?.openThreads }}</span>
                <span class="chip"><Icon name="check" :size="10" />{{ mrOf(r)?.approvals ?? 0 }}</span>
                <span v-if="r.isLive" class="chip live-chip"><i />live session</span>
                <span v-else class="chip job">{{ r.kind === 'watch' ? 'watch comments' : 'review' }}</span>
              </span>
              <span class="title" :title="r.title">{{ r.title }}</span>
            </span>
          </label>
        </section>
      </div>
      <div v-if="error" class="warn">{{ error }}</div>
      <footer>
        <button class="ghost" @click="emit('close')">Cancel</button>
        <button class="primary" :disabled="!selectedRows.length || isStarting" @click="start">
          {{ isStarting ? 'Starting…' : `Start (${selectedRows.length})` }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.modal {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  padding: 24px;
  overflow: auto;
  background: rgba(0, 0, 0, 0.6);
}
.dialog {
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-sizing: border-box;
  width: min(1040px, 100%);
  max-height: calc(100vh - 48px);
  min-height: 0;
  overflow: hidden;
  padding: 16px 18px;
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 12px;
}
header {
  display: flex;
  align-items: center;
}
h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}
h3 {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-3);
}
.x {
  margin-left: auto;
  color: var(--text-3);
  background: none;
  border: none;
  cursor: pointer;
}
.lists {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow-y: auto;
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 5px;
  padding: 7px 10px;
  font-size: 12px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 8px;
  cursor: pointer;
}
.row:hover {
  border-color: var(--line-2);
}
.row.picked {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 7%, var(--bg-2));
}
.row.live {
  opacity: 0.55;
  cursor: default;
}
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.key {
  flex: none;
  font: 600 12px var(--font-mono);
  color: var(--text);
}
.title {
  min-width: 0;
  overflow: hidden;
  color: var(--text-2);
  white-space: nowrap;
  text-overflow: ellipsis;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 18px;
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
.chip.project {
  color: var(--text-2);
  background: var(--bg-3);
}
.chip.mr span {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: 3px;
}
.chip.attn {
  color: var(--warn);
  border-color: var(--warn);
}
.chip.job {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 45%, transparent);
}
.live-chip i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
}
.author {
  font-size: 11px;
  color: var(--text-3);
}
.ctrls {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
}
select {
  flex: none;
  max-width: 160px;
  color: var(--text);
  background: var(--bg-1);
  border: 1px solid var(--line-2);
  border-radius: 6px;
  font: 12px var(--font-ui);
}
.seg {
  display: flex;
  flex: none;
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
.hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
}
.warn {
  font-size: 12px;
  color: var(--warn);
}
footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
button.primary,
button.ghost {
  padding: 6px 14px;
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
.ghost:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--text);
}
button:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>
