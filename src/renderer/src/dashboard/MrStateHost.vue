<script setup lang="ts">
import { onBeforeUnmount, toRef } from 'vue'
import type { MrRow } from '../types'
import { useMrState, type MrState } from './mrstate'

const props = defineProps<{ row: MrRow; myName: string | null }>()
const emit = defineEmits<{ state: [state: MrState]; gone: [state: MrState] }>()

const state = useMrState(toRef(props, 'row'), toRef(props, 'myName'))
emit('state', state)
onBeforeUnmount(() => emit('gone', state))
</script>

<template>
  <span hidden />
</template>
