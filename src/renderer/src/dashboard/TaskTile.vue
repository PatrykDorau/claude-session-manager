<script setup lang="ts">
import { computed } from 'vue'
import { splitTag } from '../taskview'
import type { MrRow, Session } from '../types'
import { stageOf, type Identity } from './commandpanel'
import PriorityIcon from './PriorityIcon.vue'
import Icon from './Icon.vue'
import IdentityMark from './IdentityMark.vue'
import SessionBadge from './SessionBadge.vue'

const props = defineProps<{
  ticketKey: string | null
  summary: string
  priority?: string | null
  mr: MrRow | null
  session: Session | null
  identity?: Identity | null
  isSelected?: boolean
  isPinned?: boolean
  mrTitle?: string
}>()
const emit = defineEmits<{ 'open-mr': [key: string] }>()

const title = computed(() => splitTag(props.summary))
const stage = computed(() => stageOf(props.session))
const openThreads = computed(() => props.mr?.openThreads ?? 0)
</script>

<template>
  <article class="tile" :class="{ sel: isSelected, marked: !!identity }">
    <SessionBadge v-if="session?.isLive" :status="session.status" :model="session.model" :context-tokens="session.contextTokens" />
    <IdentityMark v-if="identity" class="corner-mark" :identity="identity" :size="22" />
    <p class="summary" :title="summary">{{ title.text || 'No title' }}</p>
    <div class="top">
      <PriorityIcon :name="priority ?? undefined" />
      <slot name="ticket-key">
        <span class="key">{{ ticketKey }}</span>
      </slot>
      <span v-if="session" class="stage" :class="stage.tone"><Icon :name="stage.icon" :size="11" />{{ stage.label }}</span>
      <span v-if="title.tag" class="tag">{{ title.tag }}</span>
      <slot name="top" />
      <span v-if="isPinned || $slots.marks" class="marks">
        <Icon v-if="isPinned" class="pin-mark" name="dashboard" :size="11" title="Pinned" />
        <slot name="marks" />
      </span>
    </div>
    <div v-if="mr" class="mrinfo" :class="{ attn: openThreads > 0 }" :title="mrTitle ?? 'Open the merge request'" @click.stop="emit('open-mr', mr.key)">
      <Icon name="pr" :size="12" />!{{ mr.iid }}
      <span v-if="mr.isDraft" class="dr">Draft</span>
      <span v-if="openThreads > 0" class="thr" title="Unresolved threads"><Icon name="message" :size="11" />{{ openThreads }}</span>
      <span v-if="mr.approvals" class="ap" :class="{ ok: mr.approvals >= 2 }"><Icon name="check" :size="11" />{{ mr.approvals }}</span>
    </div>
    <slot name="chips" />
    <slot name="actions" />
  </article>
</template>

<style scoped>
.tile {
  position: relative;
  margin: 0 2px 6px;
  padding: 10px 12px 9px 14px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 9px;
  outline: none;
}
.tile:hover {
  border-color: var(--line-3);
}
.tile:focus-visible {
  border-color: var(--text-4);
}
.tile::before {
  content: '';
  position: absolute;
  left: -1px;
  top: 10px;
  bottom: 10px;
  width: 3px;
  border-radius: 0 2px 2px 0;
  background: var(--edge);
}
.tile.sel {
  background: var(--bg-3);
  border-color: var(--accent);
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.tile.sel::before {
  background: var(--accent);
}
.top {
  display: flex;
  flex-wrap: wrap;
  row-gap: 4px;
  align-items: center;
  gap: 8px;
  min-width: 0;
  margin-top: 8px;
}
.key {
  flex: none;
  font: 600 11.5px var(--font-mono);
  color: var(--text-3);
}
.tag {
  flex: none;
  padding: 1px 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
  background: var(--bg-4);
  border-radius: 5px;
}
.pin-mark {
  flex: none;
  color: var(--accent);
}
.marks {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
.corner-mark {
  position: absolute;
  top: -7px;
  right: -7px;
  z-index: 1;
  border: 2px solid var(--bg-1);
  pointer-events: none;
}
.tile.marked .summary {
  padding-right: 22px;
}
.stage {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: var(--text-4);
}
.stage.input {
  color: var(--warn);
  font-weight: 700;
}
.stage.working {
  color: var(--info);
}
.stage.done {
  color: var(--ok);
}
.summary {
  margin: 0;
  font: 500 13.5px/1.4 var(--font-ui);
  color: var(--text);
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.mrinfo:hover {
  filter: brightness(1.25);
}
.mrinfo {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 7px;
  padding: 1px 8px;
  font: 600 11.5px/18px var(--font-ui);
  color: var(--text-3);
  background: var(--bg-4);
  border-radius: 9px;
}
.mrinfo.attn {
  color: var(--warn);
  background: var(--warn-soft);
}
.mrinfo .thr,
.mrinfo .ap {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.mrinfo .ap.ok {
  color: var(--ok);
}
.mrinfo .dr {
  padding: 0 5px;
  font-size: 10px;
  line-height: 15px;
  color: var(--bg-0);
  background: var(--warn);
  border-radius: 4px;
}
</style>
