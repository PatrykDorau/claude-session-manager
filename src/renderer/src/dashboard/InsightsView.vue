<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import type {
  InsightsApplied,
  InsightsDayMetrics,
  InsightsEffect,
  InsightsIncident,
  InsightsMetricKey,
  InsightsProposal,
  InsightsReport,
  InsightsTip
} from '../types'
import { ago } from '../display'
import { bucketShares, formatCompact, formatMinutes, markerIndexes, tileDelta } from './charts'
import Icon from './Icon.vue'
import EChart from './insights/EChart.vue'
import FindingCard from './insights/FindingCard.vue'
import {
  BUCKETS,
  HIGH_BUCKETS,
  METRIC_LABELS,
  PROBLEMS,
  TICKET_COLOR,
  formatMetric,
  modelColor,
  shortModel,
  stageColor,
  type ChartSeries
} from './insights/palette'
import {
  costPerDayOption,
  donutOption,
  hbarOption,
  linesOption,
  sparkOption,
  type BarItem,
  type DayColumn,
  type DayMarker
} from './insights/options'

const TILE_KEYS: InsightsMetricKey[] = [
  'costUnits',
  'sessions',
  'avgContext',
  'corrections',
  'ruleBreaks'
]
const NEUTRAL_KEYS: InsightsMetricKey[] = ['sessions']
const VERDICT_LABELS: Record<InsightsEffect['verdict'], string> = {
  improved: 'Improved',
  'no-change': 'No change',
  worse: 'Worse',
  'too-early': 'Too early'
}
const TICKET_LIMIT = 8
const BAR_ROW_HEIGHT = 28
const SPARK_COLOR = '#a78bfa'

const report = ref<InsightsReport | null>(null)
const busy = ref<string | null>(null)
const notice = ref<string | null>(null)
const tab = ref<'claude' | 'you'>('claude')
let stopListening: (() => void) | null = null

const load = async (): Promise<void> => {
  report.value = await window.api.getInsightsReport()
}
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
  const result = await window.api.runInsightsNow()
  if (result.error) notice.value = result.error
  await load()
}
const applyProposal = (p: InsightsProposal): Promise<void> =>
  run(`apply-${p.id}`, () => window.api.applyInsightsProposal(p.id))
const testProposal = (p: InsightsProposal): Promise<void> =>
  run(`test-${p.id}`, () => window.api.testInsightsProposal(p.id))
const dismissProposal = (p: InsightsProposal): Promise<void> =>
  run(`dismiss-${p.id}`, () => window.api.dismissInsightsProposal(p.id))

const isValidDay = (entry: InsightsDayMetrics): boolean =>
  typeof entry?.costUnits === 'number' && typeof entry?.day === 'string'
const byDay = (a: InsightsDayMetrics, b: InsightsDayMetrics): number => a.day.localeCompare(b.day)
const numberOf = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0
const dayLabel = (day: string): string => day.slice(5)

const history = computed(() =>
  (report.value?.history ?? []).filter(isValidDay).sort(byDay).slice(-30)
)
const latest = computed(() => history.value[history.value.length - 1] ?? null)
const week = computed(() => history.value.slice(-7))
const applied = computed(() => report.value?.applied ?? [])
const isEmpty = computed(() => !report.value?.result && history.value.length === 0)

const tiles = computed(() => {
  const today = latest.value
  if (!today) return []
  const earlier = history.value.slice(-8, -1)
  return TILE_KEYS.map((key) => {
    const delta = tileDelta(
      numberOf(today[key]),
      earlier.map((day) => numberOf(day[key]))
    )
    const pct = delta.deltaPct
    const tone =
      pct === null || pct === 0 || NEUTRAL_KEYS.includes(key)
        ? 'neutral'
        : pct > 0
          ? 'worse'
          : 'better'
    return {
      key,
      label: METRIC_LABELS[key],
      value: formatMetric(key, delta.value),
      delta: pct === null ? null : `${pct > 0 ? '+' : ''}${pct}% vs 7d`,
      tone
    }
  })
})

