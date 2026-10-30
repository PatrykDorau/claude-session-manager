import {
  app,
  clipboard,
  shell,
  dialog,
  nativeImage,
  Notification,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  globalShortcut,
  screen
} from 'electron'
import type { NativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import chokidar from 'chokidar'
import icon from '../../resources/icon.png?asset'
import attentionPng from '../../resources/attention.png?asset'
import { STAGES, type Session, type TaskMeta } from '../renderer/src/types'
import { rmSync, readdirSync, existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join as joinPath } from 'node:path'
import { release } from 'node:os'
import { scanRaw } from './scanner'
import { buildSessions } from './aggregate'
import { normalizePath } from './lock'
import {
  runningResumeIds,
  listAgents,
  gitDirty,
  probeCommand,
  branchMergedOrGone,
  listBranchTickets,
  gitRemote,
  listProcesses,
  killProcess
} from './processes'
import { detectWorktreeRepo } from './worktree'
import { branchTicket, parsePrefixes } from './ticket'
import { fetchIssue } from './jira'
import { computeFinished, branchKey } from './finished'
import {
  findTaskFolder,
  folderStages,
  mrSearchUrl,
  taskFinished,
  highestStage,
  isCompletedStatus,
  isRejectedStatus,
  isTestingStatus
} from './taskmeta'
import { formatDiagnostics } from './diagnostics'
import { ideDir, projectsDir, doneDir, activeDir, needsInputDir, sessionsDir } from './paths'
import {
  focusOrOpen,
  focusWindow,
  openProject,
  reopenAndResume,
  resumeStandalone,
  switchAccount,
  openAgentView,
  resumeCommand,
  type ResumeKey
} from './launcher'
import {
  profileDirFor,
  profileName,
  layoutStatus,
  applyLayoutConfig,
  type LayoutStatus
} from './vscodeconfig'
import { choosePane, type Placement } from './pane'
import { updateSnapshot, restoreQueue, forgetSessions } from './restore'
import {
  closeCandidates,
  parseSessionFile,
  killChain,
  sessionPid,
  isSessionProcess,
  type SessionFile
} from './closing'
import {
  loadState,
  saveState,
  DEFAULT_STATE,
  applyWatched,
  applyName,
  applyFinished,
  applyTicketOverride,
  applyTicketWatched,
  applyTicketFinished,
  overrideTicket,
  type State
} from './store'
import { installHooks } from './hooks'
import { clearInheritedSessionMarker } from './env'
import { nearestEdge, dockBounds, pickDisplay } from './dock'
import { registerAppBar, unregisterAppBar } from './appbar'
import { fetchUsage } from './usage'
import type { UsageResult } from '../renderer/src/types'

let mainWindow: BrowserWindow
let tray: Tray
let appState: State = DEFAULT_STATE()
let statePath = ''
let liveAgentIds = new Set<string>()
let agentStatus = new Map<string, string>()
let cachedRunningIds: string[] = []
let attentionIcon: NativeImage | null = null
let dirtyMap: Record<string, boolean> = {}
let lastUsage: UsageResult | null = null
let bgAgents = new Map<string, { status: string; name: string | null }>()
let claudeOk = true
let editorOk = true
let claudeVersion: string | null = null
let lastCounts = { total: 0, live: 0, waiting: 0 }
let menuClosedAt = 0
let lastSessions: Session[] = []
const resuming = new Map<string, Placement | null>()
let restoreSavedAt = 0
let restoreSavedKey = ''
let isProcessScanReady = false
const jiraInFlight = new Set<string>()
const jiraMissed = new Set<string>()
const branchDone = new Map<string, boolean>()
const knownFolders = new Map<string, string>()
const worktreeRepo = new Map<string, string | null>()
const notifiedWaiting = new Set<string>()
let lastTasks: Record<string, TaskMeta> = {}
let opisEntries: { month: string; names: string[] }[] = []
let folderFiles = new Map<string, string[]>()
const remotes = new Map<string, string | null>()

const opisDir = (): string => joinPath(app.getPath('desktop'), 'Opis zadan')

async function refreshTaskSources(): Promise<void> {
  const root = opisDir()
  const months = (await readdir(root).catch(() => [] as string[])).filter((m) => /^\d{2}-\d{4}$/.test(m))
  opisEntries = await Promise.all(
    months.map(async (month) => ({
      month,
      names: await readdir(joinPath(root, month)).catch(() => [] as string[])
    }))
  )
  const tickets = new Set(lastSessions.map((s) => s.ticket).filter((t): t is string => !!t))
  const nextFiles = new Map<string, string[]>()
  for (const t of tickets) {
    const hit = findTaskFolder(opisEntries, t)
    if (!hit || hit.name !== t) continue
    const dir = joinPath(root, hit.month, hit.name)
    nextFiles.set(dir, await readdir(dir).catch(() => [] as string[]))
  }
  folderFiles = nextFiles
  for (const [key, path] of knownFolders)
    if (!remotes.has(key)) remotes.set(key, await gitRemote(path))
}

function buildTaskMeta(sessions: Session[]): Record<string, TaskMeta> {
  const out: Record<string, TaskMeta> = {}
  const byTicket = new Map<string, Session[]>()
  for (const s of sessions) if (s.ticket) byTicket.set(s.ticket, [...(byTicket.get(s.ticket) ?? []), s])
  for (const [ticket, list] of byTicket) {
    const hit = findTaskFolder(opisEntries, ticket)
    const folder = hit ? joinPath(opisDir(), hit.month, hit.name) : null
    const jiraState = appState.jira[ticket]?.status ?? null
    const reachedSet = new Set([
      ...list.flatMap((s) => s.stages),
      ...(folder ? folderStages(folderFiles.get(folder) ?? []) : []),
      ...(isTestingStatus(jiraState) ? ['testing' as const] : []),
      ...(isCompletedStatus(jiraState, appState.settings.jiraDoneStatuses) ? ['done' as const] : [])
    ])
    const reached = STAGES.filter((st) => reachedSet.has(st))
    const remote = list
      .map((s) => remotes.get(normalizePath(s.projectPath)))
      .find((r): r is string => !!r)
    const jira = appState.jira[ticket]
    out[ticket] = {
      ticket,
      title: jira?.summary ?? null,
      jiraStatus: jira?.status ?? null,
      stage: highestStage(reached),
      reached,
      folder,
      mrUrl: remote ? mrSearchUrl(remote, ticket) : null,
      isWatched: appState.watchedTickets.includes(ticket),
      isFinished: taskFinished(
        ticket,
        jira?.status ?? null,
        appState.settings.jiraDoneStatuses,
        appState.finishedTickets,
        appState.finishOptOutTickets
      ),
      isRejected: isRejectedStatus(jiraState)
    }
  }
  return out
}

function decorate(sessions: Session[]): Session[] {
  const finishCtx = {
    finished: new Set(appState.finished),
    optOut: new Set(appState.finishOptOut),
    jiraStatus: new Map(Object.entries(appState.jira).map(([k, v]) => [k, v.status])),
    branchDone,
    accepting: appState.settings.jiraDoneStatuses
  }
  return sessions.map((s) => {
    const reg = agentStatus.get(s.id)
    let status = s.status
    if (reg === 'busy') status = 'working'
    else if (reg === 'idle' && s.status !== 'waiting' && s.status !== 'checkout') status = 'idle'
    const key = s.projectPath ? normalizePath(s.projectPath) : ''
    const repo = worktreeRepo.get(key)
    const fin = computeFinished(s, key, finishCtx)
    const ov = appState.ticketOverride[s.id]
    return {
      ...s,
      ticket: overrideTicket(s.ticket, ov),
      manualTicket: ov !== undefined,
      worktree: !!repo,
      repo: repo ?? null,
      watched: appState.watched.includes(s.id),
      name: appState.names[s.id] ?? null,
      dirty: dirtyMap[key] ?? false,
      bg: bgAgents.has(s.id),
      finished: fin.finished,
      jiraStatus: fin.jiraStatus,
      status
    }
  })
}

async function refreshRunning(): Promise<void> {
  cachedRunningIds = [...(await runningResumeIds())]
}

async function refreshAgents(): Promise<void> {
  const list = await listAgents()
  if (!list) return
  liveAgentIds = new Set(list.map((a) => a.sessionId))
  agentStatus = new Map(list.map((a) => [a.sessionId, a.status]))
  bgAgents = new Map(
    list.filter((a) => a.kind === 'background').map((a) => [a.sessionId, { status: a.status, name: a.name }])
  )
}

async function refreshDirty(): Promise<void> {
  const entries = [...knownFolders.entries()]
  const next: Record<string, boolean> = {}
  await Promise.all(entries.map(async ([key, path]) => (next[key] = await gitDirty(path))))
  dirtyMap = next
}

async function pushSessions(): Promise<void> {
  if (!mainWindow) return
  const { raw, lockedFolders } = await scanRaw()
  for (const r of raw)
    if (r.cwd) {
      const key = normalizePath(r.cwd)
      knownFolders.set(key, r.cwd)
      if (!worktreeRepo.has(key)) {
        worktreeRepo.set(key, null)
        void detectWorktreeRepo(r.cwd).then((repo) => worktreeRepo.set(key, repo))
      }
    }
  const openIds = [...new Set([...liveAgentIds, ...cachedRunningIds])]
  const sessions = buildSessions(raw, openIds, Date.now(), 8000, parsePrefixes(appState.settings.ticketPrefixes))
  const decorated = decorate(sessions)
  lastSessions = decorated
  lastCounts = {
    total: sessions.length,
    live: sessions.filter((s) => s.isLive).length,
    waiting: sessions.filter((s) => s.status === 'waiting').length
  }
  lastTasks = buildTaskMeta(decorated)
  trackRestore(decorated, lockedFolders.length > 0)
  mainWindow.webContents.send('tasks', lastTasks)
  mainWindow.webContents.send('sessions', decorated)
  mainWindow.webContents.send('close-candidates', openCloseCandidates())
  updateAttention(sessions)
  void fetchUnseenTickets(decorated)
}

const jiraTitles = (): Record<string, string | null> =>
  Object.fromEntries(Object.entries(appState.jira).map(([k, v]) => [k, v.summary]))

const closedIds = new Set<string>()

const openCloseCandidates = (): ReturnType<typeof closeCandidates> =>
  closeCandidates(lastSessions, jiraTitles()).filter((c) => !closedIds.has(c.id))

const sessionFiles = (): SessionFile[] => {
  try {
    return readdirSync(sessionsDir())
      .filter((n) => n.endsWith('.json'))
      .map((n) => parseSessionFile(readText(joinPath(sessionsDir(), n)) ?? ''))
      .filter((f): f is SessionFile => f !== null)
  } catch {
    return []
  }
}

const closeSessions = async (ids: string[]): Promise<string[]> => {
  const candidates = openCloseCandidates().filter((c) => ids.includes(c.id))
  const files = sessionFiles()
  const procs = await listProcesses()
  const targets = candidates.map((c) => {
    const pid = sessionPid(files, c.id, procs)
    const file = files.find((f) => f.pid === pid && f.sessionId === c.id)
    return { c, file, chain: pid === null ? [] : killChain(pid, procs) }
  })
  for (const t of targets) if (t.chain.length) await killProcess(t.chain[t.chain.length - 1], true)
  const after = await listProcesses()
  const closed: string[] = []
  const failed: string[] = []
  for (const t of targets) {
    if (t.file && t.chain.length && !isSessionProcess(t.file, after)) closed.push(t.c.id)
    else failed.push(t.c.ticket)
  }
  for (const id of closed) closedIds.add(id)
  appState = { ...appState, restore: forgetSessions(appState.restore, closed) }
  saveState(statePath, appState)
  void pushSessions()
  return failed
}

function trackRestore(sessions: Session[], isAnyWindowOpen: boolean): void {
  if (!isProcessScanReady) return
  const now = Date.now()
  for (const id of closedIds) if (!sessions.some((s) => s.id === id && s.isLive)) closedIds.delete(id)
  const live = sessions.filter((s) => s.isLive && !s.bg && s.projectPath && !closedIds.has(s.id))
  const liveIds = live.map((s) => s.id)
  for (const id of liveIds) resuming.delete(id)
  const restore = updateSnapshot(appState.restore, live, isAnyWindowOpen, now)
  const pane = Object.fromEntries(
    Object.entries(appState.pane).filter(([id]) => liveIds.includes(id) || resuming.has(id))
  )
  appState = { ...appState, restore, pane }
  const key = JSON.stringify([restore.snapshot.map((e) => e.id), restore.pendingRemoval, pane])
  if (key !== restoreSavedKey || now - restoreSavedAt >= 30000) {
    restoreSavedKey = key
    restoreSavedAt = now
    saveState(statePath, appState)
  }
  const knownIds = sessions.map((s) => s.id)
  const count = restoreQueue(restore.snapshot, liveIds, knownIds, now).filter(
    (e) => !resuming.has(e.id)
  ).length
  mainWindow?.webContents.send('restore-state', { count })
}

const vscodeUserDir = (): string => joinPath(process.env.APPDATA ?? '', 'Code', 'User')

const readText = (file: string): string | null => {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

const storageJson = (): string =>
  readText(joinPath(vscodeUserDir(), 'globalStorage', 'storage.json')) ?? ''

const profileStatus = (dir: string): LayoutStatus =>
  layoutStatus(
    readText(joinPath(dir, 'settings.json')),
    readText(joinPath(dir, 'keybindings.json'))
  )

const usedProfiles = (): { profileDir: string; name: string; status: LayoutStatus }[] => {
  const storage = storageJson()
  const folders = [...new Set(lastSessions.map((s) => s.projectPath).filter(Boolean))]
  const dirs = [...new Set(folders.map((f) => profileDirFor(f, storage, vscodeUserDir())))]
  return dirs.map((profileDir) => ({
    profileDir,
    name: profileName(profileDir, storage, vscodeUserDir()),
    status: profileStatus(profileDir)
  }))
}

const resumeKeyFor = (s: { id: string; projectPath: string }): ResumeKey => {
  const dir = profileDirFor(s.projectPath, storageJson(), vscodeUserDir())
  if (profileStatus(dir) !== 'configured') return 'F9'
  const liveIds = lastSessions.filter((x) => x.isLive).map((x) => x.id)
  const pending = [...resuming.values()].filter((p): p is Placement => !!p)
  const placement: Placement = {
    pane: choosePane(s.projectPath, liveIds, appState.pane, pending),
    folder: s.projectPath
  }
  resuming.set(s.id, placement)
  appState = { ...appState, pane: { ...appState.pane, [s.id]: placement } }
  saveState(statePath, appState)
  return placement.pane === 'top' ? 'F9' : 'F10'
}

async function resumeInVsCode(s: Session): Promise<boolean> {
  if (resuming.has(s.id)) return true
  resuming.set(s.id, null)
  const key = resumeKeyFor(s)
  const isLayoutConfigured = !!resuming.get(s.id)
  const ok = await reopenAndResume(s.projectPath, s.id, s.ticket, key, isLayoutConfigured)
  const forget = (): boolean => resuming.delete(s.id)
  if (!ok) forget()
  else setTimeout(forget, 60000)
  return ok
}

function resumeOrNotify(s: Session): void {
  void resumeInVsCode(s).then((ok) => {
    if (!ok) notifyResumeFailed(s)
  })
}

async function fetchTickets(tickets: string[]): Promise<void> {
  const token = appState.settings.jiraToken.trim()
  if (!token) return
  const todo = tickets.filter((t) => !jiraInFlight.has(t))
  todo.forEach((t) => jiraInFlight.add(t))
  const results = await Promise.all(
    todo.map(async (t) => [t, await fetchIssue(appState.settings.jiraBase, token, t)] as const)
  )
  todo.forEach((t) => jiraInFlight.delete(t))
  const jira = { ...appState.jira }
  for (const [t, issue] of results) if (issue) jira[t] = issue
  appState = { ...appState, jira }
  saveState(statePath, appState)
}

async function refreshOpenTickets(): Promise<void> {
  const open = Object.values(lastTasks)
    .filter((t) => !t.isFinished)
    .map((t) => t.ticket)
  if (!open.length) return
  await fetchTickets(open)
  void pushSessions()
}

async function fetchUnseenTickets(sessions: Session[]): Promise<void> {
  const unseen = [
    ...new Set(sessions.map((s) => s.ticket).filter((t): t is string => !!t && !appState.jira[t]))
  ].filter((t) => !jiraInFlight.has(t) && !jiraMissed.has(t))
  if (!unseen.length) return
  await fetchTickets(unseen)
  unseen.filter((t) => !appState.jira[t]).forEach((t) => jiraMissed.add(t))
  if (unseen.some((t) => appState.jira[t])) void pushSessions()
}

async function refreshFinishSignals(): Promise<void> {
  const isManual = (id: string): boolean =>
    appState.finished.includes(id) || appState.finishOptOut.includes(id)

  jiraMissed.clear()
  await fetchTickets([...new Set(lastSessions.filter((s) => s.ticket).map((s) => s.ticket as string))])

  const branchJobs = new Map<string, { repo: string; branch: string }>()
  for (const s of lastSessions) {
    if (s.ticket || !s.gitBranch || !s.projectPath || isManual(s.id)) continue
    branchJobs.set(branchKey(normalizePath(s.projectPath), s.gitBranch), {
      repo: s.projectPath,
      branch: s.gitBranch
    })
  }
  await Promise.all(
    [...branchJobs].map(async ([k, { repo, branch }]) => {
      branchDone.set(k, await branchMergedOrGone(repo, branch))
    })
  )

  void pushSessions()
}

async function probeEnv(): Promise<void> {
  const [cv, ev] = await Promise.all([
    probeCommand('claude', ['--version']),
    probeCommand('code', ['--version'])
  ])
  claudeVersion = cv
  claudeOk = cv !== null
  editorOk = ev !== null
  mainWindow?.webContents.send('claude-status', { claude: claudeOk, editor: editorOk })
}

function openSession(s: Session): void {
  if (!s?.id) return
  if (s.bg) {
    openAgentView(s.projectPath)
    return
  }
  try {
    rmSync(joinPath(doneDir(), s.id), { force: true })
  } catch {
    /* ignore */
  }
  void pushSessions()
  if (resuming.has(s.id)) return
  if (!editorOk) {
    resumeStandalone(s.projectPath, s.id, s.ticket)
    return
  }
  const action = appState.settings.clickAction
  if (action === 'project-cmd') {
    openProject(s.projectPath)
    if (!s.isLive) resumeStandalone(s.projectPath, s.id, s.ticket)
  } else if (action === 'project') openProject(s.projectPath)
  else if (action === 'standalone') resumeStandalone(s.projectPath, s.id, s.ticket)
  else if (action === 'terminal') resumeOrNotify(s)
  else if (action === 'focus') focusWindow(s.projectPath)
  else if (!s.isLive) resumeOrNotify(s)
  else
    void focusOrOpen(s)
      .then((ok) => {
        if (!ok) notifyResumeFailed(s)
      })
      .catch((err) => console.error('[diag] focusOrOpen threw:', err))
}

async function pushUsage(): Promise<void> {
  const res = await fetchUsage()
  if (res.ok || !lastUsage?.ok) lastUsage = res
  mainWindow?.webContents.send('usage-update', lastUsage)
}

function notifyResumeFailed(s: Session): void {
  mainWindow?.webContents.send('resume-failed', {
    label: s.name ?? s.projectName,
    command: resumeCommand(s.id, s.ticket)
  })
}

function notifyNeedsYou(s: Session): void {
  if (!Notification.isSupported()) return
  const label = s.name ?? (s.ticket ? `${s.projectName} · ${s.ticket}` : s.projectName)
  const n = new Notification({
    title: 'Claude needs you',
    body: label,
    icon,
    silent: true
  })
  n.on('click', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
    openSession(s)
  })
  n.show()
  mainWindow?.webContents.send('play-alert')
}

function updateAttention(sessions: Session[]): void {
  if (!mainWindow) return
  const waitingIds = new Set<string>()
  for (const s of sessions) {
    if (s.status !== 'waiting') continue
    waitingIds.add(s.id)
    if (!notifiedWaiting.has(s.id)) {
      notifiedWaiting.add(s.id)
      notifyNeedsYou(s)
    }
  }
  for (const id of [...notifiedWaiting]) if (!waitingIds.has(id)) notifiedWaiting.delete(id)
  const count = waitingIds.size
  if (count > 0) {
    if (!attentionIcon) attentionIcon = nativeImage.createFromPath(attentionPng)
    mainWindow.setOverlayIcon(attentionIcon, `${count} session(s) need you`)
    if (!mainWindow.isFocused()) mainWindow.flashFrame(true)
  } else {
    mainWindow.setOverlayIcon(null, '')
    mainWindow.flashFrame(false)
  }
  if (tray) {
    const live = sessions.filter((s) => s.isLive).length
    const parts: string[] = []
    if (count) parts.push(`${count} need you`)
    if (live) parts.push(`${live} live`)
    tray.setToolTip(parts.length ? `Claude Sessions — ${parts.join(' · ')}` : 'Claude Sessions')
  }
}

function removeSessionFiles(id: string): void {
  try {
    for (const p of readdirSync(projectsDir())) {
      const f = joinPath(projectsDir(), p, `${id}.jsonl`)
      if (existsSync(f)) {
        rmSync(f, { force: true })
        break
      }
    }
  } catch {
    /* ignore */
  }
  for (const dir of [activeDir(), doneDir(), needsInputDir()]) {
    try {
      rmSync(joinPath(dir, id), { force: true })
    } catch {
      /* ignore */
    }
  }
  liveAgentIds.delete(id)
}

function sendDockState(): void {
  mainWindow?.webContents.send('dock-state', {
    isDocked: appState.dock.isDocked,
    edge: appState.dock.edge
  })
}

function releaseAppBar(): void {
  if (mainWindow) unregisterAppBar(mainWindow.getNativeWindowHandle())
}

function applyDock(): void {
  const d = appState.dock
  if (!mainWindow || !d.isDocked) return
  const display = pickDisplay(screen.getAllDisplays(), d.displayId, screen.getPrimaryDisplay().id)
  let bounds = dockBounds(display.workArea, d.edge, d.width)
  const isShown = mainWindow.isVisible() && !mainWindow.isMinimized()
  if (appState.settings.isDockReserving && isShown) {
    const width = dockBounds(display.bounds, d.edge, d.width).width
    const granted = registerAppBar(
      mainWindow.getNativeWindowHandle(),
      d.edge,
      screen.dipToScreenRect(null, display.bounds),
      Math.round(width * display.scaleFactor)
    )
    if (granted) bounds = screen.screenToDipRect(null, granted)
  } else releaseAppBar()
  mainWindow.setAlwaysOnTop(appState.settings.isDockOnTop, 'screen-saver')
  mainWindow.setBounds(bounds)
}

function setDocked(isDocked: boolean, atCursor = false): void {
  if (!mainWindow) return
  if (isDocked) {
    const b = mainWindow.getBounds()
    const display = screen.getDisplayMatching(b)
    appState.dock = {
      ...appState.dock,
      isDocked: true,
      edge: nearestEdge(b, display.workArea),
      displayId: display.id,
      floating: b
    }
    applyDock()
  } else {
    const f = appState.dock.floating ?? { x: 100, y: 100, width: 360, height: 500 }
    const cursor = screen.getCursorScreenPoint()
    appState.dock = { ...appState.dock, isDocked: false }
    mainWindow.setAlwaysOnTop(appState.settings.alwaysOnTop, 'screen-saver')
    const target = atCursor ? { ...f, x: Math.round(cursor.x - f.width / 2), y: cursor.y - 12 } : f
    mainWindow.setBounds(target)
    releaseAppBar()
  }
  saveState(statePath, appState)
  sendDockState()
}

function wireDock(win: BrowserWindow): void {
  win.on('will-resize', (e, _bounds, details) => {
    if (!appState.dock.isDocked) return
    const inner = appState.dock.edge === 'left' ? 'right' : 'left'
    if (details.edge !== inner) e.preventDefault()
  })
  win.on('resized', () => {
    if (!appState.dock.isDocked) return
    appState.dock = { ...appState.dock, width: win.getBounds().width }
    saveState(statePath, appState)
    applyDock()
  })
  win.on('will-move', () => {
    if (appState.dock.isDocked) setDocked(false, true)
  })
  win.on('hide', releaseAppBar)
  win.on('minimize', releaseAppBar)
  win.on('show', applyDock)
  win.on('restore', applyDock)
  let timer: NodeJS.Timeout | null = null
  const redock = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(applyDock, 300)
  }
  screen.on('display-metrics-changed', redock)
  screen.on('display-added', redock)
  screen.on('display-removed', redock)
  applyDock()
}

