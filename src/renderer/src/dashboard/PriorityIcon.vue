<script setup lang="ts">
import { computed } from 'vue'
import { priorityLook } from './dashboard'

const props = defineProps<{ name: string | undefined }>()

const PRIORITY_PATH: Record<number, string> = {
  2: 'M3 9l5-5 5 5M3 14l5-5 5 5',
  1: 'M3 11l5-5 5 5',
  0: 'M3 6.5h10M3 10.5h10',
  [-1]: 'M3 6l5 5 5-5',
  [-2]: 'M3 3l5 5 5-5M3 8l5 5 5-5'
}
const look = computed(() => priorityLook(props.name))
</script>

<template>
  <svg v-if="look" class="prio" viewBox="0 0 16 16" :style="{ color: look.color }" :aria-label="`Priority ${name}`">
    <title>Priority: {{ name }}</title>
    <path :d="PRIORITY_PATH[look.level]" />
  </svg>
</template>

<style scoped>
.prio {
  flex: none;
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