const modelCosts = (day: InsightsDayMetrics): Record<string, number> => {
  const costs = day.costByModel ?? {}
  return Object.keys(costs).length ? costs : { unknown: day.costUnits }
}
const costSeries = computed<ChartSeries[]>(() => {
  const totals: Record<string, number> = {}
  history.value.forEach((day) =>
    Object.entries(modelCosts(day)).forEach(
      ([model, cost]) => (totals[model] = (totals[model] ?? 0) + numberOf(cost))
    )
  )
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .map(([model]) => ({ key: model, label: shortModel(model), color: modelColor(model) }))
})
const costColumns = computed<DayColumn[]>(() =>
  history.value.map((day) => ({
    label: dayLabel(day.day),
    day: day.day,
    values: Object.fromEntries(
      Object.entries(modelCosts(day)).map(([model, cost]) => [model, numberOf(cost)])
    )
  }))
)
const markers = computed<DayMarker[]>(() => {
  const days = history.value.map((day) => day.day)
  return markerIndexes(days, applied.value).map((index) => ({
    index,
    title: applied.value
      .filter((entry) => entry.day === days[index])
      .map((entry) => `Applied: ${entry.title}`)
      .join(' · ')
  }))
})
const totalCost = computed(() =>
  history.value.reduce((sum, day) => sum + numberOf(day.costUnits), 0)
)
const costOption = computed(() =>
  costPerDayOption(costColumns.value, costSeries.value, markers.value)
)
const isShortHistory = computed(() => history.value.length < 3)

const bucketCost = (day: InsightsDayMetrics, key: string): number =>
  numberOf(day.buckets?.[key as keyof InsightsDayMetrics['buckets']]?.cost)
const highShareOf = (days: InsightsDayMetrics[]): number => {
  const buckets = Object.fromEntries(
    BUCKETS.map((b) => [
      b.key,
      { cost: days.reduce((total, day) => total + bucketCost(day, b.key), 0) }
    ])
  )
  const share = bucketShares(buckets)
    .filter((entry) => HIGH_BUCKETS.some((key) => key === entry.key))
    .reduce((total, entry) => total + entry.share, 0)
  return Math.round(share * 100)
}
const todaySlices = computed(() =>
  BUCKETS.map((b) => ({
    label: b.label,
    color: b.color,
    value: latest.value ? bucketCost(latest.value, b.key) : 0
  }))
)
const todayContextCost = computed(() =>
  todaySlices.value.reduce((total, slice) => total + slice.value, 0)
)
const isContextEmpty = computed(() => todayContextCost.value === 0)
const contextOption = computed(() =>
  donutOption(todaySlices.value, `${latest.value ? highShareOf([latest.value]) : 0}%`, 'above 200k')
)
const weekHighShare = computed(() => highShareOf(week.value))

const stageItems = computed<BarItem[]>(() => {
  const stages = latest.value?.costByStage ?? {}
  const total = Object.values(stages).reduce((sum, cost) => sum + numberOf(cost), 0)
  return Object.entries(stages)
    .map(([stage, cost]) => ({ stage, cost: numberOf(cost) }))
    .filter((entry) => entry.cost > 0)
    .sort((a, b) => b.cost - a.cost)
    .map(({ stage, cost }) => {
      const pct = total ? Math.round((cost / total) * 100) : 0
      return {
        label: stage,
        value: cost,
        color: stageColor(stage),
        text: `${formatCompact(cost)} · ${pct}%`,
        tip: `<b>${stage}</b><br/>${formatCompact(cost)} · ${pct}% of the day`
      }
    })
})
const stageOption = computed(() => hbarOption(stageItems.value))
const stageTotal = computed(() => stageItems.value.reduce((sum, item) => sum + item.value, 0))

