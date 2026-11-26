<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { TaskRow } from '../taskview'
import type { ReleaseCheck, ReleaseDeploy, ReleaseResult, ReleaseRow, ReleaseStage } from '../types'
import { releaseCandidates, isReleasableRow } from './release'
import Icon from './Icon.vue'

const props = defineProps<{ rows: TaskRow[] }>()
const emit = defineEmits<{ select: [key: string] }>()

const STAGE_LABEL: Record<ReleaseStage, string> = { ready: 'Ready', unfinished: 'Release unfinished', waiting: 'Waiting' }

const releaseRows = ref<ReleaseRow[]>([])
const results = ref<ReleaseResult[]>([])
const isChecking = ref(false)
const isReleasing = ref(false)

const toKeyStatus = (c: { key: string; status: string }): string => `${c.key}:${c.status}`
const toReleasable = ():ReleaseRow[] => releaseRows.value.filter(isReleasableRow)
const releasable = computed(toReleasable)
const toIsBusy = (): boolean => isChecking.value || isReleasing.value
const isBusy = computed(toIsBusy)
const toCandidateSignature = (): string =>
  releaseCandidates(props.rows)
    .map(toKeyStatus)
    .join('|')
const candidateSignature = computed(toCandidateSignature)

const check = async (): Promise<void> => {
  isChecking.value = true
  try {
    releaseRows.value = await window.api.checkRelease(releaseCandidates(props.rows))
  } finally {
    isChecking.value = false
  }
}

const release = async (keys: string[]): Promise<void> => {
  isReleasing.value = true
  try {
    results.value = await window.api.runRelease(keys)
  } finally {
    isReleasing.value = false
  }
  await check()
}

const releaseOne = (key: string): Promise<void> => release([key])
const toKey = (r: ReleaseRow): string => r.key
const releaseAll = (): Promise<void> => release(releasable.value.map(toKey))
const openMr = (url: string): void => {
  window.open(url, '_blank')
}
const resultText = (r: ReleaseResult): string => (r.error ? `${r.key}: ${r.error}` : `${r.key}: done (${r.done.join(', ')})`)
const deployText = (d: ReleaseDeploy): string => `${d.environment} ${d.status}`
const deploysText = (c: ReleaseCheck): string => {
  if (c.deploys === null) return 'deploys unknown'
  return c.deploys.length ? c.deploys.map(deployText).join(', ') : 'no deploy'
}
const pipelineText = (c: ReleaseCheck): string => (c.pipeline ? `pipeline ${c.pipeline.status}` : 'no pipeline')

watch(candidateSignature, check, { immediate: true })
</script>

<template>
  <div class="head">
    <button class="all" :disabled="!releasable.length || isBusy" @click="releaseAll">Release all ready ({{ releasable.length }})</button>
    <button class="refresh" title="Check pipelines and deploys again" :disabled="isBusy" @click="check"><Icon name="refresh" :size="14" /></button>
  </div>
  <div v-for="r in results" :key="r.key" class="note" :class="{ err: r.error }">{{ resultText(r) }}</div>
  <div v-if="isChecking" class="note">Checking…</div>
  <div v-else-if="!releaseRows.length" class="note">No tickets waiting for internal release</div>
  <article v-for="r in releaseRows" :key="r.key" class="tile" :class="r.stage">
    <div class="top">
      <button class="key" @click="emit('select', r.key)">{{ r.key }}</button>
      <span class="chip" :class="r.stage">{{ STAGE_LABEL[r.stage] }}</span>
    </div>
    <p class="summary">{{ r.summary }}</p>
    <div v-for="c in r.checks" :key="c.mr.iid" class="check">
      <button class="mr" @click="openMr(c.mr.url)">!{{ c.mr.iid }}</button>
      <span>{{ pipelineText(c) }}</span>
      <span>{{ deploysText(c) }}</span>
    </div>
    <p v-for="b in r.blockers" :key="b" class="blocker">{{ b }}</p>
    <button v-if="isReleasableRow(r) && r.stage === 'ready'" class="act" :disabled="isBusy" @click="releaseOne(r.key)">Release</button>
    <button v-else-if="isReleasableRow(r) && r.stage === 'unfinished'" class="act" :disabled="isBusy" @click="releaseOne(r.key)">Finish release</button>
  </article>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 2px 8px;
}
.all,
.act {
  padding: 3px 10px;
  font: 600 12px var(--font-ui);
  color: var(--text-1);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 6px;
  cursor: pointer;
}
.all:disabled,
.act:disabled,
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
.chip.ready {
  color: var(--ok);
  border-color: var(--ok);
}
.chip.unfinished {
  color: var(--warn);
  border-color: var(--warn);
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
.act {
  margin-top: 8px;
}
</style>
