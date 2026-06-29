# Watched Sessions & Accurate Live Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect every running Claude session accurately, add a curated Watched section with per-session names, a waiting-for-input pulse, and quick Jira/copy actions.

**Architecture:** A new I/O module scans running `claude` processes for `--resume <id>` to get the live-session set; `buildSessions` (pure) marks a session live if its id is in that set or its locked folder changed recently. A small JSON store in userData holds watched ids + names; the main process decorates each `Session` from it and pushes on file-change, on a periodic timer, and after mutations. The renderer renders two collapsible sections (Watched / Other) of `SessionRow` components.

**Tech Stack:** Electron, Vue 3 + TypeScript, Vitest, PowerShell (`Get-CimInstance`).

## Global Constraints

- **Platform:** Windows 11 only. Normalize paths (lowercase, `/` separators, no trailing slash) before comparing — use existing `normalizePath` from `src/main/lock.ts`.
- **Commits (user rule, overrides TDD frequency):** Do NOT run `git commit`/`git push`. Each "Review checkpoint" step means: stop, summarize the change, let the user commit. Leave everything in the working tree.
- **No code comments** (user rule): do not add explanatory comments to code.
- **Smallest diff:** match existing scaffold style; no drive-by refactors.
- **Status states:** exactly three — `working` | `waiting` | `idle`.
- **Session id format:** UUID (`8-4-4-4-12` hex). The jsonl filename is the session id.
- **Jira base:** `https://jira.redge.com/browse/<TICKET>`.

---

## File Structure

```
src/main/
  processes.ts     NEW  extractResumeIds() [pure] + runningResumeIds() [I/O]
  aggregate.ts     MOD  buildSessions() new signature + new liveness rule
  scanner.ts       MOD  pass running resume ids into buildSessions
  store.ts         NEW  loadState/saveState [I/O] + applyWatched/applyName [pure]
  index.ts         MOD  state load, decorate, periodic refresh, new IPC handlers
src/preload/
  index.ts         MOD  expose openTicket/copyText/setWatched/setName
  index.d.ts       MOD  type the new window.api methods
src/renderer/src/
  types.ts         MOD  Session += watched, name
  App.vue          MOD  two collapsible sections of SessionRow
  components/
    SessionRow.vue NEW  one row: dot, name, ticket, title, time, copy/edit/pin
test/
  processes.test.ts NEW
  aggregate.test.ts MOD
  store.test.ts      NEW
```

### Shared type (Task 1)

```ts
export type Status = 'working' | 'waiting' | 'idle'

export interface Session {
  id: string
  projectPath: string
  projectName: string
  gitBranch: string | null
  ticket: string | null
  firstPrompt: string | null
  lastActive: number
  isLive: boolean
  status: Status
  watched: boolean
  name: string | null
}
```

---

## Task 1: Session type + new liveness in `buildSessions` (pure)

**Files:**
- Modify: `src/renderer/src/types.ts`
- Modify: `src/main/aggregate.ts`
- Test: `test/aggregate.test.ts` (replace)

**Interfaces:**
- Produces: `buildSessions(raw: RawSession[], liveFolders: string[], liveSessionIds: string[], nowMs: number, liveFallbackMs?: number): Session[]`
  where `RawSession = { id; cwd: string|null; gitBranch: string|null; firstPrompt: string|null; mtimeMs: number }`.
- Behavior: `isLive = liveSessionIds.includes(id) || (folder has lock AND nowMs - mtimeMs <= liveFallbackMs)`; `liveFallbackMs` default `120_000`. `watched` defaults `false`, `name` defaults `null`. Sort: `working` < `waiting` < `idle`, then `lastActive` desc.

- [ ] **Step 1: Add fields to `Session` in `src/renderer/src/types.ts`**

Append `watched: boolean` and `name: string | null` to the interface (full interface shown in File Structure above).

