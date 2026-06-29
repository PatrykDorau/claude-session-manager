# Claude Session Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Windows-only, always-on-top Electron + Vue tray app that lists Claude Code sessions across all projects and, on click, focuses the already-open VSCode window or reopens + resumes the session.

**Architecture:** Electron main process (Node) scans `~/.claude/projects/**/*.jsonl` and `~/.claude/ide/*.lock`, derives a `Session[]` (project, ticket, status, liveness), and pushes it to a Vue renderer over IPC. Pure logic (parsing, ticket extraction, status, aggregation) lives in I/O-free modules that are unit-tested with fixtures. A chokidar watcher triggers debounced rescans. A thin Launcher module shells out to PowerShell / `code` for window focus and resume.

**Tech Stack:** Electron, Vue 3 + TypeScript (electron-vite scaffold), Vitest, chokidar, electron-builder, PowerShell (Win32 window focus).

## Global Constraints

- **Platform:** Windows 11 only. Paths use lowercase drive letters and backslashes in lock files (`c:\Users\...`); normalize before comparing.
- **Claude data root:** `~/.claude` → resolve via `os.homedir()` + `.claude`. Subdirs: `projects/`, `ide/`.
- **Commits (user rule, overrides TDD frequency):** Do NOT run `git commit`/`git push` automatically. Each "Commit" step is a **review checkpoint** — stop, summarize the change, and let the user commit. `git init` (no commit) is allowed in Task 1.
- **No code comments** (user rule): do not add explanatory comments to code; reasoning goes in commit messages / this plan.
- **Smallest diff:** match scaffold style; no drive-by refactors.
- **Status states:** exactly three — `working` | `waiting` | `idle`. No "needs permission" state.
- **Ticket regex:** `/[A-Z][A-Z0-9]+-\d+/` (matches `SOFKRS-8028`, `SOFKAN-12`).

---

## File Structure

```
claude-session-switcher/
├─ package.json
├─ electron.vite.config.ts
├─ vitest.config.ts
├─ src/
│  ├─ main/
│  │  ├─ index.ts              app lifecycle, window, tray, hotkey, IPC, watcher
│  │  ├─ paths.ts              claude root + dir resolution
│  │  ├─ ticket.ts             extractTicket()                [pure]
│  │  ├─ status.ts             deriveStatus()                 [pure]
│  │  ├─ transcript.ts         parseTranscriptHead()          [pure]
│  │  ├─ lock.ts               parseLockFile(), normalizePath() [pure]
│  │  ├─ aggregate.ts          buildSessions()                [pure]
│  │  ├─ scanner.ts            scanSessions()                 [I/O: fs + above pure fns]
│  │  └─ launcher.ts           focusOrOpen()                  [I/O: PowerShell/code]
│  ├─ preload/
│  │  └─ index.ts              contextBridge: onSessions, openSession
│  └─ renderer/
│     ├─ index.html
│     └─ src/
│        ├─ App.vue            floating list UI
│        ├─ main.ts
│        └─ types.ts           Session interface (shared shape)
└─ test/
   ├─ ticket.test.ts
   ├─ status.test.ts
   ├─ transcript.test.ts
   ├─ lock.test.ts
   ├─ aggregate.test.ts
   └─ fixtures/
      ├─ session-sample.jsonl
      └─ ide-sample.lock
```

