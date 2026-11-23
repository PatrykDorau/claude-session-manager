<script setup lang="ts">
import type { Autonomy } from '../../../main/orchestrator'
import { AUTONOMY_LEVELS } from './orchestrator'

defineProps<{ value: Autonomy | null; isDisabled?: boolean; disabledHint?: string }>()
const emit = defineEmits<{ change: [autonomy: Autonomy] }>()
const pick = (autonomy: Autonomy): void => emit('change', autonomy)
</script>

<template>
  <span class="seg" :title="isDisabled ? disabledHint : undefined">
    <button
      v-for="level in AUTONOMY_LEVELS"
      :key="level.value"
      :class="{ on: value === level.value }"
      :title="isDisabled ? disabledHint : level.hint"
      :disabled="isDisabled"
      @click.stop="pick(level.value)"
    >
      {{ level.label }}
    </button>
  </span>
</template>

<style scoped>
.seg {
  display: inline-flex;
  flex: none;
  overflow: hidden;
  border: 1px solid var(--line-2);
  border-radius: 5px;
}
button {
  height: 20px;
  padding: 0 6px;
  font: 10.5px/1 var(--font-ui);
  color: var(--text-3);
  background: var(--bg-3);
  border: 0;
  border-left: 1px solid var(--line-2);
  cursor: pointer;
}
button:first-child {
  border-left: 0;
}
button:hover:not(:disabled) {
  color: var(--text);
}
button.on {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, var(--bg-3));
}
button:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>