- [ ] **Step 2: Replace `test/aggregate.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { buildSessions } from '../src/main/aggregate'

const now = 1_000_000
const live = ['c:\\Users\\Me\\Proj\\krs-fo-smarttv']

describe('buildSessions', () => {
  it('marks a session live when its id is in liveSessionIds', () => {
    const out = buildSessions(
      [
        { id: 'a', cwd: 'C:\\X\\krs-fo-web', gitBranch: null, firstPrompt: null, mtimeMs: now - 10_000 },
        { id: 'b', cwd: 'C:\\X\\krs-fo-web', gitBranch: null, firstPrompt: null, mtimeMs: now - 20_000 }
      ],
      [],
      ['a', 'b'],
      now
    )
    const byId = Object.fromEntries(out.map((s) => [s.id, s]))
    expect(byId['a'].isLive).toBe(true)
    expect(byId['b'].isLive).toBe(true)
  })

  it('marks a session live via the recent-mtime fallback in a locked folder', () => {
    const out = buildSessions(
      [{ id: 'x', cwd: 'C:\\Users\\Me\\Proj\\krs-fo-smarttv', gitBranch: null, firstPrompt: null, mtimeMs: now - 1000 }],
      live,
      [],
      now
    )
    expect(out[0].isLive).toBe(true)
    expect(out[0].status).toBe('working')
  })

  it('is idle when not in live ids and the fallback window has passed', () => {
    const out = buildSessions(
      [{ id: 'x', cwd: 'C:\\Users\\Me\\Proj\\krs-fo-smarttv', gitBranch: null, firstPrompt: null, mtimeMs: now - 600_000 }],
      live,
      [],
      now
    )
    expect(out[0].isLive).toBe(false)
    expect(out[0].status).toBe('idle')
  })

  it('is idle when folder has no lock and id is not live', () => {
    const out = buildSessions(
      [{ id: 'x', cwd: 'C:\\X\\other', gitBranch: null, firstPrompt: null, mtimeMs: now }],
      live,
      [],
      now
    )
    expect(out[0].isLive).toBe(false)
  })

  it('derives ticket, projectName, lastActive, and defaults watched/name', () => {
    const [s] = buildSessions(
      [{ id: 'a', cwd: 'C:\\X\\krs-fo-web', gitBranch: 'feat/SOFKAN-9-z', firstPrompt: 'hi', mtimeMs: now }],
      [],
      [],
      now
    )
    expect(s.ticket).toBe('SOFKAN-9')
    expect(s.projectName).toBe('krs-fo-web')
    expect(s.lastActive).toBe(now)
    expect(s.watched).toBe(false)
    expect(s.name).toBe(null)
  })

  it('sorts working before waiting before idle, then by recency', () => {
    const out = buildSessions(
      [
        { id: 'idleNew', cwd: 'C:\\X\\a', gitBranch: null, firstPrompt: null, mtimeMs: now },
        { id: 'liveWaiting', cwd: 'C:\\Users\\Me\\Proj\\krs-fo-smarttv', gitBranch: null, firstPrompt: null, mtimeMs: now - 600_000 }
      ],
      live,
      ['liveWaiting'],
      now
    )
    expect(out[0].id).toBe('liveWaiting')
    expect(out[1].id).toBe('idleNew')
  })
})
```

- [ ] **Step 3: Run, verify it fails**

Run: `npx vitest run test/aggregate.test.ts`
Expected: FAIL (wrong arity / new assertions).

- [ ] **Step 4: Replace `src/main/aggregate.ts`**

```ts
import type { Session } from '../renderer/src/types'
import { extractTicket } from './ticket'
import { deriveStatus } from './status'
import { normalizePath } from './lock'

interface RawSession {
  id: string
  cwd: string | null
  gitBranch: string | null
  firstPrompt: string | null
  mtimeMs: number
}

function projectName(cwd: string | null): string {
  if (!cwd) return 'unknown'
  const parts = cwd.replace(/\\/g, '/').replace(/\/+$/, '').split('/')
  return parts[parts.length - 1] || 'unknown'
}

const STATUS_RANK: Record<string, number> = { working: 0, waiting: 1, idle: 2 }

export function buildSessions(
  raw: RawSession[],
  liveFolders: string[],
  liveSessionIds: string[],
  nowMs: number,
  liveFallbackMs = 120_000
): Session[] {
  const liveFolderSet = new Set(liveFolders.map(normalizePath))
  const liveIdSet = new Set(liveSessionIds)

  const sessions = raw.map<Session>((r) => {
    const key = r.cwd ? normalizePath(r.cwd) : ''
    const isLive =
      liveIdSet.has(r.id) || (liveFolderSet.has(key) && nowMs - r.mtimeMs <= liveFallbackMs)
    return {
      id: r.id,
      projectPath: r.cwd ?? '',
      projectName: projectName(r.cwd),
      gitBranch: r.gitBranch,
      ticket: extractTicket(r.gitBranch, r.firstPrompt),
      firstPrompt: r.firstPrompt,
      lastActive: r.mtimeMs,
      isLive,
      status: deriveStatus({ isLive, mtimeMs: r.mtimeMs, nowMs }),
      watched: false,
      name: null
    }
  })

  return sessions.sort((a, b) => {
    const r = STATUS_RANK[a.status] - STATUS_RANK[b.status]
    return r !== 0 ? r : b.lastActive - a.lastActive
  })
}
```