function applyLaunchOnStartup(on: boolean): void {
  app.setLoginItemSettings({ openAtLogin: on, args: ['--hidden'] })
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 360,
    height: 500,
    minWidth: 180,
    minHeight: 200,
    frame: false,
    alwaysOnTop: appState.settings.alwaysOnTop,
    skipTaskbar: false,
    show: false,
    backgroundColor: '#0d1117',
    icon,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  })

  win.setAlwaysOnTop(appState.settings.alwaysOnTop, 'screen-saver')

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

function wireSessions(win: BrowserWindow): void {
  let timer: NodeJS.Timeout | null = null
  const schedule = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(pushSessions, 1000)
  }
  let aTimer: NodeJS.Timeout | null = null
  const scheduleAgents = (): void => {
    if (aTimer) clearTimeout(aTimer)
    aTimer = setTimeout(async () => {
      await refreshAgents()
      await pushSessions()
    }, 600)
  }
  chokidar.watch([projectsDir(), ideDir()], { ignoreInitial: true, depth: 2 }).on('all', schedule)
  chokidar.watch(sessionsDir(), { ignoreInitial: true, depth: 0 }).on('all', scheduleAgents)
  win.webContents.on('did-finish-load', async () => {
    await refreshRunning()
    await refreshAgents()
    isProcessScanReady = true
    void probeEnv()
    await pushSessions()
    void pushUsage()
    void refreshFinishSignals()
    void refreshTaskSources().then(pushSessions)
  })
  setInterval(pushSessions, 2000)
  setInterval(refreshRunning, 6000)
  setInterval(refreshAgents, 8000)
  setInterval(refreshDirty, 8000)
  setInterval(refreshTaskSources, 8000)
  setInterval(pushUsage, 60000)
  setInterval(probeEnv, 30000)
  setInterval(refreshFinishSignals, 1800000)
  setInterval(refreshOpenTickets, 120000)
}

