<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import type { DayResult } from '../../../main/timesheet'
import type { JiraTicket, Session } from '../types'
import Icon from './Icon.vue'
import { readCellLooks, readIdentities } from './commandpanel'
import {
  NO_TICKET,
  applyEdits,
  cachedTicketInfo,
  clearEdits,
  copyText,
  emptyEdits,
  formatActivity,
  formatHours,
  localDay,
  readEdits,
  requestTicketInfo,
  shiftDay,
  ticketColor,
  writeEdits,
  type DayEdits,
  type EditedRow
} from './timesheet'

const props = defineProps<{ sessions: Session[]; tickets: JiraTicket[] }>()
const emit = defineEmits<{ openTicket: [key: string] }>()

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const COPIED_MS = 1500
const DAY_DEBOUNCE_MS = 250

const today = ref(localDay(Date.now()))
const day = ref(today.value)
const result = ref<DayResult | null>(null)
const isLoading = ref(false)
const loadError = ref<string | null>(null)
const baseDraft = ref(window.api.getSettings().timesheetHours)
const edits = ref<DayEdits>(readEdits(day.value))
const addDraft = ref('')
const isCopied = ref(false)
const identities = ref(readIdentities())
const looks = ref(readCellLooks())

const load = async (isForced: boolean): Promise<void> => {
  const requested = day.value
  today.value = localDay(Date.now())
  isLoading.value = true
  loadError.value = null
  identities.value = readIdentities()
  looks.value = readCellLooks()
  try {
    const next = await window.api.getTimesheetDay(requested, isForced)
    if (requested === day.value) {
      result.value = next
      baseDraft.value = next.baseHours
    }
  } catch (error) {
    if (requested === day.value) loadError.value = String(error)
  } finally {
    if (requested === day.value) isLoading.value = false
  }
}
const refresh = (): Promise<void> => load(true)

let dayTimer: ReturnType<typeof setTimeout> | undefined
const loadChangedDay = (): Promise<void> => load(false)
const clearDayTimer = (): void => clearTimeout(dayTimer)
onBeforeUnmount(clearDayTimer)

let validDay = day.value
const onDayChange = (next: string): void => {
  if (!DAY_PATTERN.test(next)) {
    day.value = validDay
    return
  }
  if (next === validDay) return
  validDay = next
  edits.value = readEdits(next)
  result.value = null
  clearDayTimer()
  dayTimer = setTimeout(loadChangedDay, DAY_DEBOUNCE_MS)
}
watch(day, onDayChange)

const goDay = (delta: number): void => {
  day.value = shiftDay(day.value, delta)
}
const goPrevious = (): void => goDay(-1)
const goNext = (): void => goDay(1)
const isNextDisabled = computed(() => day.value >= today.value)

const saveBaseHours = (): void => {
  const value = Math.round(Number(baseDraft.value) * 4) / 4
  const current = result.value?.baseHours ?? window.api.getSettings().timesheetHours
  if (!Number.isFinite(value) || value < 1 || value > 24) {
    baseDraft.value = current
    return
  }
  baseDraft.value = value
  if (value === current) return
  window.api.setTimesheetHours(value)
  void load(false)
}

const ticketByKey = computed(() => {
  const toEntry = (t: JiraTicket): [string, JiraTicket] => [t.key.toUpperCase(), t]
  return new Map(props.tickets.map(toEntry))
})
const titleOf = (key: string): string =>
  ticketByKey.value.get(key.toUpperCase())?.summary ?? cachedTicketInfo(key)?.summary ?? ''
const statusOf = (key: string): string =>
  ticketByKey.value.get(key.toUpperCase())?.status ?? cachedTicketInfo(key)?.status ?? ''
const fetchDetail = window.api.getTicketDetail

const rows = computed<EditedRow[]>(() =>
  result.value ? applyEdits(result.value.rows, edits.value) : []
)
const shareByKey = computed(() => {
  const toEntry = (r: DayResult['rows'][number]): [string, number] => [
    r.ticket ?? NO_TICKET,
    r.share
  ]
  return new Map((result.value?.rows ?? []).map(toEntry))
})
const shareOf = (ticket: string | null): number | null =>
  shareByKey.value.get(ticket ?? NO_TICKET) ?? null
const colorOf = (ticket: string | null): string =>
  ticket === null
    ? 'var(--text-5)'
    : ticketColor(ticket, props.sessions, identities.value, looks.value)

const requestMissing = (list: EditedRow[]): void => {
  for (const r of list) {
    if (r.ticket !== null && !ticketByKey.value.has(r.ticket.toUpperCase()))
      requestTicketInfo(r.ticket, fetchDetail)
  }
}
watch(rows, requestMissing)

