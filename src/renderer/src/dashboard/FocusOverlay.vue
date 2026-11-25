<script setup lang="ts">
import { ref } from 'vue'
import type { Session } from '../types'
import type { Job } from '../../../main/orchestrator'
import type { CellLook, Identity } from './commandpanel'
import PanelCell from './PanelCell.vue'
import Icon from './Icon.vue'

defineProps<{
  session: Session
  title: string
  jiraStatus: string | null
  job: Job | null
  look: CellLook
  identity: Identity
  isPinned: boolean
  isAutoResume?: boolean
  waitingSince: number | null
  isAcknowledged: boolean
  isTurnUnseen: boolean
  now: number
}>()
const emit = defineEmits<{
  close: []
  'open-task': [session: Session]
  unpin: [id: string]
  pin: [session: Session]
  look: [session: Session, look: CellLook]
  focused: [session: Session]
}>()

const cell = ref<InstanceType<typeof PanelCell> | null>(null)
const refit = (): void => cell.value?.refit()
defineExpose({ refit })

const close = (): void => emit('close')
const openTask = (session: Session): void => emit('open-task', session)
const unpin = (id: string): void => emit('unpin', id)
const pin = (session: Session): void => emit('pin', session)
const setLook = (session: Session, look: CellLook): void => emit('look', session, look)
const focused = (session: Session): void => emit('focused', session)
</script>

<template>
  <div class="focus">
    <div class="backdrop" />
    <div class="frame">
      <div class="strip">
        <span class="grow" />
        <button class="back" title="Back to grid (Ctrl+Shift+E)" @click="close">
          <Icon name="close" :size="12" />Back to grid
        </button>
      </div>
      <PanelCell
        ref="cell"
        class="cell"
        :session="session"
        :title="title"
        :jira-status="jiraStatus"
        :job="job"
        :look="look"
        :identity="identity"
        :is-pinned="isPinned"
        :is-auto-resume="isAutoResume"
        :waiting-since="waitingSince"
        :is-acknowledged="isAcknowledged"
        :is-turn-unseen="isTurnUnseen"
        :now="now"
        @focused="focused"
        @open-task="openTask"
        @unpin="unpin"
        @pin="pin"
        @look="setLook"
        @expand="close"
      />
    </div>
  </div>
</template>

<style scoped>
.focus {
  position: absolute;
  inset: 0;
  z-index: 40;
}
.backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
}
.frame {
  position: absolute;
  top: 7.5%;
  left: 7.5%;
  width: 85%;
  height: 85%;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.strip {
  flex: none;
  display: flex;
  align-items: center;
}
.grow {
  flex: 1;
}
.back {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  font: 12px var(--font-ui);
  color: var(--text-2);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 6px;
  cursor: pointer;
}
.back:hover {
  color: var(--text);
  border-color: var(--accent);
}
.cell {
  flex: 1;
  min-height: 0;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
}
</style>
