<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { WorktreeEntry, WorktreeStatus } from '../types'

const emit = defineEmits<{ close: [] }>()

interface Pending {
  path: string
  branch: string
  isDirty: boolean
  unpushed: number
  liveSessions: number
}

interface BulkItem extends Pending {
  name: string
  repo: string
}

const rows = ref<WorktreeEntry[]>([])
const isLoading = ref(true)
const statuses = ref<Record<string, WorktreeStatus | null>>({})
const selected = ref<string[]>([])
const bulk = ref<BulkItem[] | null>(null)
const isBulkChecking = ref(false)
const removed = ref<string[]>([])
const errors = ref<Record<string, string>>({})
const checking = ref<string | null>(null)
const deleting = ref<string | null>(null)
const pending = ref<Pending | null>(null)
const footer = ref<string | null>(null)

const isNotRemoved = (r: WorktreeEntry): boolean => !removed.value.includes(r.path)
const toVisibleRows = (): WorktreeEntry[] => rows.value.filter(isNotRemoved)
const visibleRows = computed(toVisibleRows)
const isRisky = computed(() => !!pending.value && (pending.value.isDirty || pending.value.unpushed > 0))
const isItemRisky = (b: BulkItem): boolean => b.isDirty || b.unpushed > 0
const toIsBulkRisky = (): boolean => !!bulk.value?.some(isItemRisky)
const isBulkRisky = computed(toIsBulkRisky)
const isRowFinished = (r: WorktreeEntry): boolean => !!statuses.value[r.path]?.isFinished
const toPath = (r: WorktreeEntry): string => r.path
const toFinishedPaths = (): string[] => visibleRows.value.filter(isRowFinished).map(toPath)
const finishedPaths = computed(toFinishedPaths)
const toIsBusy = (): boolean => !!deleting.value || !!checking.value || isBulkChecking.value
const isBusy = computed(toIsBusy)
const unselect = (path: string): void => {
  const isOtherPath = (p: string): boolean => p !== path
  selected.value = selected.value.filter(isOtherPath)
}
const liveWarning = (count: number): string => `${count} live ${count === 1 ? 'session' : 'sessions'} will be closed`

const loadStatus = async (path: string): Promise<void> => {
  try {
    const status = await window.api.worktreeStatus(path)
    statuses.value = { ...statuses.value, [path]: status }
  } catch {
    statuses.value = { ...statuses.value, [path]: null }
  }
}

const loadRows = async (): Promise<void> => {
  try {
    rows.value = await window.api.listWorktrees()
  } catch (e) {
    footer.value = String(e)
  } finally {
    isLoading.value = false
  }
  for (const r of rows.value) void loadStatus(r.path)
}

onMounted(loadRows)

const mrLabel = (status: WorktreeStatus): string => (status.mrState ? `MR ${status.mrState}` : 'MR ?')

const openRow = (row: WorktreeEntry): void => window.api.openWorktree(row.path)

const askBulk = async (paths: string[]): Promise<void> => {
  const isTarget = (r: WorktreeEntry): boolean => paths.includes(r.path)
  const targets = visibleRows.value.filter(isTarget)
  if (!targets.length) return
  isBulkChecking.value = true
  footer.value = null
  pending.value = null
  const items: BulkItem[] = []
  for (const row of targets) {
    try {
      const info = await window.api.checkWorktree(row.path)
      items.push({ path: row.path, name: row.name, repo: row.repo, ...info })
    } catch (e) {
      errors.value = { ...errors.value, [row.path]: String(e) }
    }
  }
  isBulkChecking.value = false
  bulk.value = items.length ? items : null
}

const selectFinished = (): void => {
  selected.value = [...finishedPaths.value]
  void askBulk(selected.value)
}

const confirmBulk = async (): Promise<void> => {
  if (!bulk.value) return
  const items = bulk.value
  bulk.value = null
  const notices: string[] = []
  for (const item of items) {
    deleting.value = item.path
    errors.value = { ...errors.value, [item.path]: '' }
    try {
      const result = await window.api.deleteWorktree(item.path, item.branch)
      if (result.error) errors.value = { ...errors.value, [item.path]: result.error }
      else {
        removed.value = [...removed.value, item.path]
        unselect(item.path)
      }
      if (result.notice) notices.push(result.notice)
    } catch (e) {
      errors.value = { ...errors.value, [item.path]: String(e) }
    }
  }
  deleting.value = null
  footer.value = notices.length ? notices.join('; ') : null
}

