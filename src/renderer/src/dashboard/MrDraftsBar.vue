<script setup lang="ts">
import { ref } from 'vue'
import type { MrDraftNote } from '../types'
import type { MrState } from './mrstate'
import Icon from './Icon.vue'

const props = defineProps<{ state: MrState; isGone: boolean }>()
const emit = defineEmits<{ 'open-draft': [draft: MrDraftNote] }>()

const { busyAction, drafts, sortedDrafts, draftHtml, runReview, editKey, editText, startEdit, saveDraftEdit, draftWhere } = props.state
const isReviewListOpen = ref(false)
const openDraft = (d: MrDraftNote): void => {
  isReviewListOpen.value = false
  emit('open-draft', d)
}
</script>

<template>
  <div v-if="drafts.length" class="reviewbar">
    <span class="rvdot" />
    <b>Review</b>
    <span class="muted">{{ drafts.length }} pending {{ drafts.length === 1 ? 'comment' : 'comments' }}, visible only to you</span>
    <button class="btn sm" @click="isReviewListOpen = !isReviewListOpen">{{ isReviewListOpen ? 'Hide' : 'Show' }}</button>
    <span class="grow" />
    <button class="btn sm primary" :disabled="!!busyAction || isGone" @click="runReview({ kind: 'submit-review', count: drafts.length })">
      <Icon name="send" :size="13" />{{ busyAction === 'submit-review' ? 'Submitting…' : 'Submit review' }}
    </button>
  </div>
  <div v-if="drafts.length && isReviewListOpen" class="reviewlist">
    <div v-for="d in sortedDrafts" :key="d.id" class="rvitem">
      <button class="rvwhere" :title="d.anchor ? 'Show this line in the code' : 'Scroll to this thread'" @click="openDraft(d)">{{ draftWhere(d) }}</button>
      <span v-if="d.isResolving" class="muted" title="Submitting the review resolves this thread">resolves thread</span>
      <template v-if="editKey === `d:${d.id}`">
        <textarea v-model="editText" rows="3" />
        <div class="crow">
          <button class="btn sm" @click="editKey = null">Cancel</button>
          <button class="btn sm primary" :disabled="!editText.trim() || !!busyAction" @click="saveDraftEdit(d.id)">Save</button>
        </div>
      </template>
      <div v-else class="md" v-html="draftHtml[d.id]" />
      <div v-if="editKey !== `d:${d.id}`" class="rvbtns">
        <button class="linkbtn" @click="startEdit(`d:${d.id}`, d.body)">Edit</button>
        <button class="linkbtn danger" :disabled="!!busyAction" @click="runReview({ kind: 'draft-delete', id: d.id })">Delete</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.grow {
  flex: 1;
}
.muted {
  color: var(--text-4);
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
.md {
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--text-2);
  overflow-wrap: anywhere;
  user-select: text;
}
.md :deep(p) {
  margin: 0 0 10px;
}
.md :deep(a) {
  color: var(--info);
  text-decoration: none;
}
.md :deep(a:hover) {
  text-decoration: underline;
}
.md :deep(h1),
.md :deep(h2),
.md :deep(h3),
.md :deep(h4) {
  margin: 16px 0 8px;
  font-size: 15px;
  color: var(--text);
}
.md :deep(code) {
  padding: 1px 5px;
  font: 12.5px var(--font-mono);
  background: var(--bg-3);
  border-radius: 4px;
}
.md :deep(pre) {
  overflow-x: auto;
  padding: 10px 12px;
  background: var(--bg-editor);
  border: 1px solid var(--line);
  border-radius: 7px;
}
.md :deep(pre code) {
  padding: 0;
  background: none;
}
.md :deep(table) {
  width: 100%;
  margin: 8px 0 12px;
  border-collapse: collapse;
}
.md :deep(th),
.md :deep(td) {
  padding: 6px 10px;
  text-align: left;
  vertical-align: top;
  border: 1px solid var(--line-2);
}
.md :deep(th) {
  color: var(--text);
  background: var(--bg-2);
}
.md :deep(img),
.md :deep(video) {
  display: block;
  max-width: 100%;
  max-height: 420px;
  border-radius: 6px;
}
.md :deep(blockquote) {
  margin: 8px 0;
  padding: 2px 12px;
  color: var(--text-3);
  border-left: 3px solid var(--line-3);
}
.md :deep(details) {
  margin: 6px 0;
}
.md :deep(summary) {
  cursor: pointer;
  color: var(--text);
}
.md :deep(ul),
.md :deep(ol) {
  margin: 4px 0 10px;
  padding-left: 22px;
}
.md :deep(.mediafail) {
  display: inline-block;
  margin: 4px 0;
  padding: 6px 10px;
  color: var(--warn);
  background: var(--warn-soft);
  border-radius: 6px;
}
.md :deep(.mediasignin) {
  padding: 0;
  font: inherit;
  color: inherit;
  text-decoration: underline;
  background: none;
  border: 0;
  cursor: pointer;
}
.btn.sm {
  height: 28px;
  padding: 0 11px;
}
.crow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}
.reviewbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  padding: 7px 12px;
  font-size: 12.5px;
  background: color-mix(in srgb, var(--accent) 8%, var(--bg-2));
  border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
  border-radius: 8px;
}
.rvdot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
}
.reviewlist {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 320px;
  margin-top: 6px;
  padding: 10px 12px;
  overflow-y: auto;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.rvitem {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--line);
}
.rvitem:last-child {
  padding-bottom: 0;
  border-bottom: none;
}
.rvitem textarea {
  box-sizing: border-box;
  width: 100%;
  padding: 8px 10px;
  font: 13px/1.5 var(--font-ui);
  color: var(--text);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 7px;
  outline: none;
  resize: vertical;
}
.rvwhere {
  align-self: flex-start;
  padding: 0;
  font: 12px var(--font-mono);
  color: var(--accent);
  background: none;
  border: none;
  cursor: pointer;
}
.rvbtns {
  display: flex;
  gap: 10px;
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
.linkbtn.danger:hover:not(:disabled) {
  color: #f2706a;
}
</style>
