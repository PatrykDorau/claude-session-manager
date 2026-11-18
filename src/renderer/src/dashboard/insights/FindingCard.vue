<script setup lang="ts">
import { computed } from 'vue'
import type { InsightsFinding, InsightsIncident, InsightsProposal, InsightsTip } from '../../types'
import Icon from '../Icon.vue'
import { METRIC_LABELS, formatMetric } from './palette'

const props = defineProps<{
  finding: InsightsFinding
  proposal: InsightsProposal | null
  tip: InsightsTip | null
  incidents: InsightsIncident[]
  metricValue: number | null
  busy: string | null
}>()
const emit = defineEmits<{
  apply: [p: InsightsProposal]
  test: [p: InsightsProposal]
  dismiss: [p: InsightsProposal]
}>()

const KIND_LABELS: Record<InsightsIncident['kind'], string> = {
  correction: 'Correction',
  'tool-errors': 'Tool errors',
  rule: 'Rule break',
  repeat: 'Repeated command',
  'big-context': 'Big context'
}

const metricText = computed(() =>
  props.metricValue === null
    ? METRIC_LABELS[props.finding.metric]
    : `${METRIC_LABELS[props.finding.metric]} ${formatMetric(props.finding.metric, props.metricValue)}`
)
const shortId = (id: string): string => id.slice(0, 8)
const onApply = (p: InsightsProposal): void => emit('apply', p)
const onTest = (p: InsightsProposal): void => emit('test', p)
const onDismiss = (p: InsightsProposal): void => emit('dismiss', p)
</script>

<template>
  <article class="card" :class="`sev-${finding.severity}`">
    <header class="top">
      <span class="sev">{{ finding.severity }}</span>
      <b class="title">{{ finding.title }}</b>
      <span class="grow" />
      <span class="metric">{{ metricText }}</span>
    </header>
    <p class="cause">{{ finding.cause }}</p>
    <div v-if="finding.sessions.length" class="chips">
      <span v-for="s in finding.sessions" :key="s" class="chip" :title="s">{{ shortId(s) }}</span>
    </div>
    <details v-if="incidents.length" class="more">
      <summary>Show what happened ({{ incidents.length }})</summary>
      <div class="incidents">
        <div v-for="incident in incidents" :key="incident.id" class="incident">
          <div class="ihead">
            <b>{{ KIND_LABELS[incident.kind] ?? incident.kind }}</b>
            <span class="chip" :title="incident.sessionId">{{ shortId(incident.sessionId) }}</span>
            <span v-if="incident.ticket" class="chip">{{ incident.ticket }}</span>
          </div>
          <div v-for="(turn, i) in incident.before" :key="i" class="turn">
            <div v-if="turn.text" class="ttext">{{ turn.text }}</div>
            <div v-if="turn.tools.length" class="tools">{{ turn.tools.join('\n') }}</div>
          </div>
          <div v-if="incident.user" class="user">{{ incident.user }}</div>
        </div>
      </div>
    </details>

    <section v-if="proposal" class="sub" :class="{ dismissed: proposal.isDismissed }">
      <header class="top">
        <Icon name="sparkles" :size="13" />
        <b>{{ proposal.title }}</b>
        <span class="grow" />
        <span v-if="proposal.isApplied" class="pill ok">Applied</span>
        <span v-else-if="proposal.isDismissed" class="pill">Dismissed</span>
      </header>
      <p class="line"><span class="key">Why</span>{{ proposal.why }}</p>
      <p class="line"><span class="key">Expected</span>{{ proposal.expected }}</p>
      <div class="target" :title="proposal.target">{{ proposal.target }}</div>
      <div class="acts">
        <button class="btn sm" :disabled="!!busy || proposal.isApplied" @click="onApply(proposal)">
          <Icon name="check" :size="12" />Apply
        </button>
        <button class="btn sm" :disabled="!!busy" @click="onTest(proposal)">
          <Icon name="play" :size="12" />Test first
        </button>
        <button
          v-if="!proposal.isDismissed && !proposal.isApplied"
          class="btn sm danger"
          :disabled="!!busy"
          @click="onDismiss(proposal)"
        >
          <Icon name="close" :size="12" />Dismiss
        </button>
      </div>
      <details class="more">
        <summary>Show change</summary>
        <pre
          class="diff"
        ><span v-for="(l, i) in proposal.find.split('\n')" :key="`f${i}`" class="del">- {{ l }}