const isNoTicket = (r: { ticket: string | null }): boolean => r.ticket === null
const noTicketHours = computed(() => {
  const original = result.value?.rows.find(isNoTicket)
  return original ? (edits.value.hours[NO_TICKET] ?? original.hours) : 0
})
const moveTarget = computed(() => edits.value.moves[NO_TICKET] ?? null)
const isMoved = computed(() => moveTarget.value !== null && !!result.value?.rows.some(isNoTicket))
const pickerKeys = computed(() => {
  const keyOfRow = (r: DayResult['rows'][number]): string => r.ticket ?? NO_TICKET
  const isTicketKey = (key: string): boolean => key !== NO_TICKET
  const keyOfTicket = (t: JiraTicket): string => t.key.toUpperCase()
  return [
    ...new Set([
      ...(result.value?.rows ?? []).map(keyOfRow).filter(isTicketKey),
      ...props.tickets.map(keyOfTicket)
    ])
  ]
})

const saveEdits = (next: DayEdits): void => {
  edits.value = next
  writeEdits(day.value, next)
}
const keyOf = (ticket: string | null): string => ticket ?? NO_TICKET
const setHours = (ticket: string | null, event: Event): void => {
  const input = event.target as HTMLInputElement
  const text = input.value
  const value = Number(text)
  const hours = { ...edits.value.hours }
  if (text.trim() === '') delete hours[keyOf(ticket)]
  else if (Number.isFinite(value) && value >= 0) hours[keyOf(ticket)] = value
  saveEdits({ ...edits.value, hours })
  const isSameTicket = (r: EditedRow): boolean => r.ticket === ticket
  const stored = rows.value.find(isSameTicket)
  input.value = stored ? formatHours(stored.hours) : ''
}
const moveNoTicket = (event: Event): void => {
  const target = (event.target as HTMLSelectElement).value
  const moves = { ...edits.value.moves }
  if (target) moves[NO_TICKET] = target
  else delete moves[NO_TICKET]
  saveEdits({ ...edits.value, moves })
}
const undoMove = (): void => {
  const moves = { ...edits.value.moves }
  delete moves[NO_TICKET]
  saveEdits({ ...edits.value, moves })
}
const addRow = (): void => {
  const key = addDraft.value.trim().toUpperCase()
  addDraft.value = ''
  if (!key || edits.value.added.includes(key)) return
  saveEdits({ ...edits.value, added: [...edits.value.added, key] })
}
const resetEdits = (): void => {
  edits.value = emptyEdits()
  clearEdits(day.value)
}
const isEditedDay = computed(
  () =>
    Object.keys(edits.value.hours).length > 0 ||
    Object.keys(edits.value.moves).length > 0 ||
    edits.value.added.length > 0
)

const copy = (): void => {
  window.api.copyText(copyText(rows.value, titleOf))
  isCopied.value = true
  const clearCopied = (): void => {
    isCopied.value = false
  }
  setTimeout(clearCopied, COPIED_MS)
}

const addHours = (sum: number, r: EditedRow): number => sum + r.hours
const editedSum = computed(() => rows.value.reduce(addHours, 0))
const baseHours = computed(() => result.value?.baseHours ?? 0)
const isMismatch = computed(() => Math.abs(editedSum.value - baseHours.value) > 0.001)
const isEmpty = computed(() => result.value !== null && result.value.totalMinutes === 0)

const span = computed(() => {
  const strip = result.value?.strip ?? []
  if (!strip.length) return null
  const toFrom = (b: { from: number }): number => b.from
  const toTo = (b: { to: number }): number => b.to
  return { from: Math.min(...strip.map(toFrom)), to: Math.max(...strip.map(toTo)) }
})
const clockOf = (at: number): string => {
  const date = new Date(at)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}
const blocks = computed(() => {
  const range = span.value
  if (!range) return []
  const length = Math.max(range.to - range.from, 1)
  const toBlock = (
    b: DayResult['strip'][number],
    index: number
  ): { id: number; left: string; width: string; color: string; title: string } => ({
    id: index,
    left: `${((b.from - range.from) / length) * 100}%`,
    width: `${((b.to - b.from) / length) * 100}%`,
    color: colorOf(b.ticket),
    title: `${b.ticket ?? 'No ticket'} · ${clockOf(b.from)}–${clockOf(b.to)}`
  })
  return (result.value?.strip ?? []).map(toBlock)
})

const shareText = (ticket: string | null): string => {
  const share = shareOf(ticket)
  return share === null ? '–' : `${Math.round(share * 100)}%`
}
const barWidth = (ticket: string | null): string => `${Math.round((shareOf(ticket) ?? 0) * 100)}%`
const openTicket = (key: string): void => emit('openTicket', key)
const openInJira = (key: string): void => window.api.openTicket(key)

