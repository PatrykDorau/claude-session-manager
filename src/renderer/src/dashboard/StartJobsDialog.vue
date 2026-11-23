<script setup lang="ts">
import { ref, computed } from 'vue'
import type { JiraTicket, MrRow, Session } from '../types'
import type { Autonomy } from '../../../main/orchestrator'
import { ticketPickRows, mrPickRows, type PickRow } from './orchestrator'

const props = defineProps<{ tickets: JiraTicket[]; mrs: MrRow[]; myName: string | null; sessions: Session[] }>()
const emit = defineEmits<{ close: []; started: [] }>()

const repos = window.api.getTaskRepos()
const toKey = (p: string): string => p.toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '')
const knownRoots = (): { path: string; name: string }[] => {
  const extra = [...new Set(Object.values(repos.byPrefix))]
    .filter((p) => !repos.roots.some((r) => toKey(r.path) === toKey(p)))
    .map((p) => ({ path: p, name: p.split(/[\\/]/).filter(Boolean).pop() ?? p }))
  return [...repos.roots, ...extra]
}
const roots = knownRoots()
const repoFor = (key: string): string | null => repos.byPrefix[key.split('-')[0].toUpperCase()] ?? roots[0]?.path ?? null

const liveSessions = computed(() => props.sessions.filter((s) => s.isLive))
const liveTickets = computed(() => new Set(liveSessions.value.flatMap((s) => (s.ticket ? [s.ticket] : []))))
const liveMrs = computed(
  () => new Set(props.mrs.filter((m) => liveSessions.value.some((s) => s.id === m.sessionId)).map((m) => m.key))
)

const ticketRows = ref<PickRow[]>(ticketPickRows(props.tickets.map((t) => ({ key: t.key, summary: t.summary, type: t.type ?? null })), repoFor, liveTickets.value))
const mrRows = ref<PickRow[]>(mrPickRows(props.mrs, props.myName, liveMrs.value))
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
          <div v-for="r in ticketRows" :key="idOf(r)" class="row" :class="{ live: r.isLive }">
            <input type="checkbox" :checked="isPicked(r)" :disabled="isBlocked(r)" @change="toggle(r)" />
            <span class="key">{{ r.key }}</span>
            <span class="title" :title="r.title">{{ r.title }}</span>
            <span v-if="r.isLive" class="tag">live session</span>
            <template v-else>
              <span v-if="!r.repo" class="tag">pick a repo</span>
              <select v-model="r.repo" :disabled="isStarting">
                <option v-for="p in roots" :key="p.path" :value="p.path">{{ p.name }}</option>
              </select>
              <span class="seg">
                <button :class="{ on: r.autonomy !== 'autonomous' }" @click="setAutonomy(r, 'manual')">I decide</button>
                <button :class="{ on: r.autonomy === 'autonomous' }" @click="setAutonomy(r, 'autonomous')">Autonomous</button>
              </span>
            </template>
          </div>
        </section>
        <section>
          <h3>MRs</h3>
          <p v-if="!mrRows.length" class="hint">No merge requests.</p>
          <div v-for="r in mrRows" :key="idOf(r)" class="row" :class="{ live: r.isLive }">
            <input type="checkbox" :checked="isPicked(r)" :disabled="r.isLive" @change="toggle(r)" />
            <span class="key">{{ r.key }}</span>
            <span class="title" :title="r.title">{{ r.title }}</span>
            <span v-if="r.isLive" class="tag">live session</span>
            <span v-else class="tag">{{ r.kind === 'watch' ? 'watch comments' : 'review' }}</span>
          </div>
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
  width: min(900px, 100%);
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
  gap: 8px;
  padding: 4px 2px;
  font-size: 12px;
}
.row.live {
  opacity: 0.5;
}
.key {
  flex: none;
  font: 600 12px var(--font-mono);
  color: var(--text-2);
}
.title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--text-3);
  white-space: nowrap;
  text-overflow: ellipsis;
}
.tag {
  flex: none;
  color: var(--text-4);
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