- [ ] **Step 5: Run, verify pass**

Run: `npx vitest run test/aggregate.test.ts`
Expected: 6 passing.

- [ ] **Step 6: Run typecheck** — `npm run typecheck` → clean.

- [ ] **Step 7: Review checkpoint** — summarize; user commits (`feat: id-based live detection + watched/name fields`).

---

## Task 2: Running-process scan (`processes.ts`)

**Files:**
- Create: `src/main/processes.ts`
- Test: `test/processes.test.ts`

**Interfaces:**
- Produces:
  - `extractResumeIds(commandLines: string[]): string[]` — pure; unique UUIDs found after `--resume`.
  - `runningResumeIds(): Promise<Set<string>>` — I/O; spawns PowerShell, returns the set (empty on error).

- [ ] **Step 1: Write `test/processes.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { extractResumeIds } from '../src/main/processes'

describe('extractResumeIds', () => {
  it('pulls a single resume id', () => {
    expect(extractResumeIds(['claude --resume 3367d315-46a2-4000-bc43-7e3a5c0a43a5'])).toEqual([
      '3367d315-46a2-4000-bc43-7e3a5c0a43a5'
    ])
  })
  it('handles the concatenated command-line form (stops at the UUID boundary)', () => {
    expect(
      extractResumeIds([
        '--resume 3367d315-46a2-4000-bc43-7e3a5c0a43a5claude --resume 3367d315-46a2-4000-bc43-7e3a5c0a43a5'
      ])
    ).toEqual(['3367d315-46a2-4000-bc43-7e3a5c0a43a5'])
  })
  it('collects multiple distinct ids across lines', () => {
    expect(
      extractResumeIds([
        'claude --resume 3367d315-46a2-4000-bc43-7e3a5c0a43a5',
        'claude --resume dbabf464-5443-4599-bdeb-ad3eff872743'
      ]).sort()
    ).toEqual(
      ['3367d315-46a2-4000-bc43-7e3a5c0a43a5', 'dbabf464-5443-4599-bdeb-ad3eff872743'].sort()
    )
  })
  it('ignores lines without a resume id', () => {
    expect(extractResumeIds(['claude', 'node foo.js', ''])).toEqual([])
  })
})
```

- [ ] **Step 2: Run, verify fail** — `npx vitest run test/processes.test.ts` → module not found.

- [ ] **Step 3: Implement `src/main/processes.ts`**

```ts
import { spawn } from 'node:child_process'

const RESUME =
  /--resume\s+([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/g

export function extractResumeIds(commandLines: string[]): string[] {
  const ids = new Set<string>()
  for (const line of commandLines) {
    RESUME.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = RESUME.exec(line)) !== null) ids.add(m[1])
  }
  return [...ids]
}

export async function runningResumeIds(): Promise<Set<string>> {
  const ps =
    "Get-CimInstance Win32_Process -Filter \"Name='claude.exe'\" | ForEach-Object { $_.CommandLine }"
  return new Promise((resolve) => {
    let out = ''
    const p = spawn('powershell.exe', ['-NoProfile', '-Command', ps], { windowsHide: true })
    p.stdout.on('data', (d) => (out += d.toString()))
    p.on('error', () => resolve(new Set()))
    p.on('close', () => resolve(new Set(extractResumeIds(out.split(/\r?\n/)))))
  })
}
```

- [ ] **Step 4: Run, verify pass** — `npx vitest run test/processes.test.ts` → 4 passing.

- [ ] **Step 5: Review checkpoint** — `feat: scan running claude processes for resumed session ids`.