const loadInitial = (): Promise<void> => load(false)
onMounted(loadInitial)
</script>

<template>
  <div class="ts">
    <header class="fhead">
      <Icon name="gauge" :size="18" />
      <h1>Timesheet</h1>
      <div class="daypick">
        <button class="iconbtn prev" title="Previous day" @click="goPrevious">
          <Icon name="chevronRight" :size="16" />
        </button>
        <input v-model="day" class="inp date" type="date" :max="today" />
        <button class="iconbtn" title="Next day" :disabled="isNextDisabled" @click="goNext">
          <Icon name="chevronRight" :size="16" />
        </button>
      </div>
      <span v-if="result" class="sub">{{ formatActivity(result.totalMinutes) }} of activity</span>
      <span class="grow" />
      <label class="base" title="Hours the day is scaled to">
        Base
        <input
          v-model.number="baseDraft"
          class="inp num"
          type="number"
          min="1"
          max="24"
          step="0.5"
          @change="saveBaseHours"
        />
        h
      </label>
      <button class="btn" :disabled="isLoading" title="Read the day again" @click="refresh">
        <Icon name="refresh" :size="14" />Refresh
      </button>
      <button
        class="btn"
        :disabled="!rows.length"
        title="Copy KEY, hours and title lines"
        @click="copy"
      >
        <Icon :name="isCopied ? 'check' : 'copy'" :size="14" />{{ isCopied ? 'Copied' : 'Copy' }}
      </button>
      <button
        class="btn"
        :disabled="!isEditedDay"
        title="Drop the edits of this day"
        @click="resetEdits"
      >
        Reset edits
      </button>
    </header>
    <p v-if="loadError" class="notice">{{ loadError }}</p>
    <div class="body">
      <p v-if="result === null" v-show="!loadError" class="muted">Loading…</p>
      <div v-else-if="isEmpty" class="empty">
        <Icon name="gauge" :size="34" />
        <p>No activity recorded on {{ day }}.</p>
      </div>
      <div v-else class="page">
        <div v-if="span" class="strip">
          <span class="clock">{{ clockOf(span.from) }}</span>
          <div class="track">
            <i
              v-for="b in blocks"
              :key="b.id"
              :title="b.title"
              :style="{ left: b.left, width: b.width, background: b.color }"
            />
          </div>
          <span class="clock">{{ clockOf(span.to) }}</span>
        </div>
        <table class="grid">
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Title</th>
              <th>Status</th>
              <th class="right">Share</th>
              <th class="right">Hours</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.ticket ?? NO_TICKET">
              <td>
                <button
                  v-if="r.ticket"
                  class="key"
                  :title="`Open ${r.ticket}`"
                  @click="openTicket(r.ticket)"
                >
                  {{ r.ticket }}
                </button>
                <button
                  v-if="r.ticket"
                  class="jira"
                  title="Open in Jira"
                  @click="openInJira(r.ticket)"
                >
                  <Icon name="external" :size="12" />
                </button>
                <span v-else class="noticket">No ticket</span>
              </td>
              <td class="title">
                <template v-if="r.ticket">{{ titleOf(r.ticket) }}</template>
                <select v-else class="inp pick" @change="moveNoTicket">
                  <option value="">Move hours to…</option>
                  <option v-for="k in pickerKeys" :key="k" :value="k">
                    {{ k }}{{ titleOf(k) ? ` · ${titleOf(k)}` : '' }}
                  </option>
                </select>
              </td>
              <td class="status">{{ r.ticket ? statusOf(r.ticket) : '' }}</td>
              <td class="right mono">{{ shareText(r.ticket) }}</td>
              <td class="right">
                <input
                  class="inp num"
                  :class="{ edited: r.isEdited }"
                  type="number"
                  min="0"
                  step="0.25"
                  :value="formatHours(r.hours)"
                  @change="setHours(r.ticket, $event)"
                />
              </td>
              <td class="barcell">
                <span class="bar"
                  ><i :style="{ width: barWidth(r.ticket), background: colorOf(r.ticket) }"
                /></span>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="isMoved" class="moved">
          No-ticket {{ formatHours(noTicketHours) }} h moved to <b>{{ moveTarget }}</b>
          <button class="link" @click="undoMove">Undo</button>
        </p>
        <form class="addrow" @submit.prevent="addRow">
          <input
            v-model="addDraft"
            class="inp"
            spellcheck="false"
            placeholder="Ticket key, e.g. SOFKRS-1234"
          />
          <button class="btn" type="submit" :disabled="!addDraft.trim()">
            <Icon name="plus" :size="14" />Add row
          </button>
        </form>
        <footer class="sum" :class="{ off: isMismatch }">
          {{ formatHours(editedSum) }} h of {{ formatHours(baseHours) }} h
          <template v-if="isMismatch"> · differs from the base</template>
        </footer>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ts {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-1);
}
.fhead {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 52px;
  padding: 0 16px;
  color: var(--accent);
  border-bottom: 1px solid var(--line);
}
.fhead h1 {
  margin: 0;
  font: 600 15px var(--font-ui);
  color: var(--text);
}
.daypick {
  display: flex;
  align-items: center;
  gap: 4px;
}
.iconbtn {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  color: var(--text-3);
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.iconbtn:hover:not(:disabled) {
  color: var(--text);
  background: var(--bg-3);
}
.iconbtn:disabled {
  opacity: 0.35;
  cursor: default;
}
.iconbtn.prev :deep(svg) {
  transform: rotate(180deg);
}
.inp {
  height: 28px;
  padding: 0 8px;
  font: 500 12.5px var(--font-ui);
  color: var(--text);
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  border-radius: 6px;
}
.inp:focus {
  outline: none;
  border-color: var(--accent);
}
.date {
  color-scheme: dark;
}
.num {
  width: 72px;
  font-family: var(--font-mono);
  text-align: right;
}
.num.edited {
  color: var(--warn);
  border-color: var(--warn);
}
.sub {
  font-size: 12px;
  color: var(--text-4);
}
.grow {
  flex: 1;
}
.base {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-3);
}
.base .num {
  width: 60px;
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  font: 500 12.5px var(--font-ui);
  color: var(--text-2);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 7px;
  cursor: pointer;
}
.btn:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--line-3);
}
.btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.notice {
  margin: 10px 16px 0;
  padding: 8px 12px;
  font-size: 12.5px;
  color: var(--danger);
  background: var(--danger-soft);
  border-radius: 8px;
}
.body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
.page {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 1200px;
}
.strip {
  display: flex;
  align-items: center;
  gap: 8px;
}
.clock {
  flex: none;
  font: 500 11.5px var(--font-mono);
  color: var(--text-4);
}
.track {
  position: relative;
  flex: 1;
  height: 12px;
  overflow: hidden;
  background: var(--bg-3);
  border-radius: 4px;
}
.track i {
  position: absolute;
  top: 0;
  bottom: 0;
  min-width: 1px;
}
.grid {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}
.grid th {
  padding: 6px 8px;
  font: 600 11.5px var(--font-ui);
  color: var(--text-4);
  text-align: left;
  border-bottom: 1px solid var(--line);
}
.grid td {
  padding: 5px 8px;
  color: var(--text-2);
  border-bottom: 1px solid var(--line);
}
.right {
  text-align: right;
}
.grid th.right {
  text-align: right;
}
.mono {
  font-family: var(--font-mono);
}
.key {
  padding: 0;
  font: 600 12.5px var(--font-mono);
  color: var(--accent);
  background: none;
  border: none;
  cursor: pointer;
}
.key:hover {
  text-decoration: underline;
}
.jira {
  display: inline-grid;
  place-items: center;
  margin-left: 6px;
  padding: 0;
  vertical-align: middle;
  color: var(--text-4);
  background: none;
  border: none;
  cursor: pointer;
}
.jira:hover {
  color: var(--accent);
}
.noticket {
  color: var(--text-4);
  font-style: italic;
}
.title {
  max-width: 480px;
  overflow: hidden;
  color: var(--text);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status {
  color: var(--text-3);
  white-space: nowrap;
}
.pick {
  max-width: 100%;
}
.barcell {
  width: 140px;
}
.bar {
  display: block;
  height: 6px;
  overflow: hidden;
  background: var(--bg-3);
  border-radius: 3px;
}
.bar i {
  display: block;
  height: 100%;
  border-radius: 3px;
}
.moved {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-3);
}
.link {
  margin-left: 6px;
  padding: 0;
  font: inherit;
  color: var(--accent);
  background: none;
  border: none;
  cursor: pointer;
}
.addrow {
  display: flex;
  gap: 8px;
}
.addrow .inp {
  width: 260px;
}
.sum {
  padding: 8px 12px;
  font: 600 13px var(--font-mono);
  color: var(--text-2);
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  border-radius: 8px;
}
.sum.off {
  color: var(--warn);
  background: var(--warn-soft);
  border-color: var(--warn);
}
.muted {
  margin: 0;
  color: var(--text-4);
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 60px 20px;
  color: var(--text-5);
  text-align: center;
}
.empty p {
  max-width: 420px;
  color: var(--text-3);
}
</style>
