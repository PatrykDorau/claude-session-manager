<script setup lang="ts">
import type { Session } from '../types'
import { stageOf, type Identity } from './commandpanel'
import Icon from './Icon.vue'
import IdentityMark from './IdentityMark.vue'

defineProps<{
  tabs: Session[]
  selectedId: string
  identityOf: (session: Session) => Identity
  titleOf: (session: Session) => string
  isCallingOf: (session: Session) => boolean
}>()
const emit = defineEmits<{ select: [session: Session] }>()

const select = (session: Session): void => emit('select', session)
</script>

<template>
  <div class="tabs" role="tablist">
    <button
      v-for="t in tabs"
      :key="t.id"
      type="button"
      class="tab"
      :class="{ 'is-selected': t.id === selectedId }"
      role="tab"
      :aria-selected="t.id === selectedId"
      @click="select(t)"
    >
      <IdentityMark :identity="identityOf(t)" :size="16" />
      <span class="title">{{ titleOf(t) }}</span>
      <Icon :name="stageOf(t).icon" :size="12" />
      <span v-if="isCallingOf(t) && t.id !== selectedId" class="bell" role="img" aria-label="needs you">
        <Icon name="bell" :size="12" />
      </span>
    </button>
  </div>
</template>

<style scoped>
.tabs {
  flex: none;
  display: flex;
  gap: 2px;
  overflow-x: auto;
  padding: 2px 2px 0;
  border-bottom: 1px solid var(--line-2);
}
.tab {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 160px;
  padding: 3px 6px;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.tab.is-selected {
  border-color: var(--line-2);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  font-weight: 600;
}
.bell {
  display: inline-flex;
}
.title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
