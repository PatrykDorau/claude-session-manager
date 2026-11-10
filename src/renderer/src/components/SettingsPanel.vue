<script setup lang="ts">
import { ref, inject } from 'vue'
import type { Ref } from 'vue'
import { SOUNDS, playSound, type SoundName } from '../sound'

const colorblind = inject<Ref<boolean>>('colorblind', ref(false))
const initial = window.api.getSettings()
const jiraBase = ref(initial.jiraBase)
const jiraToken = ref(initial.jiraToken)
const jiraDoneStatuses = ref(initial.jiraDoneStatuses)
const ticketPrefixes = ref(initial.ticketPrefixes)
const taskJql = ref(initial.taskJql)
const startPrompt = ref(initial.startPrompt)
const alwaysOnTop = ref(initial.alwaysOnTop)
const launchOnStartup = ref(initial.launchOnStartup)
const isDockReserving = ref(initial.isDockReserving)
const isDockOnTop = ref(initial.isDockOnTop)
const clickAction = ref(initial.clickAction)
const alertSound = ref(localStorage.getItem('alertSound') !== '0')
const soundName = ref<SoundName>((localStorage.getItem('alertSoundName') as SoundName) || 'chime')
const version = ((): string => {
  try {
    return window.api.getVersion()
  } catch {
    return ''
  }
})()
const diagCopied = ref(false)
const vscodeProfiles = ref(window.api.getVscodeLayout())
const isLayoutPreview = ref(false)
const STATUS_TEXT = { configured: 'configured', missing: 'not configured', conflict: 'configured differently' }
const syncing = ref(false)
const synced = ref(false)

function saveJira(): void {
  window.api.setSettings({ jiraBase: jiraBase.value.trim() })
}
function saveJiraToken(): void {
  window.api.setSettings({ jiraToken: jiraToken.value.trim() })
}
function savePrefixes(): void {
  window.api.setSettings({ ticketPrefixes: ticketPrefixes.value })
}
const saveTaskJql = (): void => window.api.setSettings({ taskJql: taskJql.value })
const saveStartPrompt = (): void => window.api.setSettings({ startPrompt: startPrompt.value })
const gitlabBase = ref(initial.gitlabBase)
const gitlabToken = ref(initial.gitlabToken)
const mrProjects = ref(initial.mrProjects)
const mrMention = ref(initial.mrMention)
const saveGitlab = (): void =>
  window.api.setSettings({
    gitlabBase: gitlabBase.value.trim(),
    gitlabToken: gitlabToken.value.trim(),
    mrProjects: mrProjects.value,
    mrMention: mrMention.value.trim()
  })
const startView = ref(initial.startView)
const saveStartView = (): void => window.api.setSettings({ startView: startView.value })
const quickActions = ref(initial.quickActions.map((a) => ({ ...a })))
const saveQuickActions = (): void =>
  window.api.setSettings({ quickActions: quickActions.value.map((a) => ({ label: a.label, prompt: a.prompt })) })
const addQuickAction = (): void => {
  quickActions.value = [...quickActions.value, { label: '', prompt: '' }]
}
const removeQuickAction = (index: number): void => {
  quickActions.value = quickActions.value.filter((_a, i) => i !== index)
  saveQuickActions()
}
function saveJiraStatuses(): void {
  window.api.setSettings({ jiraDoneStatuses: jiraDoneStatuses.value })
}
async function syncJira(): Promise<void> {
  if (syncing.value) return
  syncing.value = true
  synced.value = false
  try {
    await window.api.syncJira()
  } finally {
    syncing.value = false
    synced.value = true
    setTimeout(() => (synced.value = false), 1500)
  }
}
function saveClick(): void {
  window.api.setSettings({ clickAction: clickAction.value })
}
function toggleTop(): void {
  alwaysOnTop.value = !alwaysOnTop.value
  window.api.setSettings({ alwaysOnTop: alwaysOnTop.value })
}
function toggleDockReserve(): void {
  isDockReserving.value = !isDockReserving.value
  window.api.setSettings({ isDockReserving: isDockReserving.value })
}
function toggleDockOnTop(): void {
  isDockOnTop.value = !isDockOnTop.value
  window.api.setSettings({ isDockOnTop: isDockOnTop.value })
}
function toggleStartup(): void {
  launchOnStartup.value = !launchOnStartup.value
  window.api.setSettings({ launchOnStartup: launchOnStartup.value })
}
function toggleColorblind(): void {
  colorblind.value = !colorblind.value
  localStorage.setItem('colorblind', colorblind.value ? '1' : '0')
}
function toggleSound(): void {
  alertSound.value = !alertSound.value
  localStorage.setItem('alertSound', alertSound.value ? '1' : '0')
  if (alertSound.value) playSound(soundName.value)
}
function selectSound(name: SoundName): void {
  soundName.value = name
  localStorage.setItem('alertSoundName', name)
  playSound(name)
}
function applyLayout(): void {
  vscodeProfiles.value = window.api.applyVscodeLayout()
  isLayoutPreview.value = false
}
function switchAccount(): void {
  window.api.switchAccount()
}
function copyDiag(): void {
  window.api.copyText(window.api.getDiagnostics())
  diagCopied.value = true
  setTimeout(() => (diagCopied.value = false), 1500)
}
</script>

