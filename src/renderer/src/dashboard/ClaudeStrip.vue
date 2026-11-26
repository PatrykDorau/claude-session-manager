<script setup lang="ts">
defineProps<{ label: string | null; color: string | null }>()
const emit = defineEmits<{ expand: [] }>()
const expand = (): void => emit('expand')
</script>

<template>
  <button class="strip" title="Show Claude" @click="expand">
    <span class="arrow">◂</span>
    <i v-if="color" :style="{ background: color }" />
    <span class="label">{{ label ?? 'No session' }}</span>
  </button>
</template>

<style scoped>
.strip {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 32px;
  padding: 12px 0;
  box-sizing: border-box;
  writing-mode: vertical-rl;
  font: 500 12px var(--font-ui);
  color: var(--text-4);
  background: var(--bg-editor);
  border: none;
  border-left: 1px solid var(--line);
  cursor: pointer;
}
.strip:hover {
  color: var(--text);
  background: var(--bg-2);
}
.arrow {
  flex: none;
}
i {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.label {
  min-height: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
