<script setup lang="ts">
import { ref } from 'vue'
import JiraText from './JiraText.vue'
import { testCasesFromMr, markdownToJira } from './testcases'

const props = defineProps<{ ticketKey: string; sessionId: string | null; isWritable: boolean }>()
const emit = defineEmits<{ close: [] }>()

const ASK_PROMPT = (key: string): string =>
  `Napisz test case'y dla testerów do zadania ${key} jako komentarz w formacie Jira wiki markup: h3. dla każdego przypadku, * dla kroków, *Oczekiwany rezultat:* na końcu. Odpowiedz samą treścią komentarza, bez wstępu i bez podsumowania.`

const POST_PROMPT = (key: string): string =>
  `To moja wyraźna prośba o dodanie komentarza do zadania ${key} w Jirze. Napisz test case'y dla testerów według zasad browser-verify qa (priorytety, środowisko DEV, kolejność od Critical), w formacie Jira wiki markup: h3. TCn — tytuł, *Priorytet:*, *Warunki wstępne:*, kroki jako lista #, *Oczekiwany rezultat:*. Zapisz je do pliku test-case-jira.txt w folderze zadania (Desktop\\Opis zadan\\<MM-YYYY>\\${key}), a potem dodaj ten plik jako komentarz: node C:/Users/ASSET-17300/.claude/tools/jira.js comment ${key} --body-file <ścieżka do pliku>. Nie pytaj mnie o potwierdzenie, kliknąłem już przycisk publikacji w Claude Cockpit. Na koniec napisz jedną linię z wynikiem.`
const text = ref('')
const step = ref<'start' | 'sent' | 'edit' | 'confirm' | 'done'>('start')
const useMrTestCases = async (): Promise<void> => {
  isBusy.value = true
  error.value = null
  try {
    const mr = await window.api.getTicketMr(props.ticketKey)
    if (!mr) {
      error.value = `No merge request of yours mentions ${props.ticketKey} in its title.`
      return
    }
    const found = testCasesFromMr(mr.description)
    if (!found) {
      error.value = `The description of !${mr.iid} has no Test case'y section.`
      return
    }
    text.value = markdownToJira(found)
    note.value = `Taken from the description of !${mr.iid}. Check the preview, then post it.`
    step.value = 'edit'
  } finally {
    isBusy.value = false
  }
}
const letClaudePost = async (): Promise<void> => {
  if (!props.sessionId) return
  isBusy.value = true
  error.value = null
  try {
    const result = await window.api.sendPrompt(props.sessionId, POST_PROMPT(props.ticketKey))
    error.value = result.error
    if (!result.error) step.value = 'sent'
  } finally {
    isBusy.value = false
  }
}
const isBusy = ref(false)
const note = ref<string | null>(null)
const error = ref<string | null>(null)

const askClaude = async (): Promise<void> => {
  if (!props.sessionId) return
  isBusy.value = true
  error.value = null
  try {
    const result = await window.api.sendPrompt(props.sessionId, ASK_PROMPT(props.ticketKey))
    error.value = result.error
    if (!result.error) note.value = 'Asked Claude. When it finishes, click "Use Claude\'s last reply".'
  } finally {
    isBusy.value = false
  }
}

const useLastReply = async (): Promise<void> => {
  if (!props.sessionId) return
  const detail = await window.api.getSessionDetail(props.sessionId)
  const reply = [...detail.messages].reverse().find((m) => m.role === 'assistant')
  if (reply) {
    text.value = reply.text.trim()
    note.value = null
  } else note.value = 'Claude has not replied yet.'
}

const openJira = (): void => window.api.openTicket(props.ticketKey)

const post = async (): Promise<void> => {
  isBusy.value = true
  error.value = null
  try {
    const result = await window.api.postJiraComment(props.ticketKey, text.value.trim())
    error.value = result.error
    if (!result.error) step.value = 'done'
  } catch (e) {
    error.value = String(e)
  } finally {
    isBusy.value = false
  }
}
</script>

