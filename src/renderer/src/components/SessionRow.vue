<script setup lang="ts">
import { ref, inject } from 'vue'
import type { Ref } from 'vue'
import type { Session } from '../types'
import { colorForProject } from '../filter'

const props = defineProps<{ session: Session }>()
const colorblind = inject<Ref<boolean>>('colorblind', ref(false))

const editing = ref(false)
const editValue = ref('')
const copied = ref(false)

const vFocus = { mounted: (el: HTMLInputElement): void => el.focus() }

const open = (): void => window.api.openSession({ ...props.session })
const openTicket = (): void => {
  if (props.session.ticket) window.api.openTicket(props.session.ticket)
}
const toggleWatch = (): void => window.api.setWatched(props.session.id, !props.session.watched)
const menu = (): void => window.api.sessionMenu({ ...props.session })
const remove = (): void => {
  const s = props.session
  const label = s.ticket ? `${s.projectName} · ${s.ticket}` : s.projectName
  window.api.removeSession(s.id, label)
}

function copyId(): void {
  window.api.copyText(props.session.id)
  copied.value = true
  setTimeout(() => (copied.value = false), 1200)
}
function startEdit(): void {
  editing.value = true
  editValue.value = props.session.name ?? ''
}
function commit(): void {
  if (!editing.value) return
  window.api.setName(props.session.id, editValue.value.trim() || null)
  editing.value = false
}

