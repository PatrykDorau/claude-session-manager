<script setup lang="ts">
import { ref, inject } from 'vue'
import type { Ref } from 'vue'

const colorblind = inject<Ref<boolean>>('colorblind', ref(false))
const initial = window.api.getSettings()
const jiraBase = ref(initial.jiraBase)
const alwaysOnTop = ref(initial.alwaysOnTop)
const launchOnStartup = ref(initial.launchOnStartup)
const clickAction = ref(initial.clickAction)

function saveJira(): void {
  window.api.setSettings({ jiraBase: jiraBase.value.trim() })
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
function switchAccount(): void {
  window.api.switchAccount()
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
      <span class="flbl">On click, a session…</span>
      <select v-model="clickAction" class="inp" @change="saveClick">
        <option value="default">opens & resumes (focus if open)</option>
        <option value="terminal">resumes in a VS Code side terminal</option>
        <option value="standalone">resumes in a standalone terminal (no focus needed)</option>
        <option value="project">just opens the project in VS Code</option>
        <option value="focus">just focuses the existing window</option>
      </select>
      <small class="hint">Right-click a session for all actions at once.</small>
    </label>

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
.acct {
  margin-top: 16px;
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
