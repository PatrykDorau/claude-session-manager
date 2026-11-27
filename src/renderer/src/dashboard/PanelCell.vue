<script setup lang="ts">
import { nextTick, ref } from 'vue'
import type { Session, TerminalMode } from '../types'
import {
  IDENTITY_COLORS,
  IDENTITY_ICONS,
  formatWait,
  stageOf,
  type CellLook,
  type Identity
} from './commandpanel'
import type { IconName } from './icons'
import type { AutonomyChoice, Job } from '../../../main/orchestrator'
import { AUTONOMY_LEVELS, activityTone, choiceOf, stateLabel } from './orchestrator'
import ClaudeTerminal from './ClaudeTerminal.vue'
import ContextChip from './ContextChip.vue'
import AutonomySwitch from './AutonomySwitch.vue'
import Icon from './Icon.vue'
import IdentityMark from './IdentityMark.vue'

const props = defineProps<{ session: Session; title: string; jiraStatus: string | null; job: Job | null; look: CellLook; identity: Identity; isPinned: boolean; isAutoResume?: boolean; waitingSince: number | null; isAcknowledged: boolean; isTurnUnseen: boolean; now: number }>()
const emit = defineEmits<{ 'open-task': [session: Session]; unpin: [id: string]; pin: [session: Session]; expand: [session: Session]; look: [session: Session, look: CellLook]; focused: [session: Session]; left: [session: Session] }>()

const sessionError = ref<string | null>(null)
const cellLabel = (): string => props.session.ticket ?? props.session.name ?? props.session.id.slice(0, 8)
const sleepSession = async (): Promise<void> => {
  if (!window.confirm(`Put the session ${cellLabel()} to sleep? The Claude process stops and the session stays on the list.`)) return
  sessionError.value = (await window.api.sleepSession(props.session.id)).error
}
const stopSession = async (): Promise<void> => {
  sessionError.value = (await window.api.closeSession(props.session.id)).error
}
const isPaletteOpen = ref(false)
const pickColor = (color: string | null): void => {
  isPaletteOpen.value = false
  emit('look', props.session, { ...props.look, color: color ?? undefined })
}
const pickIcon = (icon: IconName | null): void => {
  isPaletteOpen.value = false
  emit('look', props.session, { ...props.look, icon: icon ?? undefined })
}
const isEditing = ref(false)
const draftTitle = ref('')
const titleInput = ref<HTMLInputElement | null>(null)
const editTitle = async (): Promise<void> => {
  draftTitle.value = props.look.title || props.title
  isEditing.value = true
  await nextTick()
  titleInput.value?.select()
}
const saveTitle = (): void => {
  if (!isEditing.value) return
  isEditing.value = false
  const text = draftTitle.value.trim()
  emit('look', props.session, { ...props.look, title: text && text !== props.title ? text : undefined })
}
const mode = ref<TerminalMode | null>(null)
const setMode = (next: TerminalMode | null): void => {
  mode.value = next
}
const openTask = (): void => emit('open-task', props.session)
const togglePin = (): void =>
  props.isPinned ? emit('unpin', props.session.id) : emit('pin', props.session)
const expand = (): void => emit('expand', props.session)
const focusTerminal = (): void => {
  window.api.markActivity(props.session.ticket)
  emit('focused', props.session)
}
const cellRoot = ref<HTMLElement | null>(null)
const leaveCell = (event: FocusEvent): void => {
  const target = event.relatedTarget
  if (target instanceof Node && cellRoot.value?.contains(target)) return
  emit('left', props.session)
}
const terminal = ref<InstanceType<typeof ClaudeTerminal> | null>(null)
const refit = (): void => terminal.value?.refit()
const focusCell = (): boolean => terminal.value?.focus() ?? false
defineExpose({ refit, focus: focusCell })
const isOrchOpen = ref(false)
const error = ref<string | null>(null)
const levelLabel = (job: Job | null): string => AUTONOMY_LEVELS.find((l) => l.value === choiceOf(job))?.label ?? 'Off'
const setAutonomy = async (autonomy: AutonomyChoice): Promise<void> => {
  error.value = (await window.api.setSessionAutonomy(props.session.id, autonomy)).error
}
</script>