### Shared types (defined in Task 2, reused everywhere)

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
}
```

---

## Task 1: Scaffold Electron + Vue + Vitest project

**Files:**
- Create: whole `claude-session-switcher/` scaffold via electron-vite
- Create: `vitest.config.ts`
- Modify: `package.json` (add scripts + chokidar)

- [ ] **Step 1: Scaffold with electron-vite (Vue + TS)**

Run from `C:\Users\ASSET-17300\Desktop\Projekty\`:
```bash
npm create @quick-start/electron@latest claude-session-switcher -- --template vue-ts
cd claude-session-switcher
npm install
git init
```
Expected: project created, deps installed.

- [ ] **Step 2: Add Vitest + chokidar**

```bash
npm install -D vitest
npm install chokidar
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
```

- [ ] **Step 4: Add test script to `package.json`**

In `"scripts"`, add:
```json
"test": "vitest run"
```

- [ ] **Step 5: Verify dev app launches**

Run: `npm run dev`
Expected: an Electron window opens showing the default Vue template. Close it.

- [ ] **Step 6: Verify test runner works (empty)**

Create `test/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
describe('smoke', () => { it('runs', () => { expect(1).toBe(1) }) })
```
Run: `npm test`
Expected: 1 passing test. Then delete `test/smoke.test.ts`.

- [ ] **Step 7: Commit checkpoint** — `chore: scaffold electron-vue-ts + vitest`

---

## Task 2: Ticket extraction (pure)

**Files:**
- Create: `src/main/ticket.ts`
- Create: `src/renderer/src/types.ts` (shared `Session`/`Status` — see File Structure)
- Test: `test/ticket.test.ts`

**Interfaces:**
- Produces: `extractTicket(gitBranch: string | null, firstPrompt: string | null): string | null`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest'
import { extractTicket } from '../src/main/ticket'

describe('extractTicket', () => {
  it('pulls ticket from a branch name', () => {
    expect(extractTicket('fix/SOFKRS-8028-next-episode', null)).toBe('SOFKRS-8028')
  })
  it('falls back to the first prompt', () => {
    expect(extractTicket('develop', 'please look at SOFKAN-12 today')).toBe('SOFKAN-12')
  })
  it('prefers the branch over the prompt', () => {
    expect(extractTicket('feat/SOFKRS-1-a', 'mentions SOFKAN-999')).toBe('SOFKRS-1')
  })
  it('returns null when nothing matches', () => {
    expect(extractTicket('develop', 'no ticket here')).toBe(null)
    expect(extractTicket(null, null)).toBe(null)
  })
})
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run test/ticket.test.ts`
Expected: FAIL — cannot find module `../src/main/ticket`.

- [ ] **Step 3: Implement**

`src/main/ticket.ts`:
```ts
const TICKET = /[A-Z][A-Z0-9]+-\d+/

export function extractTicket(
  gitBranch: string | null,
  firstPrompt: string | null,
): string | null {
  return gitBranch?.match(TICKET)?.[0] ?? firstPrompt?.match(TICKET)?.[0] ?? null
}
```

Also create `src/renderer/src/types.ts` with the `Status` and `Session` definitions from the File Structure section.

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run test/ticket.test.ts`
Expected: 4 passing.

- [ ] **Step 5: Commit checkpoint** — `feat: ticket extraction + shared session types`

---

## Task 3: Status derivation (pure)

**Files:**
- Create: `src/main/status.ts`
- Test: `test/status.test.ts`

**Interfaces:**
- Consumes: `Status` from `types.ts`.
- Produces: `deriveStatus(input: { isLive: boolean; mtimeMs: number; nowMs: number; workingWindowMs?: number }): Status`
- Note: `working` = live AND written within `workingWindowMs` (default 5000); `waiting` = live but quiet; `idle` = not live. (Simpler and more reliable than inspecting the last entry type, which can be a `system` line.)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest'
import { deriveStatus } from '../src/main/status'

const now = 1_000_000

describe('deriveStatus', () => {
  it('idle when not live, regardless of mtime', () => {
    expect(deriveStatus({ isLive: false, mtimeMs: now, nowMs: now })).toBe('idle')
  })
  it('working when live and recently written', () => {
    expect(deriveStatus({ isLive: true, mtimeMs: now - 1000, nowMs: now })).toBe('working')
  })
  it('waiting when live but quiet past the window', () => {
    expect(deriveStatus({ isLive: true, mtimeMs: now - 60_000, nowMs: now })).toBe('waiting')
  })
  it('respects a custom working window', () => {
    expect(deriveStatus({ isLive: true, mtimeMs: now - 3000, nowMs: now, workingWindowMs: 2000 })).toBe('waiting')
  })
})
```

- [ ] **Step 2: Run, verify fail** — `npx vitest run test/status.test.ts` → module not found.

- [ ] **Step 3: Implement**

`src/main/status.ts`:
```ts
import type { Status } from '../renderer/src/types'

export function deriveStatus(input: {
  isLive: boolean
  mtimeMs: number
  nowMs: number
  workingWindowMs?: number
}): Status {
  if (!input.isLive) return 'idle'
  const window = input.workingWindowMs ?? 5000
  return input.nowMs - input.mtimeMs <= window ? 'working' : 'waiting'
}
```

- [ ] **Step 4: Run, verify pass** — 4 passing.

- [ ] **Step 5: Commit checkpoint** — `feat: status derivation`

---

## Task 4: Lock file parsing + path normalization (pure)