function buildTray(win: BrowserWindow): void {
  tray = new Tray(icon)
  const toggle = (): void => (win.isVisible() ? win.hide() : win.show())
  tray.setToolTip('Claude Sessions')
  tray.on('click', toggle)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show / Hide', click: toggle },
      {
        label: 'Always on top',
        type: 'checkbox',
        checked: appState.settings.alwaysOnTop,
        click: (i) => win.setAlwaysOnTop(i.checked, 'screen-saver')
      },
      {
        label: 'Launch on startup',
        type: 'checkbox',
        checked: appState.settings.launchOnStartup,
        click: (i) => {
          appState.settings.launchOnStartup = i.checked
          applyLaunchOnStartup(i.checked)
          saveState(statePath, appState)
        }
      },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ])
  )
}

clearInheritedSessionMarker(process.env)

app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')
app.commandLine.appendSwitch('disable-http-cache')

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron.app')

  statePath = join(app.getPath('userData'), 'state.json')
  appState = loadState(statePath)
  applyLaunchOnStartup(appState.settings.launchOnStartup)

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  process.on('uncaughtException', (e) => console.error('[diag] uncaughtException:', e))
  process.on('unhandledRejection', (e) => console.error('[diag] unhandledRejection:', e))

  ipcMain.on('open-session', (_e, s) => openSession(s))
  ipcMain.on('get-version', (e) => {
    e.returnValue = app.getVersion()
  })
  ipcMain.on('get-diagnostics', (e) => {
    e.returnValue = formatDiagnostics({
      version: app.getVersion(),
      platform: process.platform,
      release: release(),
      electron: process.versions.electron,
      node: process.versions.node,
      claude: claudeOk ? (claudeVersion ?? '?') : null,
      editor: editorOk,
      signedIn: lastUsage?.ok ? 'yes' : lastUsage?.error === 'no-credentials' ? 'no' : 'unknown',
      total: lastCounts.total,
      live: lastCounts.live,
      waiting: lastCounts.waiting
    })
  })
  ipcMain.on('get-usage', (e) => {
    e.returnValue = lastUsage
  })
  ipcMain.on('switch-account', () => {
    switchAccount()
  })
  ipcMain.on('minimize-window', () => {
    mainWindow?.minimize()
  })
  ipcMain.on('install-hooks', (e) => {
    e.returnValue = installHooks()
  })
  ipcMain.on('open-ticket', (_e, code: string) => {
    void shell.openExternal(appState.settings.jiraBase + code)
  })
  ipcMain.on('get-settings', (e) => {
    e.returnValue = {
      jiraBase: appState.settings.jiraBase,
      jiraToken: appState.settings.jiraToken,
      jiraDoneStatuses: appState.settings.jiraDoneStatuses,
      alwaysOnTop: appState.settings.alwaysOnTop,
      clickAction: appState.settings.clickAction,
      launchOnStartup: appState.settings.launchOnStartup,
      ticketPrefixes: appState.settings.ticketPrefixes,
      isDockReserving: appState.settings.isDockReserving,
      isDockOnTop: appState.settings.isDockOnTop
    }
  })
  ipcMain.on('set-settings', (_e, patch: Partial<State['settings']>) => {
    if (typeof patch.jiraBase === 'string') appState.settings.jiraBase = patch.jiraBase
    if (typeof patch.jiraToken === 'string') appState.settings.jiraToken = patch.jiraToken
    if (typeof patch.jiraDoneStatuses === 'string')
      appState.settings.jiraDoneStatuses = patch.jiraDoneStatuses
    if (typeof patch.alwaysOnTop === 'boolean') {
      appState.settings.alwaysOnTop = patch.alwaysOnTop
      if (!appState.dock.isDocked) mainWindow?.setAlwaysOnTop(patch.alwaysOnTop, 'screen-saver')
    }
    if (typeof patch.isDockReserving === 'boolean') appState.settings.isDockReserving = patch.isDockReserving
    if (typeof patch.isDockOnTop === 'boolean') appState.settings.isDockOnTop = patch.isDockOnTop
    if (typeof patch.isDockReserving === 'boolean' || typeof patch.isDockOnTop === 'boolean') applyDock()
    if (patch.clickAction) appState.settings.clickAction = patch.clickAction
    if (typeof patch.ticketPrefixes === 'string') appState.settings.ticketPrefixes = patch.ticketPrefixes
    if (typeof patch.launchOnStartup === 'boolean') {
      appState.settings.launchOnStartup = patch.launchOnStartup
      applyLaunchOnStartup(patch.launchOnStartup)
    }
    saveState(statePath, appState)
    void refreshFinishSignals()
  })
  ipcMain.on('set-finished', (_e, id: string, on: boolean) => {
    if (!id) return
    appState = applyFinished(appState, id, on)
    saveState(statePath, appState)
    void pushSessions()
  })
  ipcMain.handle('sync-jira', async () => {
    await refreshFinishSignals()
  })
  ipcMain.handle('list-branch-tickets', async (_e, projectPath: string) => {
    if (!projectPath) return []
    return listBranchTickets(projectPath)
  })
  ipcMain.handle('verify-ticket', async (_e, input: string) => {
    const code = branchTicket(input)
    if (!code) return { configured: false, status: null, code: null }
    const token = appState.settings.jiraToken.trim()
    if (!token) return { configured: false, status: null, code }
    const issue = await fetchIssue(appState.settings.jiraBase, token, code)
    return { configured: true, status: issue?.status ?? null, code }
  })
  ipcMain.on('set-ticket', (_e, id: string, value: string | null) => {
    if (!id) return
    appState = applyTicketOverride(appState, id, value)
    saveState(statePath, appState)
    void pushSessions()
  })
  ipcMain.on('session-menu', (_e, s) => {
    if (!s?.id) return
    if (Date.now() - menuClosedAt < 300) return
    const task: TaskMeta | undefined = s.ticket ? lastTasks[s.ticket] : undefined
    const menu = Menu.buildFromTemplate([
      ...(s.bg
        ? [{ label: 'Open agent view (attach)', click: () => openAgentView(s.projectPath) }]
        : [{ label: s.isLive ? 'Focus window' : 'Open & resume', click: () => (s.isLive ? void focusOrOpen(s) : resumeOrNotify(s)) }]),
      { label: 'Open project in VS Code', click: () => openProject(s.projectPath) },
      {
        label: 'Resume in side terminal',
        click: () => resumeOrNotify(s)
      },
      {
        label: 'Resume in standalone terminal',
        click: () => !resuming.has(s.id) && resumeStandalone(s.projectPath, s.id, s.ticket)
      },
      { label: 'Focus existing window', click: () => focusWindow(s.projectPath) },
      { label: 'Open folder in Explorer', click: () => void shell.openPath(s.projectPath) },
      { label: 'Copy resume command', click: () => clipboard.writeText(resumeCommand(s.id, s.ticket)) },
      { type: 'separator' },
      { label: 'Set ticket…', click: () => mainWindow?.webContents.send('open-ticket-picker', s) },
      {
        label: (task ? task.isFinished : s.finished) ? 'Mark task not finished' : 'Mark finished',
        click: () => {
          appState = task
            ? applyTicketFinished(appState, task.ticket, !task.isFinished)
            : applyFinished(appState, s.id, !s.finished)
          saveState(statePath, appState)
          void pushSessions()
        }
      },
      {
        label: (task ? task.isWatched : s.watched) ? 'Unpin' : task ? 'Pin task' : 'Watch',
        click: () => {
          appState = task
            ? applyTicketWatched(appState, task.ticket, !task.isWatched)
            : applyWatched(appState, s.id, !s.watched)
          saveState(statePath, appState)
          void pushSessions()
        }
      }
    ])
    mainWindow?.webContents.send('menu-state', true)
    menu.popup({
      window: mainWindow,
      callback: () => {
        menuClosedAt = Date.now()
        mainWindow?.webContents.send('menu-state', false)
      }
    })
  })
  ipcMain.on('open-task-folder', (_e, ticket: string) => {
    const folder = lastTasks[ticket]?.folder
    if (folder && existsSync(folder)) void shell.openPath(folder)
  })
  ipcMain.on('open-mr', (_e, ticket: string) => {
    const url = lastTasks[ticket]?.mrUrl
    if (url) void shell.openExternal(url)
  })
  ipcMain.on('set-task-watched', (_e, ticket: string, on: boolean) => {
    if (!ticket) return
    appState = applyTicketWatched(appState, ticket, on)
    saveState(statePath, appState)
    void pushSessions()
  })
  ipcMain.on('set-task-finished', (_e, ticket: string, on: boolean) => {
    if (!ticket) return
    appState = applyTicketFinished(appState, ticket, on)
    saveState(statePath, appState)
    void pushSessions()
  })
  ipcMain.on('restore-sessions', () => {
    const liveIds = lastSessions.filter((s) => s.isLive).map((s) => s.id)
    const byId = new Map(lastSessions.map((s) => [s.id, s]))
    for (const e of restoreQueue(appState.restore.snapshot, liveIds, [...byId.keys()], Date.now()))
      resumeOrNotify(byId.get(e.id) as Session)
    void pushSessions()
  })
  ipcMain.on('dismiss-restore', () => {
    const liveIds = lastSessions.filter((s) => s.isLive).map((s) => s.id)
    const knownIds = lastSessions.map((s) => s.id)
    const stale = new Set(
      restoreQueue(appState.restore.snapshot, liveIds, knownIds, Date.now()).map((e) => e.id)
    )
    const snapshot = appState.restore.snapshot.filter((e) => !stale.has(e.id))
    appState = { ...appState, restore: { ...appState.restore, snapshot } }
    saveState(statePath, appState)
    void pushSessions()
  })
  ipcMain.handle('close-sessions', (_e, ids: string[]) => closeSessions(ids))
  ipcMain.on('vscode-layout-status', (e) => {
    e.returnValue = usedProfiles()
  })
  ipcMain.on('vscode-layout-apply', (e) => {
    for (const { profileDir } of usedProfiles()) {
      const settingsFile = joinPath(profileDir, 'settings.json')
      const keybindingsFile = joinPath(profileDir, 'keybindings.json')
      try {
        for (const f of [settingsFile, keybindingsFile])
          if (existsSync(f) && !existsSync(`${f}.bak-claude-sessions`))
            copyFileSync(f, `${f}.bak-claude-sessions`)
        const out = applyLayoutConfig(readText(settingsFile), readText(keybindingsFile))
        writeFileSync(settingsFile, out.settings, 'utf8')
        writeFileSync(keybindingsFile, out.keybindings, 'utf8')
      } catch (err) {
        console.error('[vscode-layout] apply failed:', profileDir, err)
      }
    }
    e.returnValue = usedProfiles()
  })
  ipcMain.on('toggle-dock', () => setDocked(!appState.dock.isDocked))
  ipcMain.on('get-dock-state', (e) => {
    e.returnValue = { isDocked: appState.dock.isDocked, edge: appState.dock.edge }
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
  ipcMain.on('remove-session', async (_e, id: string, label: string) => {
    if (!id) return
    const first = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['Cancel', 'Delete'],
      defaultId: 0,
      cancelId: 0,
      title: 'Delete session',
      message: 'Delete this session?',
      detail: label
    })
    if (first.response !== 1) return
    const second = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['Cancel', 'Permanently delete'],
      defaultId: 0,
      cancelId: 0,
      title: 'Are you sure?',
      message: 'This permanently deletes the transcript and cannot be undone.',
      detail: label
    })
    if (second.response !== 1) return
    removeSessionFiles(id)
    void pushSessions()
  })

  mainWindow = createWindow()
  wireSessions(mainWindow)
  buildTray(mainWindow)
  wireDock(mainWindow)

  mainWindow.on('close', (e) => {
    console.log('[diag] window close event, isQuiting=', (app as never as { isQuiting?: boolean }).isQuiting)
    if (!(app as unknown as { isQuiting?: boolean }).isQuiting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })
  mainWindow.on('focus', () => mainWindow.flashFrame(false))
  mainWindow.on('blur', () => console.log('[diag] window blur'))
  mainWindow.on('hide', () => console.log('[diag] window hide'))
  mainWindow.webContents.on('render-process-gone', (_e, d) =>
    console.error('[diag] renderer gone:', d)
  )

  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show()
  })

  if (!process.argv.includes('--hidden')) mainWindow.show()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
      wireSessions(mainWindow)
    }
  })
  })
}

app.on('before-quit', () => {
  console.log('[diag] before-quit')
  ;(app as unknown as { isQuiting?: boolean }).isQuiting = true
  releaseAppBar()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
