# Claude Session Switcher — Design

**Date:** 2026-06-29
**Status:** Approved design, pre-implementation
**Platform:** Windows-only (Windows 11)

## Purpose

A small, always-on-top tray app that lists Claude Code sessions across all
projects. Live (currently-open) sessions appear on top; recently-active
resumable sessions below. Clicking a session either raises the already-open
VSCode window for that session, or — if it is not open — opens the project
folder in VSCode and resumes the session.

## Goals

- See, in one glance, every Claude Code session and what its agent is doing.
- One click to jump back to a session (focus existing window, or reopen).
- Stay out of the way: small floating window, tray icon, global hotkey.

## Non-goals

- Cross-platform support (Windows-only for now).
- Editing/reading transcripts inside the app.
- Managing MCP servers, usage analytics, agents, or checkpoints (Claudia/opcode
  already do that; this app is only a session switcher).

## Tech stack

- **Electron** (main process = Node) + **Vue 3** (renderer).
- Node gives trivial access to the filesystem, `child_process` for `code` /
  PowerShell, and native window focusing.

## Data sources

All on local disk under `~/.claude` (`C:\Users\ASSET-17300\.claude`):

1. **Session transcripts:** `~/.claude/projects/<encoded-project-path>/<session-id>.jsonl`
   - One folder per project; one `.jsonl` per session. Each line is a JSON
     event. Relevant fields observed on entries: `cwd`, `gitBranch`,
     `timestamp`, message role/content.
2. **Live IDE connections:** `~/.claude/ide/*.lock`
   - Written when a Claude Code session attaches to an IDE (VSCode). Contains
     workspace folder(s) and a pid. Used to detect which sessions are currently
     open and attached, and to focus the right window.
   - ⚠️ Exact lock-file schema (field names, whether pid is the IDE or the
     Claude process) must be **verified against real files** during
     implementation before relying on it.

## Architecture

```
Electron main process (Node)
 ├─ SessionScanner    reads projects/**/*.jsonl + ide/*.lock → Session[]
 ├─ StatusDeriver     pure: Session + now → status
 ├─ Watcher           chokidar on projects/ + ide/ → debounced rescan (~1-2s)
 ├─ Launcher          focus-window OR (code <folder> + claude --resume <id>)
 ├─ Tray + GlobalShortcut + auto-launch
 └─ IPC bridge        pushes Session[] to renderer; receives "open session" cmd

Renderer (Vue 3)
 └─ Floating list UI  rows sorted: live first, then recent, by last-active desc
```

### Module responsibilities (isolated, independently testable)

- **SessionScanner** — *input:* `~/.claude` paths. *output:* `Session[]`.
  Parses JSONL (reads enough lines to get `cwd`, `gitBranch`, first user
  message, and the last entry; does not load whole files into memory if large).
  Matches lock files to sessions/projects to mark `isLive`.
- **StatusDeriver** — *pure function* `(session, now) => 'working' | 'waiting' | 'idle'`.
  No I/O. Fully unit-tested.
- **TicketExtractor** — *pure function* `(gitBranch, firstPrompt) => ticket | null`.
  Regex `[A-Z]+-\d+`, branch first then prompt. Unit-tested.
- **Launcher** — thin OS shim. `focusWindow(pid|folder)` and
  `openAndResume(folder, sessionId)`. Verified manually.
- **Watcher / Tray / window** — Electron glue.

### Session model

```
Session {
  id            // session uuid (filename)
  projectPath   // cwd
  projectName   // basename(cwd)
  gitBranch     // from transcript, may be null
  ticket        // e.g. "SOFKRS-8028" or null
  firstPrompt   // first user message text (tooltip)
  lastActive    // max(timestamp, file mtime)
  isLive        // has a matching live IDE lock
  status        // 'working' | 'waiting' | 'idle'
}
```

## Status rules (3 states)

- 🟢 **working** — `isLive` AND transcript mtime within ~5s of now.
- 🟡 **waiting** — `isLive` AND last transcript entry is a completed assistant
  turn AND file quiet (mtime older than the working threshold).
- ⚪ **idle** — not `isLive` (no live IDE lock). Resumable history.

The unreliable "needs permission" state is intentionally **excluded**.

## Click behavior

- **Live session →** focus its VSCode window.
  - Primary: use the lock file's pid → find its main top-level window →
    Win32 `SetForegroundWindow` (via a PowerShell/`user32` shim).
  - Fallback: `code <projectPath>` (VSCode focuses an already-open folder).
- **Idle session →** `code <projectPath>` to open the folder, then start
  `claude --resume <id>` in a new terminal at that folder.
  - ⚠️ **Known limitation:** a session resumed in a *standalone* terminal does
    not auto-attach to the VSCode window the way VSCode's integrated terminal
    does. The exact "resume inside VSCode's integrated terminal" mechanism is
    deferred; v1 opens the folder and starts the resume best-effort. This is the
    rare path (sessions are usually already open).

## Window / UX

- Frameless floating window, ~360×500, always-on-top (toggle in tray menu).
- Rows: `● status-dot  projectName  ·  TICKET  ·  relative-last-active`.
  Hover tooltip shows the first prompt and git branch.
- Sort: live sessions first (working before waiting), then idle by `lastActive`
  descending.
- **Tray icon** with menu: Show/Hide, Toggle always-on-top, Launch on startup,
  Quit.
- **Global hotkey** to show/hide the window.
- **Launch on Windows startup** (Electron `app.setLoginItemSettings`),
  toggle-able; starts hidden to tray.
- **Live auto-refresh** via the watcher; no manual refresh needed.

## Testing strategy

Unit tests (fixtures = sample JSONL + lock files):

- TicketExtractor: branch-based, prompt-based, none.
- StatusDeriver: working / waiting / idle boundaries.
- SessionScanner: project-name parsing, first-prompt extraction, lock→session
  matching, malformed/empty JSONL tolerance.

Manual verification: window focus, open+resume, tray, hotkey, auto-launch.

## Open questions / deferred

- Lock-file schema confirmation (blocks live detection + focus-by-pid).
- Exact resume-inside-VSCode-integrated-terminal mechanism (deferred to a later
  iteration; v1 is best-effort).

## Project location

New standalone repo: `C:\Users\ASSET-17300\Desktop\Projekty\claude-session-switcher`
(separate from work repos).