<template>
  <div class="settings">
    <label class="field">
      <span class="flbl">Open on launch</span>
      <select v-model="startView" class="inp" @change="saveStartView">
        <option value="ask">Ask every time</option>
        <option value="dashboard">Dashboard</option>
        <option value="sidebar">Compact sidebar</option>
      </select>
      <small class="hint">Which window opens when the app starts. "Choose a window…" in the tray menu shows the picker again.</small>
    </label>

    <label class="field">
      <span class="flbl">Jira base URL</span>
      <input v-model="jiraBase" class="inp" spellcheck="false" @change="saveJira" @blur="saveJira" />
      <small class="hint">{{ jiraBase }}SOFKRS-1234</small>
    </label>

    <label class="field">
      <span class="flbl">Jira API token</span>
      <input
        v-model="jiraToken"
        type="password"
        class="inp"
        spellcheck="false"
        placeholder="Personal Access Token"
        @change="saveJiraToken"
        @blur="saveJiraToken"
      />
      <small class="hint">Bearer token for auto-finishing sessions when their ticket is accepted. Leave blank to disable.</small>
    </label>

    <label class="field">
      <span class="flbl">Jira "done" statuses</span>
      <input
        v-model="jiraDoneStatuses"
        class="inp"
        spellcheck="false"
        @change="saveJiraStatuses"
        @blur="saveJiraStatuses"
      />
      <small class="hint">Comma-separated statuses that count as finished (case-insensitive).</small>
    </label>

    <label class="field">
      <span class="flbl">Ticket prefixes</span>
      <input
        v-model="ticketPrefixes"
        class="inp"
        spellcheck="false"
        placeholder="e.g. SOFKRS, SOFKAN"
        @change="savePrefixes"
        @blur="savePrefixes"
      />
      <small class="hint">The ticket is taken from the first prompt only. Comma-separated prefixes to accept; leave blank to accept any code (UTF-8, SHA-256… are ignored).</small>
    </label>

    <label class="field">
      <span class="flbl">Task view JQL</span>
      <input v-model="taskJql" class="inp" spellcheck="false" @change="saveTaskJql" @blur="saveTaskJql" />
      <small class="hint">Which Jira tickets the Tasks view lists.</small>
    </label>

    <label class="field">
      <span class="flbl">Start session prompt</span>
      <textarea
        v-model="startPrompt"
        class="inp"
        rows="3"
        spellcheck="false"
        @change="saveStartPrompt"
        @blur="saveStartPrompt"
      />
      <small class="hint">First message of a session started from the Tasks view. {ticket} and {title} are replaced.</small>
    </label>

    <label class="field">
      <span class="flbl">GitLab address</span>
      <input v-model="gitlabBase" class="inp" spellcheck="false" @change="saveGitlab" />
    </label>
    <label class="field">
      <span class="flbl">GitLab token</span>
      <input v-model="gitlabToken" class="inp" type="password" spellcheck="false" @change="saveGitlab" />
      <small class="hint">Fine-grained token. User: Todo read, User read, Merge request read. Group and project (your groups): Merge request read, create, update, approve, merge; Markdown upload read (videos and images in descriptions). Approve, merge, rebase and comments run only after you confirm.</small>
    </label>
    <label class="field">
      <span class="flbl">Review projects</span>
      <input v-model="mrProjects" class="inp" spellcheck="false" @change="saveGitlab" />
      <small class="hint">Comma-separated project names shown in "MRs to review". Empty shows all.</small>
    </label>
    <label class="field">
      <span class="flbl">Review mention</span>
      <input v-model="mrMention" class="inp" spellcheck="false" placeholder="@telco-frontend" @change="saveGitlab" />
      <small class="hint">Open merge requests whose description mentions this group count as yours to review, together with your to-dos and MRs where you are a reviewer. Leave empty to skip.</small>
    </label>

    <div class="field">
      <span class="flbl">Dashboard quick actions</span>
      <div v-for="(a, i) in quickActions" :key="i" class="qa">
        <input v-model="a.label" class="inp" placeholder="Button label" @change="saveQuickActions" />
        <textarea v-model="a.prompt" class="inp" rows="2" placeholder="Prompt sent to Claude" @change="saveQuickActions" />
        <button class="btn" @click="removeQuickAction(i)">Remove</button>
      </div>
      <button class="btn" @click="addQuickAction">Add quick action</button>
      <small class="hint">Buttons next to the Claude terminal in the dashboard. Each sends its prompt to the session.</small>
    </div>

    <div class="field">
      <button class="btn" :disabled="syncing" @click="syncJira">
        {{ syncing ? 'Syncing…' : synced ? 'Synced ✓' : 'Sync statuses now' }}
      </button>
      <small class="hint">Fetches Jira statuses and branch state now instead of waiting for the 30-min poll.</small>
    </div>

    <label class="field">
      <span class="flbl">On click, a session…</span>
      <select v-model="clickAction" class="inp" @change="saveClick">
        <option value="project-cmd">opens project + resumes in a new terminal (recommended)</option>
        <option value="default">opens & resumes in a VS Code side terminal (needs keybind)</option>
        <option value="terminal">resumes in a VS Code side terminal (needs keybind)</option>
        <option value="standalone">resumes in a standalone terminal only</option>
        <option value="project">just opens the project in VS Code</option>
        <option value="focus">just focuses the existing window</option>
      </select>
      <small class="hint">Right-click a session for all actions at once.</small>
    </label>

    <div class="field">
      <span class="flbl">VS Code layout</span>
      <div v-for="p in vscodeProfiles" :key="p.profileDir" class="prof">
        <span>{{ p.name }}</span>
        <span :class="['pst', p.status]">{{ STATUS_TEXT[p.status] }}</span>
      </div>
      <div v-if="isLayoutPreview" class="preview">
        <div>For each profile above (backup <code>*.bak-claude-sessions</code> first):</div>
        <div><code>settings.json</code>: <code>terminal.integrated.enablePersistentSessions</code> → <code>false</code> (no empty terminal tabs after restart), <code>terminal.integrated.tabs.title</code> → <code>${sequence}</code> (tabs named after the ticket)</div>
        <div><code>keybindings.json</code>: <code>Ctrl+Alt+F9</code> / <code>Ctrl+Alt+F10</code> → code with the dev-server terminal below it on the left, Claude sessions top/bottom on the right; <code>Ctrl+Alt+F8</code> opens a terminal under the code (dev server). Existing bindings on these keys are replaced.</div>
        <div class="row">
          <button class="btn" @click="applyLayout">Apply</button>
          <button class="btn" @click="isLayoutPreview = false">Cancel</button>
        </div>
      </div>
      <button v-else class="btn" @click="isLayoutPreview = true">Configure VS Code…</button>
      <small class="hint">Press Ctrl+Alt+F8 in VS Code to open the dev-server terminal under the code.</small>
    </div>

    <div class="toggle" @click="toggleDockReserve">
      <span>Docked bar reserves screen space (pushes windows)</span>
      <span class="sw" :class="{ on: isDockReserving }" />
    </div>

    <div class="toggle" @click="toggleDockOnTop">
      <span>Docked bar always on top</span>
      <span class="sw" :class="{ on: isDockOnTop }" />
    </div>

    <div class="toggle" @click="toggleSound">
      <span>Notification sound</span>
      <span class="sw" :class="{ on: alertSound }" />
    </div>
    <div v-if="alertSound" class="sounds">
      <button
        v-for="snd in SOUNDS"
        :key="snd.id"
        class="sndbtn"
        :class="{ on: soundName === snd.id }"
        @click="selectSound(snd.id)"
      >
        {{ snd.label }}
      </button>
    </div>
    <div class="toggle" @click="toggleColorblind">
      <span>Colorblind palette</span>
      <span class="sw" :class="{ on: colorblind }" />
    </div>
    <div class="toggle" @click="toggleTop">
      <span>Always on top</span>
      <span class="sw" :class="{ on: alwaysOnTop }" />
    </div>
    <div class="toggle" @click="toggleStartup">
      <span>Launch on startup</span>
      <span class="sw" :class="{ on: launchOnStartup }" />
    </div>

    <div class="field acct">
      <span class="flbl">Anthropic account</span>
      <button class="btn" @click="switchAccount">Switch account…</button>
      <small class="hint">Opens a terminal to sign in with <code>claude auth login</code>. Usage limits update within a minute.</small>
    </div>

    <div class="field acct">
      <span class="flbl">About</span>
      <div class="abt">Claude Cockpit <span v-if="version">v{{ version }}</span></div>
      <button class="btn" @click="copyDiag">{{ diagCopied ? 'Copied ✓' : 'Copy diagnostics' }}</button>
      <small class="hint">Copies version, OS and detection info to your clipboard to share when reporting a problem.</small>
    </div>
  </div>
