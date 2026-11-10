<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { TicketDetail } from '../types'
import { statusLane } from '../taskview'
import JiraText from './JiraText.vue'
import StatusMenu from './StatusMenu.vue'

const props = defineProps<{ ticketKey: string; status: string; isFromJira: boolean; mrUrl: string | null }>()
const emit = defineEmits<{ testCases: [] }>()

const detail = ref<TicketDetail | null | undefined>(undefined)
const comment = ref('')
const isPreview = ref(false)
const isConfirming = ref(false)
const isPosting = ref(false)
const postError = ref<string | null>(null)

const lane = computed(() => statusLane(props.status))
const initials = (name: string): string =>
  name
    .split(/\s+/)
    .map((p) => p[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
const dateOf = (iso: string): string => {
  const at = Date.parse(iso)
  return Number.isNaN(at) ? '' : new Date(at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

const load = async (): Promise<void> => {
  detail.value = await window.api.getTicketDetail(props.ticketKey)
}
const post = async (): Promise<void> => {
  isPosting.value = true
  postError.value = null
  try {
    const result = await window.api.postJiraComment(props.ticketKey, comment.value.trim())
    postError.value = result.error
    if (!result.error) {
      comment.value = ''
      isConfirming.value = false
      isPreview.value = false
      await load()
    }
  } finally {
    isPosting.value = false
  }
}
const openJira = (): void => window.api.openTicket(props.ticketKey)
const openMr = (): void => window.api.openMr(props.ticketKey)

onMounted(load)
watch(() => props.status, load)
</script>

<template>
  <div class="tp">
    <div class="main">
      <p v-if="detail === undefined" class="muted">Loading the ticket from Jira…</p>
      <p v-else-if="detail === null" class="muted">Could not load the ticket. Check the Jira token in Settings.</p>
      <template v-else>
        <h3>Description</h3>
        <JiraText v-if="detail.description" :text="detail.description" />
        <p v-else class="muted">No description.</p>

        <template v-if="detail.attachments.length">
          <h3>Attachments</h3>
          <div class="atts">
            <a v-for="a in detail.attachments" :key="a.url" class="att" :href="a.url" target="_blank">{{ a.name }}</a>
          </div>
        </template>

        <h3>Comments <span class="count">{{ detail.comments.length }}</span></h3>
        <div v-for="(c, i) in detail.comments" :key="i" class="comment">
          <span class="avatar">{{ initials(c.author) }}</span>
          <div class="cbody">
            <div class="chead"><b>{{ c.author }}</b><span>{{ dateOf(c.created) }}</span></div>
            <JiraText :text="c.body" />
          </div>
        </div>

        <div class="composer">
          <div class="ctabs">
            <button :class="{ on: !isPreview }" @click="isPreview = false">Write</button>
            <button :class="{ on: isPreview }" :disabled="!comment.trim()" @click="isPreview = true">Preview</button>
          </div>
          <textarea
            v-if="!isPreview"
            v-model="comment"
            rows="4"
            placeholder="Ask the reporter to clarify something. Jira markup works: *bold*, * list, {{code}}"
          />
          <div v-else class="preview"><JiraText :text="comment" /></div>
          <div v-if="isConfirming" class="confirm">
            Post this comment on <b>{{ ticketKey }}</b>? The reporter and everyone on the ticket will see it.
          </div>
          <div v-if="postError" class="warn">{{ postError }}</div>
          <div class="cact">
            <template v-if="!isConfirming">
              <button class="btn primary" :disabled="!comment.trim()" @click="isConfirming = true">Comment</button>
            </template>
            <template v-else>
              <button class="btn" :disabled="isPosting" @click="isConfirming = false">Back</button>
              <button class="btn primary" :disabled="isPosting" @click="post">{{ isPosting ? 'Posting…' : 'Post to Jira' }}</button>
            </template>
          </div>
        </div>
      </template>
    </div>

    <aside class="side">
      <div class="field">
        <span>Status</span>
        <StatusMenu :ticket-key="ticketKey" :status="status" :color="isFromJira ? lane.color : '#737373'" :is-from-jira="isFromJira" />
      </div>
      <template v-if="detail">
        <div class="field">
          <span>Reporter</span>
          <b v-if="detail.reporter" class="person"><i>{{ initials(detail.reporter) }}</i>{{ detail.reporter }}</b>
        </div>
        <div class="field">
          <span>Assignee</span>
          <b v-if="detail.assignee" class="person"><i>{{ initials(detail.assignee) }}</i>{{ detail.assignee }}</b>
          <b v-else class="dim">Unassigned</b>
        </div>
        <div class="field"><span>Type</span><b>{{ detail.type }}</b></div>
        <div class="field"><span>Priority</span><b>{{ detail.priority }}</b></div>
        <div v-if="detail.labels.length" class="field">
          <span>Labels</span>
          <div class="chips"><em v-for="l in detail.labels" :key="l">{{ l }}</em></div>
        </div>
        <div v-if="detail.fixVersions.length" class="field">
          <span>Fix versions</span><b>{{ detail.fixVersions.join(', ') }}</b>
        </div>
        <div class="field"><span>Created</span><b class="dim">{{ dateOf(detail.created) }}</b></div>
        <div class="field"><span>Updated</span><b class="dim">{{ dateOf(detail.updated) }}</b></div>
      </template>
      <div class="actions">
        <button class="btn" @click="emit('testCases')">Test cases to Jira</button>
        <button class="btn" :disabled="!mrUrl" :title="mrUrl ?? 'No merge request for this ticket yet'" @click="openMr">
          Open merge request
        </button>
        <button class="btn" @click="openJira">Open in Jira</button>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.tp {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}
.main {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 18px 28px 40px;
}
.main > * {
  max-width: 820px;
}
h3 {
  margin: 22px 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
h3:first-child {
  margin-top: 0;
}
.count {
  font-weight: 400;
  color: var(--text-4);
}
.muted {
  color: var(--text-4);
}
.atts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.att {
  padding: 4px 10px;
  font-size: 12px;
  color: var(--text-2);
  text-decoration: none;
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 6px;
}
.att:hover {
  border-color: var(--accent);
}
.comment {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
}
.avatar,
.person i {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 28px;
  height: 28px;
  font: 600 11px var(--font-ui);
  font-style: normal;
  color: var(--on-accent);
  background: #7d9a83;
  border-radius: 50%;
}
.cbody {
  flex: 1;
  min-width: 0;
  padding: 10px 14px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 10px;
}
.chead {
  display: flex;
  gap: 10px;
  margin-bottom: 6px;
  font-size: 12px;
}
.chead b {
  color: var(--text);
}
.chead span {
  color: var(--text-4);
}
.composer {
  margin-top: 18px;
  padding: 12px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 10px;
}
.ctabs {
  display: flex;
  gap: 14px;
  margin-bottom: 8px;
}
.ctabs button {
  padding: 2px 0;
  font: 600 12px var(--font-ui);
  color: var(--text-3);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
}
.ctabs button.on {
  color: var(--text);
  border-bottom-color: var(--accent);
}
textarea {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  padding: 8px 10px;
  font: 13px var(--font-ui);
  line-height: 1.5;
  color: var(--text);
  background: var(--bg-0);
  border: 1px solid var(--line-2);
  border-radius: 8px;
  outline: none;
}
textarea:focus {
  border-color: var(--accent);
}
.preview {
  min-height: 80px;
  padding: 8px 10px;
  background: var(--bg-0);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.confirm {
  margin-top: 10px;
  font-size: 13px;
  color: var(--text-2);
}
.warn {
  margin-top: 8px;
  font-size: 12px;
  color: var(--warn);
}
.cact {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 10px;
}
.side {
  width: 290px;
  flex: none;
  overflow-y: auto;
  padding: 18px 18px 30px;
  border-left: 1px solid var(--line);
}
.field {
  display: grid;
  grid-template-columns: 90px 1fr;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 12px;
}
.field > span {
  color: var(--text-3);
}
.field b {
  font-weight: 500;
  color: var(--text);
}
.person {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.person i {
  width: 22px;
  height: 22px;
  font-size: 10px;
}
.dim {
  color: var(--text-3) !important;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.chips em {
  padding: 1px 8px;
  font-style: normal;
  font-size: 11px;
  color: var(--text-2);
  background: var(--bg-3);
  border-radius: 9px;
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 20px;
}
.btn {
  padding: 6px 12px;
  font: 12px var(--font-ui);
  color: var(--text-2);
  background: var(--line);
  border: 1px solid var(--line-2);
  border-radius: 7px;
  cursor: pointer;
}
.btn:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--accent);
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
</style>
