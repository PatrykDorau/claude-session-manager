<script setup lang="ts">
import { ref } from 'vue'
import type { Session, TerminalMode } from '../types'
import type { Autonomy, Job } from '../../../main/orchestrator'
import { AUTONOMY_LEVELS, activityTone, stateLabel } from './orchestrator'
import ClaudeTerminal from './ClaudeTerminal.vue'
import ContextChip from './ContextChip.vue'
import AutonomySwitch from './AutonomySwitch.vue'
import Icon from './Icon.vue'

const props = defineProps<{ session: Session; title: string; jiraStatus: string | null; job: Job | null }>()
const emit = defineEmits<{ 'open-task': [session: Session]; unpin: [id: string] }>()

const mode = ref<TerminalMode | null>(null)
const setMode = (next: TerminalMode | null): void => {
  mode.value = next
}
const openTask = (): void => emit('open-task', props.session)
const unpin = (): void => emit('unpin', props.session.id)
const isOrchOpen = ref(false)
const error = ref<string | null>(null)
const levelLabel = (autonomy: Autonomy): string => AUTONOMY_LEVELS.find((l) => l.value === autonomy)?.label ?? autonomy
const setAutonomy = async (autonomy: Autonomy): Promise<void> => {
  error.value = (await window.api.setSessionAutonomy(props.session.id, autonomy)).error
}
</script>

<template>
  <section class="cell" :class="session.status">
    <header class="bar">
      <button class="key" :title="`Open ${session.ticket ?? session.name ?? 'session'}`" @click="openTask">{{ session.ticket ?? session.name ?? session.id.slice(0, 8) }}</button>
      <span class="title" :title="title">{{ title }}</span>
      <span v-if="jiraStatus" class="jira">{{ jiraStatus }}</span>
      <span class="pill" :class="session.status">{{ session.status }}</span>
      <span class="orch">
        <button class="auto" :class="{ on: !!job }" title="Orchestrator: autonomy and recent decisions" @click="isOrchOpen = !isOrchOpen">
          <Icon name="bot" :size="11" />{{ job ? levelLabel(job.autonomy) : 'Off' }}
        </button>
        <span v-if="isOrchOpen" class="scrim" @click="isOrchOpen = false" />
        <span v-if="isOrchOpen" class="orch-pop">
          <AutonomySwitch :value="job?.autonomy ?? null" :is-disabled="!job && !session.ticket" disabled-hint="Only a session with a ticket can be orchestrated" @change="setAutonomy" />
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
      <ContextChip :session="session" :mode="mode" />
      <button class="x" title="Unpin from the grid" @click="unpin">×</button>
    </header>
    <div class="term">
      <ClaudeTerminal :session-id="session.id" :project-name="session.projectName" @mode="setMode" />
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
.bar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 8px;
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
  position: relative;
  flex: none;
}
.scrim {
  position: fixed;
  inset: 0;
  z-index: 10;
}
.orch-pop {
  position: absolute;
  top: 24px;
  right: 0;
  z-index: 11;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 320px;
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