</template>

<style scoped>
.settings {
  padding: 14px;
  color: #ededed;
  font-size: 12px;
}
.field {
  display: block;
  margin-bottom: 16px;
}
.flbl {
  display: block;
  font-weight: 600;
  margin-bottom: 5px;
}
.inp {
  width: 100%;
  box-sizing: border-box;
  font: 12px system-ui;
  background: #1b1b1b;
  color: #ededed;
  border: 1px solid #3a3a3a;
  border-radius: 6px;
  padding: 6px 8px;
  outline: none;
}
.inp:focus {
  border-color: #2ef05a;
}
.qa {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid #3a3a3a;
}
.hint {
  display: block;
  color: #737373;
  font-size: 10px;
  margin-top: 4px;
  word-break: break-all;
}
.toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 2px;
  cursor: pointer;
  border-bottom: 1px solid #232323;
}
.sounds {
  display: flex;
  gap: 6px;
  padding: 4px 2px 8px;
}
.sndbtn {
  flex: 1;
  font: 11px system-ui;
  background: #1b1b1b;
  color: #9a9a9a;
  border: 1px solid #3a3a3a;
  border-radius: 6px;
  padding: 5px 8px;
  cursor: pointer;
}
.sndbtn:hover {
  color: #ededed;
}
.sndbtn.on {
  color: #111111;
  background: #00e62e;
  border-color: #00e62e;
}
.acct {
  margin-top: 16px;
}
.prof {
  display: flex;
  justify-content: space-between;
  padding: 3px 0;
}
.pst {
  color: #9a9a9a;
}
.pst.configured {
  color: #56d364;
}
.pst.conflict {
  color: #e3b341;
}
.preview {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 6px 0;
  padding: 8px;
  font-size: 11px;
  color: #d4d4d4;
  border: 1px solid #3a3a3a;
  border-radius: 6px;
}
.preview .row {
  display: flex;
  gap: 6px;
}
.abt {
  color: #9a9a9a;
  margin-bottom: 8px;
}
.btn {
  font: 12px system-ui;
  background: #2b2b2b;
  color: #ededed;
  border: 1px solid #3a3a3a;
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
}
.btn:hover {
  border-color: #2ef05a;
  color: #fff;
}
.btn:disabled {
  opacity: 0.6;
  cursor: default;
  border-color: #3a3a3a;
  color: #ededed;
}
.sw {
  width: 34px;
  height: 18px;
  border-radius: 10px;
  background: #3a3a3a;
  position: relative;
  transition: background 0.15s;
  flex: none;
}
.sw::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #9a9a9a;
  transition: transform 0.15s;
}
.sw.on {
  background: #00e62e;
}
.sw.on::after {
  transform: translateX(16px);
  background: #fff;
}
</style>
