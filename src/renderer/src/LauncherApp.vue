<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import Icon from './dashboard/Icon.vue'

const isRemembered = ref(false)
const launch = (view: 'sidebar' | 'dashboard'): void => window.api.launchView(view, isRemembered.value)
const onKey = (e: KeyboardEvent): void => {
  if (e.key === '1') launch('dashboard')
  if (e.key === '2') launch('sidebar')
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <main class="launcher">
    <header>
      <div class="mark"><Icon name="dashboard" :size="18" /></div>
      <div>
        <h1>Claude Cockpit</h1>
        <p>Choose how you want to work today.</p>
      </div>
    </header>

    <div class="choices">
      <button class="choice" autofocus @click="launch('dashboard')">
        <svg class="shot" viewBox="0 0 200 110" aria-hidden="true">
          <rect x="0.5" y="0.5" width="199" height="109" rx="7" class="frame" />
          <rect x="6" y="6" width="10" height="98" rx="3" class="rail" />
          <rect x="21" y="6" width="44" height="98" rx="3" class="panel" />
          <rect x="25" y="12" width="36" height="7" rx="2" class="line" />
          <rect x="25" y="24" width="36" height="12" rx="2" class="row on" />
          <rect x="25" y="40" width="36" height="12" rx="2" class="row" />
          <rect x="25" y="56" width="36" height="12" rx="2" class="row" />
          <rect x="70" y="6" width="124" height="14" rx="3" class="panel" />
          <rect x="70" y="24" width="62" height="80" rx="3" class="code" />
          <rect x="136" y="24" width="58" height="80" rx="3" class="term" />
          <rect x="75" y="31" width="40" height="3" rx="1.5" class="line" />
          <rect x="75" y="38" width="50" height="3" rx="1.5" class="line" />
          <rect x="75" y="45" width="30" height="3" rx="1.5" class="add" />
          <rect x="141" y="31" width="44" height="3" rx="1.5" class="line" />
          <rect x="141" y="38" width="34" height="3" rx="1.5" class="accent" />
        </svg>
        <span class="name"><Icon name="dashboard" :size="15" />Dashboard<kbd>1</kbd></span>
        <span class="desc">A full window with tickets, merge requests, code, Claude sessions and dev servers.</span>
      </button>

      <button class="choice" @click="launch('sidebar')">
        <svg class="shot" viewBox="0 0 200 110" aria-hidden="true">
          <rect x="0.5" y="0.5" width="199" height="109" rx="7" class="frame" />
          <rect x="6" y="6" width="136" height="98" rx="3" class="desk" />
          <rect x="148" y="6" width="46" height="98" rx="3" class="panel" />
          <rect x="152" y="12" width="38" height="12" rx="2" class="row on" />
          <rect x="152" y="28" width="38" height="12" rx="2" class="row" />
          <rect x="152" y="44" width="38" height="12" rx="2" class="row" />
          <rect x="152" y="60" width="38" height="12" rx="2" class="row" />
        </svg>
        <span class="name"><Icon name="sidebar" :size="15" />Compact sidebar<kbd>2</kbd></span>
        <span class="desc">A narrow bar docked to the screen edge that lists your sessions while you work in VS Code.</span>
      </button>
    </div>

    <footer>
      <label><input v-model="isRemembered" type="checkbox" />Remember my choice</label>
      <span>You can change it later in Settings.</span>
    </footer>
  </main>
</template>

<style scoped>
.launcher {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 26px 28px 20px;
  color: var(--text-2);
  background: var(--bg-0);
  font: 13px/1.45 var(--font-ui);
  -webkit-font-smoothing: antialiased;
}
header {
  display: flex;
  align-items: center;
  gap: 14px;
}
.mark {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  color: var(--accent);
  background: var(--accent-soft);
  border-radius: 10px;
}
h1 {
  margin: 0;
  font: 600 17px var(--font-ui);
  color: var(--text);
}
header p {
  margin: 2px 0 0;
  color: var(--text-3);
}
.choices {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-top: 22px;
}
.choice {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 12px 14px;
  text-align: left;
  font: inherit;
  color: inherit;
  background: var(--bg-1);
  border: 1px solid var(--line-2);
  border-radius: 12px;
  cursor: pointer;
}
.choice:hover,
.choice:focus-visible {
  background: var(--bg-2);
  border-color: var(--accent);
  outline: none;
}
.shot {
  width: 100%;
  height: auto;
  margin-bottom: 4px;
}
.frame {
  fill: var(--bg-0);
  stroke: var(--line-2);
}
.rail,
.desk {
  fill: var(--bg-2);
}
.panel {
  fill: var(--bg-3);
}
.code,
.term {
  fill: var(--bg-1);
  stroke: var(--line-2);
  stroke-width: 0.6;
}
.line {
  fill: var(--line-3);
}
.row {
  fill: var(--bg-4);
}
.row.on {
  fill: var(--accent-soft);
  stroke: var(--accent);
  stroke-width: 0.6;
}
.add,
.accent {
  fill: var(--accent);
  opacity: 0.7;
}
.name {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  font: 600 14px var(--font-ui);
  color: var(--text);
}
kbd {
  margin-left: auto;
  padding: 0 6px;
  font: 11px var(--font-mono);
  color: var(--text-4);
  border: 1px solid var(--line-2);
  border-radius: 4px;
}
.desc {
  font-size: 12.5px;
  color: var(--text-3);
}
footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16px;
  font-size: 12px;
  color: var(--text-4);
}
footer label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-2);
  cursor: pointer;
}
footer input {
  margin: 0;
  accent-color: var(--accent);
}
</style>
