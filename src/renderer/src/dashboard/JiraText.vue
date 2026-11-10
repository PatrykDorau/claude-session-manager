<script setup lang="ts">
import { computed } from 'vue'
import { parseJiraMarkup, type Span } from './jiraMarkup'

const props = defineProps<{ text: string }>()

const blocks = computed(() => parseJiraMarkup(props.text))
const spanClass = (s: Span): Record<string, boolean> => ({ b: s.isBold, i: s.isItalic, c: s.isCode })
</script>

<template>
  <div class="jt">
    <template v-for="(block, i) in blocks" :key="i">
      <pre v-if="block.kind === 'code'" class="code">{{ block.text }}</pre>
      <component
        :is="block.kind === 'heading' ? `h${Math.min(block.level + 2, 6)}` : 'p'"
        v-else
        :class="[block.kind, block.kind === 'item' ? `d${Math.min(block.depth, 3)}` : '']"
      >
        <template v-for="(s, j) in block.spans" :key="j">
          <a v-if="s.href" :href="s.href" target="_blank" rel="noreferrer" :class="spanClass(s)">{{ s.text }}</a>
          <span v-else :class="spanClass(s)">{{ s.text }}</span>
        </template>
      </component>
    </template>
  </div>
</template>

<style scoped>
.jt {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-2);
  overflow-wrap: anywhere;
}
a {
  color: var(--info);
  text-decoration: none;
}
a:hover {
  text-decoration: underline;
}
.heading {
  margin: 18px 0 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
.heading:first-child {
  margin-top: 0;
}
.para {
  margin: 0 0 10px;
}
.item {
  position: relative;
  margin: 0 0 4px;
  padding-left: 16px;
}
.item::before {
  content: '';
  position: absolute;
  left: 4px;
  top: 0.7em;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--accent);
}
.item.d2 {
  margin-left: 16px;
}
.item.d3 {
  margin-left: 32px;
}
.b {
  font-weight: 600;
  color: var(--text);
}
.i {
  font-style: italic;
}
.c,
.code {
  font-family: var(--font-mono);
  font-size: 12px;
  background: var(--bg-3);
  border-radius: 4px;
}
.c {
  padding: 1px 4px;
}
.code {
  margin: 0 0 10px;
  padding: 8px 10px;
  white-space: pre-wrap;
  border: 1px solid var(--line-2);
}
</style>