**Files:**
- Create: `src/main/lock.ts`
- Test: `test/lock.test.ts`
- Create: `test/fixtures/ide-sample.lock`

**Interfaces:**
- Produces:
  - `normalizePath(p: string): string` — lowercased, backslashes→`/`, trailing slash stripped.
  - `parseLockFile(content: string): { pid: number; workspaceFolders: string[]; ideName: string } | null` — returns null on malformed JSON.

- [ ] **Step 1: Create fixture** `test/fixtures/ide-sample.lock`:

```json
{"pid":13164,"workspaceFolders":["c:\\Users\\ASSET-17300\\Desktop\\Projekty\\zwo\\krs-fo-smarttv"],"ideName":"Visual Studio Code","transport":"ws","runningInWindows":true,"authToken":"db5c7bfb"}
```

- [ ] **Step 2: Write failing test**

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseLockFile, normalizePath } from '../src/main/lock'

describe('normalizePath', () => {
  it('lowercases drive, unifies separators, strips trailing slash', () => {
    expect(normalizePath('C:\\Users\\Me\\Proj\\')).toBe('c:/users/me/proj')
    expect(normalizePath('c:/users/me/proj')).toBe('c:/users/me/proj')
  })
})

describe('parseLockFile', () => {
  it('parses a real lock fixture', () => {
    const raw = readFileSync(join(__dirname, 'fixtures/ide-sample.lock'), 'utf8')
    const lock = parseLockFile(raw)
    expect(lock?.pid).toBe(13164)
    expect(lock?.workspaceFolders[0]).toContain('krs-fo-smarttv')
  })
  it('returns null on malformed json', () => {
    expect(parseLockFile('{not json')).toBe(null)
  })
})
```

- [ ] **Step 3: Run, verify fail** — module not found.

- [ ] **Step 4: Implement**

`src/main/lock.ts`:
```ts
export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

export function parseLockFile(
  content: string,
): { pid: number; workspaceFolders: string[]; ideName: string } | null {
  try {
    const o = JSON.parse(content)
    if (typeof o.pid !== 'number' || !Array.isArray(o.workspaceFolders)) return null
    return { pid: o.pid, workspaceFolders: o.workspaceFolders, ideName: o.ideName ?? '' }
  } catch {
    return null
  }
}
```

- [ ] **Step 5: Run, verify pass** — all passing.

- [ ] **Step 6: Commit checkpoint** — `feat: lock parsing + path normalization`

---

## Task 5: Transcript head parsing (pure)

**Files:**
- Create: `src/main/transcript.ts`
- Test: `test/transcript.test.ts`
- Create: `test/fixtures/session-sample.jsonl`

**Interfaces:**
- Produces: `parseTranscriptHead(lines: string[]): { sessionId: string | null; cwd: string | null; gitBranch: string | null; firstPrompt: string | null }`
- Behavior: iterate parsed JSON lines; capture first non-empty `cwd`, `gitBranch`, `sessionId` seen; `firstPrompt` = content of the first entry with `type === 'user'` whose `message.content` is a string (or first string in a content array). Ignore the leading `last-prompt` marker line and unparseable lines.

- [ ] **Step 1: Create fixture** `test/fixtures/session-sample.jsonl` (each line is one JSON object):

```
{"type":"last-prompt","leafUuid":"x","sessionId":"9d84c0ea"}
{"type":"user","message":{"role":"user","content":"Fix the next episode bug"},"cwd":"C:\\Users\\ASSET-17300\\Desktop\\Projekty\\zwo\\krs-fo-smarttv","sessionId":"9d84c0ea","gitBranch":"fix/SOFKRS-8028-next-episode"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"ok"}]},"cwd":"C:\\Users\\ASSET-17300\\Desktop\\Projekty\\zwo\\krs-fo-smarttv","sessionId":"9d84c0ea","gitBranch":"fix/SOFKRS-8028-next-episode"}
{"type":"system","subtype":"turn_duration","timestamp":"2026-06-27T07:36:28.354Z","sessionId":"9d84c0ea"}
```

- [ ] **Step 2: Write failing test**

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseTranscriptHead } from '../src/main/transcript'

describe('parseTranscriptHead', () => {
  const lines = readFileSync(join(__dirname, 'fixtures/session-sample.jsonl'), 'utf8')
    .split(/\r?\n/).filter(Boolean)

  it('extracts session id, cwd, branch', () => {
    const h = parseTranscriptHead(lines)
    expect(h.sessionId).toBe('9d84c0ea')
    expect(h.cwd).toContain('krs-fo-smarttv')
    expect(h.gitBranch).toBe('fix/SOFKRS-8028-next-episode')
  })
  it('uses the first user message as firstPrompt', () => {
    expect(parseTranscriptHead(lines).firstPrompt).toBe('Fix the next episode bug')
  })
  it('tolerates garbage lines', () => {
    const h = parseTranscriptHead(['not json', ...lines, '{bad'])
    expect(h.sessionId).toBe('9d84c0ea')
  })
  it('returns nulls for empty input', () => {
    expect(parseTranscriptHead([])).toEqual({ sessionId: null, cwd: null, gitBranch: null, firstPrompt: null })
  })
})
```