---

## Task 3: Wire process scan into the scanner

**Files:**
- Modify: `src/main/scanner.ts`

**Interfaces:**
- Consumes: `runningResumeIds` (Task 2), `buildSessions` new signature (Task 1).

- [ ] **Step 1: Update imports in `src/main/scanner.ts`**

Add to the existing imports:
```ts
import { runningResumeIds } from './processes'
```

- [ ] **Step 2: Update `scanSessions` to fetch and pass live ids**

Replace the body start and the final return. The function currently begins:
```ts
export async function scanSessions(nowMs: number): Promise<Session[]> {
  const folders = await liveFolders()
```
Change to:
```ts
export async function scanSessions(nowMs: number): Promise<Session[]> {
  const [folders, liveIds] = await Promise.all([liveFolders(), runningResumeIds()])
```
And change the final line from:
```ts
  return buildSessions(raw, folders, nowMs)
```
to:
```ts
  return buildSessions(raw, folders, [...liveIds], nowMs)
```

- [ ] **Step 3: Typecheck** — `npm run typecheck` → clean.

- [ ] **Step 4: Manual smoke** — temporarily add to `whenReady` in `index.ts`:
```ts
import { scanSessions } from './scanner'
scanSessions(Date.now()).then((s) => console.log('LIVE', s.filter((x) => x.isLive).map((x) => x.projectName)))
```
Run `npm run dev` with several `claude --resume` sessions open; expected: each resumed session's project appears. Remove the temporary line.

- [ ] **Step 5: Review checkpoint** — `feat: scanner uses running-process ids for liveness`.

---

## Task 4: Persistence store (`store.ts`)

**Files:**
- Create: `src/main/store.ts`
- Test: `test/store.test.ts`

**Interfaces:**
- Produces:
  - `interface State { watched: string[]; names: Record<string, string> }`
  - `loadState(file: string): State` (I/O; default on missing/bad)
  - `saveState(file: string, state: State): void` (I/O)
  - `applyWatched(state: State, id: string, on: boolean): State` (pure)
  - `applyName(state: State, id: string, name: string | null): State` (pure; empty/whitespace clears)

- [ ] **Step 1: Write `test/store.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadState, saveState, applyWatched, applyName } from '../src/main/store'

describe('store pure transforms', () => {
  it('applyWatched adds, is idempotent, and removes', () => {
    let s = { watched: [], names: {} }
    s = applyWatched(s, 'a', true)
    expect(s.watched).toEqual(['a'])
    s = applyWatched(s, 'a', true)
    expect(s.watched).toEqual(['a'])
    s = applyWatched(s, 'a', false)
    expect(s.watched).toEqual([])
  })
  it('applyName sets, trims, and clears on empty/null', () => {
    let s = { watched: [], names: {} }
    s = applyName(s, 'a', '  My session  ')
    expect(s.names['a']).toBe('My session')
    s = applyName(s, 'a', null)
    expect(s.names['a']).toBeUndefined()
    s = applyName(s, 'b', '   ')
    expect(s.names['b']).toBeUndefined()
  })
})

describe('store io', () => {
  it('round-trips and defaults when missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'css-'))
    const file = join(dir, 'state.json')
    expect(loadState(file)).toEqual({ watched: [], names: {} })
    saveState(file, { watched: ['x'], names: { x: 'n' } })
    expect(loadState(file)).toEqual({ watched: ['x'], names: { x: 'n' } })
    rmSync(dir, { recursive: true, force: true })
  })
})
```

- [ ] **Step 2: Run, verify fail** — `npx vitest run test/store.test.ts` → module not found.

- [ ] **Step 3: Implement `src/main/store.ts`**

```ts
import { readFileSync, writeFileSync } from 'node:fs'

export interface State {
  watched: string[]
  names: Record<string, string>
}

export function loadState(file: string): State {
  try {
    const o = JSON.parse(readFileSync(file, 'utf8'))
    return {
      watched: Array.isArray(o.watched) ? o.watched : [],
      names: o.names && typeof o.names === 'object' ? o.names : {}
    }
  } catch {
    return { watched: [], names: {} }
  }
}

export function saveState(file: string, state: State): void {
  try {
    writeFileSync(file, JSON.stringify(state, null, 2), 'utf8')
  } catch {
    return
  }
}

export function applyWatched(state: State, id: string, on: boolean): State {
  const set = new Set(state.watched)
  if (on) set.add(id)
  else set.delete(id)
  return { ...state, watched: [...set] }
}

export function applyName(state: State, id: string, name: string | null): State {
  const names = { ...state.names }
  const trimmed = name?.trim()
  if (trimmed) names[id] = trimmed
  else delete names[id]
  return { ...state, names }
}
```

