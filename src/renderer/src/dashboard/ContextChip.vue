<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import type { Session, TerminalMode } from '../types'
import { contextLevel, formatContext, handoffPrompt, clearStartPrompt, isIdleLarge, isAutoClearDue, nextClearStep, type ClearPhase } from './context'

const props = defineProps<{ session: Session; mode: TerminalMode | null }>()

const now = ref(Date.now())
const tick = (): void => {
  now.value = Date.now()
}
const clock = setInterval(tick, 60_000)
const phase = ref<ClearPhase>('none')
const autoFiredFor = ref<number | null>(null)
const stopClock = (): void => clearInterval(clock)
onUnmounted(stopClock)

const isIdle = computed(() => isIdleLarge(props.session, now.value))
const level = computed(() => (isIdle.value && contextLevel(props.session.contextTokens) === 'ok' ? 'warn' : contextLevel(props.session.contextTokens)))
const isDanger = computed(() => level.value === 'danger')
const isClearShown = computed(() => props.mode === 'attach' && !!props.session.ticket && (isDanger.value || isIdle.value || phase.value !== 'none'))
const isBusy = computed(() => props.session.status === 'working' || props.session.status === 'waiting')
const isClearDisabled = computed(() => phase.value === 'blocked' || (phase.value === 'none' && isBusy.value))
const clearLabel = computed(() => {
  if (phase.value === 'handoff') return 'Writing handoff… (cancel)'
  if (phase.value === 'blocked') return 'Handoff needs you'
  return 'Clear + handoff'
})
const clearTitle = computed(() => {
  if (phase.value === 'handoff') return 'Cancel: do not /clear after the handoff'
  if (isBusy.value && phase.value === 'none') return 'Wait until the session is idle'
  return 'Write handoff.md, /clear, then start again from the handoff'
})
const chipTitle = computed(() =>
  isIdle.value
    ? `Context read on every turn: ${props.session.contextTokens} tokens. Idle — the cache expired, the next turn re-reads everything`
    : `Context read on every turn: ${props.session.contextTokens} tokens`
)

const resetOnError = (result: { error: string | null }): void => {
  if (!result.error) return
  phase.value = 'none'
}

const clearAndHandOff = (): void => {
  const ticket = props.session.ticket
  if (phase.value === 'handoff') {
    phase.value = 'none'
    return
  }
  if (!ticket || isClearDisabled.value) return
  phase.value = 'handoff'
  void window.api.sendPrompt(props.session.id, handoffPrompt(ticket, new Date())).then(resetOnError)
}

const clearThenStart = (id: string, ticket: string): void => {
  window.api.writeTerminal(id, '/clear\r')
  const sendStart = (): void => void window.api.sendPrompt(id, clearStartPrompt(ticket, new Date()))
  setTimeout(sendStart, 1500)
}

const isAutoDue = computed(() => props.mode === 'attach' && !!props.session.ticket && phase.value === 'none' && autoFiredFor.value !== props.session.lastActive && isAutoClearDue(props.session, now.value))
const autoClear = (isDue: boolean): void => {
  if (!isDue) return
  autoFiredFor.value = props.session.lastActive
  clearAndHandOff()
}
watch(isAutoDue, autoClear, { immediate: true })

const sessionState = (): [string, string] => [props.session.id, props.session.status]
const onSessionState = ([id, status]: [string, string], [prevId, prev]: [string, string]): void => {
  if (id !== prevId) {
    phase.value = 'none'
    return
  }
  const step = nextClearStep(phase.value, prev, status)
  phase.value = step.phase
  const ticket = props.session.ticket
  if (step.isClearNow && ticket) clearThenStart(id, ticket)
}
watch(sessionState, onSessionState)

const compact = (): void => window.api.writeTerminal(props.session.id, '/compact\r')
const handOff = (): void => {
  if (props.session.ticket) void window.api.sendPrompt(props.session.id, handoffPrompt(props.session.ticket, new Date()))
}
</script>

<template>
  <span v-if="level !== 'none'" class="context">
    <span class="chip" :class="level" :title="chipTitle">{{ formatContext(session.contextTokens) }} context</span>
    <button v-if="isDanger && mode === 'attach'" class="act" title="Run /compact in this session" @click="compact">Compact</button>
    <button v-if="isDanger && session.ticket" class="act" title="Write handoff.md for a fresh session" @click="handOff">Hand off</button>
    <button v-if="isClearShown" class="act" :title="clearTitle" :disabled="isClearDisabled" @click="clearAndHandOff">{{ clearLabel }}</button>
  </span>
</template>

<style scoped>
.context {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-right: 6px;
}
.chip {
  font-size: 12px;
  white-space: nowrap;
}
.chip.ok {
  color: var(--text-4);
}
.chip.warn {
  color: var(--warn);
}
.chip.danger {
  color: var(--danger);
}
.act {
  height: 22px;
  padding: 0 8px;
  font: 500 12px var(--font-ui);
  color: var(--danger);
  background: none;
  border: 1px solid var(--danger-line);
  border-radius: 6px;
  cursor: pointer;
}
.act:disabled {
  opacity: 0.6;
  cursor: default;
}
.act:not(:disabled):hover {
  background: var(--danger-soft);
  border-color: var(--danger);
}
</style>
