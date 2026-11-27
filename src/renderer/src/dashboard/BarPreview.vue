<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Job } from '../../../main/orchestrator'
import type { Session } from '../types'
import type { CoordinatorBar } from './coordinator'
import { renderMarkdown } from './mrhtml'
import CodeView from './CodeView.vue'

type PreviewTab = 'log' | 'files' | 'changes'

const props = defineProps<{ bar: CoordinatorBar; job: Job | null; session: Session | null }>()
const emit = defineEmits<{ 'open-task': [session: Session]; open: [job: Job]; close: [] }>()

const TABS: { key: PreviewTab; label: string }[] = [
  { key: 'log', label: 'Log' },
  { key: 'files', label: 'Files' },
  { key: 'changes', label: 'Changes' }
]

const tab = ref<PreviewTab>('log')
const media = ref<{ name: string; kind: 'video' | 'image' }[]>([])
const docs = ref<{ name: string; html: string }[]>([])

const fileKey = computed(() => props.session?.ticket ?? props.bar.key)
const logLines = computed(() => props.job?.log ?? [])
const formatTime = (at: number): string => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const isEmpty = computed(() => !media.value.length && !docs.value.length)
const isOpenable = computed(() => !!props.session || !!props.job)

const toDoc = (doc: { name: string; text: string }): { name: string; html: string } => ({ name: doc.name, html: renderMarkdown(doc.text, '', 0) })
const loadFiles = async (): Promise<void> => {
  const key = fileKey.value
  const [files, texts] = await Promise.all([window.api.getTaskFiles(key), window.api.getTaskDocs(key)])
  if (key !== fileKey.value) return
  media.value = files ?? []
  docs.value = (texts ?? []).map(toDoc)
}
const selectTab = (next: PreviewTab): void => {
  tab.value = next
}
const openFile = (name: string): void => window.api.openTaskFile(fileKey.value, name)
const openSession = (): void => {
  if (props.session) emit('open-task', props.session)
  else if (props.job) emit('open', props.job)
}
const closePreview = (): void => emit('close')
const barId = (): string => props.bar.id
const resetTab = (): void => {
  tab.value = 'log'
}
watch(barId, resetTab)
const tabAndKey = (): [PreviewTab, string] => [tab.value, fileKey.value]
const reloadFiles = (): void => {
  if (tab.value === 'files') void loadFiles()
}
watch(tabAndKey, reloadFiles, { immediate: true })
</script>

<template>
  <aside class="preview">
    <header class="head">
      <b class="key">{{ bar.key }}</b>
      <span class="title" :title="bar.title">{{ bar.title }}</span>
      <button v-if="isOpenable" class="btn" @click="openSession">Open session</button>
      <button class="btn ghost" title="Close the preview" @click="closePreview">×</button>
    </header>
    <nav class="tabs">
      <button v-for="t in TABS" :key="t.key" :class="{ on: tab === t.key }" @click="selectTab(t.key)">{{ t.label }}</button>
    </nav>
    <div class="content">
      <div v-if="tab === 'log'" class="log">
        <p v-if="!logLines.length" class="note">No log. This session is not a job yet.</p>
        <div v-for="(line, i) in logLines" :key="`${line.at}:${i}`" class="event">
          <time>{{ formatTime(line.at) }}</time>
          <span>{{ line.text }}</span>
        </div>
      </div>
      <div v-else-if="tab === 'files'" class="files">
        <p v-if="isEmpty" class="note">No files in the task folder.</p>
        <section v-for="d in docs" :key="d.name" class="doc">
          <h4>{{ d.name }}</h4>
          <div class="md" v-html="d.html" />
        </section>
        <div v-for="f in media" :key="f.name" class="media">
          <span>{{ f.kind === 'video' ? '▶' : '▣' }} {{ f.name }}</span>
          <button class="btn" @click="openFile(f.name)">Open</button>
        </div>
      </div>
      <CodeView
        v-else-if="session?.projectPath"
        :key="session.id"
        :cwd="session.projectPath"
        :ticket-key="bar.key"
        :ticket-title="bar.title"
        :can-ask="false"
        :source-session-id="null"
      />
      <p v-else class="note">No session with a project folder.</p>
    </div>
  </aside>
</template>

<style scoped>
.preview {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-1);
  border-left: 1px solid var(--line);
}
.head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--line);
}
.key {
  font: 600 12px var(--font-mono);
  color: var(--text);
}
.title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
  text-overflow: ellipsis;
}
.btn {
  height: 24px;
  padding: 0 10px;
  font: 11px var(--font-ui);
  color: var(--text-2);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 5px;
  cursor: pointer;
}
.btn:hover {
  color: var(--text);
  border-color: var(--accent);
}
.btn.ghost {
  padding: 0 7px;
  background: none;
  border-color: transparent;
}
.tabs {
  flex: none;
  display: flex;
  gap: 2px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--line);
}
.tabs button {
  height: 24px;
  padding: 0 10px;
  font: 12px var(--font-ui);
  color: var(--text-3);
  background: none;
  border: 0;
  border-radius: 5px;
  cursor: pointer;
}
.tabs button.on {
  color: var(--text);
  background: var(--bg-3);
}
.content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}
.log,
.files {
  padding: 10px 12px;
}
.note {
  margin: 0;
  color: var(--text-4);
  font-size: 12px;
}
.event {
  display: flex;
  gap: 10px;
  padding: 2px 0;
  font-size: 12px;
  color: var(--text-2);
}
.event time {
  flex: none;
  font: 11px var(--font-mono);
  color: var(--text-4);
}
.doc h4 {
  margin: 0 0 6px;
  font: 600 12px var(--font-mono);
  color: var(--text-3);
}
.md {
  font-size: 12.5px;
  color: var(--text-2);
  overflow-wrap: anywhere;
}
.md :deep(pre) {
  overflow-x: auto;
}
.media {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 0;
  font-size: 12px;
  color: var(--text-2);
}
</style>