- [ ] **Step 4: Run, verify pass** — `npx vitest run test/store.test.ts` → all passing.

- [ ] **Step 5: Review checkpoint** — `feat: watched/names persistence store`.

---

## Task 5: Main wiring — decorate, periodic refresh, IPC, preload

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

**Interfaces:**
- Consumes: `loadState/saveState/applyWatched/applyName` (Task 4), `scanSessions` (Task 3), `Session` (Task 1).
- Produces (preload `window.api`): `openTicket(code)`, `copyText(text)`, `setWatched(id, on)`, `setName(id, name)`.

- [ ] **Step 1: Preload — add methods in `src/preload/index.ts`**

In the `api` object (after `openSession`):
```ts
  openTicket: (code: string): void => {
    ipcRenderer.send('open-ticket', code)
  },
  copyText: (text: string): void => {
    ipcRenderer.send('copy-text', text)
  },
  setWatched: (id: string, on: boolean): void => {
    ipcRenderer.send('set-watched', id, on)
  },
  setName: (id: string, name: string | null): void => {
    ipcRenderer.send('set-name', id, name)
  }
```

- [ ] **Step 2: Preload typing — `src/preload/index.d.ts`**

Replace the `api` member of the `Window` interface with:
```ts
    api: {
      onSessions: (cb: (s: Session[]) => void) => void
      openSession: (s: Session) => void
      openTicket: (code: string) => void
      copyText: (text: string) => void
      setWatched: (id: string, on: boolean) => void
      setName: (id: string, name: string | null) => void
    }
```

- [ ] **Step 3: Main — imports & module state in `src/main/index.ts`**

Add to imports:
```ts
import { clipboard, shell } from 'electron'
import type { Session } from '../renderer/src/types'
import { scanSessions } from './scanner'
import { loadState, saveState, applyWatched, applyName, type State } from './store'
```
(`shell` is already imported in the scaffold — merge into the existing `electron` import rather than duplicating; `scanSessions` may already be imported from earlier tasks — keep one import.)

Add module-level state below imports:
```ts
let appState: State = { watched: [], names: {} }
let statePath = ''

function decorate(sessions: Session[]): Session[] {
  return sessions.map((s) => ({
    ...s,
    watched: appState.watched.includes(s.id),
    name: appState.names[s.id] ?? null
  }))
}

async function pushSessions(): Promise<void> {
  if (!mainWindow) return
  mainWindow.webContents.send('sessions', decorate(await scanSessions(Date.now())))
}
```

- [ ] **Step 4: Main — replace `wireSessions` to use `pushSessions` + periodic timer**

Replace the existing `wireSessions` function with:
```ts
function wireSessions(win: BrowserWindow): void {
  let timer: NodeJS.Timeout | null = null
  const schedule = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(pushSessions, 1500)
  }
  chokidar.watch([projectsDir(), ideDir()], { ignoreInitial: true, depth: 2 }).on('all', schedule)
  win.webContents.on('did-finish-load', pushSessions)
  setInterval(pushSessions, 4000)
}
```

- [ ] **Step 5: Main — load state and register IPC handlers in `whenReady`**

At the top of the `app.whenReady().then(() => {` body (before `createWindow`):
```ts
  statePath = join(app.getPath('userData'), 'state.json')
  appState = loadState(statePath)
```
Add handlers next to the existing `open-session` handler:
```ts
  ipcMain.on('open-ticket', (_e, code: string) => {
    void shell.openExternal(`https://jira.redge.com/browse/${code}`)
  })
  ipcMain.on('copy-text', (_e, text: string) => {
    clipboard.writeText(text)
  })
  ipcMain.on('set-watched', (_e, id: string, on: boolean) => {
    appState = applyWatched(appState, id, on)
    saveState(statePath, appState)
    void pushSessions()
  })
  ipcMain.on('set-name', (_e, id: string, name: string | null) => {
    appState = applyName(appState, id, name)
    saveState(statePath, appState)
    void pushSessions()
  })
