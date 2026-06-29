# Watched Sessions, Naming, Accurate Live Detection, Jira/Copy — Design

**Status:** Approved (pending spec review)
**Date:** 2026-06-29
**Builds on:** `2026-06-29-claude-session-switcher-design.md`

## Purpose

Extend the session switcher with: accurate per-session live detection (multiple
Claude sessions inside one VSCode window must each show as live), a curated
"Watched" section, per-session manual names, a waiting-for-input visual cue, and
quick actions (open the ticket in Jira, copy the session id).

## Problem being fixed

Liveness is currently derived as "the single newest session per live folder"
(`aggregate.ts`). When one VSCode window runs several Claude sessions, only one
lights up green. The IDE lock files (`~/.claude/ide/*.lock`) are per-window and
do not record which sessions run inside, so the lock alone cannot map to
sessions.

**Observed signal:** running Claude sessions started with `--resume <id>` carry
the session id in their process command line, e.g.

```
claude --resume 3367d315-46a2-4000-bc43-7e3a5c0a43a5
```

Fresh `claude` (no `--resume`) has no id in its command line.

## Global constraints (unchanged from base design)

- Windows 11 only. Normalize paths (lowercase, `/` separators) before comparing.
- Status states remain exactly three: `working` | `waiting` | `idle`.
- No code comments (user rule). Smallest diff. Do not auto-commit.
- Pure logic stays I/O-free and unit-tested; I/O lives in thin modules.

---

## 1. Live-session detection

### New module: `src/main/processes.ts` (I/O)

- `async runningResumeIds(): Promise<Set<string>>`
  - Spawns PowerShell:
    `Get-CimInstance Win32_Process -Filter "Name='claude.exe'"` and reads
    `CommandLine`.
  - Extracts every `--resume <uuid>` occurrence; returns the set of ids.
  - On any failure, returns an empty set (degrade gracefully).
  - Parsing is a pure helper so it can be unit-tested:
    `extractResumeIds(commandLines: string[]): string[]`
    using regex `/--resume\s+([0-9a-fA-F-]{8,})/g`.

### `src/main/aggregate.ts` change

New signature:

```ts
buildSessions(
  raw: RawSession[],
  liveFolders: string[],
  liveSessionIds: string[],
  nowMs: number,
  liveFallbackMs?: number,   // default 120_000
): Session[]
```

Liveness rule per session:

```
isLive =
  liveSessionIds.includes(id)
  OR (liveFolderSet.has(folderKey) AND nowMs - mtimeMs <= liveFallbackMs)
```

- The old "newest session per folder" logic is removed; liveness is now the
  union of the process-scan set and the recent-activity-in-a-locked-folder
  fallback.
- `deriveStatus` is unchanged (`working`/`waiting`/`idle` from `isLive` + mtime).
- `Session` gains two fields, defaulted here:
  `watched: false`, `name: null` (overwritten by main from the store).

### `src/main/scanner.ts` change

- `scanSessions(nowMs)` also calls `runningResumeIds()` and passes the ids into
  `buildSessions(raw, folders, [...ids], nowMs)`.

### Periodic refresh (`src/main/index.ts`)

- In addition to the chokidar watcher, a `setInterval` (~4000 ms) triggers a
  scan + push, so liveness/status reflect process exits and `working → waiting`
  transitions without a file-change event. The watcher path stays as-is
  (debounced 1500 ms).

---

## 2. Persistence — `src/main/store.ts` (I/O)

- File: `join(app.getPath('userData'), 'state.json')`.
- Shape: `{ watched: string[]; names: Record<string, string> }`.
- API:
  - `loadState(): State` (returns `{ watched: [], names: {} }` if missing/bad)
  - `setWatched(id: string, on: boolean): void`
  - `setName(id: string, name: string | null): void` (empty/null removes entry)
  - Each mutation writes the file and updates an in-memory copy.
- Main decorates each `Session` before pushing:
  `watched = state.watched.includes(id)`, `name = state.names[id] ?? null`.

### Shared type change — `src/renderer/src/types.ts`

```ts
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
  watched: boolean        // new
  name: string | null     // new
}
```

---

## 3. IPC + preload

Preload `window.api` gains (all renderer → main, fire-and-forget except none
need a return):

- `openSession(s)` — existing.
- `openTicket(code: string)` — main runs
  `shell.openExternal('https://jira.redge.com/browse/' + code)`.
- `copyText(text: string)` — main runs `clipboard.writeText(text)`.
- `setWatched(id: string, on: boolean)` — updates store, then triggers a push.
- `setName(id: string, name: string | null)` — updates store, then triggers a push.

`onSessions(cb)` — existing.

After `setWatched`/`setName`, main re-decorates and pushes the current session
list immediately so the UI reflects the change without waiting for a rescan.

---

## 4. Renderer UI — `src/renderer/src/App.vue`

### Sections

- **Watched** (collapsible, pinned at top): sessions where `watched === true`
  **or** `isLive === true`. (Currently-open sessions always appear here.)
- **Other** (collapsible): the remaining sessions.
- Each section header shows a chevron + count; clicking toggles collapse.
  Default: both expanded. Collapse state is renderer-local (not persisted).

### Row

`[dot] [project name] [ticket] [title] [time] [copy] [pin] [edit]`

- **dot**: green `working`, amber `waiting`, grey `idle`.
- **project name**: bold.
- **ticket**: blue; click opens Jira (`openTicket`). Hidden if no ticket.
- **title**: `name` if set, else truncated `firstPrompt` (~40 chars), else empty.
- **time**: relative (`just now`, `Nm ago`, …), right-aligned.
- **copy**: icon; click copies the bare session id (`copyText(id)`); brief
  "copied" affordance.
- **pin**: filled when watched; click toggles `setWatched`.
- **edit** (pencil): click reveals an inline text input prefilled with the
  current name (or empty); Enter commits `setName`, Esc cancels, empty clears.
- Row click away from any icon/ticket/input → `openSession`. All icons, the
  ticket, and the rename input call `stopPropagation`.

### Waiting animation

- Rows (or their dot) with `status === 'waiting'` get a subtle CSS pulse
  (amber, ~1.5 s ease-in-out alternate) to signal "needs input." `working` and
  `idle` are static.

### Sorting

- Within each section: live first (`working` before `waiting`), then by
  `lastActive` desc — reuse the existing comparator.

---

## 5. Testing

- `extractResumeIds` — unit tests: single/multiple ids, no-resume lines, junk,
  mixed.
- `buildSessions` — update existing tests for the new signature; add cases:
  - session live because its id is in `liveSessionIds` (folder may have no lock);
  - session live via the mtime fallback in a locked folder;
  - not live when neither holds;
  - `watched`/`name` default to `false`/`null`.
- `store` — load/save round-trip, missing-file default, name clear removes key
  (use a temp dir via `app.getPath` injection or a path param for testability).
- Manual: multiple sessions in one window all show live; watched section;
  rename; Jira open; copy id; waiting pulse; periodic refresh updates dots.

---

## Out of scope (YAGNI)

- Mapping a fresh `claude` (no `--resume`) to its exact session beyond the mtime
  fallback.
- Naming/collapse-state sync across machines.
- Per-section manual reordering.
