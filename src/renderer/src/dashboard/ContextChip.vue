<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import type { AgentNode, Session, TerminalMode } from '../types'
import { contextLevel, formatContext, handoffPrompt, clearStartPrompt, isIdleLarge, nextClearStep, type ClearPhase } from './context'
import { useEscapeClose } from './escape'
import { isSideSessionName } from './tabs'

const props = defineProps<{ session: Session; mode: TerminalMode | null }>()

const now = ref(Date.now())
const tick = (): void => {
  now.value = Date.now()
}
const clock = setInterval(tick, 60_000)
const phase = ref<ClearPhase>('none')
const stopClock = (): void => clearInterval(clock)
onUnmounted(stopClock)

const isIdle = computed(() => isIdleLarge(props.session, now.value))
const level = computed(() => (isIdle.value && contextLevel(props.session.contextTokens) === 'ok' ? 'warn' : contextLevel(props.session.contextTokens)))
const isDanger = computed(() => level.value === 'danger')
const isClearShown = computed(() => props.mode === 'attach' && !!props.session.ticket && !isSideSessionName(props.session.name) && (isDanger.value || isIdle.value || phase.value !== 'none'))
const isBusy = computed(() => props.session.status === 'working' || props.session.status === 'waiting')
const isClearDisabled = computed(() => phase.value === 'blocked' || (phase.value === 'none' && isBusy.value))
const clearLabel = computed(() => {
  if (phase.value === 'handoff') return 'Writing handoff… (cancel)'
  if (phase.value === 'blocked') return 'Handoff needs you'
  return 'Clear + handoff'
})
const isCompactShown = computed(() => isDanger.value && props.mode === 'attach')
const isHandOffShown = computed(() => isDanger.value && !!props.session.ticket)
const isMenuAvailable = computed(() => isCompactShown.value || isHandOffShown.value || isClearShown.value)
const isMenuOpen = ref(false)
const phaseText = computed(() => {
  if (phase.value === 'handoff') return 'Writing handoff…'
  if (phase.value === 'blocked') return 'Handoff needs you'
  return ''
})
const toggleMenu = (): void => {
  if (isMenuAvailable.value) isMenuOpen.value = !isMenuOpen.value
}
const closeMenu = (): void => {
  isMenuOpen.value = false
}
useEscapeClose(isMenuOpen, closeMenu)
const runItem = (run: () => void): void => {
  closeMenu()
  run()
}
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

const isPeekOpen = ref(false)
const activeAgents = ref<AgentNode[]>([])
const isAgentsLoaded = ref(false)
const openPeek = async (): Promise<void> => {
  isPeekOpen.value = true
  const groups = (await window.api.getAgentTree()) ?? []
  const group = groups.find((g) => g.sessionId === props.session.id)
  activeAgents.value = (group?.agents ?? []).filter((a) => a.state === 'working' || a.state === 'stuck')
  isAgentsLoaded.value = true
}
const closePeek = (): void => {
  isPeekOpen.value = false
}

const compact = (): void => window.api.writeTerminal(props.session.id, '/compact\r')
const handOff = (): void => {
  if (props.session.ticket) void window.api.sendPrompt(props.session.id, handoffPrompt(props.session.ticket, new Date()))
}
</script>

<template>
  <span v-if="level !== 'none'" class="context">
    <span class="peek" @mouseenter="openPeek" @mouseleave="closePeek">
      <button class="chip" :class="[level, { menu: isMenuAvailable }]" :title="chipTitle" :disabled="!isMenuAvailable" @click="toggleMenu">
        {{ formatContext(session.contextTokens) }} context<template v-if="phaseText"> · {{ phaseText }}</template>
        <span v-if="isMenuAvailable" class="dot" />
      </button>
      <span v-if="isMenuOpen" class="scrim" @click="closeMenu" />
      <span v-if="isMenuOpen" class="actions">
        <button v-if="isCompactShown" class="item" title="Run /compact in this session" @click="runItem(compact)">Compact</button>
        <button v-if="isHandOffShown" class="item" title="Write handoff.md for a fresh session" @click="runItem(handOff)">Hand off</button>
        <button v-if="isClearShown" class="item" :title="clearTitle" :disabled="isClearDisabled" @click="runItem(clearAndHandOff)">{{ clearLabel }}</button>
      </span>
      <span v-if="isPeekOpen && !isMenuOpen" class="pop">
        <span class="prow main"><b>Main session</b><em>{{ formatContext(session.contextTokens) }}</em></span>
        <span class="hint">{{ chipTitle }}</span>
        <span v-if="!isAgentsLoaded" class="hint">Loading subagents…</span>
        <span v-else-if="!activeAgents.length" class="hint">No active subagents.</span>
        <template v-else>
          <span class="sub">Active subagents</span>
          <span v-for="a in activeAgents" :key="a.id" class="prow" :title="a.task">
            <b>{{ a.agentType }}</b><i>{{ a.model }}{{ a.state === 'stuck' ? ' · quiet 5+ min' : '' }}</i><em>{{ formatContext(a.contextTokens) || '–' }}</em>
            <span class="desc">{{ a.description || a.task }}</span>
          </span>
        </template>
      </span>
    </span>
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
.peek {
  position: relative;
  display: inline-flex;
}
.pop {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 320px;
  padding: 10px 12px;
  font-size: 12px;
  color: var(--text-2);
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
}
.prow {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 2px 8px;
  align-items: baseline;
}
.prow b {
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.prow i {
  font-style: normal;
  color: var(--text-4);
}
.prow em {
  font-style: normal;
  font-variant-numeric: tabular-nums;
  color: var(--text);
}
.prow .desc {
  grid-column: 1 / -1;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sub {
  margin-top: 4px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-4);
}
.hint {
  color: var(--text-4);
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0;
  font: 12px var(--font-ui);
  white-space: nowrap;
  background: none;
  border: none;
  cursor: default;
}
.chip.menu {
  cursor: pointer;
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.scrim {
  position: fixed;
  inset: 0;
  z-index: 49;
}
.actions {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  min-width: 200px;
  padding: 5px;
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  border-radius: 10px;
  box-shadow: var(--shadow);
}
.item {
  padding: 8px 10px;
  font: 13px var(--font-ui);
  color: var(--text);
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
}
.item:hover:not(:disabled) {
  background: var(--bg-4);
}
.item:disabled {
  opacity: 0.4;
  cursor: default;
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
</style>
