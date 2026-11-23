<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { FlowAgent, FlowRole, FlowStage, FlowState, FlowTicket } from '../types'
import type { TaskRow } from '../taskview'
import { ago } from '../display'
import Icon from './Icon.vue'
import type { IconName } from './icons'

const props = defineProps<{ rows: TaskRow[] }>()
const emit = defineEmits<{ openTicket: [key: string] }>()

const flow = ref<FlowState | null>(null)
const keys = computed(() => props.rows.map((r) => r.key))
let loadId = 0
const load = async (): Promise<void> => {
  const id = ++loadId
  try {
    const next = await window.api.getFlow(keys.value)
    if (id === loadId) flow.value = next
  } catch {
    if (id === loadId) flow.value = null
  }
}
const reload = (): void => void load()
let timer: ReturnType<typeof setInterval> | null = null
const startTimer = (): void => {
  reload()
  timer = setInterval(reload, 30_000)
}
const stopTimer = (): void => {
  if (timer) clearInterval(timer)
}
onMounted(startTimer)
onUnmounted(stopTimer)
watch(keys, reload)

const stageNumbers = computed(() => new Set(flow.value?.skill.stages.map((s) => s.n) ?? []))
const ticketsAt = (n: number): FlowTicket[] => flow.value?.tickets.filter((t) => t.n === n) ?? []
const unplaced = computed(() => flow.value?.tickets.filter((t) => t.n === null || !stageNumbers.value.has(t.n)) ?? [])
const isUnplacedOpen = ref(false)
const toggleUnplaced = (): void => {
  isUnplacedOpen.value = !isUnplacedOpen.value
}
const openStage = ref<number | null>(null)
const toggleStage = (n: number): void => {
  openStage.value = openStage.value === n ? null : n
}
const summaryOf = (key: string): string => props.rows.find((r) => r.key === key)?.summary ?? ''
const chipTitle = (t: FlowTicket): string =>
  [summaryOf(t.key), t.stage && `Etap: ${t.stage}`, t.next && `Następny: ${t.next}`, t.firstStep && `Krok 1: ${t.firstStep}`].filter(Boolean).join('\n')
const sizeLabel = (t: FlowTicket): string => (t.size ? `${t.size}${t.risk ? ` · ${t.risk}` : ''}` : '')
const openSkill = (): void => window.api.openFlowSkill()
const open = (key: string): void => emit('openTicket', key)

const STAGE_ICONS: [RegExp, IconName][] = [
  [/brainstorm/i, 'message'],
  [/repro/i, 'play'],
  [/plan|implement/i, 'code'],
  [/verify/i, 'check'],
  [/analy/i, 'search'],
  [/qa|test case/i, 'clipboard'],
  [/review/i, 'diff'],
  [/\bmr\b|merge/i, 'pr']
]
const stageIcon = (s: FlowStage): IconName => STAGE_ICONS.find(([pattern]) => pattern.test(s.title))?.[1] ?? 'info'
const modelClass = (model: string): string => /opus|sonnet|haiku/i.exec(model)?.[0].toLowerCase() ?? 'other'
const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)
const agentOf = (name: string): FlowAgent | undefined => flow.value?.agents.find((a) => a.name === name)
const agentModel = (name: string, role: FlowRole): string => {
  const model = agentOf(name)?.model
  return model ? capitalize(model) : role.model
}
const roleLabel = (s: FlowStage, r: FlowRole): string => (s.roles.length > 1 ? r.stage.replace(/^\d+\.\s*/, '') : '')
const agentTitle = (name: string): string => agentOf(name)?.description ?? name
</script>