function clean(text: string): string {
  return text
    .replace(/<command-[a-z-]+>/gi, '')
    .replace(/<\/command-[a-z-]+>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
function title(): string {
  const text = clean(props.session.name ?? props.session.firstPrompt ?? '')
  if (!text) return ''
  const words = text.split(' ')
  let out = words.slice(0, 6).join(' ')
  let cut = words.length > 6
  if (out.length > 48) {
    out = out.slice(0, 48).trimEnd()
    cut = true
  }
  return cut ? out + '…' : out
}
function statusColor(): string {
  const cb = colorblind.value
  switch (props.session.status) {
    case 'waiting':
      return cb ? '#d55e00' : '#f0883e'
    case 'working':
      return cb ? '#009e73' : '#3fb950'
    case 'checkout':
      return cb ? '#56b4e9' : '#58a6ff'
    case 'idle':
      return cb ? '#f0e442' : '#d29922'
    default:
      return '#8b949e'
  }
}
function statusLabel(): string {
  switch (props.session.status) {
    case 'waiting':
      return 'needs you'
    case 'working':
      return 'working'
    case 'checkout':
      return 'check output'
    case 'idle':
      return 'idle'
    default:
      return 'not active'
  }
}
function modelShort(): string {
  const m = props.session.model ?? ''
  const x = m.match(/opus|sonnet|haiku|fable/i)
  return x ? x[0].toLowerCase() : ''
}
function contextShort(): string {
  const t = props.session.contextTokens
  if (!t) return ''
  return t >= 1000 ? Math.round(t / 1000) + 'k' : String(t)
}
function meta(): string {
  return [modelShort(), contextShort()].filter(Boolean).join(' · ')
}
function branchShort(): string {
  const b = props.session.gitBranch ?? ''
  return b.length > 22 ? b.slice(0, 22) + '…' : b
}
function hexToRgba(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}
function rowBg(): string {
  const s = props.session.status
  if (s === 'working') return hexToRgba(statusColor(), 0.1)
  if (s === 'checkout') return hexToRgba(statusColor(), 0.14)
  return ''
}
function ago(ms: number): string {
  const d = Math.max(0, Date.now() - ms)
  const m = Math.floor(d / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`
}
</script>

<template>
  <li
    class="row"
    :class="{ waiting: session.status === 'waiting' }"
    :style="{
      background: rowBg(),
      '--blink-bg': hexToRgba(statusColor(), 0.28),
      borderLeft: '3px solid ' + colorForProject(session.projectName)
    }"
    :title="session.firstPrompt ?? ''"
    @click="open"
    @contextmenu.prevent.stop="menu"
  >
    <span class="dot" :style="{ background: statusColor(), boxShadow: '0 0 6px ' + statusColor() }" />
    <div class="body">
      <div class="line">
        <span class="name">{{ session.projectName }}</span>
        <span v-if="session.bg" class="bg" title="Background agent — click to open the agent view">bg</span>
        <span class="status" :style="{ color: statusColor() }">{{ statusLabel() }}</span>
        <span class="time">{{ ago(session.lastActive) }}</span>
      </div>
      <div v-if="session.ticket || session.gitBranch || meta()" class="line meta">
        <span v-if="session.ticket" class="ticket" @click.stop="openTicket">{{ session.ticket }}</span>
        <span v-if="session.gitBranch" class="branch" :title="session.gitBranch">
          <svg class="bicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="6" y1="3" x2="6" y2="15" />
            <circle cx="18" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <path d="M18 9a9 9 0 0 1-9 9" />
          </svg>
          {{ branchShort() }}<span v-if="session.dirty" class="dirty" title="Uncommitted changes">●</span>
        </span>
        <span v-if="meta()" class="metinfo">{{ meta() }}</span>
      </div>
      <div class="line sub">
        <input
          v-if="editing"
          v-focus
          v-model="editValue"
          class="edit"
          @click.stop
          @keyup.enter="commit"
          @keyup.esc="editing = false"
          @blur="commit"
        />
        <span v-else class="ttl">{{ title() }}</span>
        <span class="actions">
        <button class="ic" :title="copied ? 'Copied' : 'Copy session id'" @click.stop="copyId">
          <svg v-if="copied" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        </button>
        <button class="ic" title="Rename" @click.stop="startEdit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
          </svg>
        </button>
        <button class="ic star" :class="{ on: session.watched }" title="Watch" @click.stop="toggleWatch">
          <svg viewBox="0 0 24 24" :fill="session.watched ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>
        <button class="ic trash" title="Delete session" @click.stop="remove">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
        </span>
      </div>
    </div>
  </li>
</template>

<style scoped>
.row {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 8px 11px;
  cursor: pointer;
  border-bottom: 1px solid #161b22;
}
.row:hover {
  filter: brightness(1.25);
}
.row.waiting {
  animation: rowblink 1.1s ease-in-out infinite;
}
@keyframes rowblink {
  0%,
  100% {
    background: transparent;
  }
  50% {
    background: var(--blink-bg, rgba(240, 136, 62, 0.28));
  }
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex: none;
  margin-top: 3px;
}
.body {
  flex: 1;
  min-width: 0;
}
.line {
  display: flex;
  align-items: baseline;
  gap: 7px;
}
.line.meta {
  margin-top: 2px;
  gap: 6px;
}
.line.sub {
  margin-top: 2px;
  align-items: center;
}
.actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
}
.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  font-size: 12px;
  color: #e6edf3;
}
.status {
  flex: none;
  font-size: 10px;
  font-weight: 600;
}
.bg {
  flex: none;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.3px;
  color: #d2a8ff;
  border: 1px solid #6e40c9;
  border-radius: 4px;
  padding: 0 4px;
  line-height: 1.4;
}
.metinfo {
  flex: none;
  margin-left: auto;
  color: #6e7681;
  font-size: 10px;
  white-space: nowrap;
}
.time {
  flex: none;
  color: #6e7681;
  font-size: 10px;
}
.ticket {
  flex: none;
  color: #58a6ff;
  font-size: 10px;
  font-weight: 500;
  cursor: pointer;
}
.ticket:hover {
  text-decoration: underline;
}
.branch {
  flex: 0 1 auto;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #6e7681;
  font-size: 10px;
}
.bicon {
  width: 10px;
  height: 10px;
  flex: none;
}
.dirty {
  color: #f0883e;
  margin-left: 2px;
}
.ttl {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #8b949e;
  font-size: 11px;
}
.edit {
  flex: 1;
  min-width: 0;
  font: 11px system-ui;
  background: #0d1117;
  color: #e6edf3;
  border: 1px solid #30363d;
  border-radius: 4px;
  padding: 1px 5px;
}
.ic {
  background: none;
  border: none;
  cursor: pointer;
  padding: 3px;
  border-radius: 5px;
  color: #b1bac4;
  display: inline-flex;
}
.ic svg {
  width: 15px;
  height: 15px;
  display: block;
}
.ic:hover {
  color: #fff;
  background: #21262d;
}
.ic.star.on {
  color: #e3b341;
}
.ic.trash:hover {
  color: #f85149;
}
</style>