const allTickets = computed(() => latest.value?.tickets ?? [])
const ticketItems = computed<BarItem[]>(() =>
  [...allTickets.value]
    .sort((a, b) => numberOf(b.cost) - numberOf(a.cost))
    .slice(0, TICKET_LIMIT)
    .map((t) => ({
      label: t.ticket,
      value: numberOf(t.cost),
      color: TICKET_COLOR,
      text: formatCompact(numberOf(t.cost)),
      tip: `<b>${t.ticket}</b> · ${formatCompact(numberOf(t.cost))}<br/>${t.sessions} ${t.sessions === 1 ? 'session' : 'sessions'} · ${formatMinutes(numberOf(t.activeMinutes))}`
    }))
)
const ticketOption = computed(() => hbarOption(ticketItems.value))
const ticketHeight = computed(() => Math.max(ticketItems.value.length, 1) * BAR_ROW_HEIGHT + 8)
const stageHeight = computed(() => Math.max(stageItems.value.length * BAR_ROW_HEIGHT + 8, 180))

const isProblemTrend = computed(() => history.value.length >= 2)
const problemOption = computed(() =>
  linesOption(
    history.value.map((day) => dayLabel(day.day)),
    PROBLEMS.map((p) => ({ ...p, values: history.value.map((day) => numberOf(day[p.key])) })),
    markers.value
  )
)
const problemChips = computed(() =>
  PROBLEMS.map((p) => ({
    ...p,
    value: formatCompact(latest.value ? numberOf(latest.value[p.key]) : 0)
  }))
)

const incidentsById = computed(
  () => new Map((report.value?.incidents ?? []).map((incident) => [incident.id, incident]))
)
const findings = computed(() => report.value?.result?.findings ?? [])
const findingsOf = computed(() => findings.value.filter((f) => f.kind === tab.value))
const claudeCount = computed(() => findings.value.filter((f) => f.kind === 'claude').length)
const youCount = computed(() => findings.value.filter((f) => f.kind === 'you').length)
const proposalFor = (findingId: string): InsightsProposal | null =>
  report.value?.result?.proposals.find((p) => p.finding === findingId) ?? null
const tipFor = (findingId: string): InsightsTip | null =>
  report.value?.result?.tips.find((t) => t.finding === findingId) ?? null
const incidentsFor = (ids: string[]): InsightsIncident[] =>
  ids.flatMap((id) => {
    const incident = incidentsById.value.get(id)
    return incident ? [incident] : []
  })
const metricValueOf = (metric: InsightsMetricKey): number | null =>
  latest.value ? numberOf(latest.value[metric]) : null

const effects = computed(() =>
  applied.value.map((entry: InsightsApplied) => {
    const effect = report.value?.result?.effects.find((e) => e.proposal === entry.id) ?? null
    const values = history.value.map((day) => numberOf(day[entry.metric]))
    const applyIndex = history.value.findIndex((day) => day.day === entry.day)
    return {
      entry,
      verdict: effect?.verdict ?? null,
      note: effect?.note ?? '',
      option: sparkOption(values, applyIndex < 0 ? null : applyIndex, SPARK_COLOR)
    }
  })
)

onMounted(() => {
  void load()
  stopListening = window.api.onInsightsChanged(load)
})
onBeforeUnmount(() => stopListening?.())
</script>