```

- [ ] **Step 6: Typecheck & build** — `npm run typecheck` → clean; `npm run build` → succeeds.

- [ ] **Step 7: Review checkpoint** — `feat: decorate sessions from store, periodic refresh, jira/copy/watch/name IPC`.

---

## Task 6: Renderer UI — collapsible sections + `SessionRow`

**Files:**
- Create: `src/renderer/src/components/SessionRow.vue`
- Modify: `src/renderer/src/App.vue`

**Interfaces:**
- Consumes: `window.api.{onSessions,openSession,openTicket,copyText,setWatched,setName}`, `Session` (Task 1).

- [ ] **Step 1: Create `src/renderer/src/components/SessionRow.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import type { Session } from '../types'

const props = defineProps<{ session: Session }>()

const editing = ref(false)
const editValue = ref('')
const copied = ref(false)

const vFocus = { mounted: (el: HTMLInputElement): void => el.focus() }

const open = (): void => window.api.openSession({ ...props.session })
const openTicket = (): void => {
  if (props.session.ticket) window.api.openTicket(props.session.ticket)
}
const toggleWatch = (): void => window.api.setWatched(props.session.id, !props.session.watched)

function copyId(): void {
  window.api.copyText(props.session.id)
  copied.value = true
  setTimeout(() => (copied.value = false), 1200)
}
function startEdit(): void {
  editing.value = true
  editValue.value = props.session.name ?? ''
}
function commit(): void {
  window.api.setName(props.session.id, editValue.value.trim() || null)
  editing.value = false
}