<template>
  <div class="modal" @click.self="emit('close')">
    <div class="dialog">
      <header>
        <h2>Test cases for {{ ticketKey }}</h2>
        <button class="x" title="Close" @click="emit('close')">✕</button>
      </header>

      <template v-if="step === 'start'">
        <p class="confirm">
          Claude writes the test cases for <b>{{ ticketKey }}</b> in its session and posts them as a comment on the ticket in Jira. Everyone on the ticket will see it.
          It only posts on tickets assigned to you.
        </p>
        <p v-if="!isWritable" class="hint">Open the ticket's Claude session in the dashboard first, so Claude can take the request.</p>
        <div v-if="error" class="warn">{{ error }}</div>
        <footer>
          <button class="ghost" @click="step = 'edit'">Write them myself</button>
          <button class="ghost" @click="emit('close')">Cancel</button>
          <button class="ghost" :disabled="!isWritable || isBusy" @click="letClaudePost">Let Claude write and post them</button>
          <button class="primary" :disabled="isBusy" title="Takes the Test case'y section from the merge request description" @click="useMrTestCases">
            {{ isBusy ? 'Loading…' : 'Use the test cases from the MR' }}
          </button>
        </footer>
      </template>
      <template v-else-if="step === 'sent'">
        <p class="confirm">Sent to Claude. Follow it in the Claude pane: it writes the test cases, saves them in the task folder and posts the comment on <b>{{ ticketKey }}</b>.</p>
        <footer>
          <button class="ghost" @click="openJira">Open in Jira</button>
          <button class="primary" @click="emit('close')">Done</button>
        </footer>
      </template>
      <template v-else-if="step === 'edit'">
        <div class="tools">
          <button class="ghost" :disabled="!isWritable || isBusy" @click="askClaude">Ask Claude to write them</button>
          <button class="ghost" :disabled="!sessionId" @click="useLastReply">Use Claude's last reply</button>
        </div>
        <p v-if="!isWritable" class="hint">Open the ticket's Claude session in the dashboard to ask Claude, or paste the test cases yourself.</p>
        <p v-if="note" class="hint">{{ note }}</p>
        <div class="split">
          <textarea v-model="text" class="box" placeholder="Test cases in Jira markup. h3. title, * step, *bold*" spellcheck="false" />
          <div class="preview">
            <JiraText v-if="text.trim()" :text="text" />
            <p v-else class="hint">The preview shows here.</p>
          </div>
        </div>
        <div v-if="error" class="warn">{{ error }}</div>
        <footer>
          <button class="ghost" @click="emit('close')">Cancel</button>
          <button class="primary" :disabled="!text.trim()" @click="step = 'confirm'">Review comment</button>
        </footer>
      </template>

      <template v-else-if="step === 'confirm'">
        <p class="confirm">This posts a comment on <b>{{ ticketKey }}</b> in Jira. Everyone on the ticket will see it.</p>
        <div class="preview full"><JiraText :text="text" /></div>
        <div v-if="error" class="warn">{{ error }}</div>
        <footer>
          <button class="ghost" :disabled="isBusy" @click="step = 'edit'">Back to editing</button>
          <button class="primary" :disabled="isBusy" @click="post">{{ isBusy ? 'Posting…' : 'Post comment to Jira' }}</button>
        </footer>
      </template>

      <template v-else>
        <p class="confirm">Comment posted on <b>{{ ticketKey }}</b>.</p>
        <footer>
          <button class="ghost" @click="openJira">Open in Jira</button>
          <button class="primary" @click="emit('close')">Done</button>
        </footer>
      </template>
    </div>
  </div>
</template>

<style scoped>
.modal {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  padding: 24px;
  overflow: auto;
  background: rgba(0, 0, 0, 0.6);
}
.dialog {
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-sizing: border-box;
  width: min(1000px, 100%);
  max-height: calc(100vh - 48px);
  min-height: 0;
  overflow: hidden;
  padding: 16px 18px;
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 12px;
}
header {
  display: flex;
  align-items: center;
}
h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}
.x {
  margin-left: auto;
  color: var(--text-3);
  background: none;
  border: none;
  cursor: pointer;
}
.tools {
  display: flex;
  gap: 8px;
}
.split {
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  height: min(60vh, 600px);
  min-height: 200px;
}
.box {
  resize: none;
  padding: 10px;
  font: 12px var(--font-mono);
  line-height: 1.5;
  color: var(--text);
  background: var(--bg-1);
  border: 1px solid var(--line-2);
  border-radius: 8px;
  outline: none;
}
.box:focus {
  border-color: var(--accent);
}
.preview {
  min-height: 0;
  overflow-y: auto;
  padding: 10px 14px;
  background: var(--bg-1);
  border: 1px solid var(--bg-4);
  border-radius: 8px;
}
.preview.full {
  flex: 1 1 auto;
  max-height: none;
}
.hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
}
.confirm {
  margin: 0;
  font-size: 13px;
  color: var(--text-2);
}
.warn {
  font-size: 12px;
  color: var(--warn);
}
footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
button.primary,
button.ghost {
  padding: 6px 14px;
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
.ghost:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--text);
}
button:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>
