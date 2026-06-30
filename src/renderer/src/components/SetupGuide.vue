<script setup lang="ts">
import { ref } from 'vue'

const hookState = ref<'idle' | 'ok' | 'error'>('idle')
const hookError = ref('')
const keybind = '{ "key": "ctrl+alt+f9", "command": "workbench.action.createTerminalEditorSide" }'

function installHooks(): void {
  const res = window.api.installHooks()
  if (res.ok) {
    hookState.value = 'ok'
  } else {
    hookState.value = 'error'
    hookError.value = res.error ?? 'Unknown error'
  }
}
function copyKeybind(): void {
  window.api.copyText(keybind)
}
</script>

<template>
  <div class="guide">
    <h2>Welcome 👋</h2>
    <p class="lead">
      This app lists every Claude Code session across your projects, with live status and usage
      limits. Most of it works immediately — here's the little that needs setup.
    </p>

    <h3>1 · Prerequisites</h3>
    <p>
      You need <b>Claude Code</b> installed and the <code>claude</code> command on your PATH (used
      for status, account switching and resuming). To open projects, the VS Code <code>code</code>
      command should also be on PATH.
    </p>

    <h3>2 · Clicking a session (no setup)</h3>
    <p>
      By default, clicking a session <b>opens the project in VS Code and resumes the session in a
      new terminal window</b>. This needs no configuration. You can change it under
      <b>Settings → On click</b>.
    </p>

    <h3>3 · "Needs you" &amp; "Check output" status</h3>
    <p>
      To see when a session is <b>waiting for your permission</b> or has <b>finished and awaits
      review</b>, the app uses small Claude Code hooks. Install them in one click — this writes
      <code>~/.claude/needs-input-hook.js</code> and adds hooks to <code>~/.claude/settings.json</code>
      (your existing settings are backed up to <code>settings.json.bak</code> and other hooks are
      preserved). Restart your Claude sessions afterwards.
    </p>
    <div class="row">
      <button class="btn" :disabled="hookState === 'ok'" @click="installHooks">
        {{ hookState === 'ok' ? 'Hooks installed ✓' : 'Install status hooks' }}
      </button>
      <span v-if="hookState === 'error'" class="err">{{ hookError }}</span>
    </div>

    <h3>4 · VS Code side-terminal resume (optional)</h3>
    <p>
      Prefer resuming inside VS Code's integrated terminal instead of a separate window? Pick
      <b>"resumes in a VS Code side terminal"</b> under Settings → On click, and add this keybinding
      via <b>Command Palette → Preferences: Open Keyboard Shortcuts (JSON)</b>:
    </p>
    <code class="block">{{ keybind }}</code>
    <button class="btn ghost" @click="copyKeybind">Copy keybinding</button>
  </div>
</template>

<style scoped>
.guide {
  padding: 14px;
  color: #e6edf3;
  font-size: 12px;
  line-height: 1.5;
}
h2 {
  font-size: 16px;
  margin: 0 0 6px;
}
h3 {
  font-size: 12px;
  font-weight: 600;
  color: #58a6ff;
  margin: 16px 0 4px;
}
.lead {
  color: #8b949e;
  margin: 0 0 4px;
}
p {
  margin: 0 0 4px;
  color: #c9d1d9;
}
code {
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 4px;
  padding: 1px 5px;
  font: 11px ui-monospace, monospace;
  color: #e6edf3;
}
code.block {
  display: block;
  padding: 8px 10px;
  margin: 6px 0;
  word-break: break-all;
  user-select: all;
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
}
.btn {
  font: 12px system-ui;
  background: #1f6feb;
  color: #fff;
  border: 1px solid #1f6feb;
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
}
.btn:disabled {
  background: #238636;
  border-color: #238636;
  cursor: default;
}
.btn.ghost {
  background: none;
  color: #8b949e;
  border-color: #30363d;
  margin-top: 4px;
}
.btn.ghost:hover {
  color: #e6edf3;
}
.err {
  color: #f85149;
  font-size: 11px;
}
</style>