</span><span v-for="(l, i) in proposal.replace.split('\n')" :key="`r${i}`" class="add">+ {{ l }}
</span></pre>
      </details>
    </section>

    <section v-if="tip" class="sub">
      <header class="top">
        <Icon name="info" :size="13" />
        <b>{{ tip.title }}</b>
      </header>
      <p class="line">{{ tip.detail }}</p>
    </section>
  </article>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  border-left: 3px solid var(--text-4);
  border-radius: 10px;
}
.card.sev-high {
  border-left-color: var(--danger);
}
.card.sev-medium {
  border-left-color: var(--warn);
}
.top {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
  color: var(--text);
}
.title {
  min-width: 0;
}
.sev {
  flex: none;
  padding: 0 7px;
  font: 600 10.5px/18px var(--font-ui);
  text-transform: uppercase;
  color: var(--text-4);
  background: var(--bg-3);
  border-radius: 9px;
}
.sev-high .sev {
  color: var(--danger);
  background: var(--danger-soft);
}
.sev-medium .sev {
  color: var(--warn);
  background: var(--warn-soft);
}
.grow {
  flex: 1;
}
.metric {
  flex: none;
  font: 12px var(--font-mono);
  color: var(--text-3);
}
.cause {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-2);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.chip {
  padding: 0 6px;
  font: 11px/18px var(--font-mono);
  color: var(--text-3);
  background: var(--bg-3);
  border-radius: 5px;
}
.more summary {
  font-size: 12px;
  color: var(--text-3);
  cursor: pointer;
}
.more summary:hover {
  color: var(--text);
}
.incidents {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 320px;
  margin-top: 6px;
  overflow-y: auto;
}
.incident {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  font-size: 12px;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 7px;
  user-select: text;
}
.ihead {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text);
}
.turn {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-left: 8px;
  border-left: 2px solid var(--line-2);
}
.ttext {
  max-height: 72px;
  overflow-y: auto;
  white-space: pre-wrap;
  color: var(--text-3);
}
.tools {
  max-height: 60px;
  overflow-y: auto;
  white-space: pre-wrap;
  font: 11px/1.4 var(--font-mono);
  color: var(--text-4);
}
.user {
  max-height: 72px;
  overflow-y: auto;
  padding-left: 8px;
  white-space: pre-wrap;
  color: var(--text);
  border-left: 2px solid var(--warn);
}
.sub {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.sub .top {
  color: var(--accent);
  font-size: 13px;
}
.sub .top b {
  color: var(--text);
}
.sub.dismissed {
  opacity: 0.55;
}
.line {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-2);
}
.key {
  display: inline-block;
  min-width: 62px;
  margin-right: 6px;
  font-size: 11.5px;
  color: var(--text-4);
}
.pill {
  padding: 0 8px;
  font: 600 11.5px/20px var(--font-ui);
  color: var(--text-4);
  background: var(--bg-3);
  border-radius: 10px;
}
.pill.ok {
  color: var(--ok);
}
.target {
  align-self: flex-start;
  max-width: 100%;
  padding: 0 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 11.5px/20px var(--font-mono);
  color: var(--text-3);
  background: var(--bg-3);
  border-radius: 5px;
}
.diff {
  margin: 6px 0 0;
  padding: 8px 10px;
  max-height: 260px;
  overflow: auto;
  font: 12px/1.5 var(--font-mono);
  background: var(--bg-2);
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
</style>
