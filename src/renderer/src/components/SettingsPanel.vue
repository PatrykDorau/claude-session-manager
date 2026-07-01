<script setup lang="ts">
import { ref, inject } from 'vue'
import type { Ref } from 'vue'
import { SOUNDS, playSound, type SoundName } from '../sound'

const colorblind = inject<Ref<boolean>>('colorblind', ref(false))
const initial = window.api.getSettings()
const jiraBase = ref(initial.jiraBase)
const jiraToken = ref(initial.jiraToken)
const jiraDoneStatuses = ref(initial.jiraDoneStatuses)
const alwaysOnTop = ref(initial.alwaysOnTop)
const launchOnStartup = ref(initial.launchOnStartup)
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
const syncing = ref(false)
const synced = ref(false)

function saveJira(): void {
  window.api.setSettings({ jiraBase: jiraBase.value.trim() })
}
function saveJiraToken(): void {
  window.api.setSettings({ jiraToken: jiraToken.value.trim() })
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
      <div class="abt">Claude Session Switcher <span v-if="version">v{{ version }}</span></div>
      <button class="btn" @click="copyDiag">{{ diagCopied ? 'Copied ✓' : 'Copy diagnostics' }}</button>
      <small class="hint">Copies version, OS and detection info to your clipboard to share when reporting a problem.</small>
    </div>
  </div>
</template>

<style scoped>
.settings {
  padding: 14px;
  color: #e6edf3;
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
  background: #0d1117;
  color: #e6edf3;
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: 6px 8px;
  outline: none;
}
.inp:focus {
  border-color: #58a6ff;
}
.hint {
  display: block;
  color: #6e7681;
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
  border-bottom: 1px solid #161b22;
}
.sounds {
  display: flex;
  gap: 6px;
  padding: 4px 2px 8px;
}
.sndbtn {
  flex: 1;
  font: 11px system-ui;
  background: #0d1117;
  color: #8b949e;
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: 5px 8px;
  cursor: pointer;
}
.sndbtn:hover {
  color: #e6edf3;
}
.sndbtn.on {
  color: #fff;
  background: #1f6feb;
  border-color: #1f6feb;
}
.acct {
  margin-top: 16px;
}
.abt {
  color: #8b949e;
  margin-bottom: 8px;
}
.btn {
  font: 12px system-ui;
  background: #21262d;
  color: #e6edf3;
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
}
.btn:hover {
  border-color: #58a6ff;
  color: #fff;
}
.btn:disabled {
  opacity: 0.6;
  cursor: default;
  border-color: #30363d;
  color: #e6edf3;
}
.sw {
  width: 34px;
  height: 18px;
  border-radius: 10px;
  background: #30363d;
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
  background: #8b949e;
  transition: transform 0.15s;
}
.sw.on {
  background: #1f6feb;
}
.sw.on::after {
  transform: translateX(16px);
  background: #fff;
}
</style>
