<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, onActivated, nextTick } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { attachClipboard } from './termclipboard'
import '@xterm/xterm/css/xterm.css'
import type { DevServer, ServerChoice, ServerProfile } from '../types'
import { runningChoice } from './serverchoice'

const props = defineProps<{ ticketKey: string; cwd: string | null; servers: DevServer[] }>()

const KINDS: { value: ServerProfile['kind']; label: string }[] = [
  { value: 'web', label: 'Web' },
  { value: 'stv', label: 'Smart TV' },
  { value: 'custom', label: 'Custom command' }
]
const loadProfile = (kind?: ServerProfile['kind']): ServerProfile | null => (props.cwd ? window.api.getServerProfile(props.cwd, kind) : null)
const profile = ref<ServerProfile | null>(loadProfile())
const command = ref(profile.value?.command ?? '')
const choice = ref<ServerChoice>({ ...(profile.value?.choice ?? { tenant: '', environment: '', platform: 'web', resolution: '1280x720' }) })
const setKind = (kind: ServerProfile['kind']): void => {
  const next = loadProfile(kind)
  profile.value = next
  command.value = next?.command ?? ''
  choice.value = { ...(next?.choice ?? choice.value) }
}
const preview = computed(() => {
  if (!profile.value || profile.value.kind === 'custom') return command.value
  const c = choice.value
  return profile.value.kind === 'stv'
    ? `TENANT=${c.tenant} ENVIRONMENT=${c.environment} PLATFORM=${c.platform} RESOLUTION=${c.resolution} npm run serve -- --port …`
    : `.env.local ← .env.${c.tenant}-${c.environment}, then npm run serve -- --port …`
})
const port = ref('')
const isStarting = ref(false)
const error = ref<string | null>(null)
const host = ref<HTMLDivElement | null>(null)

const running = computed(() => props.servers.find((s) => s.key === props.ticketKey) ?? null)
const url = computed(() => running.value?.url ?? null)
const syncChoice = (server: DevServer | null): void => {
  if (server) choice.value = runningChoice(server.label, choice.value)
}
watch(running, syncChoice, { immediate: true })

let term: Terminal | null = null
let fit: FitAddon | null = null
let observer: ResizeObserver | null = null
let offData: (() => void) | null = null

const FIT_DELAY_MS = 120
let fitTimer: ReturnType<typeof setTimeout> | null = null

const fitTerminal = (): void => {
  if (!term || !fit || !host.value?.clientWidth) return
  const next = fit.proposeDimensions()
  if (!next || (next.cols === term.cols && next.rows === term.rows)) return
  fit.fit()
  window.api.resizeServer(props.ticketKey, term.cols, term.rows)
}
const scheduleFit = (): void => {
  if (fitTimer) clearTimeout(fitTimer)
  fitTimer = setTimeout(fitTerminal, FIT_DELAY_MS)
}

const start = async (): Promise<void> => {
  if (!props.cwd || isStarting.value) return
  isStarting.value = true
  error.value = null
  term?.clear()
  try {
    const wanted = port.value.trim() ? Number(port.value.trim()) : null
    if (wanted !== null && !Number.isInteger(wanted)) {
      error.value = 'The port must be a number'
      return
    }
    const result = await window.api.startServer(
      props.ticketKey,
      props.cwd,
      { kind: profile.value?.kind ?? 'custom', choice: { ...choice.value }, command: command.value },
      wanted,
      term?.cols ?? 120,
      term?.rows ?? 30
    )
    error.value = result.error
  } catch (e) {
    error.value = String(e)
  } finally {
    isStarting.value = false
  }
}
const stop = (): void => window.api.stopServer(props.ticketKey)
const openUrl = (): void => {
  if (running.value) window.api.openInChrome(running.value.url, props.ticketKey)
}

onMounted(async () => {
  await nextTick()
  term = new Terminal({
    fontFamily: 'Cascadia Mono, Consolas, monospace',
    fontSize: 12,
    convertEol: true,
    theme: { background: '#1e1e1e', foreground: '#cccccc', cursor: '#3dd68c', selectionBackground: '#264f78' }
  })
  fit = new FitAddon()
  term.loadAddon(fit)
  term.open(host.value as HTMLDivElement)
  term.write(window.api.getServerLog(props.ticketKey))
  term.onData((data) => window.api.writeServer(props.ticketKey, data))
  attachClipboard(term, host.value as HTMLDivElement)
  offData = window.api.onServerData((key, chunk) => {
    if (key === props.ticketKey) term?.write(chunk)
  })
  observer = new ResizeObserver(scheduleFit)
  observer.observe(host.value as HTMLDivElement)
  fitTerminal()
})
onActivated(fitTerminal)
onBeforeUnmount(() => {
  observer?.disconnect()
  if (fitTimer) clearTimeout(fitTimer)
  offData?.()
  term?.dispose()
})
</script>