- [ ] **Step 3: Run, verify fail** — module not found.

- [ ] **Step 4: Implement**

`src/main/transcript.ts`:
```ts
interface Head {
  sessionId: string | null
  cwd: string | null
  gitBranch: string | null
  firstPrompt: string | null
}

function textOf(content: unknown): string | null {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const t = content.find((c) => c && typeof c === 'object' && (c as any).type === 'text')
    if (t && typeof (t as any).text === 'string') return (t as any).text
  }
  return null
}

export function parseTranscriptHead(lines: string[]): Head {
  const head: Head = { sessionId: null, cwd: null, gitBranch: null, firstPrompt: null }
  for (const line of lines) {
    let o: any
    try {
      o = JSON.parse(line)
    } catch {
      continue
    }
    if (head.sessionId == null && typeof o.sessionId === 'string') head.sessionId = o.sessionId
    if (head.cwd == null && typeof o.cwd === 'string') head.cwd = o.cwd
    if (head.gitBranch == null && typeof o.gitBranch === 'string') head.gitBranch = o.gitBranch
    if (head.firstPrompt == null && o.type === 'user' && o.message) {
      const t = textOf(o.message.content)
      if (t) head.firstPrompt = t
    }
  }
  return head
}
```

- [ ] **Step 5: Run, verify pass** — all passing.

- [ ] **Step 6: Commit checkpoint** — `feat: transcript head parsing`

---

## Task 6: Session aggregation (pure)

**Files:**
- Create: `src/main/aggregate.ts`
- Test: `test/aggregate.test.ts`

**Interfaces:**
- Consumes: `Session`/`Status` (types.ts), `extractTicket` (Task 2), `deriveStatus` (Task 3), `normalizePath` (Task 4).
- Produces:
  ```ts
  interface RawSession {
    id: string; cwd: string | null; gitBranch: string | null
    firstPrompt: string | null; mtimeMs: number
  }
  buildSessions(raw: RawSession[], liveFolders: string[], nowMs: number): Session[]
  ```
