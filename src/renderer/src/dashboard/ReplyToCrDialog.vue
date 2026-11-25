<script setup lang="ts">
import { ref, computed } from 'vue'
import type { MrRow, Session } from '../types'
import { crCandidates, type CrCandidate, type Identity } from './commandpanel'
import { findAddressSession, findWorkSession } from './mrs'
import IdentityMark from './IdentityMark.vue'

const props = defineProps<{
  mrs: MrRow[]
  myName: string | null
  sessions: Session[]
  identityOf: (session: Session) => Identity
}>()
const emit = defineEmits<{ close: []; started: [sessionIds: string[]] }>()

const startedKeys = ref<Set<string>>(new Set())
const markStarted = (c: CrCandidate): CrCandidate =>
  startedKeys.value.has(c.mr.key) ? { ...c, isRunning: true, isChecked: false } : c
const listCandidates = (): CrCandidate[] =>
  crCandidates(props.mrs, props.myName, props.sessions).map(markStarted)
const candidates = computed(listCandidates)
const unchecked = ref<Set<string>>(new Set())
const checkedOverrides = ref<Set<string>>(new Set())
const isStarting = ref(false)
const errors = ref<string[]>([])

const isPicked = (c: CrCandidate): boolean =>
  !c.isRunning &&
  (c.isChecked ? !unchecked.value.has(c.mr.key) : checkedOverrides.value.has(c.mr.key))
const toggle = (c: CrCandidate): void => {
  const target = c.isChecked ? unchecked : checkedOverrides
  const next = new Set(target.value)
  if (!next.delete(c.mr.key)) next.add(c.mr.key)
  target.value = next
}
const listSelected = (): CrCandidate[] => candidates.value.filter(isPicked)
const selected = computed(listSelected)

const isLiveSession = (session: Session | undefined): boolean => !!session?.isLive
const identityOfCandidate = (c: CrCandidate): Identity | null => {
  const address = findAddressSession(props.sessions, { ticket: c.mr.ticket, iid: c.mr.iid })
  const work = findWorkSession(props.sessions, c.mr.ticket)
  const live = [address, work].find(isLiveSession)
  return live ? props.identityOf(live) : null
}

const summary = (c: CrCandidate): string => {
  const { waitingThreads, openThreads } = c.mr
  if (c.isRunning) return 'session running'
  if (c.isMineLast) return 'your reply is last'
  if (waitingThreads === null) return `${openThreads} unresolved`
  return `${waitingThreads} wait for you · ${openThreads - waitingThreads} your reply last`
}

const start = async (): Promise<void> => {
  if (!selected.value.length || isStarting.value) return
  isStarting.value = true
  errors.value = []
  const sessionIds: string[] = []
  for (const c of selected.value) {
    try {
      const result = await window.api.startAddress(c.mr.key)
      if (result.error) errors.value = [...errors.value, `!${c.mr.iid}: ${result.error}`]
      else if (result.sessionId) {
        sessionIds.push(result.sessionId)
        startedKeys.value = new Set([...startedKeys.value, c.mr.key])
      }
    } catch (e) {
      errors.value = [...errors.value, `!${c.mr.iid}: ${String(e)}`]
    }
  }
  isStarting.value = false
  if (sessionIds.length) emit('started', sessionIds)
  if (!errors.value.length) emit('close')
}
</script>

<template>
  <div class="modal" @click.self="emit('close')">
    <div class="dialog">
      <header>
        <h2>Reply to CR</h2>
        <button class="x" title="Close" @click="emit('close')">✕</button>
      </header>
      <div class="lists">
        <p v-if="!candidates.length" class="hint">No merge requests with unresolved threads.</p>
        <label
          v-for="c in candidates"
          :key="c.mr.key"
          class="row"
          :class="{ live: c.isRunning, picked: isPicked(c), ident: !!identityOfCandidate(c) }"
          :style="{ '--id-color': identityOfCandidate(c)?.color }"
        >
          <input
            type="checkbox"
            :checked="isPicked(c)"
            :disabled="c.isRunning || isStarting"
            @change="toggle(c)"
          />
          <span class="main">
            <span class="line">
              <IdentityMark
                v-if="identityOfCandidate(c)"
                :identity="identityOfCandidate(c)!"
                :size="18"
              />
              <span class="chip project">{{ c.mr.projectName }}</span>
              <span class="key">!{{ c.mr.iid }}</span>
              <span class="chip" :class="{ attn: !c.isRunning && !c.isMineLast }">{{
                summary(c)
              }}</span>
            </span>
            <span class="title" :title="c.mr.title">{{ c.mr.title }}</span>
          </span>
        </label>
      </div>
      <div v-for="e in errors" :key="e" class="warn">{{ e }}</div>
      <footer>
        <button class="ghost" @click="emit('close')">Cancel</button>
        <button class="primary" :disabled="!selected.length || isStarting" @click="start">
          {{ isStarting ? 'Starting…' : `Start (${selected.length})` }}
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
  width: min(640px, 100%);
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
.x {
  margin-left: auto;
  color: var(--text-3);
  background: none;
  border: none;
  cursor: pointer;
}
.lists {
  flex: 1 1 auto;
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
.row.ident {
  border-left: 3px solid var(--id-color);
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
.chip.project {
  color: var(--text-2);
  background: var(--bg-3);
}
.chip.attn {
  color: var(--warn);
  border-color: var(--warn);
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