<template>
  <div class="sp">
    <div v-if="profile" class="choices">
      <label>
        <span>Mode</span>
        <select :value="profile.kind" :disabled="!!running" @change="setKind(($event.target as HTMLSelectElement).value as ServerProfile['kind'])">
          <option v-for="k in KINDS" :key="k.value" :value="k.value">{{ k.label }}</option>
        </select>
      </label>
      <template v-if="profile.kind !== 'custom'">
      <label>
        <span>Tenant</span>
        <select v-model="choice.tenant" :disabled="!!running">
          <option v-for="t in profile.tenants" :key="t" :value="t">{{ t }}</option>
        </select>
      </label>
      <label>
        <span>Environment</span>
        <select v-model="choice.environment" :disabled="!!running">
          <option v-for="e in profile.environments" :key="e" :value="e">{{ e }}</option>
        </select>
      </label>
      <template v-if="profile.kind === 'stv'">
        <label>
          <span>Platform</span>
          <select v-model="choice.platform" :disabled="!!running">
            <option v-for="pl in profile.platforms" :key="pl" :value="pl">{{ pl }}</option>
          </select>
        </label>
        <label>
          <span>Resolution</span>
          <select v-model="choice.resolution" :disabled="!!running">
            <option v-for="r in profile.resolutions" :key="r" :value="r">{{ r }}</option>
          </select>
        </label>
      </template>
      </template>
    </div>
    <div class="bar">
      <div class="cmd">
        <span class="dollar">$</span>
        <input
          v-if="!profile || profile.kind === 'custom'"
          v-model="command"
          spellcheck="false"
          :disabled="!!running || !cwd"
          placeholder="npm run serve -- --port {port}"
        />
        <span v-else class="preview">{{ running ? running.command : preview }}</span>
      </div>
      <input v-model="port" class="port" :disabled="!!running || !cwd" placeholder="auto port" />
      <button v-if="!running" class="db" :disabled="!cwd || isStarting || !command.trim()" @click="start">
        {{ isStarting ? 'Starting…' : 'Start server' }}
      </button>
      <template v-else>
        <button class="db ghost" :title="url ?? ''" @click="openUrl">Open in Chrome</button>
        <button class="db danger" @click="stop">Stop</button>
      </template>
    </div>
    <div class="meta">
      <span v-if="cwd">in <code>{{ cwd }}</code></span>
      <span v-else>Start a session first. The server runs in the ticket's worktree.</span>
      <span v-if="!running && profile?.kind === 'web'" class="hint">Writes .env.local in this worktree only.</span>
      <span v-else-if="!running" class="hint">The last choice is remembered per repo.</span>
      <span v-else class="live"><i />{{ running.label }} · <code>{{ running.url }}</code></span>
    </div>
    <div v-if="error" class="warn">{{ error }}</div>
    <div ref="host" class="out" />
  </div>
</template>

<style scoped>
.sp {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 14px 20px 16px;
  gap: 8px;
}
.choices {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.choices label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: var(--text-3);
}
.choices select {
  min-width: 130px;
  padding: 6px 8px;
  font: 13px var(--font-ui);
  color: var(--text);
  background: var(--bg-0);
  border: 1px solid var(--line-2);
  border-radius: 8px;
  outline: none;
}
.choices select:focus {
  border-color: var(--accent);
}
.preview {
  flex: 1;
  padding: 8px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 12px var(--font-mono);
  color: var(--text-2);
}
.bar {
  display: flex;
  gap: 8px;
}
.cmd {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  background: var(--bg-0);
  border: 1px solid var(--line-2);
  border-radius: 8px;
}
.cmd:focus-within {
  border-color: var(--accent);
}
.dollar {
  font: 13px var(--font-mono);
  color: var(--accent);
}
.cmd input {
  flex: 1;
  padding: 8px 0;
  font: 13px var(--font-mono);
  color: var(--text);
  background: none;
  border: none;
  outline: none;
}
.port {
  width: 90px;
  padding: 0 10px;
  font: 13px var(--font-mono);
  color: var(--text);
  background: var(--bg-0);
  border: 1px solid var(--line-2);
  border-radius: 8px;
  outline: none;
}
.port:focus {
  border-color: var(--accent);
}
input:disabled {
  opacity: 0.6;
}
.db {
  padding: 0 14px;
  font: 600 12px var(--font-ui);
  color: var(--on-accent);
  background: var(--accent);
  border: 1px solid var(--accent);
  border-radius: 8px;
  cursor: pointer;
  white-space: nowrap;
}
.db.ghost {
  color: var(--text-2);
  background: var(--line);
  border-color: var(--line-2);
}
.db.danger {
  color: var(--danger);
  background: none;
  border-color: var(--danger-line);
}
.db:disabled {
  opacity: 0.45;
  cursor: default;
}
.meta {
  display: flex;
  gap: 14px;
  font-size: 12px;
  color: var(--text-3);
}
.meta code {
  font-family: var(--font-mono);
  color: var(--text-2);
}
.hint {
  color: var(--text-4);
}
.live code {
  color: var(--ok);
}
.live {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--ok);
}
.live i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--ok);
  box-shadow: 0 0 6px var(--ok);
}
.warn {
  font-size: 12px;
  color: var(--warn);
}
.out {
  flex: 1;
  min-height: 0;
  padding: 8px 0 0 10px;
  background: var(--bg-0);
  border: 1px solid var(--bg-4);
  border-radius: 8px;
}
</style>
