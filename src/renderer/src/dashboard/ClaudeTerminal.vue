<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, onActivated, nextTick } from 'vue'
import '@xterm/xterm/css/xterm.css'
import type { SessionDetail, TerminalMode } from '../types'
import { isQuickExit } from './dashboard'
import { acquireTerminal, releaseTerminal, showTerminalIn } from './terminalpool'

const props = defineProps<{ sessionId: string; projectName: string }>()
const emit = defineEmits<{ mode: [mode: TerminalMode | null]; exited: []; focusVscode: [] }>()

const mode = ref<TerminalMode | null>(null)
const isBusy = ref(false)
const error = ref<string | null>(null)
const detail = ref<SessionDetail | null>(null)
const host = ref<HTMLDivElement | null>(null)
const endedCode = ref<number | null>(null)

const shared = acquireTerminal(props.sessionId)
let observer: ResizeObserver | null = null

const setMode = (next: TerminalMode | null): void => {
  mode.value = next
  emit('mode', next)
}

const FIT_DELAY_MS = 120
let fitTimer: ReturnType<typeof setTimeout> | null = null

const isVisible = (): boolean => !!host.value?.clientWidth && !!host.value.clientHeight
const adopt = (): void => {
  if (host.value && isVisible()) showTerminalIn(shared, host.value)
}
const fitTerminal = (): void => {
  if (!isVisible() || shared.element.parentElement !== host.value) return
  const next = shared.fit.proposeDimensions()
  if (!next || (next.cols === shared.term.cols && next.rows === shared.term.rows)) return
  shared.fit.fit()
  window.api.resizeTerminal(props.sessionId, shared.term.cols, shared.term.rows)
}
const scheduleFit = (): void => {
  if (fitTimer) clearTimeout(fitTimer)
  fitTimer = setTimeout(fitTerminal, FIT_DELAY_MS)
}
const onHostResize = (): void => {
  adopt()
  scheduleFit()
}
const onExit = (code: number): void => {
  if (isQuickExit(shared.openedAt, Date.now())) endedCode.value = code
  else emit('exited')
}
shared.onExit.add(onExit)

onActivated(() => {
  adopt()
  fitTerminal()
  shared.term.focus()
})

const createTerminal = async (): Promise<{ cols: number; rows: number }> => {
  await nextTick()
  if (host.value) showTerminalIn(shared, host.value)
  shared.fit.fit()
  if (!observer && host.value) {
    observer = new ResizeObserver(onHostResize)
    observer.observe(host.value)
  }
  shared.term.focus()
  return { cols: shared.term.cols, rows: shared.term.rows }
}

const runAttached = async (start: (cols: number, rows: number) => Promise<{ error: string | null }>): Promise<boolean> => {
  isBusy.value = true
  error.value = null
  endedCode.value = null
  mode.value = 'attach'
  emit('mode', null)
  try {
    const size = await createTerminal()
    const result = await start(size.cols, size.rows)
    error.value = result.error
    shared.openedAt = Date.now()
    shared.isAttached = !result.error
    if (!result.error) emit('mode', 'attach')
    return !result.error
  } catch (e) {
    error.value = String(e)
    return false
  } finally {
    isBusy.value = false
  }
}

const resumeHere = (): Promise<boolean> => runAttached((cols, rows) => window.api.openTerminal(props.sessionId, cols, rows))
const takeOver = (): Promise<boolean> => runAttached((cols, rows) => window.api.takeOver(props.sessionId, cols, rows))

const paste = (text: string): void => {
  if (mode.value !== 'attach') return
  window.api.writeTerminal(props.sessionId, `\x1b[200~${text}\x1b[201~`)
  shared.term.focus()
}

defineExpose({ takeOver, paste })

const lastReply = computed(() => {
  const text = [...(detail.value?.messages ?? [])].reverse().find((m) => m.role === 'assistant')?.text.trim() ?? ''
  return text.length > 320 ? `${text.slice(0, 319)}…` : text
})

const loadDetail = async (): Promise<void> => {
  detail.value = await window.api.getSessionDetail(props.sessionId)
}

