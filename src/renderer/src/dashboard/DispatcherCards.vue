<script setup lang="ts">
import { ref, watch } from 'vue'
import type { InboxItem } from '../types'
import { PERMISSION_KEYS, optionKey, type InboxRow } from './inbox'
import { ago } from '../display'
import Icon from './Icon.vue'

const props = defineProps<{ rows: InboxRow[] }>()
const emit = defineEmits<{ open: [row: InboxRow] }>()

interface CardOption {
  key: string
  label: string
}

const items = ref<Record<string, InboxItem | null>>({})
const errors = ref<Record<string, string>>({})
const loadedAt: Record<string, number> = {}

const loadItem = async (row: InboxRow): Promise<void> => {
  loadedAt[row.sessionId] = row.since
  const item = await window.api.getInboxItem(row.sessionId)
  if (loadedAt[row.sessionId] !== row.since) return
  items.value = { ...items.value, [row.sessionId]: item }
}
const isStale = (row: InboxRow): boolean => row.status === 'waiting' && loadedAt[row.sessionId] !== row.since
const loadStale = (rows: InboxRow[]): void => {
  for (const row of rows.filter(isStale)) void loadItem(row)
}
watch(() => props.rows, loadStale, { immediate: true })

const questionOf = (row: InboxRow): string => {
  const item = items.value[row.sessionId]
  return item?.question ?? item?.pendingTool?.input ?? ''
}
const toOption = (label: string, index: number): CardOption => ({ key: optionKey(index), label })
const optionsOf = (row: InboxRow): CardOption[] => {
  const item = items.value[row.sessionId]
  if (!item?.isWritable || !item.pendingTool) return []
  if (item.reason === 'question') return item.questionOptions.map(toOption)
  return [
    { key: PERMISSION_KEYS.yes, label: 'Yes' },
    { key: PERMISSION_KEYS.no, label: 'No' }
  ]
}
const answer = async (row: InboxRow, key: string): Promise<void> => {
  const toolUseId = items.value[row.sessionId]?.pendingTool?.toolUseId
  if (!toolUseId) return
  const result = await window.api.answerInbox(row.sessionId, toolUseId, key)
  errors.value = { ...errors.value, [row.sessionId]: result.error ?? '' }
  if (!result.error) items.value = { ...items.value, [row.sessionId]: null }
}
const dismiss = (row: InboxRow): void => window.api.dismissInbox(row.sessionId)
</script>

<template>
  <ul v-if="rows.length" class="cards">
    <li v-for="r in rows" :key="r.sessionId" class="card" :class="r.status">
      <div class="line">
        <Icon :name="r.status === 'waiting' ? 'bell' : 'check'" :size="12" class="mark" />
        <span class="label">{{ r.label }}</span>
        <span class="title" :title="r.title">{{ r.title }}</span>
        <span class="age">{{ ago(r.since) }}</span>
      </div>
      <p v-if="r.status === 'waiting' && questionOf(r)" class="question">{{ questionOf(r) }}</p>
      <div class="actions">
        <button v-for="o in optionsOf(r)" :key="o.key" class="opt" :title="o.label" @click="answer(r, o.key)">
          <b>{{ o.key }}</b>{{ o.label }}
        </button>
        <span class="grow" />
        <button class="link" @click="emit('open', r)">Open session</button>
        <button v-if="r.status === 'checkout'" class="link" title="Remove from the list" @click="dismiss(r)">Dismiss</button>
      </div>
      <p v-if="errors[r.sessionId]" class="error">{{ errors[r.sessionId] }}</p>
    </li>
  </ul>
</template>

<style scoped>
.cards {
  flex: none;
  max-height: 40%;
  overflow-y: auto;
  margin: 0;
  padding: 6px;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-bottom: 1px solid var(--line);
}
.card {
  padding: 6px 8px;
  border: 1px solid var(--line);
  border-left: 3px solid var(--line-2);
  border-radius: 6px;
  background: var(--bg-2);
}
.card.waiting {
  border-left-color: var(--warn);
}
.card.checkout {
  border-left-color: var(--accent);
}
.line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 12px;
}
.mark {
  flex: none;
  color: var(--text-4);
}
.waiting .mark {
  color: var(--warn);
}
.label {
  flex: none;
  font: 600 12px var(--font-mono);
  color: var(--accent);
}
.title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-2);
}
.age {
  flex: none;
  font-size: 11px;
  color: var(--text-4);
}
.question {
  margin: 4px 0 0 20px;
  font-size: 12px;
  color: var(--text);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 4px 0 0 20px;
}
.opt {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 2px 8px;
  border: 1px solid var(--line-2);
  border-radius: 5px;
  background: var(--bg-1);
  color: var(--text);
  font: 12px var(--font-ui);
  cursor: pointer;
}
.opt b {
  margin-right: 5px;
  color: var(--text-4);
  font-family: var(--font-mono);
}
.opt:hover {
  border-color: var(--accent);
}
.grow {
  flex: 1;
}
.link {
  padding: 0;
  border: none;
  background: none;
  color: var(--text-3);
  font: 12px var(--font-ui);
  cursor: pointer;
}
.link:hover {
  color: var(--accent);
}
.error {
  margin: 4px 0 0 20px;
  font-size: 11px;
  color: var(--warn);
}
</style>