<template>
  <div class="flv">
    <header class="fhead">
      <Icon name="flow" :size="18" />
      <h1>Flow</h1>
      <span v-if="flow?.updatedAt" class="sub">task-workflow · changed {{ ago(flow.updatedAt) }}</span>
      <span class="grow" />
      <button class="btn" @click="openSkill"><Icon name="external" :size="14" />Open SKILL.md</button>
    </header>
    <div v-if="flow" class="body">
      <template v-if="flow.skill.error">
        <p class="warn">Could not read the flow: {{ flow.skill.error }}. Showing {{ flow.skillPath }} as text.</p>
        <pre class="raw">{{ flow.raw }}</pre>
      </template>
      <template v-else>
        <div class="legend">
          <span class="who main"><Icon name="user" :size="12" />main</span>
          <span class="hint">the session you talk to: decides, keeps the ledger</span>
          <span class="who agent"><Icon name="bot" :size="12" />agent</span>
          <span class="hint">separate fresh context, cannot ask you</span>
          <span class="gate"><Icon name="globe" :size="12" /></span>
          <span class="hint">runs only when the effect is visible in the app</span>
          <span class="m opus">Opus</span>
          <span class="m sonnet">Sonnet</span>
          <span class="m haiku">Haiku</span>
        </div>
        <div v-if="flow.boosters.length" class="boosters">
          <span class="blabel"><Icon name="gauge" :size="13" />Always on</span>
          <span v-for="b in flow.boosters" :key="b.id" class="booster"><b>{{ b.name }}</b>{{ b.detail }}</span>
        </div>
        <div class="lane">
          <template v-for="(s, i) in flow.skill.stages" :key="s.n">
            <Icon v-if="i > 0" class="arrow" name="chevronRight" :size="16" />
            <section class="stage" :class="{ busy: ticketsAt(s.n).length }">
              <div class="top">
                <span class="num">{{ s.n }}</span>
                <span class="sicon"><Icon :name="stageIcon(s)" :size="15" /></span>
                <span class="grow" />
                <span v-if="s.isGated" class="gate" title="Runs only when the browser gate said yes"><Icon name="globe" :size="13" /></span>
                <button v-if="ticketsAt(s.n).length" class="count" :class="{ on: openStage === s.n }" :title="`Show the tickets at stage ${s.n}`" @click="toggleStage(s.n)">{{ ticketsAt(s.n).length }}</button>
              </div>
              <h2>{{ s.title }}</h2>
              <div v-for="r in s.roles" :key="r.stage" class="role">
                <span v-if="roleLabel(s, r)" class="rlabel">{{ roleLabel(s, r) }}</span>
                <div v-if="r.isMain" class="line">
                  <span class="who main"><Icon name="user" :size="12" />main</span>
                  <span class="m" :class="modelClass(r.model)">{{ r.model }}</span>
                </div>
                <span v-if="r.isMain && r.agents.length" class="or">or, when Subagent-Driven</span>
                <div v-for="a in r.agents" :key="a" class="line">
                  <span class="who agent" :title="agentTitle(a)"><Icon name="bot" :size="12" />{{ a }}</span>
                  <span class="m" :class="modelClass(agentModel(a, r))">{{ agentModel(a, r) }}</span>
                </div>
                <div v-if="!r.isMain && !r.agents.length" class="line">
                  <span class="who">{{ r.who }}</span>
                  <span class="m" :class="modelClass(r.model)">{{ r.model }}</span>
                </div>
              </div>
            </section>
          </template>
        </div>
        <div v-if="openStage !== null && ticketsAt(openStage).length" class="chips staged">
          <span class="slabel">Stage {{ openStage }}</span>
          <button v-for="t in ticketsAt(openStage)" :key="t.key" class="chip" :class="t.risk" :title="chipTitle(t)" @click="open(t.key)">
            <b>{{ t.key }}</b><span v-if="sizeLabel(t)">{{ sizeLabel(t) }}</span>
          </button>
        </div>
        <div v-if="unplaced.length" class="unplaced">
          <button class="toggle" @click="toggleUnplaced">
            <Icon :name="isUnplacedOpen ? 'chevronDown' : 'chevronRight'" :size="14" />{{ unplaced.length }} tickets without a handoff stage
          </button>
          <div v-if="isUnplacedOpen" class="ulist">
            <button v-for="t in unplaced" :key="t.key" class="chip" :title="chipTitle(t)" @click="open(t.key)"><b>{{ t.key }}</b></button>
          </div>
        </div>
        <div class="rules">
          <section v-if="flow.skill.sizes.length">
            <h3>Size → stages and models</h3>
            <table>
              <thead>
                <tr><th v-for="h in flow.skill.sizes[0]" :key="h">{{ h }}</th></tr>
              </thead>
              <tbody>
                <tr v-for="row in flow.skill.sizes.slice(1)" :key="row[0]">
                  <td v-for="(cell, ci) in row" :key="ci" :class="{ size: ci === 0 }">{{ cell }}</td>
                </tr>
              </tbody>
            </table>
          </section>
          <section v-if="flow.skill.risk.length">
            <h3>Risk</h3>
            <ul class="risk">
              <li v-for="r in flow.skill.risk" :key="r" :class="r.split(' ')[0].replace(/:$/, '')">{{ r }}</li>
            </ul>
          </section>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.flv {
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
.btn:hover {
  color: var(--text);
  border-color: var(--line-3);
}
.body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px;
}
.warn {
  margin: 0 0 10px;
  font-size: 12.5px;
  color: var(--warn);
}
.raw {
  font: 12px/1.5 var(--font-mono);
  color: var(--text-3);
  white-space: pre-wrap;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  margin-bottom: 12px;
  font-size: 11.5px;
}
.hint {
  margin-right: 12px;
  color: var(--text-4);
}
.boosters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  font-size: 11.5px;
}
.blabel {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--text-3);
}
.booster {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 9px;
  color: var(--text-3);
  background: var(--bg-2);
  border: 1px dashed var(--line-3);
  border-radius: 12px;
}
.booster b {
  color: var(--text);
}
.lane {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 8px 4px;
  padding-bottom: 6px;
}
.arrow {
  flex: none;
  align-self: center;
  color: var(--text-4);
}
.stage {
  flex: 1 0 170px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 190px;
  padding: 12px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 10px;
}
.stage.busy {
  border-color: var(--accent);
}
.top {
  display: flex;
  align-items: center;
  gap: 6px;
}
.num {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  font: 600 12px var(--font-ui);
  color: var(--accent);
  border: 1px solid var(--accent);
  border-radius: 50%;
}
.sicon {
  display: inline-flex;
  color: var(--text-3);
}
.count {
  min-width: 20px;
  height: 18px;
  padding: 0 6px;
  display: grid;
  place-items: center;
  font: 600 11px var(--font-ui);
  color: var(--bg-1);
  background: var(--accent);
  border-radius: 9px;
  border: 0;
  cursor: pointer;
}
.count.on {
  outline: 2px solid color-mix(in srgb, var(--accent) 45%, transparent);
}
.stage h2 {
  margin: 0;
  font: 600 13px/1.3 var(--font-ui);
  color: var(--text);
}
.role {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.rlabel {
  font-size: 10.5px;
  color: var(--text-4);
}
.line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
}
.or {
  font-size: 10.5px;
  font-style: italic;
  color: var(--text-4);
}
.who {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 20px;
  padding: 0 7px;
  font: 500 11.5px var(--font-ui);
  color: var(--text-2);
  border-radius: 5px;
}
.who.main {
  color: var(--text);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
}
.who.agent {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
}
.gate {
  display: inline-flex;
  align-items: center;
  color: #5ec8ff;
}
.m {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 6px;
  font: 600 10.5px var(--font-ui);
  color: var(--text-3);
  border: 1px solid var(--line-2);
  border-radius: 9px;
}
.m.opus {
  color: #e8b84a;
  border-color: color-mix(in srgb, #e8b84a 50%, transparent);
}
.m.sonnet {
  color: #6aa9ff;
  border-color: color-mix(in srgb, #6aa9ff 50%, transparent);
}
.m.haiku {
  color: #7fd19b;
  border-color: color-mix(in srgb, #7fd19b 50%, transparent);
}
.chips {
  margin-top: auto;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.chips.staged {
  margin-top: 10px;
  align-items: center;
}
.slabel {
  font-size: 11.5px;
  color: var(--text-3);
  margin-right: 4px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 8px;
  font: 500 11.5px var(--font-ui);
  color: var(--text-2);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 12px;
  cursor: pointer;
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
}
.chip b {
  font-weight: 600;
  color: var(--text);
}
.chip.high {
  border-color: var(--warn);
}
.chip.critical {
  border-color: var(--danger);
}
.chip:hover {
  background: var(--bg-2);
}
.unplaced {
  margin-top: 14px;
}
.toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0;
  font: 12px var(--font-ui);
  color: var(--text-4);
  background: none;
  border: none;
  cursor: pointer;
}
.toggle:hover {
  color: var(--text-2);
}
.ulist {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.rules {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: 24px;
  margin-top: 22px;
}
.rules h3 {
  margin: 0 0 8px;
  font: 600 12.5px var(--font-ui);
  color: var(--text-3);
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
th,
td {
  padding: 6px 8px;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid var(--line);
}
th {
  font-weight: 500;
  color: var(--text-4);
}
td {
  color: var(--text-2);
}
td.size {
  font-weight: 600;
  color: var(--accent);
}
.risk {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
  color: var(--text-2);
}
.risk li {
  padding-left: 10px;
  border-left: 2px solid var(--line-3);
}
.risk li.critical {
  border-color: var(--danger);
}
.risk li.high {
  border-color: var(--warn);
}
</style>
