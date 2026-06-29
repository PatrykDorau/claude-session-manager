<script setup lang="ts">
import { ref, computed, onMounted, provide } from 'vue'
import type { Session } from './types'
import SessionRow from './components/SessionRow.vue'

const sessions = ref<Session[]>([])
const loaded = ref(false)
const minElapsed = ref(false)
const ready = computed(() => loaded.value && minElapsed.value)
const version = ((): string => {
  try {
    return window.api.getVersion()
  } catch {
    return ''
  }
})()
const watchedOpen = ref(true)
const othersOpen = ref(true)
const search = ref('')
const colorblind = ref(localStorage.getItem('colorblind') === '1')
provide('colorblind', colorblind)

onMounted(() => {
  setTimeout(() => (minElapsed.value = true), 600)
  window.api.onSessions((s) => {
    sessions.value = s
    loaded.value = true
  })
})

const watchedList = computed(() => sessions.value.filter((s) => s.watched || s.isLive))
const otherList = computed(() => {
  const rest = sessions.value.filter((s) => !(s.watched || s.isLive))
  const q = search.value.trim().toUpperCase()
  if (!q) return rest
  return rest.filter((s) => (s.ticket ?? '').toUpperCase().includes(q))
})

function toggleColorblind(): void {
  colorblind.value = !colorblind.value
  localStorage.setItem('colorblind', colorblind.value ? '1' : '0')
}
</script>

<template>
  <div class="wrap">
    <header>
      <span class="title">Claude Sessions <span v-if="version" class="ver">v{{ version }}</span></span>
      <button class="cb" :class="{ on: colorblind }" title="Colorblind palette" @click="toggleColorblind">
        ◑
      </button>
    </header>
    <div v-if="!ready" class="loading">
      <div class="spinner" />
    </div>
    <div v-else class="scroll">
      <div class="shead" @click="watchedOpen = !watchedOpen">
        <span class="chev">{{ watchedOpen ? '▾' : '▸' }}</span>
        Watched <span class="count">{{ watchedList.length }}</span>
      </div>
      <ul v-show="watchedOpen">
        <SessionRow v-for="s in watchedList" :key="s.id" :session="s" />
        <li v-if="!watchedList.length" class="empty">Nothing watched or live</li>
      </ul>

      <div class="shead" @click="othersOpen = !othersOpen">
        <span class="chev">{{ othersOpen ? '▾' : '▸' }}</span>
        Other <span class="count">{{ otherList.length }}</span>
      </div>
      <div v-show="othersOpen" class="searchbar">
        <input v-model="search" class="search" placeholder="Filter by ticket…" @click.stop />
      </div>
      <ul v-show="othersOpen">
        <SessionRow v-for="s in otherList" :key="s.id" :session="s" />
        <li v-if="!otherList.length" class="empty">No matching sessions</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  font: 12px system-ui;
  color: #e6edf3;
  background: #0d1117;
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  font-weight: 600;
  border-bottom: 1px solid #21262d;
  -webkit-app-region: drag;
}
.title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ver {
  color: #6e7681;
  font-size: 10px;
  font-weight: 400;
}
.loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.spinner {
  width: 26px;
  height: 26px;
  border: 3px solid #21262d;
  border-top-color: #58a6ff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.cb {
  flex: none;
  -webkit-app-region: no-drag;
  background: none;
  border: 1px solid #30363d;
  color: #8b949e;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  padding: 2px 7px;
}
.cb:hover {
  color: #e6edf3;
}
.cb.on {
  color: #58a6ff;
  border-color: #58a6ff;
}
.scroll {
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-gutter: stable;
  flex: 1;
}
.scroll::-webkit-scrollbar {
  width: 10px;
}
.scroll::-webkit-scrollbar-track {
  background: #0d1117;
}
.scroll::-webkit-scrollbar-thumb {
  background: #30363d;
  border: 2px solid #0d1117;
  border-radius: 6px;
}
.scroll::-webkit-scrollbar-thumb:hover {
  background: #484f58;
}
.shead {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 600;
  color: #8b949e;
  background: #0d1117;
  cursor: pointer;
  position: sticky;
  top: 0;
}
.chev {
  width: 10px;
}
.count {
  color: #6e7681;
  font-weight: 400;
}
.searchbar {
  padding: 4px 10px 6px;
}
.search {
  width: 100%;
  box-sizing: border-box;
  font: 11px system-ui;
  background: #0d1117;
  color: #e6edf3;
  border: 1px solid #30363d;
  border-radius: 5px;
  padding: 4px 7px;
  outline: none;
}
.search:focus {
  border-color: #58a6ff;
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.empty {
  color: #8b949e;
  padding: 7px 10px;
  text-align: center;
}
</style>
