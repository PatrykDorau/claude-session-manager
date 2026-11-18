<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import type { PromptEntry, TerminalMode } from '../types'
import { searchPrompts } from './promptquery'
import { ago } from '../display'
import { useEscapeClose } from './escape'

const props = defineProps<{ sessionId: string | null; targetLabel: string | null }>()
const emit = defineEmits<{ close: [] }>()

const entries = ref<PromptEntry[]>([])
const query = ref('')
const selected = ref(0)
const draft = ref<string | null>(null)
const mode = ref<TerminalMode | null>(null)
const isSending = ref(false)
const sendError = ref<string | null>(null)
const isCopied = ref(false)
const input = ref<HTMLInputElement | null>(null)
const editor = ref<HTMLTextAreaElement | null>(null)
const list = ref<HTMLUListElement | null>(null)
const isDraftIncomplete = ref(false)
const isOverlayOpen = ref(true)
const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null

const results = computed(() => searchPrompts(entries.value, query.value))
const blockedReason = computed(() => {
  if (!props.sessionId) return 'Open a ticket or MR session to send a prompt to it.'
  if (!mode.value) return 'Connecting to the session…'
  if (mode.value === 'resume') return 'The session is closed. Resume it to write to it.'
  if (mode.value === 'vscode') return 'The session runs in a VS Code terminal. Write to it there.'
  if (mode.value === 'elsewhere')
    return 'The session is open in VS Code. Take it over to write from here.'
  return null
})
const label = (e: PromptEntry): string =>
  e.ticket ?? e.project.split(/[\\/]/).filter(Boolean).pop() ?? ''

const loadMode = async (): Promise<void> => {
  const id = props.sessionId
  mode.value = null
  const next = id ? await window.api.terminalMode(id) : null
  if (id === props.sessionId) mode.value = next
}
watch(
  () => props.sessionId,
  () => void loadMode(),
  { immediate: true }
)
watch(query, () => (selected.value = 0))

const open = async (e: PromptEntry | undefined): Promise<void> => {
  if (!e) return
  draft.value = e.text
  isDraftIncomplete.value = e.isIncomplete
  sendError.value = null
  await nextTick()
  editor.value?.focus()
}
const copy = async (text: string): Promise<void> => {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    return
  }
  isCopied.value = true
  setTimeout(() => (isCopied.value = false), 1200)
}
const send = async (): Promise<void> => {
  const id = props.sessionId
  const text = draft.value
  if (!id || !text?.trim() || isSending.value || blockedReason.value) return
  isSending.value = true
  try {
    sendError.value = (await window.api.sendPrompt(id, text)).error
    if (!sendError.value) emit('close')
  } finally {
    isSending.value = false
  }
}
const onListKey = (ev: KeyboardEvent): void => {
  if (ev.key === 'ArrowDown')
    selected.value = Math.max(0, Math.min(selected.value + 1, results.value.length - 1))
  else if (ev.key === 'ArrowUp') selected.value = Math.max(selected.value - 1, 0)
  else if (ev.key === 'Enter') void open(results.value[selected.value])
  else return
  ev.preventDefault()
  void nextTick(() => list.value?.querySelector('.sel')?.scrollIntoView({ block: 'nearest' }))
}
const onEsc = (): void => {
  if (draft.value !== null) {
    draft.value = null
    void nextTick(() => input.value?.focus())
  } else emit('close')
}

useEscapeClose(isOverlayOpen, onEsc)
onBeforeUnmount(() => previousFocus?.focus())

onMounted(async () => {
  input.value?.focus()
  entries.value = await window.api.getPromptHistory()
})
</script>

<template>
  <div class="pscrim" @click="emit('close')" />
  <div class="psbox">
    <template v-if="draft === null">
      <input
        ref="input"
        v-model="query"
        class="psq"
        placeholder="Search your prompts…"
        spellcheck="false"
        @keydown="onListKey"
      />
      <ul ref="list" class="pslist">
        <li
          v-for="(e, i) in results"
          :key="`${e.at}-${i}`"
          :class="{ sel: i === selected }"
          @mouseenter="selected = i"
          @click="open(e)"
        >
          <div class="psmeta">
            <span class="pskey">{{ label(e) }}</span
            ><span>{{ ago(e.at) }}</span>
          </div>
          <div class="pstext">{{ e.text }}</div>
        </li>
        <li v-if="!results.length" class="psempty">No prompts found.</li>
      </ul>
      <div class="psfoot">↑↓ choose · Enter edit &amp; send · Esc close</div>
    </template>
    <template v-else>
      <textarea
        ref="editor"
        v-model="draft"
        class="psedit"
        rows="8"
        spellcheck="false"
        @keydown.enter.ctrl.prevent="send"
      />
      <p v-if="isDraftIncomplete" class="pshint err">
        A long paste in this prompt is no longer stored. Its placeholder is still in the text.
      </p>
      <p v-if="!blockedReason && targetLabel" class="pshint">Sends to {{ targetLabel }}</p>
      <p v-if="blockedReason" class="pshint">{{ blockedReason }}</p>
      <p v-if="sendError" class="pshint err">{{ sendError }}</p>
      <div class="psbtns">
        <button class="btn" @click="copy(draft)">{{ isCopied ? 'Copied' : 'Copy' }}</button>
        <button class="btn" @click="onEsc">Cancel</button>
        <button
          class="btn primary"
          :disabled="!!blockedReason || isSending || !draft.trim()"
          @click="send"
        >
          Send
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.pscrim {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(0, 0, 0, 0.35);
}
.psbox {
  position: fixed;
  top: 12vh;
  left: 50%;
  z-index: 41;
  width: min(640px, calc(100vw - 32px));
  transform: translateX(-50%);
  padding: 10px;
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  border-radius: 10px;
  font-size: 12px;
}
.psq,
.psedit {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  font: 13px var(--font-ui);
  color: var(--text);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 6px;
  outline: none;
}
.psedit {
  resize: vertical;
}
.pslist {
  max-height: 55vh;
  margin: 8px 0 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}
.pslist li {
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
}
.pslist li.sel {
  background: var(--bg-3);
}
.psmeta {
  display: flex;
  gap: 8px;
  color: var(--text-3);
  font-size: 11px;
}
.pskey {
  color: var(--accent);
  font-weight: 600;
}
.pstext {
  display: -webkit-box;
  overflow: hidden;
  color: var(--text);
  white-space: pre-wrap;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.psempty {
  color: var(--text-3);
  cursor: default;
}
.psfoot {
  margin-top: 6px;
  color: var(--text-4);
  font-size: 11px;
}
.pshint {
  margin: 6px 0 0;
  color: var(--text-3);
}
.pshint.err {
  color: var(--warn);
}
.btn {
  display: inline-flex;
  align-items: center;
  height: 30px;
  padding: 0 12px;
  font: 500 12.5px var(--font-ui);
  color: var(--text-2);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 7px;
  cursor: pointer;
}
.btn:hover:not(:disabled) {
  color: var(--text);
  background: var(--bg-4);
}
.btn.primary {
  font-weight: 600;
  color: var(--on-accent);
  background: var(--accent);
  border-color: var(--accent);
}
.btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.psbtns {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 8px;
}
</style>
