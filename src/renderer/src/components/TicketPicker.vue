<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import type { Session } from '../types'

const props = defineProps<{ session: Session }>()
const emit = defineEmits<{ close: [] }>()

const candidates = ref<{ ticket: string; branch: string }[]>([])
const query = ref(props.session.ticket ?? '')
const verifying = ref(false)
const verified = ref<{ configured: boolean; status: string | null; code: string | null } | null>(
  null
)

onMounted(async () => {
  candidates.value = await window.api.listBranchTickets(props.session.projectPath)
})

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return candidates.value
  return candidates.value.filter(
    (c) => c.ticket.toLowerCase().includes(q) || c.branch.toLowerCase().includes(q)
  )
})

const typedCode = computed(() => verified.value?.code ?? null)

let timer: ReturnType<typeof setTimeout> | null = null
watch(query, (q) => {
  verified.value = null
  if (timer) clearTimeout(timer)
  if (!q.trim()) return
  timer = setTimeout(async () => {
    verifying.value = true
    verified.value = await window.api.verifyTicket(q.trim())
    verifying.value = false
  }, 400)
})

const save = (value: string | null): void => {
  window.api.setTicket(props.session.id, value)
  emit('close')
}
</script>

<template>
  <div class="modal" @click.self="emit('close')">
    <div class="dialog">
      <div class="dtitle">Set ticket</div>
      <input
        v-model="query"
        class="tinput"
        placeholder="Ticket code, Jira URL, or filter branches"
      />
      <div v-if="query.trim()" class="verify">
        <span v-if="verifying" class="muted">Checking…</span>
        <span v-else-if="verified?.configured && verified.status"
          >✓ {{ typedCode }} — {{ verified.status }}</span
        >
        <span v-else-if="verified?.configured && verified.code" class="warn"
          >? {{ typedCode }} — not found in Jira</span
        >
        <span v-else-if="verified?.code" class="muted"
          >{{ typedCode }} — unverified (no Jira token)</span
        >
        <span v-else class="muted">No ticket code recognized</span>
      </div>
      <ul class="cands">
        <li v-for="c in filtered" :key="c.branch" @click="save(c.ticket)">
          <b>{{ c.ticket }}</b><span class="cb">{{ c.branch }}</span>
        </li>
        <li v-if="!filtered.length" class="empty muted">No matching branches</li>
      </ul>
      <div class="dbtns">
        <button class="db" :disabled="!typedCode" @click="save(typedCode)">Save</button>
        <button class="db ghost" @click="save('')">Not a task</button>
        <button v-if="session.manualTicket" class="db ghost" @click="save(null)">Reset to auto</button>
        <button class="db ghost" @click="emit('close')">Cancel</button>
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
.dbtns {
  display: flex;
  flex-wrap: wrap;
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
  padding: 5px 12px;
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
.tinput {
  width: 100%;
  box-sizing: border-box;
  background: #1b1b1b;
  border: 1px solid #3a3a3a;
  border-radius: 6px;
  color: #ededed;
  padding: 6px 8px;
  font: 12px system-ui;
}
.verify {
  margin: 6px 0;
  font-size: 11px;
}
.warn {
  color: #d29922;
}
.muted {
  color: #8c8c8c;
}
.cands {
  list-style: none;
  margin: 6px 0;
  padding: 0;
  max-height: 180px;
  overflow-y: auto;
}
.cands li {
  display: flex;
  gap: 8px;
  align-items: baseline;
  padding: 5px 6px;
  border-radius: 6px;
  cursor: pointer;
}
.cands li:hover {
  background: #2b2b2b;
}
.cands .empty {
  cursor: default;
}
.cb {
  color: #8c8c8c;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
