<script setup lang="ts">
import { ref } from 'vue'
import type { TaskRow } from '../taskview'
import { plainSession } from '../cards'

const props = defineProps<{ row: TaskRow; isBackgroundOnly?: boolean }>()
const emit = defineEmits<{ close: []; started: [sessionId: string | null] }>()

const repos = window.api.getTaskRepos()
const prefix = props.row.key.split('-')[0].toUpperCase()
const findSessionRoot = (): string | undefined => {
  const path = props.row.sessions[0]?.projectPath
  if (!path) return undefined
  const cut = path.search(/[\\/]\.claude[\\/]worktrees[\\/]/)
  const toKey = (p: string): string => p.toLowerCase().replace(/\\/g, '/')
  const root = toKey(cut >= 0 ? path.slice(0, cut) : path)
  return repos.roots.find((r) => toKey(r.path) === root)?.path
}
const repo = ref(findSessionRoot() ?? repos.byPrefix[prefix] ?? repos.roots[0]?.path ?? '')
const mode = ref<'vscode' | 'background'>(props.isBackgroundOnly ? 'background' : 'vscode')
const isStarting = ref(false)
const error = ref<string | null>(null)

const resumeLatest = (): void => {
  window.api.openSession(plainSession(props.row.sessions[0]))
  emit('close')
}

const start = async (): Promise<void> => {
  if (!repo.value || isStarting.value) return
  isStarting.value = true
  error.value = null
  let sessionId: string | null = null
  try {
    const result = await window.api.startTask(props.row.key, props.row.summary, repo.value, mode.value)
    error.value = result.error
    sessionId = result.sessionId ?? null
  } catch (e) {
    error.value = String(e)
  } finally {
    isStarting.value = false
  }
  if (error.value) return
  emit('started', sessionId)
  emit('close')
}
</script>

<template>
  <div class="pop" @click.stop>
    <label class="field">
      <span>Repo</span>
      <select v-model="repo" :disabled="isStarting">
        <option v-for="r in repos.roots" :key="r.path" :value="r.path">{{ r.name }}</option>
      </select>
    </label>
    <div v-if="!isBackgroundOnly" class="modes">
      <label><input v-model="mode" type="radio" value="vscode" :disabled="isStarting" /> VS Code</label>
      <label><input v-model="mode" type="radio" value="background" :disabled="isStarting" /> Background</label>
    </div>
    <div v-if="error" class="warn">{{ error }}</div>
    <div class="btns">
      <span v-if="isStarting" class="muted"><span class="spin" />{{ mode === 'vscode' ? 'Starting Claude and opening VS Code…' : 'Starting Claude in the background…' }}</span>
      <template v-else>
        <button v-if="row.sessions.length" class="db" @click="resumeLatest">Resume latest</button>
        <button class="db" :class="{ ghost: row.sessions.length }" :disabled="!repo" @click="start">
          {{ row.sessions.length ? 'New session' : 'Start' }}
        </button>
        <button class="db ghost" @click="emit('close')">Cancel</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.pop {
  margin: 4px 0 2px;
  padding: 8px;
  background: #1b1b1b;
  border: 1px solid #3a3a3a;
  border-radius: 6px;
  font-size: 11px;
}
.field {
  display: flex;
  gap: 6px;
  align-items: center;
}
.field select {
  flex: 1;
  background: #232323;
  color: #ededed;
  border: 1px solid #3a3a3a;
  border-radius: 4px;
  font: 11px system-ui;
  padding: 2px 4px;
}
.modes {
  display: flex;
  gap: 12px;
  margin-top: 6px;
  color: #d4d4d4;
}
.btns {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 8px;
}
.warn {
  margin-top: 6px;
  color: #d29922;
  overflow-wrap: anywhere;
}
.muted {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #8c8c8c;
}
.spin {
  width: 10px;
  height: 10px;
  border: 2px solid #3a3a3a;
  border-top-color: #00e62e;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.db {
  font: 11px system-ui;
  background: #00e62e;
  color: #111111;
  border: 1px solid #00e62e;
  border-radius: 6px;
  padding: 3px 10px;
  cursor: pointer;
}
.db:disabled {
  opacity: 0.5;
  cursor: default;
}
.db.ghost {
  background: none;
  color: #9a9a9a;
  border-color: #3a3a3a;
}
.db.ghost:hover {
  color: #ededed;
}
</style>
