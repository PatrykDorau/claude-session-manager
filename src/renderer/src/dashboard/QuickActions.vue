<script setup lang="ts">
import { ref, computed } from 'vue'
import type { QuickAction, TerminalMode } from '../types'

const props = defineProps<{
  sessionId: string | null
  mode: TerminalMode | null
  extra?: QuickAction[]
  takeOver?: () => Promise<boolean>
}>()

const NO_ASK_KEY = 'dashboard.takeOverWithoutAsking'
const readNoAsk = (): boolean => {
  try {
    return localStorage.getItem(NO_ASK_KEY) === '1'
  } catch {
    return false
  }
}
const pending = ref<string | null>(null)
const isNoAsk = ref(readNoAsk())
const isDontAskChecked = ref(false)

const settingsActions = window.api.getSettings().quickActions
const actions = computed(() => [...(props.extra ?? []), ...settingsActions])
const isSending = ref(false)
const error = ref<string | null>(null)
const lastSent = ref<{ text: string; at: number } | null>(null)

const blockedReason = computed(() => {
  if (!props.sessionId) return 'Start a session to talk to Claude here.'
  if (!props.mode) return 'Connecting to the session…'
  if (props.mode === 'resume') return 'The session is closed. Resume it above to write to it.'
  if (props.mode === 'vscode') return 'The session runs in a VS Code terminal. Write to it there.'
  if (props.mode === 'elsewhere' && !props.takeOver) return 'The session is open in VS Code. Take it over above to write from here.'
  return null
})

const takeOverThenSend = async (text: string): Promise<boolean> => {
  pending.value = null
  isSending.value = true
  const isMoved = await props.takeOver?.()
  isSending.value = false
  if (!isMoved) {
    error.value = 'Could not move the session to the dashboard.'
    return false
  }
  return sendNow(text)
}

const confirmTakeOver = async (): Promise<void> => {
  const text = pending.value
  if (!text) return
  if (isDontAskChecked.value) {
    isNoAsk.value = true
    try {
      localStorage.setItem(NO_ASK_KEY, '1')
    } catch {
      isNoAsk.value = true
    }
  }
  await takeOverThenSend(text)
}

const send = async (text: string): Promise<boolean> => {
  const id = props.sessionId
  if (!id || !text.trim() || isSending.value || blockedReason.value) return false
  if (props.mode === 'elsewhere') {
    if (isNoAsk.value) return takeOverThenSend(text)
    pending.value = text.trim()
    return false
  }
  return sendNow(text)
}

const sendNow = async (text: string): Promise<boolean> => {
  const id = props.sessionId
  if (!id) return false
  isSending.value = true
  error.value = null
  try {
    const result = await window.api.sendPrompt(id, text.trim())
    error.value = result.error
    if (!result.error) lastSent.value = { text: text.trim(), at: Date.now() }
    return !result.error
  } catch (e) {
    error.value = String(e)
    return false
  } finally {
    isSending.value = false
  }
}

const timeOf = (at: number): string => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <div class="composer" :class="{ blocked: !!blockedReason }">
    <div v-if="pending" class="ask">
      <p>
        This session is open in VS Code. Sending moves it to the dashboard; the VS Code tab shows "Session opened in
        another window" and "Open in VS Code" moves it back. Claude keeps working either way.
      </p>
      <div class="askrow">
        <label><input v-model="isDontAskChecked" type="checkbox" /> Don't ask again</label>
        <span class="grow" />
        <button class="chip" @click="pending = null">Cancel</button>
        <button class="send small" @click="confirmTakeOver">Move here and send</button>
      </div>
    </div>
    <div class="chips">
      <span class="lbl">Quick actions</span>
      <button
        v-for="a in actions"
        :key="a.label + a.prompt"
        class="chip"
        :disabled="!!blockedReason || isSending"
        :title="a.prompt"
        @click="send(a.prompt)"
      >
        {{ a.label }}
      </button>
    </div>
    <div v-if="blockedReason && sessionId" class="hint">{{ blockedReason }}</div>
    <div v-if="error" class="warn">{{ error }}</div>
    <div v-else-if="lastSent" class="sent">Sent at {{ timeOf(lastSent.at) }}: {{ lastSent.text }}</div>
  </div>
</template>

<style scoped>
.composer {
  flex: none;
  padding: 8px 14px;
  background: var(--bg-2);
  border-top: 1px solid var(--line-2);
}
.ask {
  margin-bottom: 10px;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-2);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-left: 3px solid var(--warn);
  border-radius: 8px;
}
.ask p {
  margin: 0 0 8px;
}
.askrow {
  display: flex;
  align-items: center;
  gap: 8px;
}
.askrow label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-2);
}
.grow {
  flex: 1;
}
.send.small {
  min-width: 0;
  padding: 5px 12px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.lbl {
  margin-right: 4px;
  font-size: 11px;
  color: var(--text-4);
}
.hint {
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-4);
}
.chip {
  padding: 4px 10px;
  font: 12px var(--font-ui);
  color: var(--text-2);
  background: var(--line);
  border: 1px solid var(--line-2);
  border-radius: 14px;
  cursor: pointer;
}
.chip:hover:not(:disabled),
.chip:focus-visible {
  color: var(--text);
  border-color: var(--accent);
  outline: none;
}
.row {
  display: flex;
  gap: 8px;
  align-items: stretch;
}
.box {
  flex: 1;
  resize: none;
  padding: 8px 10px;
  font: 13px var(--font-ui);
  line-height: 1.4;
  color: var(--text);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 8px;
  outline: none;
}
.box:focus {
  border-color: var(--accent);
}
.send {
  flex: none;
  min-width: 76px;
  font: 600 12px var(--font-ui);
  color: var(--on-accent);
  background: var(--accent);
  border: none;
  border-radius: 8px;
  cursor: pointer;
}
.chip:disabled,
.send:disabled,
.box:disabled {
  opacity: 0.45;
  cursor: default;
}
.warn {
  margin-top: 6px;
  font-size: 11px;
  color: var(--warn);
}
.sent {
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-4);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