- Behavior:
  - A project is "live" if its normalized `cwd` is in normalized `liveFolders`.
  - Within a live project, only the **most-recently-modified** session is `isLive`; older ones are idle.
  - `projectName` = last path segment of `cwd` (handles `/` and `\`); `''` cwd → `'unknown'`.
  - Sort: live first; among live, `working` before `waiting`; then all by `lastActive` desc.

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest'
import { buildSessions } from '../src/main/aggregate'

const now = 1_000_000
const live = ['c:\\Users\\Me\\Proj\\krs-fo-smarttv']

describe('buildSessions', () => {
  it('marks only the newest session of a live project as live', () => {
    const out = buildSessions([
      { id: 'old', cwd: 'C:\\Users\\Me\\Proj\\krs-fo-smarttv', gitBranch: 'fix/SOFKRS-1-a', firstPrompt: null, mtimeMs: now - 10_000 },
      { id: 'new', cwd: 'C:\\Users\\Me\\Proj\\krs-fo-smarttv', gitBranch: 'fix/SOFKRS-2-b', firstPrompt: null, mtimeMs: now - 1000 },
    ], live, now)
    const byId = Object.fromEntries(out.map((s) => [s.id, s]))
    expect(byId['new'].isLive).toBe(true)
    expect(byId['new'].status).toBe('working')
    expect(byId['old'].isLive).toBe(false)
    expect(byId['old'].status).toBe('idle')
  })

  it('derives ticket, projectName, lastActive', () => {
    const [s] = buildSessions(
      [{ id: 'a', cwd: 'C:\\X\\krs-fo-web', gitBranch: 'feat/SOFKAN-9-z', firstPrompt: 'hi', mtimeMs: now }],
      [], now,
    )
    expect(s.ticket).toBe('SOFKAN-9')
    expect(s.projectName).toBe('krs-fo-web')
    expect(s.lastActive).toBe(now)
    expect(s.isLive).toBe(false)
  })

  it('sorts live(working,waiting) before idle, then by recency', () => {
    const out = buildSessions([
      { id: 'idleNew', cwd: 'C:\\X\\a', gitBranch: null, firstPrompt: null, mtimeMs: now },
      { id: 'liveWaiting', cwd: 'C:\\Users\\Me\\Proj\\krs-fo-smarttv', gitBranch: null, firstPrompt: null, mtimeMs: now - 60_000 },
    ], live, now)
    expect(out[0].id).toBe('liveWaiting')
    expect(out[1].id).toBe('idleNew')
  })
})
```

- [ ] **Step 2: Run, verify fail** — module not found.

- [ ] **Step 3: Implement**

`src/main/aggregate.ts`:
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

export function buildSessions(raw: RawSession[], liveFolders: string[], nowMs: number): Session[] {
  const liveSet = new Set(liveFolders.map(normalizePath))

  const newestLiveIdByFolder = new Map<string, { id: string; mtimeMs: number }>()
  for (const r of raw) {
    const key = r.cwd ? normalizePath(r.cwd) : ''
    if (!liveSet.has(key)) continue
    const cur = newestLiveIdByFolder.get(key)
    if (!cur || r.mtimeMs > cur.mtimeMs) newestLiveIdByFolder.set(key, { id: r.id, mtimeMs: r.mtimeMs })
  }

  const sessions = raw.map<Session>((r) => {
    const key = r.cwd ? normalizePath(r.cwd) : ''
    const isLive = newestLiveIdByFolder.get(key)?.id === r.id
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
    }
  })

  return sessions.sort((a, b) => {
    const r = STATUS_RANK[a.status] - STATUS_RANK[b.status]
    return r !== 0 ? r : b.lastActive - a.lastActive
  })
}
```

- [ ] **Step 4: Run, verify pass** — all passing.

- [ ] **Step 5: Commit checkpoint** — `feat: session aggregation + sorting`

---

## Task 7: Scanner (filesystem I/O)

**Files:**
- Create: `src/main/paths.ts`
- Create: `src/main/scanner.ts`

**Interfaces:**
- Consumes: pure modules above.
- Produces:
  - `paths.ts`: `claudeRoot(): string`, `projectsDir(): string`, `ideDir(): string`
  - `scanner.ts`: `async scanSessions(nowMs: number): Promise<Session[]>`
- Behavior: read all `*.lock` in `ideDir` → collect live folders (skip stale: keep only locks whose `pid` is alive via `process.kill(pid, 0)` in a try/catch). Walk each project subdir in `projectsDir`, for each `*.jsonl`: `stat` for `mtimeMs`, read **first 60 lines only** for the head, build `RawSession`. Call `buildSessions`.

- [ ] **Step 1: Implement `src/main/paths.ts`**

```ts
import { homedir } from 'node:os'
import { join } from 'node:path'

export function claudeRoot(): string { return join(homedir(), '.claude') }
export function projectsDir(): string { return join(claudeRoot(), 'projects') }
export function ideDir(): string { return join(claudeRoot(), 'ide') }
```

- [ ] **Step 2: Implement `src/main/scanner.ts`**

```ts
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import type { Session } from '../renderer/src/types'
import { ideDir, projectsDir } from './paths'
import { parseLockFile } from './lock'
import { parseTranscriptHead } from './transcript'
import { buildSessions } from './aggregate'

function pidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch { return false }
}

async function liveFolders(): Promise<string[]> {
  let entries: string[] = []
  try { entries = await readdir(ideDir()) } catch { return [] }
  const folders: string[] = []
  for (const f of entries.filter((e) => e.endsWith('.lock'))) {
    const lock = parseLockFile(await readFile(join(ideDir(), f), 'utf8').catch(() => ''))
    if (lock && pidAlive(lock.pid)) folders.push(...lock.workspaceFolders)
  }
  return folders
}

async function headLines(file: string, max: number): Promise<string[]> {
  const out: string[] = []
  const rl = createInterface({ input: createReadStream(file, { encoding: 'utf8' }) })
  for await (const line of rl) {
    if (line) out.push(line)
    if (out.length >= max) break
  }
  rl.close()
  return out
}

