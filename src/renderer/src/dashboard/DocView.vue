<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const props = defineProps<{ text: string }>()

const host = ref<HTMLDivElement | null>(null)
const html = ref('')
let renderCount = 0

const renderDiagrams = async (): Promise<void> => {
  const blocks = Array.from(host.value?.querySelectorAll<HTMLElement>('pre > code.language-mermaid') ?? [])
  if (!blocks.length) return
  const { default: mermaid } = await import('mermaid')
  mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict', fontFamily: 'Segoe UI, system-ui, sans-serif' })
  for (const code of blocks) {
    renderCount += 1
    const box = document.createElement('div')
    box.className = 'diagram'
    try {
      const { svg } = await mermaid.render(`doc-diagram-${renderCount}`, code.textContent ?? '')
      box.innerHTML = svg
    } catch {
      box.textContent = 'This diagram could not be drawn.'
      box.classList.add('broken')
    }
    code.parentElement?.replaceWith(box)
  }
}

const render = async (): Promise<void> => {
  const raw = marked.parse(props.text, { gfm: true, async: false }) as string
  html.value = DOMPurify.sanitize(raw, { ADD_TAGS: ['details', 'summary'], ADD_ATTR: ['target'] })
  await nextTick()
  for (const a of Array.from(host.value?.querySelectorAll<HTMLAnchorElement>('a[href]') ?? [])) {
    a.target = '_blank'
    a.rel = 'noreferrer'
  }
  await renderDiagrams()
}

onMounted(render)
watch(() => props.text, render)
</script>

<template>
  <div ref="host" class="doc" v-html="html" />
</template>

<style scoped>
.doc {
  max-width: 920px;
  padding: 20px 28px 48px;
  font-size: 14px;
  line-height: 1.65;
  color: var(--text-2);
  user-select: text;
}
.doc :deep(h1) {
  margin: 0 0 14px;
  font: 600 22px var(--font-ui);
  color: var(--text);
}
.doc :deep(h2) {
  margin: 28px 0 10px;
  padding-bottom: 6px;
  font: 600 18px var(--font-ui);
  color: var(--text);
  border-bottom: 1px solid var(--line);
}
.doc :deep(h3),
.doc :deep(h4) {
  margin: 20px 0 8px;
  font: 600 15px var(--font-ui);
  color: var(--text);
}
.doc :deep(p) {
  margin: 0 0 12px;
}
.doc :deep(a) {
  color: var(--info);
  text-decoration: none;
}
.doc :deep(a:hover) {
  text-decoration: underline;
}
.doc :deep(code) {
  padding: 1px 5px;
  font: 13px var(--font-mono);
  color: #d7ba7d;
  background: var(--bg-3);
  border-radius: 4px;
}
.doc :deep(pre) {
  overflow-x: auto;
  padding: 12px 14px;
  background: var(--bg-editor);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.doc :deep(pre code) {
  padding: 0;
  color: #cccccc;
  background: none;
}
.doc :deep(table) {
  width: 100%;
  margin: 8px 0 16px;
  border-collapse: collapse;
}
.doc :deep(th),
.doc :deep(td) {
  padding: 6px 10px;
  text-align: left;
  vertical-align: top;
  border: 1px solid var(--line-2);
}
.doc :deep(th) {
  color: var(--text);
  background: var(--bg-2);
}
.doc :deep(blockquote) {
  margin: 10px 0;
  padding: 4px 14px;
  color: var(--text-3);
  border-left: 3px solid var(--line-3);
}
.doc :deep(ul),
.doc :deep(ol) {
  margin: 4px 0 12px;
  padding-left: 24px;
}
.doc :deep(details) {
  margin: 8px 0;
  padding: 6px 12px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.doc :deep(summary) {
  cursor: pointer;
  color: var(--text);
}
.doc :deep(.diagram) {
  margin: 12px 0 18px;
  padding: 14px;
  overflow-x: auto;
  text-align: center;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 10px;
}
.doc :deep(.diagram svg) {
  max-width: 100%;
  height: auto;
}
.doc :deep(.diagram.broken) {
  color: var(--warn);
}
</style>
