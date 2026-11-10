<script setup lang="ts">
import { ref } from 'vue'
import type { MenuItem } from '../types'
import Icon from './Icon.vue'
import type { IconName } from './icons'

defineProps<{ label: string; items: MenuItem[]; isIcon?: boolean; title?: string; icon?: IconName }>()

const isOpen = ref(false)
const choose = (item: MenuItem): void => {
  if (item.isDisabled) return
  isOpen.value = false
  item.run()
}
</script>

<template>
  <span class="mb">
    <button class="trigger" :class="{ icon: isIcon, on: isOpen }" :title="title" @click="isOpen = !isOpen">
      <Icon v-if="icon" :name="icon" :size="15" />
      <span v-if="!isIcon || !icon">{{ label }}</span>
      <Icon v-if="!isIcon" name="chevronDown" :size="13" class="caret" />
    </button>
    <div v-if="isOpen" class="scrim" @click="isOpen = false" />
    <div v-if="isOpen" class="menu">
      <button v-for="item in items" :key="item.label" class="item" :disabled="item.isDisabled" :title="item.hint" @click="choose(item)">
        <Icon v-if="item.icon" :name="item.icon" :size="15" class="iicon" />
        <span class="itext">
          <span>{{ item.label }}</span>
          <small v-if="item.hint">{{ item.hint }}</small>
        </span>
      </button>
    </div>
  </span>
</template>

<style scoped>
.mb {
  position: relative;
  display: inline-flex;
}
.trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 10px;
  font: 500 12.5px var(--font-ui);
  white-space: nowrap;
  color: var(--text-2);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 7px;
  cursor: pointer;
}
.trigger.icon {
  width: 30px;
  padding: 0;
  justify-content: center;
}
.trigger:hover,
.trigger:focus-visible,
.trigger.on {
  color: var(--text);
  background: var(--bg-4);
  border-color: var(--line-3);
  outline: none;
}
.caret {
  color: var(--text-4);
}
.scrim {
  position: fixed;
  inset: 0;
  z-index: 29;
}
.menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 30;
  min-width: 260px;
  padding: 5px;
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  border-radius: 10px;
  box-shadow: var(--shadow);
}
.item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  font: 13px var(--font-ui);
  color: var(--text);
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
}
.iicon {
  margin-top: 2px;
  color: var(--text-3);
}
.itext {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.item:hover:not(:disabled) {
  background: var(--bg-4);
}
.item:hover:not(:disabled) .iicon {
  color: var(--accent);
}
.item small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 300px;
  font-size: 11.5px;
  color: var(--text-4);
}
.item:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