function title(): string {
  const s = props.session
  if (s.name) return s.name
  const p = s.firstPrompt ?? ''
  return p.length > 40 ? p.slice(0, 40) + '…' : p
}
function dotColor(): string {
  const s = props.session.status
  return s === 'working' ? '#3fb950' : s === 'waiting' ? '#d29922' : '#6e7681'
}
function ago(ms: number): string {
  const d = Math.max(0, Date.now() - ms)
  const m = Math.floor(d / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`
}
</script>

<template>
  <li class="row" :class="{ waiting: session.status === 'waiting' }" :title="session.firstPrompt ?? ''" @click="open">
    <span class="d" :style="{ background: dotColor() }" />
    <span class="name">{{ session.projectName }}</span>
    <span v-if="session.ticket" class="ticket" @click.stop="openTicket">{{ session.ticket }}</span>
    <input
      v-if="editing"
      v-focus
      v-model="editValue"
      class="edit"
      @click.stop
      @keyup.enter="commit"
      @keyup.esc="editing = false"
      @blur="commit"
    />
    <span v-else class="ttl">{{ title() }}</span>
    <span class="time">{{ ago(session.lastActive) }}</span>
    <button class="ic" :title="copied ? 'Copied' : 'Copy session id'" @click.stop="copyId">
      {{ copied ? '✓' : '⎘' }}
    </button>
    <button class="ic" title="Rename" @click.stop="startEdit">✎</button>
    <button class="ic" :class="{ on: session.watched }" title="Watch" @click.stop="toggleWatch">★</button>
  </li>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  cursor: pointer;
  border-bottom: 1px solid #161b22;
}
.row:hover {
  background: #161b22;
}
.row.waiting {
  animation: pulse 1.5s ease-in-out infinite alternate;
}
@keyframes pulse {
  from {
    background: transparent;
  }
  to {
    background: rgba(210, 153, 34, 0.18);
  }
}
.d {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex: none;
}
.name {
  font-weight: 500;
}
.ticket {
  color: #58a6ff;
  font-size: 11px;
  cursor: pointer;
}
.ticket:hover {
  text-decoration: underline;
}
.ttl {
  color: #8b949e;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 130px;
}
.edit {
  font: 11px system-ui;
  background: #0d1117;
  color: #e6edf3;
  border: 1px solid #30363d;
  border-radius: 4px;
  padding: 1px 4px;
  width: 130px;
}
.time {
  margin-left: auto;
  color: #8b949e;
  font-size: 11px;
  flex: none;
}
.ic {
  background: none;
  border: none;
  color: #6e7681;
  cursor: pointer;
  font-size: 12px;
  padding: 0 2px;
  flex: none;
}
.ic:hover {
  color: #e6edf3;
}
.ic.on {
  color: #d29922;
}
</style>
```

- [ ] **Step 2: Replace `src/renderer/src/App.vue`**

```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { Session } from './types'
import SessionRow from './components/SessionRow.vue'

const sessions = ref<Session[]>([])
const watchedOpen = ref(true)
const othersOpen = ref(true)

onMounted(() => window.api.onSessions((s) => (sessions.value = s)))

const watchedList = computed(() => sessions.value.filter((s) => s.watched || s.isLive))
const otherList = computed(() => sessions.value.filter((s) => !(s.watched || s.isLive)))
</script>

<template>
  <div class="wrap">
    <header>Claude Sessions</header>
    <div class="scroll">
      <div class="shead" @click="watchedOpen = !watchedOpen">
        <span class="chev">{{ watchedOpen ? '▾' : '▸' }}</span>
        Watched <span class="count">{{ watchedList.length }}</span>
      </div>
      <ul v-show="watchedOpen">
        <SessionRow v-for="s in watchedList" :key="s.id" :session="s" />
        <li v-if="!watchedList.length" class="empty">Nothing watched or live</li>
      </ul>

      <div class="shead" @click="othersOpen = !othersOpen">
        <span class="chev">{{ othersOpen ? '▾' : '▸' }}</span>
        Other <span class="count">{{ otherList.length }}</span>
      </div>
      <ul v-show="othersOpen">
        <SessionRow v-for="s in otherList" :key="s.id" :session="s" />
        <li v-if="!otherList.length" class="empty">No other sessions</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  font: 12px system-ui;
  color: #e6edf3;
  background: #0d1117;
  height: 100vh;
  display: flex;
  flex-direction: column;
}
header {
  padding: 8px 10px;
  font-weight: 600;
  border-bottom: 1px solid #21262d;
  -webkit-app-region: drag;
}
.scroll {
  overflow-y: auto;
  flex: 1;
}
.shead {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 600;
  color: #8b949e;
  background: #0d1117;
  cursor: pointer;
  position: sticky;
  top: 0;
}
.chev {
  width: 10px;
}
.count {
  color: #6e7681;
  font-weight: 400;
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.empty {
  color: #8b949e;
  padding: 7px 10px;
  text-align: center;
}
</style>
```

- [ ] **Step 3: Typecheck & build** — `npm run typecheck` → clean; `npm run build` → succeeds.

- [ ] **Step 4: Manual verify** — `npm run dev`:
  - Multiple `claude --resume` sessions in one VSCode window → each shows green/amber in **Watched**.
  - Star toggles a session into Watched and it persists across an app restart.
  - Pencil renames a row; blank clears back to the first prompt.
  - Clicking a ticket opens `https://jira.redge.com/browse/<TICKET>` in the browser.
  - Copy icon copies the session id (paste to confirm).
  - A `waiting` session’s row gently pulses amber.
  - Collapsing/expanding both sections works; counts are correct.

- [ ] **Step 5: Review checkpoint** — `feat: watched/other sections, session rows, jira/copy/rename, waiting pulse`.

---

## Self-Review

- **Spec coverage:** live detection via process scan (Tasks 2–3) + mtime fallback (Task 1); persistence (Task 4); decorate/periodic/IPC (Task 5); Watched/Other collapsible sections, names with first-prompt fallback, pin, copy-id, Jira link, waiting pulse (Task 6). ✔
- **Type consistency:** `buildSessions(raw, liveFolders, liveSessionIds, nowMs, liveFallbackMs?)` used identically in Task 1 (def) and Task 3 (call). `Session` += `watched`/`name` defined in Task 1, defaulted in `buildSessions`, overwritten by `decorate` (Task 5), consumed in Task 6. `State`, `applyWatched`, `applyName`, `loadState`, `saveState` signatures match between Task 4 and Task 5. `window.api` methods match between preload (Task 5) and renderer use (Task 6). ✔
- **Placeholders:** none — every code step is complete.
- **Deviation from spec:** rename is available on every row (per the clarified answer "Any session in the list"); waiting pulse animates the row background rather than only the dot (clearer signal in a dense list).
```