onMounted(async () => {
  if (shared.isAttached) {
    setMode('attach')
    await createTerminal()
    return
  }
  const initial = await window.api.terminalMode(props.sessionId)
  if (initial === 'attach') {
    await resumeHere()
    return
  }
  setMode(initial)
  await loadDetail()
})

onBeforeUnmount(() => {
  observer?.disconnect()
  if (fitTimer) clearTimeout(fitTimer)
  shared.onExit.delete(onExit)
  releaseTerminal(props.sessionId)
})
</script>

<template>
  <div class="tw">
    <div v-show="mode === 'attach'" ref="host" class="xterm-host" />
    <div v-if="mode === 'attach' && (isBusy || error || endedCode !== null)" class="overlay">
      <span v-if="isBusy" class="muted"><span class="spin" />Attaching to the session…</span>
      <span v-else-if="error" class="warn">{{ error }}</span>
      <span v-else class="warn">
        The session closed right after attaching (code {{ endedCode }}).
        <button class="db ghost" @click="emit('exited')">Retry</button>
      </span>
    </div>

    <div v-if="mode && mode !== 'attach'" class="idle">
      <div class="card">
        <div class="prompt">
          <span class="dollar">$</span>
          {{ mode === 'resume' ? 'claude --resume' : 'claude attach' }} <span class="dim">{{ sessionId.slice(0, 8) }}</span>
        </div>
        <p v-if="mode === 'resume'">This session is closed. Open it here to continue the conversation in this terminal.</p>
        <p v-else-if="mode === 'elsewhere'">
          This session is open in VS Code. Opening it here moves it to the dashboard; Claude keeps working and
          "Open in VS Code" moves it back.
        </p>
        <p v-else>
          This session runs as an interactive terminal in VS Code ({{ projectName }}). It can only be shown here once it
          is closed there.
        </p>
        <div class="acts">
          <button v-if="mode === 'resume'" class="db" @click="resumeHere">Open session here</button>
          <button v-if="mode === 'elsewhere'" class="db" @click="takeOver">Open session here</button>
          <button v-if="mode !== 'resume'" class="db ghost" @click="emit('focusVscode')">Focus in VS Code</button>
        </div>
        <p v-if="lastReply" class="last"><span class="dim">Last reply</span>{{ lastReply }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tw {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-editor);
}
.xterm-host :deep(.pool-term) {
  width: 100%;
  height: 100%;
}
.xterm-host {
  flex: 1;
  min-height: 0;
  padding: 6px 0 0 8px;
}
.overlay {
  position: absolute;
  top: 8px;
  right: 12px;
  font-size: 11px;
}
.readonly {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.idle {
  flex: 1;
  min-height: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  overflow-y: auto;
}
.card {
  width: min(560px, 100%);
  padding: 18px 20px;
  background: var(--bg-editor);
  border: 1px solid var(--bg-4);
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-2);
}
.prompt {
  margin-bottom: 10px;
  font: 13px var(--font-mono);
  color: var(--text);
}
.dollar {
  color: var(--accent);
}
.dim {
  color: var(--text-4);
}
.card p {
  margin: 0 0 14px;
}
.acts {
  display: flex;
  gap: 8px;
}
.card .last {
  margin: 16px 0 0;
  padding-top: 12px;
  border-top: 1px solid var(--bg-4);
  font-size: 12px;
  white-space: pre-wrap;
  color: var(--text-3);
}
.card .last .dim {
  display: block;
  margin-bottom: 4px;
  font-size: 11px;
}
.muted {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-3);
}
.warn {
  color: var(--warn);
}
.spin {
  width: 10px;
  height: 10px;
  border: 2px solid var(--line-2);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.db {
  font: 600 12px var(--font-ui);
  background: var(--accent);
  color: var(--on-accent);
  border: 1px solid var(--accent);
  border-radius: 6px;
  padding: 6px 14px;
  cursor: pointer;
}
.db.ghost {
  background: none;
  color: var(--text-2);
  border-color: var(--line-2);
}
.db.ghost:hover {
  color: var(--text);
}
</style>
