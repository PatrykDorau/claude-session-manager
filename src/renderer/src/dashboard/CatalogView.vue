<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { CatalogGroup, CatalogItem, CatalogRead } from '../types'
import { renderMarkdown } from './mrhtml'
import Icon from './Icon.vue'

const SELECTED_KEY = 'dash.catalog.selected'
const SEARCH_KEY = 'dash.catalog.search'

const readStored = (key: string): string => {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}
const writeStored = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value)
  } catch {
    return
  }
}
const fileName = (path: string): string => path.replace(/^.*[\\/]/, '')

const groups = ref<CatalogGroup[] | null>(null)
const search = ref(readStored(SEARCH_KEY))
const selectedPath = ref(readStored(SELECTED_KEY))
const activePath = ref('')
const detail = ref<CatalogRead | null>(null)
const isMissing = ref(false)

const allItems = computed<CatalogItem[]>(() => (groups.value ?? []).flatMap((g) => g.items))
const selectedItem = computed(() => allItems.value.find((i) => i.path === selectedPath.value) ?? null)
const visibleGroups = computed(() => {
  const needle = search.value.trim().toLowerCase()
  return (groups.value ?? [])
    .map((g) => ({
      ...g,
      items: needle ? g.items.filter((i) => `${i.name} ${i.description}`.toLowerCase().includes(needle)) : g.items
    }))
    .filter((g) => g.items.length)
})
const title = computed(() => detail.value?.meta.name || (selectedItem.value ? selectedItem.value.name : ''))
const hint = computed(() => {
  const meta = detail.value?.meta ?? {}
  return [meta['user-invocable'] ? `user-invocable: ${meta['user-invocable']}` : '', meta['argument-hint'] ? `argument-hint: ${meta['argument-hint']}` : '']
    .filter(Boolean)
    .join(' · ')
})
const html = computed(() => (detail.value ? renderMarkdown(detail.value.body, '', 0) : ''))

let openToken = 0
const open = async (path: string): Promise<void> => {
  openToken += 1
  const token = openToken
  const result = await window.api.readCatalogItem(path)
  if (token !== openToken) return
  isMissing.value = !result
  detail.value = result
  activePath.value = path
}
const select = (item: CatalogItem): void => {
  selectedPath.value = item.path
  writeStored(SELECTED_KEY, item.path)
  void open(item.path)
}
const setSearch = (event: Event): void => {
  search.value = (event.target as HTMLInputElement).value
  writeStored(SEARCH_KEY, search.value)
}
const openFolder = (): void => window.api.openCatalogFolder(activePath.value)

onMounted(async () => {
  groups.value = await window.api.getCatalog()
  if (selectedItem.value) void open(selectedItem.value.path)
})
</script>

<template>
  <div class="cv">
    <aside class="list">
      <div class="search">
        <Icon name="search" :size="14" />
        <input :value="search" placeholder="Search skills, agents, plugins" @input="setSearch" />
      </div>
      <div class="scroll">
        <p v-if="groups === null" class="muted">Loading…</p>
        <p v-else-if="!visibleGroups.length" class="muted">Nothing matches.</p>
        <section v-for="g in visibleGroups" :key="g.id" class="group">
          <header class="ghead">
            <b>{{ g.title }}</b>
            <span v-if="g.version" class="ver">{{ g.version }}</span>
            <span v-if="g.isEnabled !== null" class="badge" :class="g.isEnabled ? 'on' : 'off'">{{ g.isEnabled ? 'enabled' : 'disabled' }}</span>
          </header>
          <button v-for="i in g.items" :key="i.path" class="item" :class="{ sel: i.path === selectedPath }" :title="i.description" @click="select(i)">
            <span class="name">{{ i.name }}</span>
            <span class="kind">{{ i.kind }}</span>
          </button>
        </section>
      </div>
    </aside>
    <main class="doc">
      <div v-if="!selectedItem" class="empty">
        <Icon name="fileText" :size="34" />
        <p>Select a skill, agent or command to read its definition.</p>
      </div>
      <template v-else>
        <header class="dhead">
          <div class="titles">
            <h1>{{ title }}</h1>
            <p v-if="detail?.meta.description" class="desc">{{ detail.meta.description }}</p>
            <p v-if="hint" class="hint">{{ hint }}</p>
          </div>
          <button class="btn" @click="openFolder"><Icon name="folder" :size="14" />Open folder</button>
        </header>
        <nav v-if="detail && detail.siblings.length > 1" class="tabs">
          <button v-for="p in detail.siblings" :key="p" class="tab" :class="{ sel: p === activePath }" @click="open(p)">{{ fileName(p) }}</button>
        </nav>
        <p v-if="isMissing" class="muted pad">This file can no longer be read.</p>
        <div v-else class="md" v-html="html" />
      </template>
    </main>
  </div>
</template>

<style scoped>
.cv {
  flex: 1;
  min-width: 0;
  display: flex;
  background: var(--bg-1);
}
.list {
  flex: none;
  width: 320px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--line);
}
.search {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 52px;
  padding: 0 12px;
  color: var(--text-4);
  border-bottom: 1px solid var(--line);
}
.search input {
  flex: 1;
  min-width: 0;
  font: 13px var(--font-ui);
  color: var(--text);
  background: none;
  border: none;
  outline: none;
}
.scroll {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}
.group {
  margin-bottom: 12px;
}
.ghead {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  font: 12px var(--font-ui);
  color: var(--text-3);
}
.ghead b {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ver {
  color: var(--text-4);
}
.badge {
  padding: 0 7px;
  font: 600 11px/18px var(--font-ui);
  border-radius: 9px;
}
.badge.on {
  color: var(--ok);
  background: rgba(61, 214, 140, 0.1);
}
.badge.off {
  color: var(--text-4);
  background: var(--bg-3);
}
.item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  font: 13px var(--font-ui);
  color: var(--text-2);
  text-align: left;
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.item:hover {
  background: var(--bg-2);
}
.item.sel {
  color: var(--text);
  background: var(--bg-3);
}
.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.kind {
  font-size: 11px;
  color: var(--text-4);
}
.doc {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}
.dhead {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--line);
}
.titles {
  flex: 1;
  min-width: 0;
}
.titles h1 {
  margin: 0;
  font: 600 16px var(--font-ui);
  color: var(--text);
}
.desc {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--text-2);
}
.hint {
  margin: 6px 0 0;
  font: 12px var(--font-mono);
  color: var(--text-4);
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  font: 500 12.5px var(--font-ui);
  color: var(--text-2);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 7px;
  cursor: pointer;
}
.tabs {
  flex: none;
  display: flex;
  gap: 4px;
  padding: 8px 20px 0;
  border-bottom: 1px solid var(--line);
}
.tab {
  padding: 6px 12px;
  font: 12.5px var(--font-ui);
  color: var(--text-3);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
}
.tab.sel {
  color: var(--text);
  border-bottom-color: var(--accent);
}
.md {
  padding: 16px 20px 32px;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--text-2);
  overflow-wrap: anywhere;
}
.md :deep(pre) {
  padding: 10px 12px;
  overflow-x: auto;
  background: var(--bg-2);
  border-radius: 8px;
}
.md :deep(code) {
  font-family: var(--font-mono);
  font-size: 12.5px;
}
.md :deep(table) {
  border-collapse: collapse;
}
.md :deep(th),
.md :deep(td) {
  padding: 4px 10px;
  border: 1px solid var(--line-2);
}
.muted {
  font-size: 13px;
  color: var(--text-4);
}
.pad {
  padding: 16px 20px;
}
.list .muted {
  padding: 8px;
}
.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-4);
}
</style>
