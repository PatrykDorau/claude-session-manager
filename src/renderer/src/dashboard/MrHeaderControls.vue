<script setup lang="ts">
import type { MenuItem, MrRow } from '../types'
import type { MrState } from './mrstate'
import Icon from './Icon.vue'
import MenuButton from './MenuButton.vue'

const props = defineProps<{ row: MrRow; state: MrState; isGone: boolean; isAddressPending: boolean; openItems: MenuItem[]; part?: 'title' | 'actions' }>()
const emit = defineEmits<{ 'address-comments': [] }>()

const { isMine, busyAction, overview, isDraftMr, toggleDraft, isTitleEditing, titleText, startTitleEdit, saveTitle, isRefreshingStatus, refreshStatus } = props.state
const addressComments = (): void => emit('address-comments')
</script>

<template>
  <template v-if="part !== 'actions'">
    <button v-if="overview" class="linkbtn draftlink" :disabled="!!busyAction || isGone" :title="isDraftMr ? 'Remove the Draft prefix so it can be merged' : 'Mark as draft so it cannot be merged yet'" @click="toggleDraft">
      {{ isDraftMr ? 'Mark as ready' : 'Mark as draft' }}
    </button>
    <input
      v-if="isTitleEditing"
      v-model="titleText"
      class="titleedit"
      @keydown.enter="saveTitle"
      @keydown.esc="isTitleEditing = false"
    />
    <template v-if="isTitleEditing">
      <button class="btn sm" @click="isTitleEditing = false">Cancel</button>
      <button class="btn sm primary" :disabled="!!busyAction" @click="saveTitle">Save title</button>
    </template>
    <h1 v-else class="title editable" :title="`${row.title} — click to edit`" @click="startTitleEdit">{{ row.title }}</h1>
  </template>
  <template v-if="part !== 'title'">
    <button class="btn icon" :class="{ spinning: isRefreshingStatus }" :disabled="isRefreshingStatus" title="Reload this merge request from GitLab" @click="refreshStatus"><Icon name="refresh" :size="14" /></button>
    <MenuButton label="Open in" icon="external" :items="openItems" />
    <button
      v-if="isMine"
      class="btn primary"
      :disabled="isAddressPending || isGone"
      title="Starts a fresh Claude session in the MR worktree for the unresolved threads"
      @click="addressComments"
    >
      <span v-if="isAddressPending" class="spin" /><Icon v-else name="message" :size="13" />{{ isAddressPending ? 'Starting…' : 'Address comments' }}
    </button>
  </template>
</template>

<style scoped>
.title {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 600 15px var(--font-ui);
  color: var(--text);
}
.btn {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  box-sizing: border-box;
  font: 500 12.5px var(--font-ui);
  color: var(--text-2);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 7px;
  cursor: pointer;
  text-decoration: none;
}
.btn:hover:not(:disabled),
.btn:focus-visible {
  color: var(--text);
  background: var(--bg-4);
  border-color: var(--line-3);
  outline: none;
}
.btn.primary {
  font-weight: 600;
  color: var(--on-accent);
  background: var(--accent);
  border-color: var(--accent);
}
.btn.primary:hover:not(:disabled) {
  color: var(--on-accent);
  background: var(--accent-hover);
}
.btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.btn.sm {
  height: 28px;
  padding: 0 11px;
}
.spin {
  flex: none;
  width: 12px;
  height: 12px;
  border: 2px solid var(--line-2);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.linkbtn {
  padding: 0;
  font: 12px var(--font-ui);
  color: var(--text-4);
  background: none;
  border: none;
  cursor: pointer;
}
.linkbtn:hover:not(:disabled) {
  color: var(--text);
}
.title.editable {
  cursor: text;
}
.title.editable:hover {
  text-decoration: underline dotted var(--text-4);
}
.titleedit {
  flex: 1;
  min-width: 0;
  padding: 3px 8px;
  font: 600 16px var(--font-ui);
  color: var(--text);
  background: var(--bg-3);
  border: 1px solid var(--accent);
  border-radius: 6px;
  outline: none;
}
.draftlink {
  flex: none;
  font-size: 12px;
}
.btn.icon {
  width: 30px;
  padding: 0;
  justify-content: center;
}
.btn.icon.spinning :deep(svg) {
  animation: mrspin 0.8s linear infinite;
}
@keyframes mrspin {
  to {
    transform: rotate(360deg);
  }
}
</style>
