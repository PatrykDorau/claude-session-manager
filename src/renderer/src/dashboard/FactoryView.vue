<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import type { FactoryProposal, FactoryReport } from '../types'
import { ago } from '../display'
import { formatContext } from './context'
import Icon from './Icon.vue'
import DocView from './DocView.vue'

const report = ref<FactoryReport | null>(null)
const busy = ref<string | null>(null)
const notice = ref<string | null>(null)
let stopListening: (() => void) | null = null

const load = async (): Promise<void> => {
  report.value = await window.api.getFactoryReport()
}
const peakTokens = computed(() => Math.max(1, ...(report.value?.trend ?? []).map((t) => t.tokens)))
const run = async (id: string, action: () => Promise<{ error: string | null }>): Promise<void> => {
  busy.value = id
  notice.value = null
  try {
    const result = await action()
    if (result.error && result.error !== 'cancelled') notice.value = result.error
  } finally {
    busy.value = null
    await load()
  }
}
const runNow = async (): Promise<void> => {
  notice.value = null
  const result = await window.api.runFactoryNow()
  if (result.error) notice.value = result.error
  await load()
}
const applyProposal = (p: FactoryProposal): Promise<void> => run(`apply-${p.id}`, () => window.api.applyFactoryProposal(p.id))
const testProposal = (p: FactoryProposal): Promise<void> => run(`test-${p.id}`, () => window.api.testFactoryProposal(p.id))
const dismissProposal = (p: FactoryProposal): Promise<void> => run(`dismiss-${p.id}`, () => window.api.dismissFactoryProposal(p.id))

onMounted(() => {
  void load()
  stopListening = window.api.onFactoryChanged(load)
})
onBeforeUnmount(() => stopListening?.())
</script>

<template>
  <div class="fv">
    <header class="fhead">
      <Icon name="sparkles" :size="18" />
      <h1>Factory</h1>
      <span class="sub">
        <template v-if="report?.isRunning">Scoring the last 24 h…</template>
        <template v-else-if="report?.lastRun">Last run {{ ago(report.lastRun) }}</template>
        <template v-else>Never run</template>
      </span>
      <span class="grow" />
      <button class="btn" :disabled="!!report?.isRunning" @click="runNow"><Icon name="play" :size="14" />Run now</button>
    </header>
    <p v-if="notice" class="notice">{{ notice }}</p>
    <p v-else-if="report?.lastError && !report.isRunning" class="notice">Last run failed: {{ report.lastError }}</p>
    <div class="body">
      <p v-if="report === null" class="muted">Loading…</p>
      <template v-else>
        <section v-if="report.trend.length" class="trend">
          <h2>Tokens read per day</h2>
          <div v-for="t in report.trend" :key="t.date" class="bar">
            <span class="date">{{ t.date }}</span>
            <span class="track"><i :style="{ width: `${(t.tokens / peakTokens) * 100}%` }" /></span>
            <span class="tokens">{{ formatContext(t.tokens) }}</span>
          </div>
        </section>

        <section v-if="report.proposals.length" class="proposals">
          <h2>Proposals · {{ report.day }}</h2>
          <article v-for="p in report.proposals" :key="p.id" class="card" :class="{ dismissed: p.isDismissed }">
            <header class="top">
              <b>{{ p.title }}</b>
              <span class="grow" />
              <span v-if="p.isDismissed" class="pill">Dismissed</span>
            </header>
            <div class="target" :title="p.target">{{ p.target }}</div>
            <ul class="evidence">
              <li v-for="(e, i) in p.evidence" :key="i">{{ e }}</li>
            </ul>
            <pre class="diff"><span v-for="(l, i) in p.find.split('\n')" :key="`f${i}`" class="del">- {{ l }}
</span><span v-for="(l, i) in p.replace.split('\n')" :key="`r${i}`" class="add">+ {{ l }}
</span></pre>
            <div class="acts">
              <button class="btn sm" :disabled="!!busy" @click="applyProposal(p)"><Icon name="check" :size="12" />Apply</button>
              <button class="btn sm" :disabled="!!busy" @click="testProposal(p)"><Icon name="play" :size="12" />Test first</button>
              <button v-if="!p.isDismissed" class="btn sm danger" :disabled="!!busy" @click="dismissProposal(p)"><Icon name="close" :size="12" />Dismiss</button>
            </div>
          </article>
        </section>

        <DocView v-if="report.report" :text="report.report" />
        <div v-else class="empty">
          <Icon name="sparkles" :size="34" />
          <p>No report yet. The factory scores the last 24 h of Claude sessions once a day; press Run now to score them now.</p>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.fv {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-1);
}
.fhead {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 52px;
  padding: 0 16px;
  color: var(--accent);
  border-bottom: 1px solid var(--line);
}
.fhead h1 {
  margin: 0;
  font: 600 15px var(--font-ui);
  color: var(--text);
}
.sub {
  font-size: 12px;
  color: var(--text-4);
}
.grow {
  flex: 1;
}
.notice {
  margin: 10px 16px 0;
  padding: 8px 12px;
  font-size: 12.5px;
  color: var(--danger);
  background: var(--danger-soft);
  border-radius: 8px;
  white-space: pre-wrap;
}
.body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
h2 {
  margin: 0 0 10px;
  font: 600 13px var(--font-ui);
  color: var(--text-3);
}
.trend {
  max-width: 920px;
  margin-bottom: 20px;
}
.bar {
  display: grid;
  grid-template-columns: 90px 1fr 60px;
  align-items: center;
  gap: 10px;
  height: 20px;
  font-size: 12px;
  color: var(--text-3);
}
.date,
.tokens {
  font-family: var(--font-mono);
}
.tokens {
  text-align: right;
}
.track {
  height: 8px;
  background: var(--bg-3);
  border-radius: 4px;
  overflow: hidden;
}
.track i {
  display: block;
  height: 100%;
  background: var(--accent);
  border-radius: 4px;
}
.proposals {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 920px;
  margin-bottom: 20px;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  border-radius: 10px;
}
.card.dismissed {
  opacity: 0.55;
}
.top {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
  color: var(--text);
}
.pill {
  padding: 0 8px;
  font: 600 11.5px/20px var(--font-ui);
  color: var(--text-4);
  background: var(--bg-3);
  border-radius: 10px;
}
.target {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 12px var(--font-mono);
  color: var(--text-4);
}
.evidence {
  margin: 0;
  padding: 0 0 0 16px;
  font-size: 12.5px;
  color: var(--text-2);
}
.diff {
  margin: 0;
  padding: 8px 10px;
  overflow-x: auto;
  font: 12px/1.5 var(--font-mono);
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 7px;
  user-select: text;
}
.del {
  color: var(--danger);
}
.add {
  color: var(--ok);
}
.acts {
  display: flex;
  gap: 6px;
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  font: 500 12.5px var(--font-ui);
  color: var(--text-2);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 7px;
  cursor: pointer;
}
.btn.sm {
  height: 26px;
  padding: 0 10px;
  font-size: 12px;
}
.btn:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--line-3);
}
.btn.danger {
  color: var(--danger);
  border-color: var(--danger-line);
}
.btn.danger:hover:not(:disabled) {
  background: var(--danger-soft);
  border-color: var(--danger);
}
.btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.muted {
  color: var(--text-4);
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 60px 20px;
  color: var(--text-5);
  text-align: center;
}
.empty p {
  max-width: 420px;
  color: var(--text-3);
}
</style>
