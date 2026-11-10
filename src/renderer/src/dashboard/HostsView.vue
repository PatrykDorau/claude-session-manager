<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import type { LocalHost, Session } from '../types'
import { ago } from '../display'
import Icon from './Icon.vue'

const props = defineProps<{ sessions: Session[] }>()
const emit = defineEmits<{ 'open-ticket': [key: string] }>()

const POLL_MS = 4000
const ACTIVE_MS = 15000

const hosts = ref<LocalHost[] | null>(null)
const busy = ref<string | null>(null)
const notice = ref<string | null>(null)
const now = ref(Date.now())
let timer: ReturnType<typeof setTimeout> | null = null

const load = async (): Promise<void> => {
  if (timer) clearTimeout(timer)
  hosts.value = await window.api.getLocalHosts()
  now.value = Date.now()
  timer = setTimeout(load, POLL_MS)
}
const sessionOf = (key: string | null): Session | undefined =>
  key
    ? props.sessions
        .filter((s) => s.isLive && s.ticket?.toUpperCase() === key)
        .sort((a, b) => b.lastActive - a.lastActive)[0]
    : undefined
const isBusyOutput = (h: LocalHost): boolean => !!h.server?.lastOutputAt && now.value - h.server.lastOutputAt < ACTIVE_MS
const run = async (id: string, action: () => Promise<unknown> | unknown): Promise<void> => {
  busy.value = id
  notice.value = null
  try {
    const result = (await action()) as { error?: string | null } | undefined
    if (result?.error) notice.value = result.error
  } finally {
    busy.value = null
    await load()
  }
}
const stopServer = (h: LocalHost): Promise<void> => run(`stop-${h.key}`, () => window.api.stopServer(h.key as string))
const startServer = (h: LocalHost): Promise<void> => run(`start-${h.key}`, () => window.api.startTicketServer(h.key as string, null))
const closeChrome = (h: LocalHost): Promise<void> => run(`chrome-${h.key}`, () => window.api.closeChrome(h.key))
const openChrome = (h: LocalHost): void => window.api.openInChrome(h.server?.url ?? 'about:blank', h.key ?? undefined)

onMounted(load)
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})
</script>

