<script setup lang="ts">
import { computed, onMounted } from 'vue'
import type { ReviewDoc } from '../types'
import Icon from './Icon.vue'
import { remarkedParts, setRemark, toggleReviewed, type PartProgress } from './reviewparts'

const props = defineProps<{ doc: ReviewDoc; progress: PartProgress; isStale: boolean; staleReason: 'moved' | 'files' | null; isMrOfOther: boolean; current: number | null; isSending: boolean }>()
const emit = defineEmits<{
  select: [index: number]
  update: [progress: PartProgress]
  send: []
  rerun: []
}>()

const firstOpen = (): number => {
  const index = props.doc.parts.findIndex((_, i) => !props.progress.reviewed.includes(i))
  return index === -1 ? 0 : index
}
const current = computed(() => props.current ?? firstOpen())
const part = computed(() => props.doc.parts[current.value] ?? null)
const total = computed(() => props.doc.parts.length)
const reviewedCount = computed(() => props.progress.reviewed.filter((i) => i < total.value).length)
const isReviewed = (index: number): boolean => props.progress.reviewed.includes(index)
const remarkCount = computed(() => remarkedParts(props.doc, props.progress).length)
const remark = computed(() => props.progress.remarks[current.value] ?? '')
const sendTitle = computed(() =>
  props.isMrOfOther
    ? 'Adds every remark as an unpublished draft note on the MR, at the first line of its part'
    : "Sends every remark as one prompt to the ticket's Claude session"
)

const select = (index: number): void => emit('select', index)
const step = (delta: number): void => select(Math.min(Math.max(current.value + delta, 0), total.value - 1))
const flipReviewed = (): void => emit('update', toggleReviewed(props.progress, current.value))
const writeRemark = (e: Event): void => emit('update', setRemark(props.progress, current.value, (e.target as HTMLTextAreaElement).value))
const hunkLabel = (h: { file: string; start: number; end: number }): string => `${h.file.split('/').pop()}:${h.start}-${h.end}`

onMounted(() => {
  if (part.value && props.current === null) emit('select', current.value)
})
</script>

<template>
  <div class="rp">
    <div class="rphead">
      <b>Review in parts</b>
      <span class="rpn" :class="{ done: total > 0 && reviewedCount === total }">Reviewed {{ reviewedCount }}/{{ total }}</span>
    </div>
    <div v-if="isStale" class="stale">
      <span>{{ staleReason === 'moved' ? 'The branch moved since the parts were generated.' : 'Some files are no longer in the diff.' }}</span>
      <button class="rplink" @click="emit('rerun')"><Icon name="refresh" :size="12" />Run again</button>
    </div>
    <p v-if="!part" class="muted">The skill found nothing to review.</p>
    <template v-else>
      <div class="card">
        <div class="ptitle">Part {{ current + 1 }}/{{ total }}: {{ part.title }}</div>
        <p v-if="part.why" class="why">{{ part.why }}</p>
        <p v-if="part.check" class="check"><span>Check</span>{{ part.check }}</p>
        <div class="hunks">
          <code v-for="(h, i) in part.hunks" :key="`${h.file}:${h.start}:${i}`" class="hunk" :title="h.file">{{ hunkLabel(h) }}</code>
        </div>
        <label class="done">
          <input type="checkbox" :checked="isReviewed(current)" @change="flipReviewed" />Reviewed
        </label>
        <textarea class="remark" rows="3" :value="remark" placeholder="Remark on this part (optional)" @input="writeRemark" />
        <div class="nav">
          <button class="rpbtn" :disabled="current === 0" @click="step(-1)"><Icon name="chevronRight" :size="13" class="flip" />Prev</button>
          <button class="rpbtn" :disabled="current >= total - 1" @click="step(1)">Next<Icon name="chevronRight" :size="13" /></button>
        </div>
      </div>
      <ol class="list">
        <li v-for="(p, i) in doc.parts" :key="i">
          <button :class="{ on: i === current, reviewed: isReviewed(i) }" :title="p.title" @click="select(i)">
            <Icon v-if="isReviewed(i)" name="check" :size="12" />
            <span v-else class="num">{{ i + 1 }}</span>
            <span class="lt">{{ p.title }}</span>
            <Icon v-if="progress.remarks[i]?.trim()" name="message" :size="11" />
          </button>
        </li>
      </ol>
      <button class="send" :disabled="!remarkCount || isSending" :title="sendTitle" @click="emit('send')">
        <Icon name="send" :size="13" />{{ isSending ? 'Sending remarks…' : `Send remarks (${remarkCount})` }}
      </button>
    </template>
  </div>
</template>

<style scoped>
.rp {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 2px 2px 16px;
}
.rphead {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin: 2px 4px 0;
  font-size: 13px;
  color: var(--text);
}
.rpn {
  font-size: 11.5px;
  color: var(--text-4);
}
.rpn.done {
  color: var(--ok, #3dd68c);
}
.stale {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
  font-size: 11.5px;
  color: var(--warn);
  background: var(--warn-soft);
  border-radius: 6px;
}
.rplink {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 4px;
  padding: 0;
  font: 600 11.5px var(--font-ui);
  color: var(--warn);
  background: none;
  border: none;
  cursor: pointer;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  border-radius: 8px;
}
.ptitle {
  font: 600 12.5px var(--font-ui);
  color: var(--text);
}
.why,
.check {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-2);
}
.check span {
  margin-right: 6px;
  font-weight: 600;
  color: var(--info);
}
.hunks {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.hunk {
  padding: 1px 6px;
  font: 11.5px var(--font-mono);
  color: var(--text-3);
  border: 1px solid var(--line-2);
  border-radius: 5px;
}
.done {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-2);
  cursor: pointer;
}
.remark {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 8px;
  font: 12px var(--font-ui);
  color: var(--text);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 6px;
  outline: none;
  resize: vertical;
}
.remark:focus {
  border-color: var(--accent);
}
.nav {
  display: flex;
  justify-content: space-between;
}
.rpbtn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 10px;
  font: 500 12px var(--font-ui);
  color: var(--text-2);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 6px;
  cursor: pointer;
}
.rpbtn:disabled {
  opacity: 0.4;
  cursor: default;
}
.flip {
  transform: rotate(180deg);
}
.list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.list button {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  height: 26px;
  padding: 0 8px;
  font: 12px var(--font-ui);
  color: var(--text-3);
  text-align: left;
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.list button:hover {
  background: var(--bg-2);
}
.list button.on {
  color: var(--text);
  background: var(--bg-3);
}
.list button.reviewed {
  color: var(--text-4);
}
.num {
  width: 12px;
  font-size: 11px;
  text-align: center;
}
.lt {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.send {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 30px;
  font: 500 12.5px var(--font-ui);
  color: var(--info);
  background: var(--info-soft);
  border: 1px solid rgba(106, 169, 255, 0.25);
  border-radius: 7px;
  cursor: pointer;
}
.send:disabled {
  opacity: 0.5;
  cursor: default;
}
.muted {
  margin: 6px 4px;
  font-size: 12px;
  color: var(--text-4);
}
</style>
