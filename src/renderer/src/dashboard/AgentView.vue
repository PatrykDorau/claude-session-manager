<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import type { AgentGroup, AgentNode, AgentStep, Session } from '../types'
import { ago } from '../display'
import { STATE_LOOK, MODEL_LOOK, groupLabel } from './agenttree'
import Icon from './Icon.vue'

const props = defineProps<{ group: AgentGroup; session: Session | undefined }>()
const emit = defineEmits<{ 'open-ticket': [key: string] }>()

const RUN_INTERVAL_MS = 5000

const selectedId = ref<string | null>(null)
const steps = ref<AgentStep[] | null>(null)
let timer: ReturnType<typeof setTimeout> | null = null

const selected = computed<AgentNode | null>(() => props.group.agents.find((a) => a.id === selectedId.value) ?? null)
const label = computed(() => groupLabel(props.group.sessionId, props.session))

const loadRun = async (): Promise<void> => {
  if (timer) clearTimeout(timer)
  const agent = selected.value
  if (!agent) return
  steps.value = await window.api.getAgentRun(props.group.sessionId, agent.id)
  if (agent.state === 'working') timer = setTimeout(loadRun, RUN_INTERVAL_MS)
}
const pick = (id: string): void => {
  selectedId.value = id
  steps.value = null
  void loadRun()
}
watch(
  () => props.group.sessionId,
  () => {
    selectedId.value = props.group.agents[props.group.agents.length - 1]?.id ?? null
    steps.value = null
    void loadRun()
  },
  { immediate: true }
)
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})
</script>

