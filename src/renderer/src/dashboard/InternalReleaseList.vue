<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { TaskRow } from '../taskview'
import type { InternalReleaseRow, ReleaseCheck, ReleaseResult } from '../types'
import { internalReleaseCandidates, preselectedKeys } from './internalrelease'
import Icon from './Icon.vue'

const props = defineProps<{ rows: TaskRow[] }>()
const emit = defineEmits<{ select: [key: string] }>()

const releaseRows = ref<InternalReleaseRow[]>([])
const selected = ref<string[]>([])
const results = ref<ReleaseResult[]>([])
const isChecking = ref(false)
const isMoving = ref(false)

const toKeyStatus = (c: { key: string; status: string }): string => `${c.key}:${c.status}`
const toIsBusy = (): boolean => isChecking.value || isMoving.value
const isBusy = computed(toIsBusy)
const toCandidateSignature = (): string =>
  internalReleaseCandidates(props.rows)
    .map(toKeyStatus)
    .join('|')
const candidateSignature = computed(toCandidateSignature)

const isGitlabTokenMissing = ref(false)
let checkSequence = 0

const check = async (): Promise<void> => {
  const sequence = ++checkSequence
  isGitlabTokenMissing.value = !window.api.getSettings().gitlabToken.trim()
  isChecking.value = true
  try {
    const checked = await window.api.checkInternalRelease(internalReleaseCandidates(props.rows))
    if (sequence !== checkSequence) return
    releaseRows.value = checked
    selected.value = preselectedKeys(checked)
  } finally {
    if (sequence === checkSequence) isChecking.value = false
  }
}

const moveSelected = async (): Promise<void> => {
  isMoving.value = true
  try {
    results.value = await window.api.runInternalRelease([...selected.value])
  } finally {
    isMoving.value = false
  }
  await check()
}

const isSelected = (key: string): boolean => selected.value.includes(key)
const toggle = (key: string, isChecked: boolean): void => {
  const isOther = (k: string): boolean => k !== key
  selected.value = isChecked ? [...selected.value.filter(isOther), key] : selected.value.filter(isOther)
}
const openMr = (url: string): void => {
  window.open(url, '_blank')
}
const resultText = (r: ReleaseResult): string => (r.error ? `${r.key}: failed: ${r.error}` : `${r.key}: moved (${r.done.join(', ')})`)
const pipelineText = (c: ReleaseCheck): string => {
  if (c.mr.state === 'opened') return 'MR still open'
  return c.pipeline ? `pipeline ${c.pipeline.status}` : 'no pipeline'
}
const transitionText = (r: InternalReleaseRow): string => (r.transition ? `can move to ${r.transition}` : 'no transition to Internal release')

watch(candidateSignature, check, { immediate: true })
</script>

<template>
  <div class="head">
    <button class="all" :disabled="!selected.length || isBusy" @click="moveSelected">Move to Internal release ({{ selected.length }})</button>
    <button class="refresh" title="Check pipelines and transitions again" :disabled="isBusy" @click="check"><Icon name="refresh" :size="14" /></button>
  </div>
  <div v-for="r in results" :key="r.key" class="note" :class="{ err: r.error }">{{ resultText(r) }}</div>
  <div v-if="isChecking" class="note">Checking…</div>
  <div v-else-if="isGitlabTokenMissing" class="note">Add a GitLab token in Settings</div>
  <div v-else-if="!releaseRows.length" class="note">No tickets waiting for internal release</div>
  <article v-for="r in releaseRows" :key="r.key" class="tile">
    <div class="top">
      <input type="checkbox" :checked="isSelected(r.key)" :disabled="isBusy" @change="toggle(r.key, ($event.target as HTMLInputElement).checked)" />
      <button class="key" @click="emit('select', r.key)">{{ r.key }}</button>
      <span class="chip" :class="{ ok: r.transition }">{{ transitionText(r) }}</span>
    </div>
    <p class="summary">{{ r.summary }}</p>
    <div v-for="c in r.checks" :key="c.mr.iid" class="check">
      <button class="mr" @click="openMr(c.mr.url)">!{{ c.mr.iid }}</button>
      <span>{{ pipelineText(c) }}</span>
    </div>
    <p v-if="!r.checks.length" class="blocker">no merge request</p>
  </article>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 2px 8px;
}
.all {
  padding: 3px 10px;
  font: 600 12px var(--font-ui);
  color: var(--text-1);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 6px;
  cursor: pointer;
}
.all:disabled,
.refresh:disabled {
  opacity: 0.5;
  cursor: default;
}
.refresh {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  margin-left: auto;
  color: var(--text-4);
  background: none;
  border: none;
  cursor: pointer;
}
.note {
  padding: 8px 10px;
  color: var(--text-3);
  font: 12px var(--font-ui);
}
.note.err {
  color: var(--warn);
}
.tile {
  margin: 0 2px 6px;
  padding: 10px 14px 9px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 9px;
}
.top {
  display: flex;
  gap: 8px;
  align-items: center;
}
.key,
.mr {
  padding: 0;
  font: 12px var(--font-mono);
  color: var(--accent);
  background: none;
  border: none;
  cursor: pointer;
}
.chip {
  padding: 0 7px;
  font: 11px/18px var(--font-ui);
  color: var(--text-4);
  border: 1px solid var(--line);
  border-radius: 9px;
}
.chip.ok {
  color: var(--ok);
  border-color: var(--ok);
}
.summary {
  margin: 6px 0;
  font: 13px var(--font-ui);
  color: var(--text-1);
}
.check {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font: 11px var(--font-ui);
  color: var(--text-3);
}
.blocker {
  margin: 4px 0 0;
  font: 11px var(--font-ui);
  color: var(--text-4);
}
</style>