const askDelete = async (row: WorktreeEntry): Promise<void> => {
  checking.value = row.path
  footer.value = null
  bulk.value = null
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
    else {
      removed.value = [...removed.value, path]
      unselect(path)
    }
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
            <input v-model="selected" type="checkbox" :value="r.path" :disabled="isBusy || !!bulk" />
            <span class="repo">{{ r.repo }} /</span>
            <b>{{ r.name }}</b>
            <span v-if="r.isLive" class="badge live">live</span>
            <template v-if="statuses[r.path]">
              <span class="badge" :class="{ done: statuses[r.path]?.mrState === 'merged' }">{{ mrLabel(statuses[r.path]!) }}</span>
              <span v-if="statuses[r.path]?.jiraStatus" class="badge">{{ statuses[r.path]?.jiraStatus }}</span>
              <span v-if="statuses[r.path]?.uncommitted" class="badge">{{ statuses[r.path]?.uncommitted }} uncommitted</span>
              <span v-if="statuses[r.path]?.unpushed" class="badge">{{ statuses[r.path]?.unpushed }} unpushed</span>
              <span v-if="statuses[r.path]?.isFinished" class="badge done">finished</span>
            </template>
            <span v-else-if="statuses[r.path] === null" class="muted">status unavailable</span>
            <span v-else class="muted">…</span>
          </div>
          <div class="meta">{{ r.branch ?? 'no branch' }} · {{ r.sessionCount }} {{ r.sessionCount === 1 ? 'session' : 'sessions' }}</div>
          <div v-if="pending?.path === r.path" class="confirm">
            <div>Delete worktree {{ r.name }}{{ pending.branch ? ` and branch ${pending.branch}` : '' }}?</div>
            <div v-if="pending.isDirty" class="warn">Uncommitted changes will be lost</div>
            <div v-if="pending.unpushed" class="warn">{{ pending.unpushed }} unpushed {{ pending.unpushed === 1 ? 'commit' : 'commits' }} will be lost</div>
            <div v-if="pending.liveSessions" class="warn">{{ liveWarning(pending.liveSessions) }}</div>
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
              <button v-if="r.sessionCount" class="db ghost" @click="openRow(r)">Open</button>
              <button class="db ghost" :disabled="isBusy" @click="askDelete(r)">
                Delete
              </button>
            </template>
          </div>
          <div v-if="errors[r.path]" class="warn">{{ errors[r.path] }}</div>
        </li>
        <li v-if="isLoading" class="muted">Loading…</li>
        <li v-else-if="!visibleRows.length" class="muted">No worktrees</li>
      </ul>
      <div v-if="bulk" class="confirm">
        <div>Delete {{ bulk.length }} {{ bulk.length === 1 ? 'worktree' : 'worktrees' }}?</div>
        <ul class="bulk">
          <li v-for="b in bulk" :key="b.path">
            <span class="repo">{{ b.repo }} /</span> {{ b.name }}{{ b.branch ? ` and branch ${b.branch}` : '' }}
            <div v-if="b.isDirty" class="warn">Uncommitted changes will be lost</div>
            <div v-if="b.unpushed" class="warn">{{ b.unpushed }} unpushed {{ b.unpushed === 1 ? 'commit' : 'commits' }} will be lost</div>
            <div v-if="b.liveSessions" class="warn">{{ liveWarning(b.liveSessions) }}</div>
          </li>
        </ul>
        <div class="rbtns">
          <button class="db" :class="{ danger: isBulkRisky }" @click="confirmBulk">
            {{ isBulkRisky ? 'Delete anyway' : 'Delete' }}
          </button>
          <button class="db ghost" @click="bulk = null">Cancel</button>
        </div>
      </div>
      <div v-if="isBulkChecking" class="muted">Checking…</div>
      <div v-if="footer" class="warn">{{ footer }}</div>
      <div class="dbtns">
        <button class="db ghost" :disabled="isBusy || !!bulk || !finishedPaths.length" @click="selectFinished">
          Delete finished{{ finishedPaths.length ? ` (${finishedPaths.length})` : '' }}
        </button>
        <button class="db ghost" :disabled="isBusy || !!bulk || !selected.length" @click="askBulk(selected)">
          Delete selected{{ selected.length ? ` (${selected.length})` : '' }}
        </button>
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
  max-width: 460px;
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
.badge.live,
.badge.done {
  color: #3fb950;
  border-color: #3fb950;
}
.bulk {
  list-style: none;
  margin: 4px 0;
  padding: 0;
  max-height: 160px;
  overflow-y: auto;
  font-size: 11px;
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
