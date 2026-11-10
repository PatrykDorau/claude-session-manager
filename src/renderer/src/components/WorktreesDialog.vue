<script setup lang="ts">
import { ref, computed } from 'vue'
import type { WorktreeRow } from '../types'

const props = defineProps<{ rows: WorktreeRow[] }>()
const emit = defineEmits<{ close: [] }>()

interface Pending {
  path: string
  branch: string
  isDirty: boolean
  unpushed: number
}

const removed = ref<string[]>([])
const errors = ref<Record<string, string>>({})
const checking = ref<string | null>(null)
const deleting = ref<string | null>(null)
const pending = ref<Pending | null>(null)
const footer = ref<string | null>(null)

const visibleRows = computed(() => props.rows.filter((r) => !removed.value.includes(r.path)))
const isRisky = computed(() => !!pending.value && (pending.value.isDirty || pending.value.unpushed > 0))

const openRow = (row: WorktreeRow): void => window.api.openWorktree(row.path)

const askDelete = async (row: WorktreeRow): Promise<void> => {
  checking.value = row.path
  footer.value = null
  errors.value = { ...errors.value, [row.path]: '' }
  try {
    const info = await window.api.checkWorktree(row.path)
    pending.value = { path: row.path, ...info }
  } catch (e) {
    errors.value = { ...errors.value, [row.path]: String(e) }
  } finally {
    checking.value = null
  }
}

const confirmDelete = async (): Promise<void> => {
  if (!pending.value) return
  const { path, branch } = pending.value
  pending.value = null
  deleting.value = path
  try {
    const result = await window.api.deleteWorktree(path, branch)
    if (result.error) errors.value = { ...errors.value, [path]: result.error }
    else removed.value = [...removed.value, path]
    footer.value = result.notice
  } catch (e) {
    errors.value = { ...errors.value, [path]: String(e) }
  } finally {
    deleting.value = null
  }
}
</script>

<template>
  <div class="modal" @click.self="!deleting && emit('close')">
    <div class="dialog">
      <div class="dtitle">Worktrees</div>
      <ul class="rows">
        <li v-for="r in visibleRows" :key="r.path">
          <div class="head">
            <span class="repo">{{ r.repo }} /</span>
            <b>{{ r.name }}</b>
            <span v-if="r.isLive" class="badge live">live</span>
            <span v-if="r.isDirty" class="badge">uncommitted changes</span>
          </div>
          <div class="meta">{{ r.branch ?? 'no branch' }} · {{ r.sessionCount }} {{ r.sessionCount === 1 ? 'session' : 'sessions' }}</div>
          <div v-if="pending?.path === r.path" class="confirm">
            <div>Delete worktree {{ r.name }}{{ pending.branch ? ` and branch ${pending.branch}` : '' }}?</div>
            <div v-if="pending.isDirty" class="warn">Uncommitted changes will be lost</div>
            <div v-if="pending.unpushed" class="warn">{{ pending.unpushed }} unpushed {{ pending.unpushed === 1 ? 'commit' : 'commits' }} will be lost</div>
            <div class="rbtns">
              <button class="db" :class="{ danger: isRisky }" @click="confirmDelete">
                {{ isRisky ? 'Delete anyway' : 'Delete' }}
              </button>
              <button class="db ghost" @click="pending = null">Cancel</button>
            </div>
          </div>
          <div v-else class="rbtns">
            <span v-if="checking === r.path" class="muted">Checking…</span>
            <span v-else-if="deleting === r.path" class="muted">Deleting…</span>
            <template v-else>
              <button class="db ghost" @click="openRow(r)">Open</button>
              <button class="db ghost" :disabled="!!deleting || !!checking" @click="askDelete(r)">
                Delete
              </button>
            </template>
          </div>
          <div v-if="errors[r.path]" class="warn">{{ errors[r.path] }}</div>
        </li>
        <li v-if="!visibleRows.length" class="muted">No worktrees</li>
      </ul>
      <div v-if="footer" class="warn">{{ footer }}</div>
      <div class="dbtns">
        <button class="db ghost" :disabled="!!deleting" @click="emit('close')">Close</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 20;
}
.dialog {
  background: #232323;
  border: 1px solid #3a3a3a;
  border-radius: 10px;
  padding: 14px;
  width: 100%;
  max-width: 320px;
}
.dtitle {
  font-weight: 600;
  margin-bottom: 6px;
}
.rows {
  list-style: none;
  margin: 6px 0;
  padding: 0;
  max-height: 360px;
  overflow-y: auto;
}
.rows li {
  padding: 6px;
  border-radius: 6px;
  font-size: 12px;
}
.rows li:hover {
  background: #2b2b2b;
}
.head {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: baseline;
}
.repo {
  color: #8c8c8c;
}
.meta {
  font-size: 10px;
  color: #8c8c8c;
  overflow-wrap: anywhere;
}
.badge {
  font-size: 10px;
  padding: 0 6px;
  border-radius: 8px;
  color: #d29922;
  border: 1px solid #d29922;
}
.badge.live {
  color: #3fb950;
  border-color: #3fb950;
}
.confirm {
  margin-top: 6px;
  padding: 6px;
  border: 1px solid #3a3a3a;
  border-radius: 6px;
}
.rbtns {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 4px;
}
.warn {
  margin-top: 4px;
  font-size: 11px;
  color: #d29922;
  overflow-wrap: anywhere;
}
.muted {
  color: #8c8c8c;
  font-size: 11px;
}
.dbtns {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 10px;
}
.db {
  font: 11px system-ui;
  background: #00e62e;
  color: #111111;
  border: 1px solid #00e62e;
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
}
.db.danger {
  background: #da3633;
  border-color: #da3633;
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