<template>
  <div class="view">
    <header class="head">
      <Icon name="bot" :size="18" class="hicon" />
      <h1 class="title">{{ label }}</h1>
      <span v-if="session" class="sub">{{ session.projectName }}</span>
      <span v-if="session?.status === 'waiting'" class="needs">needs you</span>
      <span class="grow" />
      <span class="sub">{{ group.agents.length }} {{ group.agents.length === 1 ? 'agent' : 'agents' }}</span>
      <button v-if="session?.ticket" class="btn" title="Open the ticket with this session's terminal" @click="emit('open-ticket', session.ticket)">
        <Icon name="terminal" :size="14" />Open supervisor
      </button>
    </header>

    <div class="body">
      <section class="tree">
        <div class="root">
          <span class="rdot" :class="{ live: session?.isLive }" />
          <div>
            <b>{{ label }}</b>
            <small>Supervisor · {{ session?.isLive ? 'live' : 'not running' }}</small>
          </div>
        </div>
        <ol>
          <li v-for="a in group.agents" :key="a.id" :style="{ marginLeft: `${(a.depth - 1) * 20}px` }">
            <button class="node" :class="{ on: a.id === selectedId }" @click="pick(a.id)">
              <div class="nrow">
                <span class="state" :style="{ color: STATE_LOOK[a.state].color }">
                  <i :style="{ background: STATE_LOOK[a.state].color }" :class="{ pulse: a.state === 'working' }" />{{ STATE_LOOK[a.state].label }}
                </span>
                <code class="type">{{ a.agentType }}</code>
                <span class="model" :style="{ color: MODEL_LOOK[a.model].color, borderColor: MODEL_LOOK[a.model].color }">{{ MODEL_LOOK[a.model].label }}</span>
                <span class="when">{{ a.lastAt ? ago(a.lastAt) : '' }}</span>
              </div>
              <div class="desc">{{ a.description || a.task || 'No description' }}</div>
              <div v-if="a.lastText" class="last">{{ a.lastText }}</div>
              <div class="tools"><Icon name="code" :size="11" />{{ a.toolCalls }} tool calls</div>
            </button>
          </li>
        </ol>
      </section>

      <section class="run">
        <template v-if="selected">
          <header class="rhead">
            <code>{{ selected.agentType }}</code>
            <span class="rdesc">{{ selected.description }}</span>
            <button class="iconbtn" title="Refresh" @click="loadRun"><Icon name="refresh" :size="14" /></button>
          </header>
          <p v-if="steps === null" class="muted">Loading the run…</p>
          <p v-else-if="!steps.length" class="muted">This run has no messages yet.</p>
          <ol v-else class="steps">
            <li v-for="(s, i) in steps" :key="i" :class="s.role">
              <div class="who">{{ s.role === 'user' ? (i === 0 ? 'Brief' : 'Input') : 'Agent' }}</div>
              <p v-if="s.text" class="txt">{{ s.text }}</p>
              <div v-if="s.tools.length" class="tchips">
                <span v-for="(t, j) in s.tools" :key="j" class="tchip">{{ t }}</span>
              </div>
            </li>
          </ol>
        </template>
        <div v-else class="muted center">Pick an agent to read its run.</div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.view {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-1);
}
.head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 52px;
  padding: 0 16px;
  border-bottom: 1px solid var(--line);
}
.hicon {
  color: var(--accent);
}
.title {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 600 15px var(--font-ui);
  color: var(--text);
}
.sub {
  flex: none;
  font-size: 12px;
  color: var(--text-4);
}
.needs {
  flex: none;
  padding: 0 8px;
  font-size: 11px;
  line-height: 18px;
  color: var(--warn);
  border: 1px solid var(--warn);
  border-radius: 9px;
}
.grow {
  flex: 1;
}
.btn {
  flex: none;
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
  background: var(--bg-4);
  border-color: var(--line-3);
}
.body {
  flex: 1;
  min-height: 0;
  display: flex;
}
.tree {
  flex: none;
  width: min(460px, 45%);
  overflow-y: auto;
  padding: 16px;
  border-right: 1px solid var(--line);
}
.root {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  border-radius: 10px;
}
.root b {
  display: block;
  font-size: 13px;
  color: var(--text);
}
.root small {
  font-size: 11.5px;
  color: var(--text-4);
}
.rdot {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--text-5);
}
.rdot.live {
  background: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.tree ol {
  list-style: none;
  margin: 0;
  padding: 0 0 0 16px;
  border-left: 2px solid var(--line);
  margin-left: 16px;
}
.tree li {
  position: relative;
  padding-top: 10px;
}
.tree li::before {
  content: '';
  position: absolute;
  left: -16px;
  top: 30px;
  width: 14px;
  height: 2px;
  background: var(--line);
}
.node {
  display: block;
  width: 100%;
  padding: 9px 11px;
  text-align: left;
  font: inherit;
  color: inherit;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 9px;
  cursor: pointer;
}
.node:hover {
  background: var(--bg-2);
  border-color: var(--line-2);
}
.node.on {
  background: var(--bg-3);
  border-color: var(--line-3);
}
.nrow {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.state {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
}
.state i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.pulse {
  animation: pulse 1.4s ease-in-out infinite;
}
@keyframes pulse {
  50% {
    opacity: 0.3;
  }
}
@media (prefers-reduced-motion: reduce) {
  .pulse {
    animation: none;
  }
}
.type {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 12px var(--font-mono);
  color: var(--text-2);
}
.model {
  flex: none;
  padding: 0 6px;
  font-size: 11px;
  line-height: 17px;
  border: 1px solid;
  border-radius: 9px;
}
.when {
  flex: none;
  margin-left: auto;
  font-size: 11px;
  color: var(--text-4);
}
.desc {
  margin-top: 5px;
  font-size: 13px;
  line-height: 1.4;
  color: var(--text);
}
.last {
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--text-3);
}
.tools {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 5px;
  font-size: 11px;
  color: var(--text-4);
}
.run {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-editor);
}
.rhead {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 40px;
  padding: 0 8px 0 16px;
  border-bottom: 1px solid var(--line);
}
.rhead code {
  font: 600 12.5px var(--font-mono);
  color: var(--text);
}
.rdesc {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
  color: var(--text-3);
}
.iconbtn {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  color: var(--text-4);
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.iconbtn:hover {
  color: var(--text);
  background: var(--bg-3);
}
.steps {
  flex: 1;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 12px 18px 24px;
}
.steps li {
  padding: 10px 0;
  border-bottom: 1px solid var(--line);
}
.who {
  margin-bottom: 4px;
  font: 600 11.5px var(--font-ui);
  color: var(--text-4);
}
.steps li.user .who {
  color: var(--info);
}
.txt {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-2);
  user-select: text;
}
.tchips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}
.tchip {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 1px 7px;
  font: 11.5px var(--font-mono);
  color: var(--text-3);
  background: var(--bg-3);
  border-radius: 5px;
}
.muted {
  margin: 16px;
  font-size: 12.5px;
  color: var(--text-4);
}
.center {
  flex: 1;
  display: grid;
  place-items: center;
}
</style>