export async function scanSessions(nowMs: number): Promise<Session[]> {
  const folders = await liveFolders()
  let projects: string[] = []
  try { projects = await readdir(projectsDir()) } catch { return [] }

  const raw = []
  for (const p of projects) {
    const dir = join(projectsDir(), p)
    let files: string[] = []
    try { files = (await readdir(dir)).filter((f) => f.endsWith('.jsonl')) } catch { continue }
    for (const f of files) {
      const full = join(dir, f)
      const st = await stat(full).catch(() => null)
      if (!st) continue
      const head = parseTranscriptHead(await headLines(full, 60))
      raw.push({
        id: f.replace(/\.jsonl$/, ''),
        cwd: head.cwd,
        gitBranch: head.gitBranch,
        firstPrompt: head.firstPrompt,
        mtimeMs: st.mtimeMs,
      })
    }
  }
  return buildSessions(raw, folders, nowMs)
}
```

- [ ] **Step 3: Manual smoke test**

Add a temporary line at the end of `src/main/index.ts` `whenReady`:
```ts
import { scanSessions } from './scanner'
scanSessions(Date.now()).then((s) => console.log('SESSIONS', s.length, s.slice(0, 5)))
```
Run: `npm run dev`. Expected: console logs a non-zero count and your live `krs-fo-smarttv` / `kan-fo-smarttv` projects show `isLive: true`. Remove the temporary line afterward.

- [ ] **Step 4: Commit checkpoint** — `feat: filesystem scanner for sessions + live locks`

---

## Task 8: IPC + watcher wiring (main ↔ preload ↔ renderer)

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/types.ts` (add the window API typing)

**Interfaces:**
- Produces (preload `contextBridge`, exposed as `window.api`):
  - `onSessions(cb: (s: Session[]) => void): void`
  - `openSession(s: Session): void`

- [ ] **Step 1: Preload** — `src/preload/index.ts` add:

```ts
import { contextBridge, ipcRenderer } from 'electron'
import type { Session } from '../renderer/src/types'

contextBridge.exposeInMainWorld('api', {
  onSessions: (cb: (s: Session[]) => void) =>
    ipcRenderer.on('sessions', (_e, s) => cb(s)),
  openSession: (s: Session) => ipcRenderer.send('open-session', s),
})
```

- [ ] **Step 2: Main** — in `src/main/index.ts`, after the window is created, add a debounced scan-and-push driven by a chokidar watcher:

```ts
import chokidar from 'chokidar'
import { scanSessions } from './scanner'
import { ideDir, projectsDir } from './paths'

function wireSessions(win: BrowserWindow): void {
  let timer: NodeJS.Timeout | null = null
  const push = async () => {
    win.webContents.send('sessions', await scanSessions(Date.now()))
  }
  const schedule = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(push, 1500)
  }
  chokidar
    .watch([projectsDir(), ideDir()], { ignoreInitial: true, depth: 2 })
    .on('all', schedule)
  push()
}
```
Call `wireSessions(mainWindow)` once the window exists.

- [ ] **Step 3: Window typing** — append to `src/renderer/src/types.ts`:

```ts
declare global {
  interface Window {
    api: {
      onSessions: (cb: (s: Session[]) => void) => void
      openSession: (s: Session) => void
    }
  }
}
```

- [ ] **Step 4: Handle open-session in main (stub)** — in `src/main/index.ts`:

```ts
import { ipcMain } from 'electron'
ipcMain.on('open-session', (_e, s) => { console.log('OPEN', s.projectName, s.isLive) })
```
(Real launcher lands in Task 10.)

- [ ] **Step 5: Manual verify** — `npm run dev`; add a temporary `window.api.onSessions((s) => console.log(s.length))` in `App.vue` `onMounted`. Expected: renderer console logs session count, and re-logs when you interact with another Claude session. Remove the temporary log.

- [ ] **Step 6: Commit checkpoint** — `feat: ipc + chokidar watcher pushes sessions to renderer`

---

## Task 9: Renderer list UI (Vue)

**Files:**
- Modify: `src/renderer/src/App.vue` (replace template content)

**Interfaces:**
- Consumes: `window.api.onSessions`, `window.api.openSession`, `Session` type.

- [ ] **Step 1: Implement `App.vue`**

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { Session } from './types'

const sessions = ref<Session[]>([])
onMounted(() => window.api.onSessions((s) => (sessions.value = s)))