<template>
  <section
    ref="cellRoot"
    class="cell"
    :class="[
      session.status,
      {
        'is-waiting': waitingSince !== null,
        'is-calling': waitingSince !== null && !isAcknowledged
      }
    ]"
    :style="{ '--id-color': identity.color }"
    @focusout="leaveCell"
  >
    <header class="bar">
      <div class="row1" title="Drag to move this session in the grid">
        <span class="grip">⠿</span>
        <IdentityMark :identity="identity" />
        <button class="key" :title="`Open ${session.ticket ?? session.name ?? 'session'}`" @click="openTask">{{ session.ticket ?? session.name ?? session.id.slice(0, 8) }}</button>
        <input v-if="isEditing" ref="titleInput" v-model="draftTitle" class="title-edit" @keydown.enter="saveTitle" @keydown.esc="isEditing = false" @blur="saveTitle" />
        <span v-else class="title" :title="`${look.title || title} — double-click to rename`" @dblclick="editTitle">{{ look.title || title }}</span>
        <span class="stage" :class="stageOf(session).tone"><Icon :name="stageOf(session).icon" :size="12" />{{ stageOf(session).label }}</span>
        <span class="paint">
          <button class="swatch" :style="{ background: identity.color }" title="Cell color and icon" @click="isPaletteOpen = !isPaletteOpen" />
          <span v-if="isPaletteOpen" class="scrim" @click="isPaletteOpen = false" />
          <span v-if="isPaletteOpen" class="palette">
            <span class="palette-row">
              <button
                v-for="c in IDENTITY_COLORS"
                :key="c"
                class="swatch"
                :class="{ on: identity.color === c }"
                :style="{ background: c }"
                @click="pickColor(c)"
              />
              <button class="swatch none" title="Automatic color" @click="pickColor(null)">∅</button>
            </span>
            <span class="palette-row">
              <button
                v-for="i in IDENTITY_ICONS"
                :key="i"
                class="pick-icon"
                :class="{ on: identity.icon === i }"
                :title="i"
                @click="pickIcon(i)"
              >
                <Icon :name="i" :size="13" />
              </button>
              <button class="swatch none" title="Automatic icon" @click="pickIcon(null)">∅</button>
            </span>
          </span>
        </span>
        <button class="x" title="Focus this session (Ctrl+Shift+E)" @click="expand">
          <Icon name="external" :size="12" />
        </button>
        <button
          class="x"
          :class="{ on: isPinned }"
          :title="isPinned ? 'Unpin' : 'Pin'"
          @click="togglePin"
        >
          <Icon name="dashboard" :size="12" />
        </button>
        <button v-if="session.isLive" class="x" title="Put the session to sleep" @click="sleepSession">
          <Icon name="moon" :size="12" />
        </button>
        <button v-if="session.isLive" class="x danger" title="Stop the session" @click="stopSession">
          <Icon name="stop" :size="12" />
        </button>
      </div>
      <div class="row2">
      <span v-if="jiraStatus" class="jira">{{ jiraStatus }}</span>
      <span class="pill" :class="session.status">{{ session.status }}</span>
        <span v-if="waitingSince !== null" class="wait-badge"
          ><Icon name="bell" :size="11" />Waits for you · {{ formatWait(now - waitingSince) }}</span
        >
        <span v-if="isTurnUnseen" class="turn-badge"><Icon name="sparkles" :size="11" />New turn</span>
      <span class="orch">
        <button class="auto" :class="{ on: choiceOf(job) !== 'off' }" title="Orchestrator: autonomy and recent decisions" @click="isOrchOpen = !isOrchOpen">
          <Icon name="bot" :size="11" />{{ levelLabel(job) }}
        </button>
        <span v-if="isOrchOpen" class="scrim" @click="isOrchOpen = false" />
        <span v-if="isOrchOpen" class="orch-pop">
          <AutonomySwitch :value="choiceOf(job)" :is-disabled="!job && !session.ticket" disabled-hint="Only a session with a ticket can be orchestrated" @change="setAutonomy" />
          <span v-if="error" class="err">{{ error }}</span>
          <span v-if="!job" class="hint">Not orchestrated. Pick a level to hand it to the orchestrator.</span>
          <template v-else>
            <span class="hint">{{ stateLabel(job.state, job.kind) }}</span>
            <span v-for="(e, i) in [...job.log].reverse().slice(0, 8)" :key="i" class="ev" :class="activityTone(e.text)">
              <time>{{ new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</time>{{ e.text }}
            </span>
          </template>
        </span>
      </span>
      <span v-if="sessionError" class="err">{{ sessionError }}</span>
      <span class="grow" />
      <ContextChip :session="session" :mode="mode" />
      </div>
    </header>
    <div class="term" @pointerdown.capture="focusTerminal" @keydown.capture="focusTerminal">
      <ClaudeTerminal ref="terminal" :data-activity-ticket="session.ticket ?? ''" :session-id="session.id" :project-name="session.projectName" :is-auto-resume="isAutoResume" :slept-at="session.sleptAt" @mode="setMode" />
    </div>
  </section>
</template>

<style scoped>
.cell {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--bg-2);
  border: 2px solid var(--id-color);
  border-radius: 8px;
  position: relative;
}
.cell.is-waiting {
  border-color: var(--warn);
  outline: 3px solid color-mix(in srgb, var(--warn) 45%, transparent);
  outline-offset: -5px;
}
.cell.is-calling {
  animation: call 1.6s ease-in-out infinite;
}
@keyframes call {
  50% {
    outline-color: var(--warn);
  }
}
@media (prefers-reduced-motion: reduce) {
  .cell.is-calling {
    animation: none;
    outline-color: var(--warn);
  }
}
.wait-badge {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0 7px;
  font-size: 11px;
  color: var(--bg-1);
  background: var(--warn);
  border-radius: 9px;
}
.turn-badge {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0 7px;
  font-size: 11px;
  color: var(--text);
  border: 1px solid var(--ok);
  border-radius: 9px;
}
.cell .bar {
  background: color-mix(in srgb, var(--id-color) 12%, var(--bg-3));
  border-bottom-color: color-mix(in srgb, var(--id-color) 50%, var(--line-2));
}
.row1,
.row2 {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.row1 {
  height: 26px;
  cursor: grab;
}
.row2 {
  height: 24px;
}
.grow {
  flex: 1;
}
.grip {
  flex: none;
  color: var(--text-4);
  font-size: 13px;
}
.title-edit {
  flex: 1;
  min-width: 0;
  height: 20px;
  padding: 0 6px;
  font: 12px var(--font-ui);
  color: var(--text);
  background: var(--bg-1);
  border: 1px solid var(--accent);
  border-radius: 4px;
  outline: none;
}
.paint {
  position: relative;
  flex: none;
  display: inline-flex;
}
.swatch {
  width: 14px;
  height: 14px;
  padding: 0;
  font-size: 10px;
  line-height: 1;
  color: var(--text-3);
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  border-radius: 50%;
  cursor: pointer;
}
.swatch.on {
  outline: 2px solid var(--text);
  outline-offset: 1px;
}
.palette {
  position: absolute;
  top: 20px;
  right: 0;
  z-index: 11;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}
.palette-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.pick-icon {
  display: inline-flex;
  padding: 2px;
  color: var(--text-2);
  background: none;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
}
.pick-icon.on {
  color: var(--text);
  border-color: var(--text);
}
.bar {
  display: flex;
  flex-direction: column;
  padding: 2px 8px 2px;
  background: var(--bg-3);
  border-bottom: 1px solid var(--line-2);
  border-radius: 8px 8px 0 0;
  position: relative;
  z-index: 5;
  font-size: 12px;
  color: var(--text-2);
}
.key {
  flex: none;
  padding: 0;
  font: 600 12px var(--font-mono, monospace);
  color: var(--accent);
  background: none;
  border: 0;
  cursor: pointer;
}
.key:hover {
  text-decoration: underline;
}
.title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stage {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: var(--text-4);
}
.stage.input {
  color: var(--warn);
  font-weight: 700;
}
.stage.working {
  color: var(--info);
}
.stage.done {
  color: var(--ok);
}
.jira,
.auto {
  flex: none;
  padding: 0 6px;
  font-size: 11px;
  color: var(--text-3);
  border: 1px solid var(--line-2);
  border-radius: 9px;
}
.auto {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 18px;
  background: none;
  cursor: pointer;
}
.auto.on {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 50%, transparent);
}
.orch {
  flex: none;
}
.scrim {
  position: fixed;
  inset: 0;
  z-index: 10;
}
.orch-pop {
  position: absolute;
  top: calc(100% + 4px);
  left: 8px;
  z-index: 11;
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-sizing: border-box;
  width: min(340px, calc(100% - 16px));
  padding: 10px;
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}
.hint {
  font-size: 11px;
  color: var(--text-4);
}
.err {
  font-size: 11px;
  color: var(--warn);
}
.ev {
  display: flex;
  gap: 6px;
  font-size: 11.5px;
  color: var(--text-2);
  overflow-wrap: anywhere;
}
.ev time {
  flex: none;
  font: 10.5px var(--font-mono, monospace);
  color: var(--text-4);
}
.ev.ask {
  color: var(--warn);
}
.ev.fail {
  color: var(--danger);
}
.ev.auto {
  color: var(--accent);
}
.pill {
  flex: none;
  padding: 0 7px;
  font-size: 11px;
  border-radius: 9px;
  color: var(--text-3);
  background: var(--bg-2);
}
.pill.working {
  color: var(--accent);
}
.pill.waiting {
  color: var(--bg-1);
  background: var(--warn);
}
.x {
  flex: none;
  padding: 0 4px;
  font-size: 16px;
  line-height: 1;
  color: var(--text-3);
  background: none;
  border: 0;
  cursor: pointer;
}
.x:hover {
  color: var(--text);
}
.x.on {
  color: var(--accent);
}
.bar :deep(.pop),
.bar :deep(.actions) {
  left: auto;
  right: 0;
}
.term {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
  border-radius: 0 0 8px 8px;
}
.term > * {
  flex: 1;
  min-width: 0;
}
</style>
