<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { blobWindow, type BlobRef, type BlobRow } from './mrblobs'

const props = defineProps<{ blob: BlobRef }>()

const rows = ref<BlobRow[]>([])
const lineText = props.blob.start === props.blob.end ? `${props.blob.start}` : `${props.blob.start}-${props.blob.end}`

const loadRows = async (): Promise<void> => {
  try {
    const text = await window.api.getMrBlob(props.blob.projectPath, props.blob.ref, props.blob.path)
    rows.value = text === null ? [] : blobWindow(text, props.blob.start, props.blob.end)
  } catch {
    rows.value = []
  }
}
onMounted(loadRows)
</script>

<template>
  <div v-if="rows.length" class="blob">
    <div class="bhead">{{ blob.path }}:{{ lineText }}</div>
    <div class="bcode">
      <div v-for="r in rows" :key="r.no" class="bl" :class="{ hit: r.isHit }"><span class="ln">{{ r.no }}</span>{{ r.text }}</div>
    </div>
  </div>
</template>

<style scoped>
.blob {
  margin: 4px 0 10px;
  background: var(--bg-editor);
  border: 1px solid var(--line);
  border-radius: 7px;
  overflow: hidden;
}
.bhead {
  padding: 5px 12px;
  font: 600 12px var(--font-mono);
  color: var(--text-2);
  border-bottom: 1px solid var(--line);
}
.bcode {
  padding: 6px 0;
  overflow-x: auto;
  font: 12.5px/1.6 var(--font-mono);
  color: #cccccc;
}
.bl {
  padding: 0 12px 0 0;
  white-space: pre;
}
.bl.hit {
  background: rgba(232, 184, 74, 0.12);
  box-shadow: inset 3px 0 0 var(--warn);
}
.ln {
  display: inline-block;
  width: 44px;
  margin-right: 12px;
  padding-right: 8px;
  text-align: right;
  color: var(--text-5);
  user-select: none;
}
</style>