const dot = (s: Session) =>
  s.status === 'working' ? '#3fb950' : s.status === 'waiting' ? '#d29922' : '#6e7681'

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
  <div class="wrap">
    <header>Claude Sessions</header>
    <ul>
      <li v-for="s in sessions" :key="s.id" @click="window.api.openSession(s)" :title="s.firstPrompt ?? ''">
        <span class="d" :style="{ background: dot(s) }" />
        <span class="name">{{ s.projectName }}</span>
        <span class="ticket" v-if="s.ticket">{{ s.ticket }}</span>
        <span class="time">{{ ago(s.lastActive) }}</span>
      </li>
      <li v-if="!sessions.length" class="empty">No sessions found</li>
    </ul>
  </div>
</template>

<style scoped>
.wrap { font: 12px system-ui; color: #e6edf3; background: #0d1117; height: 100vh; display: flex; flex-direction: column; }
header { padding: 8px 10px; font-weight: 600; border-bottom: 1px solid #21262d; -webkit-app-region: drag; }
ul { list-style: none; margin: 0; padding: 0; overflow-y: auto; flex: 1; }
li { display: flex; align-items: center; gap: 8px; padding: 7px 10px; cursor: pointer; border-bottom: 1px solid #161b22; }
li:hover { background: #161b22; }
.d { width: 9px; height: 9px; border-radius: 50%; flex: none; }
.name { font-weight: 500; }
.ticket { color: #58a6ff; font-size: 11px; }
.time { margin-left: auto; color: #8b949e; font-size: 11px; }
.empty { color: #8b949e; justify-content: center; cursor: default; }
</style>
```

Note: in the template, call `window.api.openSession(s)` via a local method if the linter rejects `window` in template — wrap as `const open = (s) => window.api.openSession(s)` and use `@click="open(s)"`.

- [ ] **Step 2: Manual verify** — `npm run dev`. Expected: list of projects with colored status dots, tickets, relative times; live projects on top. Clicking logs `OPEN ...` in the main console (from Task 8 stub).

- [ ] **Step 3: Commit checkpoint** — `feat: renderer session list UI`

---

## Task 10: Launcher — focus existing window or open + resume

**Files:**
- Create: `src/main/launcher.ts`
- Modify: `src/main/index.ts` (replace the open-session stub)

**Interfaces:**
- Produces: `async focusOrOpen(session: { projectPath: string; projectName: string; id: string; isLive: boolean }): Promise<void>`
- Behavior:
  - If `isLive`: focus the VSCode window whose title contains `projectName` (Win32 `SetForegroundWindow` via PowerShell). If none found, fall back to `code <projectPath>`.
  - Else: `code <projectPath>`, then open a new terminal at the folder running `claude --resume <id>` (best-effort; see spec limitation).

- [ ] **Step 1: Implement `src/main/launcher.ts`**

```ts
import { spawn } from 'node:child_process'

function code(args: string[]): void {
  spawn('code', args, { shell: true, detached: true, stdio: 'ignore' }).unref()
}

function focusByTitle(needle: string): void {
  const ps = `
$ErrorActionPreference='SilentlyContinue'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class W { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int n); }
"@
Get-Process | Where-Object { $_.MainWindowTitle -like '*${needle}*' -and $_.MainWindowTitle -like '*Visual Studio Code*' } |
 ForEach-Object { [W]::ShowWindow($_.MainWindowHandle, 9); [W]::SetForegroundWindow($_.MainWindowHandle) }
`
  spawn('powershell.exe', ['-NoProfile', '-Command', ps], { detached: true, stdio: 'ignore' }).unref()
}

function resumeInTerminal(folder: string, id: string): void {
  const cmd = `claude --resume ${id}`
  spawn('cmd.exe', ['/c', 'start', '""', 'cmd', '/k', `cd /d "${folder}" && ${cmd}`], {
    detached: true,
    stdio: 'ignore',
  }).unref()
}

export async function focusOrOpen(session: {
  projectPath: string
  projectName: string
  id: string
  isLive: boolean
}): Promise<void> {
  if (session.isLive) {
    focusByTitle(session.projectName)
    code([session.projectPath])
    return
  }
  code([session.projectPath])
  resumeInTerminal(session.projectPath, session.id)
}
```

- [ ] **Step 2: Wire in `src/main/index.ts`** — replace the stub:

```ts
import { focusOrOpen } from './launcher'
ipcMain.on('open-session', (_e, s) => { void focusOrOpen(s) })
```

- [ ] **Step 3: Manual verify (live focus)** — with `krs-fo-smarttv` open in VSCode, run `npm run dev`, click its row. Expected: that VSCode window comes to the foreground.

- [ ] **Step 4: Manual verify (reopen)** — close a project's VSCode window, click an idle row for it. Expected: VSCode opens at the folder and a terminal launches `claude --resume <id>`.

- [ ] **Step 5: Commit checkpoint** — `feat: launcher focuses existing window or reopens + resumes`

---

## Task 11: Tray, global hotkey, always-on-top, frameless window, auto-launch

**Files:**
- Modify: `src/main/index.ts`
- Create: `resources/tray.png` (any 16×16/32×32 icon)

**Interfaces:** none new (Electron app config).

- [ ] **Step 1: Make the window frameless, small, always-on-top, hidden-to-tray**

In the `BrowserWindow` options in `index.ts`:
```ts
const mainWindow = new BrowserWindow({
  width: 360,
  height: 500,
  frame: false,
  alwaysOnTop: true,
  skipTaskbar: true,
  show: false,
  webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false },
})
```
Remove any existing `mainWindow.show()`-on-ready if it conflicts (start hidden).

- [ ] **Step 2: Tray with menu**

```ts
import { Tray, Menu, app, globalShortcut } from 'electron'
import { join } from 'node:path'

let tray: Tray
function buildTray(win: BrowserWindow): void {
  tray = new Tray(join(__dirname, '../../resources/tray.png'))
  const toggle = () => (win.isVisible() ? win.hide() : win.show())
  tray.setToolTip('Claude Sessions')
  tray.on('click', toggle)
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show / Hide', click: toggle },
    { label: 'Always on top', type: 'checkbox', checked: true,
      click: (i) => win.setAlwaysOnTop(i.checked) },
    { label: 'Launch on startup', type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked, args: ['--hidden'] }) },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]))
}
```

- [ ] **Step 3: Global hotkey (show/hide)**

In `whenReady`:
```ts
globalShortcut.register('CommandOrControl+Shift+Space', () => {
  mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show()
})
```
And `app.on('will-quit', () => globalShortcut.unregisterAll())`.

- [ ] **Step 4: Don't quit on window close (tray app)**

```ts
mainWindow.on('close', (e) => { if (!(app as any).isQuiting) { e.preventDefault(); mainWindow.hide() } })
app.on('before-quit', () => { (app as any).isQuiting = true })
```
Call `buildTray(mainWindow)` in `whenReady`. If `process.argv` includes `--hidden`, leave it hidden; otherwise `mainWindow.show()`.

- [ ] **Step 5: Manual verify** — `npm run dev`. Expected: no taskbar entry; tray icon present; hotkey toggles the window; always-on-top keeps it above VSCode; closing hides (doesn't quit); Quit exits. Toggle "Launch on startup" and confirm via `app.getLoginItemSettings()` (or re-login).

- [ ] **Step 6: Commit checkpoint** — `feat: tray, hotkey, frameless always-on-top window, auto-launch`

---

## Task 12: Package a Windows build

**Files:**
- Modify: `package.json` / `electron-builder.yml` (scaffold already includes electron-builder)

- [ ] **Step 1: Build**

Run: `npm run build:win`
Expected: an installer/portable exe under `dist/`. Launch it; verify the app runs the same as `npm run dev` (tray, list, click-to-focus).

- [ ] **Step 2: Commit checkpoint** — `chore: windows packaging`

---

## Self-Review

- **Spec coverage:** purpose/scope (Tasks 7–9), Electron+Vue (Task 1), data sources locks+jsonl (Tasks 4,5,7), Session model (Task 2), 3 status states (Task 3), click focus-or-reopen (Task 10), window UX always-on-top/tray/hotkey/auto-launch/live-refresh (Tasks 8,11), testing of pure modules (Tasks 2–6). ✔
- **Deviation noted:** status derivation simplified to live+mtime (Task 3) instead of inspecting last-entry type — more reliable given `system` trailing lines; documented in Task 3 note.
- **Type consistency:** `Session`/`Status` defined once in `types.ts`; `extractTicket`, `deriveStatus`, `normalizePath`, `parseTranscriptHead`, `parseLockFile`, `buildSessions`, `scanSessions`, `focusOrOpen` signatures match across consumer tasks. ✔
- **Placeholders:** none — every code step is complete. Resume-inside-integrated-terminal remains best-effort per spec (explicit, not a placeholder).