<template>
  <div class="hv">
    <header class="hhead">
      <Icon name="server" :size="18" />
      <h1>Local servers</h1>
      <span class="sub">Dev servers and task Chromes running on this computer</span>
      <span class="grow" />
      <button class="btn" @click="load"><Icon name="refresh" :size="14" />Refresh</button>
    </header>
    <p v-if="notice" class="notice">{{ notice }}</p>
    <div class="body">
      <p v-if="hosts === null" class="muted">Loading…</p>
      <div v-else-if="!hosts.length" class="empty">
        <Icon name="server" :size="34" />
        <p>Nothing is running. Start a server from a ticket's Server tab, or let a Claude session start it with cockpit.js.</p>
      </div>
      <div class="grid">
        <article v-for="h in hosts" :key="h.key ?? 'shared'" class="host">
          <header class="top">
            <button v-if="h.key" class="key" title="Open the ticket" @click="emit('open-ticket', h.key)">{{ h.key }}</button>
            <b v-else class="key plain">Shared debug Chrome</b>
            <span class="grow" />
            <span v-if="sessionOf(h.key)?.status === 'waiting'" class="pill needs"><i />Claude needs you</span>
            <span v-else-if="sessionOf(h.key)" class="pill live"><i />Claude {{ sessionOf(h.key)?.status === 'working' ? 'working' : 'live' }}</span>
            <span v-else-if="h.key" class="pill off">No live session</span>
          </header>

          <section v-if="h.key" class="part">
            <div class="label"><Icon name="server" :size="14" />Server</div>
            <template v-if="h.server">
              <div class="line">
                <a href="#" class="url" title="Open in this ticket's Chrome" @click.prevent="openChrome(h)">{{ h.server.url }}</a>
                <span class="state" :class="{ busy: isBusyOutput(h) }"><i />{{ isBusyOutput(h) ? 'compiling or logging' : 'idle' }}</span>
              </div>
              <div class="meta">
                {{ h.server.label }} · up {{ ago(h.server.startedAt) }}<template v-if="h.server.lastOutputAt"> · last output {{ ago(h.server.lastOutputAt) }}</template>
              </div>
              <div class="meta path" :title="h.server.cwd">{{ h.server.cwd }}</div>
              <div class="acts">
                <button class="btn sm danger" :disabled="busy === `stop-${h.key}`" @click="stopServer(h)"><Icon name="stop" :size="12" />Stop server</button>
              </div>
            </template>
            <div v-else class="line off">
              Not running
              <button class="btn sm" :disabled="busy === `start-${h.key}`" @click="startServer(h)"><Icon name="play" :size="12" />{{ busy === `start-${h.key}` ? 'Starting…' : 'Start server' }}</button>
            </div>
          </section>

          <section class="part">
            <div class="label"><Icon name="globe" :size="14" />Chrome · port {{ h.chrome.port }}</div>
            <template v-if="h.chrome.isUp">
              <div class="line"><span class="state on"><i />running</span><span class="meta">{{ h.chrome.pages.length }} {{ h.chrome.pages.length === 1 ? 'tab' : 'tabs' }}</span></div>
              <ul class="pages">
                <li v-for="(p, i) in h.chrome.pages.slice(0, 4)" :key="i" :title="p.url">{{ p.title || p.url }}</li>
              </ul>
              <div class="acts">
                <button class="btn sm" @click="openChrome(h)"><Icon name="external" :size="12" />Open</button>
                <button class="btn sm danger" :disabled="busy === `chrome-${h.key}`" @click="closeChrome(h)"><Icon name="close" :size="12" />Close Chrome</button>
              </div>
            </template>
            <div v-else class="line off">
              Not running
              <button class="btn sm" @click="openChrome(h)"><Icon name="play" :size="12" />Open Chrome</button>
            </div>
          </section>
        </article>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hv {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-1);
}
.hhead {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 52px;
  padding: 0 16px;
  color: var(--accent);
  border-bottom: 1px solid var(--line);
}
.hhead h1 {
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
}
.body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 12px;
}
.host {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 14px;
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  border-radius: 10px;
}
.top {
  display: flex;
  align-items: center;
  gap: 8px;
}
.key {
  padding: 0;
  font: 600 13px var(--font-mono);
  color: var(--text);
  background: none;
  border: none;
  cursor: pointer;
}
.key:hover {
  color: var(--accent);
}
.key.plain {
  font-family: var(--font-ui);
  cursor: default;
}
.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  font: 600 11.5px/20px var(--font-ui);
  border-radius: 10px;
}
.pill i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}
.pill.live {
  color: var(--ok);
  background: rgba(61, 214, 140, 0.1);
}
.pill.needs {
  color: var(--warn);
  background: var(--warn-soft);
  animation: blink 1.6s ease-in-out infinite;
}
.pill.off {
  color: var(--text-4);
  background: var(--bg-3);
}
@keyframes blink {
  50% {
    opacity: 0.45;
  }
}
@media (prefers-reduced-motion: reduce) {
  .pill.needs {
    animation: none;
  }
}
.part {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding-top: 10px;
  border-top: 1px solid var(--line);
}
.label {
  display: flex;
  align-items: center;
  gap: 6px;
  font: 600 12px var(--font-ui);
  color: var(--text-3);
}
.line {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--text-2);
}
.line.off {
  justify-content: space-between;
  color: var(--text-4);
}
.url {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 12.5px var(--font-mono);
  color: var(--info);
  text-decoration: none;
}
.url:hover {
  text-decoration: underline;
}
.state {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--text-4);
}
.state i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-5);
}
.state.busy,
.state.on {
  color: var(--ok);
}
.state.busy i,
.state.on i {
  background: var(--ok);
}
.state.busy i {
  animation: blink 1s ease-in-out infinite;
}
.meta {
  font-size: 12px;
  color: var(--text-4);
}
.path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
}
.pages {
  margin: 0;
  padding: 0 0 0 16px;
  font-size: 12px;
  color: var(--text-3);
}
.pages li {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.acts {
  display: flex;
  gap: 6px;
  margin-top: 2px;
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
