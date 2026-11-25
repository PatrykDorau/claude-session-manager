<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Session } from '../types'
import { matchSessions, stageOf, type Identity } from './commandpanel'
import Icon from './Icon.vue'
import IdentityMark from './IdentityMark.vue'

const props = defineProps<{
  sessions: Session[]
  identityOf: (s: Session) => Identity
  textOf: (s: Session) => string[]
  labelOf: (s: Session) => string
  titleOf: (s: Session) => string
}>()
const emit = defineEmits<{ pick: [id: string]; close: [] }>()

const MAX_RESULTS = 8
const query = ref('')
const selected = ref(0)
const input = ref<HTMLInputElement | null>(null)
const list = ref<HTMLUListElement | null>(null)
const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
let isFocusRestored = true

const findResults = (): Session[] =>
  matchSessions(query.value, props.sessions, props.textOf).slice(0, MAX_RESULTS)
const results = computed(findResults)
const resetSelected = (): void => {
  selected.value = 0
}
watch(query, resetSelected)
const clampSelected = (next: Session[]): void => {
  selected.value = Math.max(0, Math.min(selected.value, next.length - 1))
}
watch(results, clampSelected)

const pick = (s: Session | undefined): void => {
  if (!s) return
  isFocusRestored = false
  emit('pick', s.id)
}
const close = (): void => emit('close')
const leave = (): void => {
  isFocusRestored = false
  close()
}
const showSelected = (): void => {
  list.value?.querySelector('.sel')?.scrollIntoView({ block: 'nearest' })
}
const onKey = (e: KeyboardEvent): void => {
  if (e.isComposing) return
  if (e.key === 'ArrowDown')
    selected.value = Math.max(0, Math.min(selected.value + 1, results.value.length - 1))
  else if (e.key === 'ArrowUp') selected.value = Math.max(selected.value - 1, 0)
  else if (e.key === 'Enter') pick(results.value[selected.value])
  else if (e.key === 'Escape') close()
  else return
  e.preventDefault()
  e.stopPropagation()
  void nextTick(showSelected)
}
const focusInput = (): void => input.value?.focus()
const restoreFocus = (): void => {
  if (isFocusRestored) previousFocus?.focus()
}
onMounted(focusInput)
onBeforeUnmount(restoreFocus)
</script>

<template>
  <div class="ssbox">
    <input
      ref="input"
      v-model="query"
      class="ssq"
      aria-label="Find a session"
      placeholder="Find a session: key, title, name, letter…"
      spellcheck="false"
      @keydown="onKey"
      @blur="leave"
    />
    <ul v-if="query.trim()" ref="list" class="sslist" role="listbox" aria-label="Matching sessions">
      <li
        v-for="(s, i) in results"
        :key="s.id"
        role="option"
        :aria-selected="i === selected"
        :class="{ sel: i === selected }"
        @mouseenter="selected = i"
        @mousedown.prevent
        @click="pick(s)"
      >
        <IdentityMark :identity="identityOf(s)" :size="18" />
        <span class="sskey">{{ labelOf(s) }}</span>
        <span class="sstitle" :title="titleOf(s)">{{ titleOf(s) }}</span>
        <span class="ssstage"
          ><Icon :name="stageOf(s).icon" :size="11" />{{ stageOf(s).label }}</span
        >
      </li>
      <li v-if="!results.length" class="ssempty">No sessions found.</li>
    </ul>
    <div class="ssfoot">↑↓ choose · Enter show · Esc or Ctrl+F close</div>
  </div>
</template>

<style scoped>
.ssbox {
  position: absolute;
  top: 8px;
  left: 50%;
  z-index: 60;
  width: min(520px, calc(100% - 32px));
  transform: translateX(-50%);
  padding: 8px;
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  font-size: 12px;
}
.ssq {
  width: 100%;
  box-sizing: border-box;
  padding: 7px 10px;
  font: 13px var(--font-ui);
  color: var(--text);
  background: var(--bg-3);
  border: 1px solid var(--accent);
  border-radius: 6px;
  outline: none;
}
.sslist {
  max-height: 50vh;
  margin: 6px 0 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}
.sslist li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 6px;
  cursor: pointer;
}
.sslist li.sel {
  background: var(--bg-4);
  box-shadow: inset 3px 0 0 var(--accent);
}
.sskey {
  flex: none;
  font: 600 12px var(--font-mono);
  color: var(--text);
}
.sstitle {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--text-2);
  white-space: nowrap;
  text-overflow: ellipsis;
}
.ssstage {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: var(--text-3);
}
.ssempty {
  color: var(--text-3);
  cursor: default;
}
.ssfoot {
  margin-top: 6px;
  color: var(--text-4);
  font-size: 11px;
}
</style>