<template>
  <div class="fv">
    <header class="fhead">
      <Icon name="sparkles" :size="18" />
      <h1>Insights</h1>
      <span class="sub">
        <template v-if="report?.isRunning">Scoring the last 24 h…</template>
        <template v-else-if="report?.lastRun">Last run {{ ago(report.lastRun) }}</template>
        <template v-else>Never run</template>
      </span>
      <span class="grow" />
      <button class="btn" :disabled="!!report?.isRunning" @click="runNow">
        <Icon name="play" :size="14" />Run now
      </button>
    </header>
    <p v-if="notice" class="notice">{{ notice }}</p>
    <p v-else-if="report?.lastError && !report.isRunning" class="notice">
      Last run failed: {{ report.lastError }}
    </p>
    <div class="body">
      <p v-if="report === null" class="muted">Loading…</p>
      <div v-else-if="isEmpty" class="empty">
        <Icon name="sparkles" :size="34" />
        <p>
          No report yet. Insights scores the last 24 h of Claude sessions once a day; press Run now
          to score them now.
        </p>
      </div>
      <div v-else class="page">
        <p v-if="report.result?.headline" class="headline">{{ report.result.headline }}</p>

        <section v-if="tiles.length" class="tiles">
          <div v-for="t in tiles" :key="t.key" class="tile">
            <span class="tlabel">{{ t.label }}</span>
            <b class="tvalue">{{ t.value }}</b>
            <span v-if="t.delta" class="tdelta" :class="t.tone">{{ t.delta }}</span>
          </div>
        </section>

        <section class="grid">
          <div class="chartcard wide">
            <header class="chead">
              <h2>Cost per day</h2>
              <span class="csub"
                >{{ formatCompact(totalCost) }} over {{ history.length }}
                {{ history.length === 1 ? 'day' : 'days' }}</span
              >
            </header>
            <EChart :option="costOption" :height="260" />
            <p v-if="isShortHistory" class="caption">Trend fills in as days accumulate</p>
          </div>
          <div class="chartcard">
            <header class="chead">
              <h2>Where the cost sits</h2>
              <span class="csub">context size · {{ formatCompact(todayContextCost) }} today</span>
            </header>
            <p v-if="isContextEmpty" class="placeholder">No cost recorded today</p>
            <template v-else>
              <EChart :option="contextOption" :height="200" />
              <p class="caption">7d avg: {{ weekHighShare }}% above 200k</p>
            </template>
          </div>
          <div class="chartcard">
            <header class="chead">
              <h2>Cost by stage</h2>
              <span class="csub"
                >{{ formatCompact(stageTotal) }} · {{ latest?.day ?? 'today' }}</span
              >
            </header>
            <p v-if="!stageItems.length" class="placeholder">No stage data today</p>
            <EChart v-else :option="stageOption" :height="stageHeight" />
          </div>
          <div class="chartcard">
            <header class="chead">
              <h2>Problems per day</h2>
              <span class="csub">{{
                isProblemTrend ? `last ${history.length} days` : (latest?.day ?? 'today')
              }}</span>
            </header>
            <EChart v-if="isProblemTrend" :option="problemOption" :height="220" />
            <div v-else class="chips">
              <div v-for="c in problemChips" :key="c.key" class="chip">
                <b class="chipvalue">{{ c.value }}</b>
                <span class="chiplabel"
                  ><i class="dot" :style="{ background: c.color }" />{{ c.label }}</span
                >
              </div>
            </div>
          </div>
          <div class="chartcard">
            <header class="chead">
              <h2>Tickets</h2>
              <span class="csub"
                >{{
                  allTickets.length > TICKET_LIMIT
                    ? `top ${TICKET_LIMIT} of ${allTickets.length}`
                    : allTickets.length
                }}
                · {{ latest?.day ?? 'today' }}</span
              >
            </header>
            <p v-if="!ticketItems.length" class="placeholder">No ticket sessions today</p>
            <EChart v-else :option="ticketOption" :height="ticketHeight" />
          </div>
        </section>

        <section v-if="report.result" class="findings">
          <div class="tabs">
            <button class="tabbtn" :class="{ on: tab === 'claude' }" @click="tab = 'claude'">
              Claude · {{ claudeCount }}
            </button>
            <button class="tabbtn" :class="{ on: tab === 'you' }" @click="tab = 'you'">
              You · {{ youCount }}
            </button>
            <span class="grow" />
            <span class="sub">{{ report.day }}</span>
          </div>
          <p v-if="!findingsOf.length" class="muted">No findings here.</p>
          <FindingCard
            v-for="f in findingsOf"
            :key="f.id"
            :finding="f"
            :proposal="f.kind === 'claude' ? proposalFor(f.id) : null"
            :tip="f.kind === 'you' ? tipFor(f.id) : null"
            :incidents="incidentsFor(f.incidents)"
            :metric-value="metricValueOf(f.metric)"
            :busy="busy"
            @apply="applyProposal"
            @test="testProposal"
            @dismiss="dismissProposal"
          />
        </section>
        <p v-else class="muted">No analysis yet. Press Run now to score the last 24 h.</p>

        <section v-if="effects.length" class="effects">
          <h2>Effects of applied changes</h2>
          <div v-for="e in effects" :key="e.entry.id" class="effect">
            <span class="verdict" :class="e.verdict ?? 'pending'">{{
              e.verdict ? VERDICT_LABELS[e.verdict] : 'Pending'
            }}</span>
            <div class="etext">
              <b :title="e.entry.target">{{ e.entry.title }}</b>
              <span class="enote"
                >{{ METRIC_LABELS[e.entry.metric] }} · applied {{ e.entry.day
                }}<template v-if="e.note"> · {{ e.note }}</template></span
              >
            </div>
            <div class="spark">
              <EChart :option="e.option" :height="32" />
            </div>
          </div>
        </section>
      </div>
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
.page {
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-width: 1200px;
}
h2 {
  margin: 0 0 10px;
  font: 600 13px var(--font-ui);
  color: var(--text-3);
}
.headline {
  margin: 0;
  font-size: 15px;
  color: var(--text);
}
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}
.tile {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  border-radius: 10px;
}
.tlabel {
  font-size: 11.5px;
  color: var(--text-4);
}
.tvalue {
  font: 600 20px var(--font-mono);
  color: var(--text);
}
.tdelta {
  font-size: 11.5px;
  color: var(--text-4);
}
.tdelta.worse {
  color: var(--danger);
}
.tdelta.better {
  color: var(--ok);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
  gap: 14px;
}
.chartcard {
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 16px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent), #202020;
  border: 1px solid var(--line);
  border-radius: 14px;
}
.chartcard.wide {
  grid-column: 1 / -1;
}
.chead {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 12px;
}
.chead h2 {
  margin: 0;
  font: 600 13px var(--font-ui);
  color: var(--text);
}
.csub {
  font-size: 12px;
  color: var(--text-4);
}
.caption {
  margin: 8px 0 0;
  font-size: 11.5px;
  color: var(--text-4);
}
.placeholder {
  flex: 1;
  display: grid;
  place-items: center;
  min-height: 160px;
  margin: 0;
  font-size: 12.5px;
  color: var(--text-4);
}
.chips {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  align-content: center;
  min-height: 180px;
}
.chip {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px 14px;
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid var(--line);
  border-radius: 12px;
}
.chipvalue {
  font: 600 28px/1 var(--font-ui);
  color: var(--text);
}
.chiplabel {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-3);
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.findings {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  border-bottom: 1px solid var(--line);
}
.tabbtn {
  height: 30px;
  padding: 0 12px;
  font: 500 12.5px var(--font-ui);
  color: var(--text-3);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
}
.tabbtn:hover {
  color: var(--text);
}
.tabbtn.on {
  color: var(--text);
  border-bottom-color: var(--accent);
}
.effects {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.effects h2 {
  margin: 0;
}
.effect {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  border-radius: 10px;
}
.verdict {
  flex: none;
  min-width: 74px;
  padding: 0 8px;
  font: 600 11.5px/20px var(--font-ui);
  text-align: center;
  color: var(--text-4);
  background: var(--bg-3);
  border-radius: 10px;
}
.verdict.improved {
  color: var(--ok);
}
.verdict.worse {
  color: var(--danger);
  background: var(--danger-soft);
}
.verdict.too-early {
  color: var(--info);
  background: var(--info-soft);
}
.etext {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12.5px;
  color: var(--text);
}
.enote {
  font-size: 12px;
  color: var(--text-3);
}
.spark {
  flex: none;
  width: 120px;
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
.btn:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--line-3);
}
.btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.muted {
  margin: 0;
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
