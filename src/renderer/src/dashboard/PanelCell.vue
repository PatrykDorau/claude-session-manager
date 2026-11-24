<script setup lang="ts">
import { nextTick, ref } from 'vue'
import type { Session, TerminalMode } from '../types'
import type { CellLook } from './commandpanel'
import type { AutonomyChoice, Job } from '../../../main/orchestrator'
import { AUTONOMY_LEVELS, activityTone, choiceOf, stateLabel } from './orchestrator'
import ClaudeTerminal from './ClaudeTerminal.vue'
import ContextChip from './ContextChip.vue'
import AutonomySwitch from './AutonomySwitch.vue'
import Icon from './Icon.vue'

const props = defineProps<{ session: Session; title: string; jiraStatus: string | null; job: Job | null; look: CellLook; isAutoResume?: boolean }>()
const emit = defineEmits<{ 'open-task': [session: Session]; unpin: [id: string]; look: [session: Session, look: CellLook]; move: [fromId: string, toId: string] }>()

const COLORS = ['#3dd68c', '#6aa9ff', '#a371f7', '#f778ba', '#f0b429', '#ff7b72', '#39c5cf']
const isPaletteOpen = ref(false)
const pickColor = (color: string | null): void => {
  isPaletteOpen.value = false
  emit('look', props.session, { ...props.look, color: color ?? undefined })
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
const DRAG_TYPE = 'application/x-cockpit-cell'
const isDropOn = ref(false)
const onDragStart = (e: DragEvent): void => {
  e.dataTransfer?.setData(DRAG_TYPE, props.session.id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
const onDrop = (e: DragEvent): void => {
  isDropOn.value = false
  const fromId = e.dataTransfer?.getData(DRAG_TYPE)
  if (fromId && fromId !== props.session.id) emit('move', fromId, props.session.id)
}

const mode = ref<TerminalMode | null>(null)
const setMode = (next: TerminalMode | null): void => {
  mode.value = next
}
const openTask = (): void => emit('open-task', props.session)
const unpin = (): void => emit('unpin', props.session.id)
const isOrchOpen = ref(false)
const error = ref<string | null>(null)
const levelLabel = (job: Job | null): string => AUTONOMY_LEVELS.find((l) => l.value === choiceOf(job))?.label ?? 'Off'
const setAutonomy = async (autonomy: AutonomyChoice): Promise<void> => {
  error.value = (await window.api.setSessionAutonomy(props.session.id, autonomy)).error
}
</script>

<template>
  <section
    class="cell"
    :class="[session.status, { colored: !!look.color, 'drop-on': isDropOn }]"
    :style="look.color ? { '--cell': look.color } : undefined"
    @dragover.prevent="isDropOn = true"
    @dragleave="isDropOn = false"
    @drop.prevent="onDrop"
  >
    <header class="bar">
      <div class="row1" draggable="true" title="Drag to move this session in the grid" @dragstart="onDragStart">
        <span class="grip">⠿</span>
        <button class="key" :title="`Open ${session.ticket ?? session.name ?? 'session'}`" @click="openTask">{{ session.ticket ?? session.name ?? session.id.slice(0, 8) }}</button>
        <input v-if="isEditing" ref="titleInput" v-model="draftTitle" class="title-edit" @keydown.enter="saveTitle" @keydown.esc="isEditing = false" @blur="saveTitle" />
        <span v-else class="title" :title="`${look.title || title} — double-click to rename`" @dblclick="editTitle">{{ look.title || title }}</span>
        <span class="paint">
          <button class="swatch" :style="look.color ? { background: look.color } : undefined" title="Cell color" @click="isPaletteOpen = !isPaletteOpen" />
          <span v-if="isPaletteOpen" class="scrim" @click="isPaletteOpen = false" />
          <span v-if="isPaletteOpen" class="palette">
            <button v-for="c in COLORS" :key="c" class="swatch" :class="{ on: look.color === c }" :style="{ background: c }" @click="pickColor(c)" />
            <button class="swatch none" title="No color" @click="pickColor(null)">∅</button>
          </span>
        </span>
        <button class="x" title="Unpin from the grid" @click="unpin">×</button>
      </div>
      <div class="row2">
      <span v-if="jiraStatus" class="jira">{{ jiraStatus }}</span>
      <span class="pill" :class="session.status">{{ session.status }}</span>
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
      <span class="grow" />
      <ContextChip :session="session" :mode="mode" />
      </div>
    </header>
    <div class="term">
      <ClaudeTerminal :session-id="session.id" :project-name="session.projectName" :is-auto-resume="isAutoResume" @mode="setMode" />
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
  border: 1px solid var(--line-2);
  border-radius: 8px;
  position: relative;
}
.cell.waiting {
  border-color: var(--warn);
}
.cell.colored {
  border-color: var(--cell);
}
.cell.colored .bar {
  background: color-mix(in srgb, var(--cell) 16%, var(--bg-3));
  border-bottom-color: color-mix(in srgb, var(--cell) 50%, var(--line-2));
}
.cell.colored .key {
  color: var(--cell);
}
.cell.drop-on {
  outline: 2px dashed var(--accent);
  outline-offset: -2px;
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
  gap: 6px;
  padding: 8px;
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
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
