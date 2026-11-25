<script setup lang="ts">
import type { Identity } from './commandpanel'
import Icon from './Icon.vue'

const props = defineProps<{ identity: Identity; size?: number }>()
</script>

<template>
  <span
    class="mark"
    :style="{ background: identity.color, height: `${props.size ?? 22}px`, minWidth: `${props.size ?? 22}px` }"
    :title="`Identity ${identity.letter}`"
  >
    <Icon :name="identity.icon" :size="Math.round((props.size ?? 22) * 0.55)" :stroke-width="2.8" />
    <span v-if="identity.letter" class="letter" :style="{ fontSize: `${Math.round((props.size ?? 22) * 0.55)}px` }">{{
      identity.letter
    }}</span>
  </span>
</template>

<style scoped>
.mark {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  box-sizing: border-box;
  padding: 0 4px;
  border-radius: 5px;
  color: #0d1117;
}
.letter {
  font-weight: 800;
  line-height: 1;
}
</style>
