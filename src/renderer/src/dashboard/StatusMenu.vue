<script setup lang="ts">
import { ref } from 'vue'
import type { JiraTransition } from '../types'

const props = defineProps<{ ticketKey: string; status: string; color: string; isFromJira: boolean }>()

const isOpen = ref(false)
const transitions = ref<JiraTransition[] | null | undefined>(undefined)
const picked = ref<JiraTransition | null>(null)
const isMoving = ref(false)
const error = ref<string | null>(null)

const toggle = async (): Promise<void> => {
  if (!props.isFromJira) return
  isOpen.value = !isOpen.value
  picked.value = null
  error.value = null
  if (isOpen.value) {
    transitions.value = undefined
    transitions.value = await window.api.getTransitions(props.ticketKey)
  }
}
const close = (): void => {
  isOpen.value = false
  picked.value = null
}
const move = async (): Promise<void> => {
  if (!picked.value) return
  isMoving.value = true
  error.value = null
  try {
    const result = await window.api.transitionTicket(props.ticketKey, picked.value.id)
    error.value = result.error
    if (!result.error) close()
  } catch (e) {
    error.value = String(e)
  } finally {
    isMoving.value = false
  }
}
</script>

<template>
  <span class="sm">
    <button
      class="pill"
      :class="{ clickable: isFromJira }"
      :style="{ '--c': color }"
      :title="isFromJira ? 'Change the status in Jira' : undefined"
      @click="toggle"
    >
      {{ status || 'Not in your Jira query' }}<span v-if="isFromJira" class="caret">▾</span>
    </button>
    <div v-if="isOpen" class="menu" @click.stop>
      <template v-if="!picked">
        <div class="mh">Move {{ ticketKey }} to</div>
        <p v-if="transitions === undefined" class="muted">Loading…</p>
        <p v-else-if="transitions === null" class="muted">Could not load the statuses. Check the Jira token.</p>
        <p v-else-if="!transitions.length" class="muted">No status changes available.</p>
        <button v-for="t in transitions ?? []" :key="t.id" class="opt" @click="picked = t">
          {{ t.to }}<span v-if="t.name !== t.to" class="via">{{ t.name }}</span>
        </button>
      </template>
      <template v-else>
        <p class="confirm">Move <b>{{ ticketKey }}</b> from <b>{{ status }}</b> to <b>{{ picked.to }}</b> in Jira?</p>
        <div v-if="error" class="warn">{{ error }}</div>
        <div class="row">
          <button class="ghost" :disabled="isMoving" @click="picked = null">Back</button>
          <button class="primary" :disabled="isMoving" @click="move">{{ isMoving ? 'Moving…' : 'Change status' }}</button>
        </div>
      </template>
    </div>
    <div v-if="isOpen" class="scrim" @click="close" />
  </span>
</template>

<style scoped>
.sm {
  position: relative;
}
.pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px;
  font: 11px var(--font-ui);
  color: var(--c);
  background: none;
  border: 1px solid var(--c);
  border-radius: 10px;
  cursor: default;
}
.pill.clickable {
  cursor: pointer;
}
.pill.clickable:hover {
  background: var(--bg-3);
}
.caret {
  font-size: 9px;
}
.scrim {
  position: fixed;
  inset: 0;
  z-index: 19;
}
.menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 20;
  width: 280px;
  padding: 8px;
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}
.mh {
  padding: 2px 6px 6px;
  font-size: 11px;
  color: var(--text-3);
}
.opt {
  display: flex;
  justify-content: space-between;
  width: 100%;
  padding: 7px 8px;
  font: 13px var(--font-ui);
  color: var(--text);
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
}
.opt:hover,
.opt:focus-visible {
  background: var(--bg-4);
  outline: none;
}
.via {
  font-size: 11px;
  color: var(--text-4);
}
.muted {
  margin: 4px 6px;
  font-size: 12px;
  color: var(--text-3);
}
.confirm {
  margin: 4px 4px 10px;
  font-size: 13px;
  line-height: 1.45;
  color: var(--text-2);
}
.warn {
  margin: 0 4px 8px;
  font-size: 12px;
  color: var(--warn);
}
.row {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}
.primary,
.ghost {
  padding: 5px 12px;
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
button:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
