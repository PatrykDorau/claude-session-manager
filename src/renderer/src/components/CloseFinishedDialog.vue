<script setup lang="ts">
import { ref, computed } from 'vue'
import type { CloseCandidate } from '../types'

const props = defineProps<{ candidates: CloseCandidate[] }>()
const emit = defineEmits<{ close: [] }>()

const rows = [...props.candidates]
const checked = ref<string[]>(rows.map((r) => r.id))
const isClosing = ref(false)
const failed = ref<string[]>([])
const BADGE: Partial<Record<CloseCandidate['status'], string>> = {
  working: 'working',
  waiting: 'waiting for you'
}

const checkedCount = computed(() => checked.value.length)

const confirmClose = async (): Promise<void> => {
  isClosing.value = true
  try {
    failed.value = await window.api.closeSessions([...checked.value])
  } catch {
    failed.value = rows.filter((r) => checked.value.includes(r.id)).map((r) => r.ticket)
  } finally {
    isClosing.value = false
  }
  if (!failed.value.length) emit('close')
}
</script>

<template>
  <div class="modal" @click.self="emit('close')">
    <div class="dialog">
      <div class="dtitle">Close finished sessions</div>
      <ul class="rows">
        <li v-for="r in rows" :key="r.id">
          <label>
            <input v-model="checked" type="checkbox" :value="r.id" />
            <b>{{ r.ticket }}</b>
            <span class="rt">{{ r.title }}</span>
            <span v-if="BADGE[r.status]" class="badge">{{ BADGE[r.status] }}</span>
          </label>
          <div class="rp">{{ r.projectName }}</div>
        </li>
      </ul>
      <div v-if="failed.length" class="warn">Could not close: {{ failed.join(', ') }}</div>
      <div class="dbtns">
        <button class="db" :disabled="!checkedCount || isClosing" @click="confirmClose">
          Close {{ checkedCount }}
        </button>
        <button class="db ghost" @click="emit('close')">Cancel</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal {
  position: fixed;
  inset: 0;
  background: rgba(1, 4, 9, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 20;
}
.dialog {
  background: #161b22;
  border: 1px solid #30363d;
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
  max-height: 260px;
  overflow-y: auto;
}
.rows li {
  padding: 5px 6px;
  border-radius: 6px;
  font-size: 12px;
}
.rows li:hover {
  background: #21262d;
}
.rows label {
  display: flex;
  gap: 6px;
  align-items: baseline;
  cursor: pointer;
}
.rt {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  color: #c9d1d9;
}
.rp {
  margin-left: 20px;
  font-size: 10px;
  color: #7d8590;
}
.badge {
  flex: none;
  font-size: 10px;
  padding: 0 6px;
  border-radius: 8px;
  color: #d29922;
  border: 1px solid #d29922;
}
.warn {
  margin: 6px 0;
  font-size: 11px;
  color: #d29922;
}
.dbtns {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 10px;
}
.db {
  font: 11px system-ui;
  background: #8957e5;
  color: #fff;
  border: 1px solid #8957e5;
  border-radius: 6px;
  padding: 5px 12px;
  cursor: pointer;
}
.db:disabled {
  opacity: 0.5;
  cursor: default;
}
.db.ghost {
  background: none;
  color: #8b949e;
  border-color: #30363d;
}
.db.ghost:hover {
  color: #e6edf3;
}
</style>
