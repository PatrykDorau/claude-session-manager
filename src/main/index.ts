import {
  app,
  clipboard,
  shell,
  session,
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
import { rmSync, readdirSync, existsSync, readFileSync, writeFileSync, copyFileSync, openSync, readSync, closeSync, fstatSync, statSync, symlinkSync } from 'node:fs'
import { parseTail, countTurns, lastMessages, createDetailCache } from './transcript'
import { createPtyHost } from './ptyhost'
import { pickPort, serverCommand, bashCandidates, isPortFree, DEFAULT_SERVER_COMMAND } from './devserver'
import { stvOptions, webOptions, mergeEnvLocal, stvCommand, serverHost as serverHostName, chromeArgs, type StvChoice } from './serverprofile'
import type { LocalHost, BranchChanges, ChangedFile, ExplainFile, ServerProfile, ServerSpec } from '../renderer/src/types'
import { terminalMode, attachArgs, resumeBackgroundArgs, pasteInput, STOP_TURN, createOpenGuard, isHandedOff, type TerminalMode } from './terminal'
import { readdir } from 'node:fs/promises'
import { join as joinPath, dirname } from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { release } from 'node:os'
import { scanRaw } from './scanner'
import { buildSessions } from './aggregate'
import { normalizePath } from './lock'
import {
  runningResumeIds,
  runningAttachIds,
  runningAttaches,
  listAgents,
  gitDirty,
  probeCommand,
  branchMergedOrGone,
  listBranchTickets,
  gitRemote,
  listProcesses,
  killProcess,
  runGit
} from './processes'
import { detectWorktreeRepo, parseWorktreeRoot } from './worktree'
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
  reopenAndRun,
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
import { worktreeRows, parseCount, isLinkedWorktreeGitFile, branchToDelete, nodeModulesAction } from './worktrees'
import { taskContext, startPrompt, parseBgId, ticketPrefix, repoRoots, startArgs, claudeExeCandidates, attachCommand, repoForProject, reviewArgs } from './tasks'
import { searchIssues, fetchDescription, postComment, fetchTransitions, doTransition, fetchTicketDetail, fetchPriority } from './jira'
import { isSafeRef, worktreeForBranch, parseStatusPaths, safeRelPath, parseStatus, isNoisePath, parseNameStatus } from './ide'
import { parseExplainDoc, explainArgs } from './explaindoc'
import { fetchMrsToReview, enrichMrs, forgetApprovals, fetchDiffStats, fetchMrSha, isInProjects, reviewState, sortMrs } from './gitlab'
import type { JiraTicket, MrFile, MrItem, MyMrs } from '../renderer/src/types'
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
  visibleBounds,
  type State,
  type StartView
} from './store'
import { installHooks } from './hooks'
import { migrateUserData } from './migrate'
import { listAgentGroups, readAgentRun } from './agents'
import { startBridge, ticketFromPath } from './bridge'
import { pickChromePort, taskChromeProfile, writeTaskMcp, seedProfile } from './taskbrowser'
import { fetchMrStatus, runMrAction, postMrComment, postMrReply, fetchVersionDiff, type MrAction, type MergeOptions } from './mractions'
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
let dashboardWindow: BrowserWindow | null = null

const sendAll = (channel: string, ...args: unknown[]): void => {
  for (const win of [mainWindow, dashboardWindow]) if (win && !win.isDestroyed()) win.webContents.send(channel, ...args)
}
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
const shownNotifications = new Set<Notification>()
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
      name: appState.names[s.id] ?? bgAgents.get(s.id)?.name ?? null,
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
  sendAll('tasks', lastTasks)
  sendAll('sessions', decorated)
  mainWindow.webContents.send('close-candidates', openCloseCandidates())
  const rows = worktreeRows(decorated, (path) => existsSync(joinPath(path, '.git')))
  for (const row of rows) {
    const root = parseWorktreeRoot(readText(joinPath(row.path, '.git')) ?? '')
    if (root) linkNodeModules(row.path, root)
  }
  mainWindow.webContents.send('worktrees', rows)
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

const killSessions = async (ids: string[]): Promise<string[]> => {
  const files = sessionFiles()
  const procs = await listProcesses()
  const targets = ids.map((id) => {
    const pid = sessionPid(files, id, procs)
    const file = files.find((f) => f.pid === pid && f.sessionId === id)
    return { id, file, chain: pid === null ? [] : killChain(pid, procs) }
  })
  for (const t of targets) if (t.chain.length) await killProcess(t.chain[t.chain.length - 1], true)
  const after = await listProcesses()
  const closed: string[] = []
  const failed: string[] = []
  for (const t of targets) {
    if (t.file && t.chain.length && !isSessionProcess(t.file, after)) closed.push(t.id)
    else failed.push(t.id)
  }
  for (const id of closed) closedIds.add(id)
  appState = { ...appState, restore: forgetSessions(appState.restore, closed) }
  saveState(statePath, appState)
  void pushSessions()
  return failed
}

const closeSessions = async (ids: string[]): Promise<string[]> => {
  const candidates = openCloseCandidates().filter((c) => ids.includes(c.id))
  const failed = await killSessions(candidates.map((c) => c.id))
  return candidates.filter((c) => failed.includes(c.id)).map((c) => c.ticket)
}

const sessionsAt = (path: string): Session[] =>
  lastSessions.filter((s) => s.projectPath && normalizePath(s.projectPath) === normalizePath(path))

const worktreeName = (path: string): string => path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? ''

const worktreeContext = async (
  path: string
): Promise<{ root: string; branch: string; target: string | null } | null> => {
  const branch = (await runGit(path, ['rev-parse', '--abbrev-ref', 'HEAD'])).out.trim()
  const commonDir = (
    await runGit(path, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
  ).out.trim()
  if (!commonDir) return null
  const root = dirname(commonDir)
  const parentBranch = (await runGit(root, ['rev-parse', '--abbrev-ref', 'HEAD'])).out.trim()
  return { root, branch, target: branchToDelete(branch, parentBranch, worktreeName(path)) }
}

const checkWorktree = async (
  path: string
): Promise<{ branch: string; isDirty: boolean; unpushed: number }> => {
  const ctx = await worktreeContext(path)
  const status = await runGit(path, ['status', '--porcelain'])
  const excluded = ctx?.branch && ctx.branch !== 'HEAD' ? [`--exclude=${ctx.branch}`] : []
  const unpushed = parseCount(
    (await runGit(path, ['rev-list', '--count', 'HEAD', '--not', '--remotes', ...excluded, '--branches'])).out
  )
  return {
    branch: ctx?.target ?? '',
    isDirty: !status.isOk || status.out.trim().length > 0,
    unpushed
  }
}

const deleteWorktree = async (
  path: string,
  expectedBranch: string
): Promise<{ error: string | null; notice: string | null }> => {
  if (!isLinkedWorktreeGitFile(readText(joinPath(path, '.git')) ?? ''))
    return { error: 'not a linked git worktree', notice: null }
  const ctx = await worktreeContext(path)
  if (!ctx) return { error: 'could not find the parent repository', notice: null }
  if ((ctx.target ?? '') !== expectedBranch)
    return { error: 'the worktree branch changed, check it again', notice: null }
  const live = sessionsAt(path).filter((s) => s.isLive)
  const failed = live.length ? await killSessions(live.map((s) => s.id)) : []
  if (failed.length) {
    const names = live.filter((s) => failed.includes(s.id)).map((s) => s.name ?? s.ticket ?? s.id)
    return { error: `could not close ${names.join(', ')}`, notice: null }
  }
  const removed = await runGit(ctx.root, ['worktree', 'remove', '--force', '--force', path])
  const isUnregistered = removed.isOk || !existsSync(joinPath(path, '.git'))
  if (!isUnregistered) return { error: removed.err || 'git worktree remove failed', notice: null }
  appState = {
    ...appState,
    restore: forgetSessions(
      appState.restore,
      sessionsAt(path).map((s) => s.id)
    )
  }
  saveState(statePath, appState)
  const deleted = ctx.target ? await runGit(ctx.root, ['branch', '-D', ctx.target]) : null
  void pushSessions()
  const notices = [
    ...(removed.isOk ? [] : [`folder ${path} could not be fully removed (a file is in use), delete it by hand`]),
    ...(deleted && !deleted.isOk ? [`branch ${ctx.target} kept: ${deleted.err}`] : [])
  ]
  return { error: null, notice: notices.length ? notices.join('; ') : null }
}

const openWorktree = (path: string): void => {
  const newest = sessionsAt(path).reduce<Session | null>(
    (a, b) => (!a || b.lastActive > a.lastActive ? b : a),
    null
  )
  if (!newest) return
  if (newest.isLive) void focusOrOpen(newest)
  else resumeOrNotify(newest)
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
  return 'F9'
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

let myTasks: { tickets: JiraTicket[]; error: 'no-token' | 'failed' | null } = {
  tickets: [],
  error: null
}
const startingTasks = new Set<string>()
let claudeExe: string | null = null

const refreshMyTasks = async (): Promise<void> => {
  const token = appState.settings.jiraToken.trim()
  const found = token
    ? await searchIssues(appState.settings.jiraBase, token, appState.settings.taskJql)
    : null
  myTasks = token
    ? found
      ? { tickets: found, error: null }
      : { tickets: myTasks.tickets, error: 'failed' }
    : { tickets: [], error: 'no-token' }
  sendAll('my-tasks', myTasks)
}

let mrItems: MrItem[] = []
let mrError: MyMrs['error'] = null
let mrErrorDetail: string | null = null
let gitlabMe: string | null = null
let isMrsLoaded = false
let isAllProjects = false
const startingReviews = new Set<string>()
const PRIORITY_TTL_MS = 30 * 60 * 1000
const ticketPriorities = new Map<string, { priority: string | null; at: number }>()
const priorityOf = (ticket: string | null): string | undefined => {
  if (!ticket) return undefined
  const fromTasks = myTasks.tickets.find((t) => t.key === ticket)?.priority
  return fromTasks ?? ticketPriorities.get(ticket)?.priority ?? undefined
}
const refreshPriorities = async (): Promise<void> => {
  const token = appState.settings.jiraToken.trim()
  if (!token) return
  const now = Date.now()
  const keys = [...new Set(mrItems.flatMap((m) => (m.ticket ? [m.ticket] : [])))].filter((k) => {
    const cached = ticketPriorities.get(k)
    return !cached || now - cached.at > PRIORITY_TTL_MS
  })
  if (!keys.length) return
  await Promise.all(
    keys.map(async (key) => {
      const priority = await fetchPriority(appState.settings.jiraBase, token, key)
      if (priority !== undefined) ticketPriorities.set(key, { priority, at: now })
    })
  )
  pushMyMrs()
}

const myMrs = (): MyMrs => ({
  items: sortMrs(
    mrItems
      .filter((m) => isAllProjects || isInProjects(m.projectPath, appState.settings.mrProjects))
      .map((m) => ({
        ...m,
        review: reviewState(m.sha, appState.reviewedMrs[m.key]),
        sessionId: appState.mrSessions[m.key] ?? null,
        ...(priorityOf(m.ticket) ? { priority: priorityOf(m.ticket) } : {})
      }))
  ),
  error: mrError,
  errorDetail: mrErrorDetail,
  isLoading: !isMrsLoaded,
  myName: gitlabMe,
  isAllProjects
})

const pushMyMrs = (): void => sendAll('my-mrs', myMrs())

const refreshMyMrs = async (): Promise<void> => {
  const token = appState.settings.gitlabToken.trim()
  if (!token) {
    mrItems = []
    mrError = 'no-token'
  } else {
    const found = await fetchMrsToReview(appState.settings.gitlabBase, token, appState.settings.mrMention)
    mrError = found.items ? null : 'failed'
    mrErrorDetail = found.detail
    gitlabMe = found.me ?? gitlabMe
    if (found.items) {
      const previous = new Map(mrItems.map((m) => [m.key, m]))
      mrItems = found.items.map((m) => {
        const old = previous.get(m.key)
        return old ? { ...m, approvals: old.approvals, openThreads: old.openThreads } : m
      })
      isMrsLoaded = true
      pushMyMrs()
      const wanted = mrItems.filter((m) => isInProjects(m.projectPath, appState.settings.mrProjects))
      const enriched = new Map((await enrichMrs(appState.settings.gitlabBase, token, wanted, gitlabMe)).map((m) => [m.key, m]))
      mrItems = mrItems.map((m) => enriched.get(m.key) ?? m)
    }
    void refreshPriorities()
  }
  isMrsLoaded = true
  pushMyMrs()
}

const mrFiles = (key: string): Promise<MrFile[] | null> => {
  const mr = mrItems.find((m) => m.key === key)
  const token = appState.settings.gitlabToken.trim()
  return mr && token ? fetchDiffStats(appState.settings.gitlabBase, token, mr.projectId, mr.iid) : Promise.resolve(null)
}

const startReview = async (key: string): Promise<{ error: string | null; sessionId?: string }> => {
  const mr = mrItems.find((m) => m.key === key)
  if (!mr) return { error: 'merge request not found' }
  if (startingReviews.has(key)) return { error: 'review is already starting' }
  const repo = repoForProject(mr.projectPath, repoRoots(lastSessions))
  if (!repo) return { error: `No local repo for ${mr.projectName}` }
  const exe = resolveClaudeExe()
  if (!exe) return { error: 'claude.exe not found' }
  startingReviews.add(key)
  let isStarted = false
  try {
    const headSha =
      (await fetchMrSha(appState.settings.gitlabBase, appState.settings.gitlabToken.trim(), mr.projectId, mr.iid)) ?? mr.sha
    const worktree = taskWorktree(repo, `MR-${mr.iid}`)
    const isExisting = isLinkedWorktreeGitFile(readText(joinPath(worktree, '.git')) ?? '')
    const out = await spawnBackground(exe, isExisting ? worktree : repo, reviewArgs(mr.iid, mr.url, isExisting))
    const shortId = parseBgId(out)
    if (!shortId) return { error: out.trim().split(/\r?\n/).pop() || 'claude did not start' }
    isStarted = true
    const id = (await waitForSessionId(shortId, 10000)) ?? shortId
    appState = {
      ...appState,
      mrSessions: { ...appState.mrSessions, [key]: id },
      reviewedMrs: { ...appState.reviewedMrs, [key]: headSha }
    }
    saveState(statePath, appState)
    pushMyMrs()
    void waitForFolder(worktree, 30000).then((isReady) => isReady && linkNodeModules(worktree, repo))
    void refreshAgents().then(() => pushSessions())
    return { error: null, sessionId: id }
  } finally {
    if (isStarted) setTimeout(() => startingReviews.delete(key), 30000)
    else startingReviews.delete(key)
  }
}

const waitForSessionId = async (shortId: string, timeoutMs: number): Promise<string | null> => {
  const deadline = Date.now() + timeoutMs
  let isAgentsChecked = false
  while (Date.now() < deadline) {
    const found =
      sessionFiles().find((f) => f.sessionId.startsWith(shortId))?.sessionId ??
      [...bgAgents.keys()].find((id) => id.startsWith(shortId))
    if (found) return found
    if (!isAgentsChecked) {
      isAgentsChecked = true
      await refreshAgents()
      continue
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  return null
}

const resolveClaudeExe = (): string | null => {
  if (claudeExe && existsSync(claudeExe)) return claudeExe
  let whereOut = ''
  try {
    whereOut = execFileSync('where', ['claude'], { encoding: 'utf8', windowsHide: true })
  } catch {
    whereOut = ''
  }
  claudeExe = claudeExeCandidates(whereOut, homedir()).find((c) => existsSync(c)) ?? null
  return claudeExe
}

const taskWorktree = (repo: string, key: string): string => joinPath(repo, '.claude', 'worktrees', key)

const linkNodeModules = (worktree: string, repo: string): void => {
  const target = joinPath(repo, 'node_modules')
  const link = joinPath(worktree, 'node_modules')
  try {
    const entries = existsSync(link) ? readdirSync(link) : null
    const action = nodeModulesAction(entries, existsSync(target) && existsSync(joinPath(worktree, 'package.json')))
    if (action === 'none') return
    if (action === 'relink') rmSync(link, { recursive: true, force: true })
    symlinkSync(target, link, 'junction')
  } catch (e) {
    console.error('[worktree] node_modules link failed:', worktree, e)
  }
}

const spawnBackground = (exe: string, cwd: string, args: string[]): Promise<string> =>
  new Promise((resolve) => {
    let out = ''
    const env = { ...process.env }
    delete env.NO_COLOR
    const p = spawn(exe, args, {
      cwd,
      shell: false,
      windowsHide: true,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let isDone = false
    const finish = (text: string): void => {
      if (isDone) return
      isDone = true
      clearTimeout(timer)
      resolve(text)
    }
    const timer = setTimeout(() => {
      if (!parseBgId(out)) p.kill()
      finish(parseBgId(out) ? out : `${out}\nclaude did not answer within 60 s`)
    }, 60000)
    const collect = (d: Buffer): void => {
      out += d.toString()
      if (parseBgId(out)) finish(out)
    }
    p.stdout?.on('data', collect)
    p.stderr?.on('data', collect)
    p.on('error', (e) => finish(`${out}\n${e.message}`))
    p.on('exit', () => setTimeout(() => finish(out), 200))
    p.on('close', () => finish(out))
  })

const waitForFolder = async (folder: string, timeoutMs: number): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (existsSync(folder)) return true
    await new Promise((r) => setTimeout(r, 500))
  }
  return existsSync(folder)
}

const attachInVsCode = async (id: string, folder: string): Promise<boolean> => {
  if (resuming.has(id)) return true
  if ((await runningAttachIds()).has(id.slice(0, 8))) return focusOrOpen({ projectPath: folder, id, isLive: true, ticket: null })
  const paneKey = resumeKeyFor({ id, projectPath: folder })
  const isLayoutConfigured = !!resuming.get(id)
  const isOpened = await reopenAndRun(folder, attachCommand(id), paneKey, isLayoutConfigured)
  setTimeout(() => resuming.delete(id), 60000)
  void pushSessions()
  return isOpened
}

const startTask = async (
  key: string,
  title: string,
  repo: string,
  mode: 'vscode' | 'background'
): Promise<{ error: string | null; sessionId?: string }> => {
  if (startingTasks.has(key)) return { error: 'this ticket is already starting' }
  const exe = resolveClaudeExe()
  if (!exe) return { error: 'claude.exe not found' }
  startingTasks.add(key)
  let isStarted = false
  try {
    appState = { ...appState, repoByPrefix: { ...appState.repoByPrefix, [ticketPrefix(key)]: repo } }
    saveState(statePath, appState)
    const worktree = taskWorktree(repo, key)
    const isExisting = isLinkedWorktreeGitFile(readText(joinPath(worktree, '.git')) ?? '')
    prepareTaskBrowser(key, worktree)
    const prompt = `${startPrompt(appState.settings.startPrompt, key, title)}\n\n${taskContext(key, worktree, repo, new Date())}`
    const out = await spawnBackground(exe, isExisting ? worktree : repo, startArgs(key, prompt, isExisting))
    const shortId = parseBgId(out)
    if (!shortId) return { error: out.trim().split(/\r?\n/).pop() || 'claude did not start' }
    isStarted = true
    if (mode === 'background') {
      void waitForFolder(worktree, 30000).then((isReady) => isReady && linkNodeModules(worktree, repo))
      const id = await waitForSessionId(shortId, 20000)
      if (!id) return { error: null, sessionId: shortId }
      appState = applyTicketOverride(appState, id, key)
      saveState(statePath, appState)
      await refreshAgents()
      void pushSessions()
      return { error: null, sessionId: id }
    }
    if (!(await waitForFolder(worktree, 30000))) return { error: 'worktree folder did not appear' }
    linkNodeModules(worktree, repo)
    const id = sessionFiles().find((f) => f.sessionId.startsWith(shortId))?.sessionId ?? shortId
    const isOpened = await attachInVsCode(id, worktree)
    return { error: isOpened ? null : 'could not open the session in VS Code' }
  } finally {
    if (isStarted) setTimeout(() => startingTasks.delete(key), 30000)
    else startingTasks.delete(key)
    void refreshAgents()
  }
}

const openTaskCode = (key: string): void => {
  const repo = appState.repoByPrefix[ticketPrefix(key)]
  const worktree = repo ? taskWorktree(repo, key) : null
  const newest = lastSessions
    .filter((s) => s.ticket?.toUpperCase() === key.toUpperCase() && s.projectPath)
    .sort((a, b) => b.lastActive - a.lastActive)[0]
  const target = worktree && existsSync(worktree) ? worktree : (newest?.projectPath ?? repo)
  if (target) openProject(target)
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
  sendAll('claude-status', { claude: claudeOk, editor: editorOk })
}

function openSession(s: Session): void {
  if (!s?.id) return
  if (bgAgents.has(s.id)) {
    void attachInVsCode(s.id, s.projectPath)
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
  sendAll('usage-update', lastUsage)
}

function notifyResumeFailed(s: Session): void {
  mainWindow?.webContents.send('resume-failed', {
    label: s.name ?? s.projectName,
    command: resumeCommand(s.id, s.ticket)
  })
}

const TAIL_BYTES = 65536

const readTailLines = (file: string): string[] => {
  const fd = openSync(file, 'r')
  try {
    const size = fstatSync(fd).size
    const length = Math.min(size, TAIL_BYTES)
    const buf = Buffer.alloc(length)
    readSync(fd, buf, 0, length, size - length)
    return buf.toString('utf8').split(/\r?\n/).filter(Boolean)
  } finally {
    closeSync(fd)
  }
}

const transcriptFile = (id: string): string | null => {
  try {
    for (const p of readdirSync(projectsDir())) {
      const f = joinPath(projectsDir(), p, `${id}.jsonl`)
      if (existsSync(f)) return f
    }
  } catch {
    return null
  }
  return null
}

const sessionQuestion = (id: string): string | null => {
  const f = transcriptFile(id)
  try {
    return f ? parseTail(readTailLines(f)).question : null
  } catch {
    return null
  }
}

const detailCache = createDetailCache((lines) => ({ turns: countTurns(lines), messages: lastMessages(lines, 20) }))

const sessionDetail = (id: string): { turns: number; messages: { role: 'user' | 'assistant'; text: string }[] } => {
  const f = transcriptFile(id)
  try {
    if (!f) return { turns: 0, messages: [] }
    const st = statSync(f)
    return detailCache.get(f, st.size, st.mtimeMs, () => readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean))
  } catch {
    return { turns: 0, messages: [] }
  }
}

const sendToDashboard = (channel: string, ...args: unknown[]): void => {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) dashboardWindow.webContents.send(channel, ...args)
}
const ptyHost = createPtyHost(sendToDashboard)

interface DevServer {
  key: string
  port: number
  command: string
  cwd: string
  startedAt: number
  url: string
  label: string
}
const SERVER_LOG_LIMIT = 200000
const PORT_PROBE_COUNT = 40
const servers = new Map<string, DevServer>()
const serverLogs = new Map<string, string>()
const pushServers = (): void => sendToDashboard('servers', [...servers.values()])
const onServerEvent = (channel: string, ...args: unknown[]): void => {
  const key = args[0] as string
  if (channel === 'pty-data') {
    const log = (serverLogs.get(key) ?? '') + (args[1] as string)
    serverLogs.set(key, log.length > SERVER_LOG_LIMIT ? log.slice(-SERVER_LOG_LIMIT) : log)
    sendToDashboard('server-data', key, args[1])
    return
  }
  servers.delete(key)
  pushServers()
  sendToDashboard('server-exit', key, args[1])
}
const serverHost = createPtyHost(onServerEvent)

const resolveBash = (): string | null =>
  bashCandidates(process.env.ProgramFiles ?? 'C:\\Program Files', process.env.LOCALAPPDATA ?? '').find((p) => existsSync(p)) ?? null

const repoNameOf = (cwd: string): string => {
  const root = parseWorktreeRoot(readText(joinPath(cwd, '.git')) ?? '') ?? cwd
  return root.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? root
}

const busyPorts = async (): Promise<Set<number>> => {
  const ports = Array.from({ length: PORT_PROBE_COUNT }, (_v, i) => 8080 + i)
  const isFree = await Promise.all(ports.map(isPortFree))
  return new Set(ports.filter((_p, i) => !isFree[i]))
}

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const CHROME_PROFILE = 'C:\\Chrome dev session'
const CHROME_DEBUG_PORT = 9222
const STV_PLATFORMS = ['web', 'browser', 'tizen', 'lg', 'hisense']
const STV_RESOLUTIONS = ['1280x720', '1920x1080']

const listDir = (dir: string): string[] => {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

const serverProfile = (cwd: string): ServerProfile => {
  const repo = repoNameOf(cwd)
  const saved = parseChoice(appState.serverCommands[`${repo}#choice`])
  const configDir = joinPath(cwd, 'config')
  const stvDirs = Object.fromEntries(
    listDir(configDir)
      .filter((d) => !d.startsWith('.'))
      .map((d) => [d, listDir(joinPath(configDir, d))])
  )
  const stv = stvOptions(stvDirs)
  const web = webOptions(listDir(cwd))
  const kind: ServerProfile['kind'] = stv.tenants.length ? 'stv' : web.tenants.length ? 'web' : 'custom'
  const options = kind === 'stv' ? stv : kind === 'web' ? web : { tenants: [], environments: [] }
  return {
    kind,
    tenants: options.tenants,
    environments: options.environments,
    platforms: kind === 'stv' ? STV_PLATFORMS : [],
    resolutions: kind === 'stv' ? STV_RESOLUTIONS : [],
    choice: {
      tenant: saved?.tenant && options.tenants.includes(saved.tenant) ? saved.tenant : (options.tenants[0] ?? ''),
      environment:
        saved?.environment && options.environments.includes(saved.environment)
          ? saved.environment
          : options.environments.includes('dev')
            ? 'dev'
            : (options.environments[0] ?? ''),
      platform: saved?.platform ?? 'web',
      resolution: saved?.resolution ?? '1280x720'
    },
    command: appState.serverCommands[repo] ?? DEFAULT_SERVER_COMMAND,
    isWorktree: parseWorktreeRoot(readText(joinPath(cwd, '.git')) ?? '') !== null
  }
}

const parseChoice = (text: string | undefined): StvChoice | null => {
  try {
    const o = text ? JSON.parse(text) : null
    return o && typeof o === 'object' ? (o as StvChoice) : null
  } catch {
    return null
  }
}

const isHttpsIn = (text: string): boolean => /^\s*VUE_APP_DEV_SERVER_HTTPS\s*=\s*true\s*$/m.test(text)

const prepareWebEnv = (cwd: string, choice: StvChoice): { error: string | null; isHttps: boolean } => {
  const root = parseWorktreeRoot(readText(joinPath(cwd, '.git')) ?? '')
  if (!root) return { error: 'Tenant switching writes .env.local, so it only runs in a ticket worktree', isHttps: false }
  const tenantEnv = readText(joinPath(cwd, `.env.${choice.tenant}-${choice.environment}`))
  if (tenantEnv === null) return { error: `No .env.${choice.tenant}-${choice.environment} in the worktree`, isHttps: false }
  const merged = mergeEnvLocal(readText(joinPath(root, '.env.local')) ?? '', tenantEnv)
  writeFileSync(joinPath(cwd, '.env.local'), merged, 'utf8')
  return { error: null, isHttps: isHttpsIn(merged) }
}

const startServer = async (
  key: string,
  cwd: string,
  spec: ServerSpec,
  port: number | null,
  cols: number,
  rows: number
): Promise<{ error: string | null; port?: number }> => {
  if (servers.has(key)) return { error: 'The server is already running' }
  const bash = resolveBash()
  if (!bash) return { error: 'Git Bash not found (C:\\Program Files\\Git\\bin\\bash.exe)' }
  if (!existsSync(cwd)) return { error: `Folder not found: ${cwd}` }
  const ours = [...servers.values()].map((s) => s.port)
  const busy = await busyPorts()
  const chosen = port ?? pickPort(ours, (p) => busy.has(p))
  if (port !== null && (ours.includes(port) || busy.has(port))) return { error: `Port ${port} is already in use` }
  const repo = repoNameOf(cwd)
  let command = serverCommand(spec.command, chosen)
  let isHttps = false
  let label = 'custom'
  if (spec.kind === 'stv') {
    command = stvCommand(spec.choice, chosen)
    isHttps = isHttpsIn(`${readText(joinPath(cwd, 'config', '.env.local')) ?? ''}\n${readText(joinPath(cwd, 'config', spec.choice.tenant, `.env.${spec.choice.environment}`)) ?? ''}`)
    label = `${spec.choice.tenant} · ${spec.choice.environment} · ${spec.choice.platform} · ${spec.choice.resolution}`
  } else if (spec.kind === 'web') {
    const prepared = prepareWebEnv(cwd, spec.choice)
    if (prepared.error) return { error: prepared.error }
    isHttps = prepared.isHttps
    command = `TENANT=${spec.choice.tenant} ENVIRONMENT=${spec.choice.environment} npm run serve -- --port ${chosen}`
    label = `${spec.choice.tenant} · ${spec.choice.environment}`
  }
  const host = spec.kind === 'custom' ? serverHostName(key, null, null) : serverHostName(key, spec.choice.tenant, spec.choice.environment)
  const url = `${isHttps ? 'https' : 'http'}://${host}:${chosen}`
  serverLogs.set(key, `$ ${command}\r\n`)
  serverHost.open(key, bash, ['-c', command], cwd, cols, rows)
  servers.set(key, { key, port: chosen, command, cwd, startedAt: Date.now(), url, label })
  appState = {
    ...appState,
    serverCommands: {
      ...appState.serverCommands,
      ...(spec.kind === 'custom' ? { [repo]: spec.command } : { [`${repo}#choice`]: JSON.stringify(spec.choice) })
    }
  }
  saveState(statePath, appState)
  pushServers()
  return { error: null, port: chosen }
}

const MAX_FILE_BYTES = 2_000_000
const MAX_TREE_FILES = 20000

const ideFiles = async (cwd: string): Promise<string[]> => {
  const res = await runGit(cwd, ['ls-files', '-co', '--exclude-standard'])
  return res.isOk ? res.out.split(/\r?\n/).filter(Boolean).slice(0, MAX_TREE_FILES) : []
}

const ideStatus = async (cwd: string): Promise<ChangedFile[]> => {
  const res = await runGit(cwd, ['status', '--porcelain', '--untracked-files=all'])
  return res.isOk ? parseStatus(res.out) : []
}

const ideRead = (cwd: string, rel: string): { text: string | null; error: string | null } => {
  const full = safeRelPath(cwd, rel)
  if (!full) return { text: null, error: 'Path outside the worktree' }
  try {
    if (statSync(full).size > MAX_FILE_BYTES) return { text: null, error: 'File is too large to open here' }
    return { text: readFileSync(full, 'utf8'), error: null }
  } catch {
    return { text: '', error: null }
  }
}

const diffBase = async (cwd: string): Promise<{ base: string; target: string; branch: string }> => {
  const branch = (await runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])).out.trim()
  const head = await runGit(cwd, ['rev-parse', '--abbrev-ref', 'origin/HEAD'])
  const target = head.isOk && head.out.trim() ? head.out.trim() : 'HEAD'
  const merge = target === 'HEAD' ? null : await runGit(cwd, ['merge-base', 'HEAD', target])
  return { base: merge?.isOk ? merge.out.trim() : 'HEAD', target, branch }
}

const ideChanges = async (cwd: string): Promise<BranchChanges> => {
  const { base, target, branch } = await diffBase(cwd)
  const [tracked, untracked, status] = await Promise.all([
    runGit(cwd, ['diff', '--name-status', base]),
    runGit(cwd, ['ls-files', '-o', '--exclude-standard']),
    runGit(cwd, ['status', '--porcelain', '--untracked-files=all'])
  ])
  const files = [
    ...parseNameStatus(tracked.out),
    ...untracked.out
      .split(/\r?\n/)
      .filter(Boolean)
      .map((path) => ({ path, state: 'untracked' as const }))
  ].filter((f) => !isNoisePath(f.path))
  const uncommitted = parseStatusPaths(status.out).filter((p) => !isNoisePath(p))
  return { branch, target: target.replace(/^origin\//, ''), base: base.slice(0, 8), files, folder: cwd, uncommitted }
}

const refFetchedAt = new Map<string, number>()
const REF_FETCH_MS = 60000

const fetchRefs = async (cwd: string, source: string, target: string): Promise<void> => {
  const key = `${cwd}|${source}|${target}`
  if (Date.now() - (refFetchedAt.get(key) ?? 0) < REF_FETCH_MS) return
  refFetchedAt.set(key, Date.now())
  await runGit(cwd, ['fetch', '--quiet', 'origin', source, target])
}

const refBase = async (cwd: string, source: string, target: string): Promise<string | null> => {
  const merge = await runGit(cwd, ['merge-base', `origin/${target}`, `origin/${source}`])
  return merge.isOk ? merge.out.trim() : null
}

const ideRefChanges = async (cwd: string, source: string, target: string): Promise<BranchChanges> => {
  const branch = (await runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])).out.trim()
  if (!isSafeRef(source) || !isSafeRef(target) || branch === source) return ideChanges(cwd)
  const list = await runGit(cwd, ['worktree', 'list', '--porcelain'])
  const local = list.isOk ? worktreeForBranch(list.out, source) : null
  if (local && existsSync(local)) return ideChanges(local.replace(/\//g, '\\'))
  await fetchRefs(cwd, source, target)
  const base = await refBase(cwd, source, target)
  if (!base) return { branch: source, target, base: '', files: [], isReadOnly: true }
  const diff = await runGit(cwd, ['diff', '--name-status', base, `origin/${source}`])
  return { branch: source, target, base: base.slice(0, 8), files: parseNameStatus(diff.out).filter((f) => !isNoisePath(f.path)), isReadOnly: true }
}

const ideReadRef = async (cwd: string, source: string, target: string, rel: string, isBase: boolean): Promise<string | null> => {
  if (!isSafeRef(source) || !isSafeRef(target) || !safeRelPath(cwd, rel)) return null
  const ref = isBase ? await refBase(cwd, source, target) : `origin/${source}`
  if (!ref) return null
  const res = await runGit(cwd, ['show', `${ref}:${rel}`])
  return res.isOk ? res.out : null
}

const ideRefFiles = async (cwd: string, source: string): Promise<string[]> => {
  if (!isSafeRef(source)) return []
  const res = await runGit(cwd, ['ls-tree', '-r', '--name-only', `origin/${source}`])
  return res.isOk ? res.out.split(/\r?\n/).filter((p) => p && !isNoisePath(p)) : []
}

const ideReadHead = async (cwd: string, rel: string, isLastCommit = false): Promise<string> => {
  if (!safeRelPath(cwd, rel)) return ''
  const { base } = isLastCommit ? { base: 'HEAD' } : await diffBase(cwd)
  const res = await runGit(cwd, ['show', `${base}:${rel}`])
  return res.isOk ? res.out : ''
}

const EXPLAIN_ROOT = joinPath(homedir(), 'Desktop', 'Opis zadan')

const startingExplains = new Set<string>()

const startExplain = async (
  key: string,
  cwd: string,
  sourceSessionId: string | null
): Promise<{ error: string | null; sessionId?: string }> => {
  if (startingExplains.has(key)) return { error: 'The explanation is already starting' }
  const exe = resolveClaudeExe()
  if (!exe) return { error: 'claude.exe not found' }
  if (!existsSync(cwd)) return { error: `Folder not found: ${cwd}` }
  startingExplains.add(key)
  try {
    const transcript = sourceSessionId ? transcriptFile(sourceSessionId) : null
    const out = await spawnBackground(exe, cwd, explainArgs(key, transcript ? transcript.replace(/\\/g, '/') : null))
    const shortId = parseBgId(out)
    if (!shortId) return { error: out.trim().split(/\r?\n/).pop() || 'claude did not start' }
    const id = (await waitForSessionId(shortId, 10000)) ?? shortId
    appState = applyTicketOverride(appState, id, key)
    saveState(statePath, appState)
    void refreshAgents().then(() => pushSessions())
    return { error: null, sessionId: id }
  } finally {
    setTimeout(() => startingExplains.delete(key), 30000)
  }
}

const findExplainFile = (key: string): ExplainFile | null => {
  const candidates = listDir(EXPLAIN_ROOT).flatMap((month) => {
    const json = joinPath(EXPLAIN_ROOT, month, key, 'wyjasnienie-zmian.json')
    try {
      return [{ json, md: joinPath(EXPLAIN_ROOT, month, key, 'wyjasnienie-zmian.md'), updatedAt: statSync(json).mtimeMs }]
    } catch {
      return []
    }
  })
  const newest = candidates.sort((a, b) => b.updatedAt - a.updatedAt)[0]
  if (!newest) return null
  try {
    const doc = parseExplainDoc(JSON.parse(readFileSync(newest.json, 'utf8').replace(/^\uFEFF/, '')))
    return doc ? { doc, mdPath: newest.md, updatedAt: newest.updatedAt } : null
  } catch {
    return null
  }
}

const ideWrite = (cwd: string, rel: string, text: string): { error: string | null } => {
  const full = safeRelPath(cwd, rel)
  if (!full) return { error: 'Path outside the worktree' }
  try {
    writeFileSync(full, text, 'utf8')
    return { error: null }
  } catch (e) {
    return { error: String(e) }
  }
}

const PLAYWRIGHT_CONFIG = 'C:/Users/ASSET-17300/.claude/playwright-mcp.json'

const chromePortFor = (key: string): number => {
  const known = appState.chromePorts[key]
  if (known) return known
  const port = pickChromePort(Object.values(appState.chromePorts))
  appState = { ...appState, chromePorts: { ...appState.chromePorts, [key]: port } }
  saveState(statePath, appState)
  return port
}

const prepareTaskBrowser = (key: string, folder: string): number => {
  const port = chromePortFor(key)
  if (ticketFromPath(folder) === key) writeTaskMcp(join(homedir(), '.claude.json'), folder, port, PLAYWRIGHT_CONFIG)
  return port
}

const openInChrome = async (url: string, key?: string | null): Promise<void> => {
  const exe = existsSync(CHROME_PATH) ? CHROME_PATH : 'chrome.exe'
  if (key) await seedProfile(CHROME_PROFILE, taskChromeProfile(key))
  const args = key ? chromeArgs(taskChromeProfile(key), chromePortFor(key), url) : chromeArgs(CHROME_PROFILE, CHROME_DEBUG_PORT, url)
  spawn(exe, args, { detached: true, stdio: 'ignore', shell: false }).unref()
}

const asString = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

const isChromeDebugUp = async (port = CHROME_DEBUG_PORT): Promise<boolean> => {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch {
    return false
  }
}

const serverFolderFor = async (key: string, cwd: string): Promise<string | null> => {
  if (cwd && existsSync(cwd)) {
    const top = await runGit(cwd, ['rev-parse', '--show-toplevel'])
    return top.isOk ? top.out.trim().replace(/\//g, '\\') : cwd
  }
  const repo = appState.repoByPrefix[ticketPrefix(key)]
  const worktree = repo ? taskWorktree(repo, key) : null
  if (worktree && existsSync(worktree)) return worktree
  return (
    lastSessions
      .filter((s) => s.ticket?.toUpperCase() === key && s.projectPath)
      .sort((a, b) => b.lastActive - a.lastActive)[0]?.projectPath ?? null
  )
}

const bridgeRoutes = {
  '/server': async (body: Record<string, unknown>): Promise<unknown> => {
    const cwd = asString(body.cwd)
    const key = asString(body.ticket).toUpperCase() || ticketFromPath(cwd)
    if (!key) return { error: 'Pass --ticket <KEY> or run it from the ticket worktree' }
    const running = servers.get(key)
    if (running) return { key, url: running.url, port: running.port, cwd: running.cwd, label: running.label, isNew: false }
    const folder = await serverFolderFor(key, cwd)
    if (!folder) return { error: `No folder found for ${key}` }
    const profile = serverProfile(folder)
    const choice = {
      tenant: asString(body.tenant) || profile.choice.tenant,
      environment: asString(body.environment) || profile.choice.environment,
      platform: asString(body.platform) || profile.choice.platform,
      resolution: asString(body.resolution) || profile.choice.resolution
    }
    const result = await startServer(key, folder, { kind: profile.kind, choice, command: profile.command }, null, 120, 32)
    if (result.error) return { error: result.error }
    const started = servers.get(key)
    return { key, url: started?.url, port: started?.port, cwd: folder, label: started?.label, isNew: true }
  },
  '/chrome': async (body: Record<string, unknown>): Promise<unknown> => {
    const key = asString(body.ticket).toUpperCase() || ticketFromPath(asString(body.cwd)) || null
    const port = key ? chromePortFor(key) : CHROME_DEBUG_PORT
    if (key) {
      const folder = await serverFolderFor(key, asString(body.cwd))
      if (folder) prepareTaskBrowser(key, folder)
    }
    if (await isChromeDebugUp(port)) return { isRunning: true, wasStarted: false, port, key }
    await openInChrome(asString(body.url) || 'about:blank', key)
    const deadline = Date.now() + 15000
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 500))
      if (await isChromeDebugUp(port)) return { isRunning: true, wasStarted: true, port, key }
    }
    return { isRunning: false, port, key, error: `Chrome did not open its debugging port ${port} in time` }
  },
  '/mrs': async (): Promise<unknown> => ({
    fetched: mrItems.length,
    shown: myMrs().items.length,
    error: mrError,
    detail: mrErrorDetail,
    me: gitlabMe,
    projects: appState.settings.mrProjects,
    isAllProjects,
    hasToken: !!appState.settings.gitlabToken.trim()
  }),
  '/status': async (): Promise<unknown> => ({
    servers: [...servers.values()].map((s) => ({ key: s.key, url: s.url, port: s.port, cwd: s.cwd, label: s.label })),
    isChromeUp: await isChromeDebugUp()
  })
}

const chromeInfo = async (port: number): Promise<LocalHost['chrome']> => {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1500) })
    if (!res.ok) return { port, isUp: false, pages: [] }
    const list = (await res.json()) as { type?: string; title?: string; url?: string }[]
    return {
      port,
      isUp: true,
      pages: list.filter((p) => p.type === 'page').map((p) => ({ title: p.title ?? '', url: p.url ?? '' }))
    }
  } catch {
    return { port, isUp: false, pages: [] }
  }
}

const listLocalHosts = async (): Promise<LocalHost[]> => {
  const keys = [...new Set([...servers.keys(), ...Object.keys(appState.chromePorts)])]
  const rows = await Promise.all(
    keys.map(async (key): Promise<LocalHost> => {
      const server = servers.get(key)
      return {
        key,
        server: server ? { ...server, lastOutputAt: serverHost.lastOutputAt(key) } : null,
        chrome: await chromeInfo(chromePortFor(key))
      }
    })
  )
  const shared: LocalHost = { key: null, server: null, chrome: await chromeInfo(CHROME_DEBUG_PORT) }
  return [...rows.filter((r) => r.server || r.chrome.isUp), ...(shared.chrome.isUp ? [shared] : [])]
}

const closeChrome = async (key: string | null): Promise<string | null> => {
  const port = key ? chromePortFor(key) : CHROME_DEBUG_PORT
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1500) })
    const url = ((await res.json()) as { webSocketDebuggerUrl?: string }).webSocketDebuggerUrl
    if (!url) return 'Chrome did not give a debugging address'
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url)
      const timer = setTimeout(() => reject(new Error('Chrome did not answer')), 4000)
      socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method: 'Browser.close' })))
      socket.addEventListener('close', () => {
        clearTimeout(timer)
        resolve()
      })
      socket.addEventListener('error', () => {
        clearTimeout(timer)
        resolve()
      })
    })
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

const stopServer = (key: string): void => {
  serverHost.close(key)
  servers.delete(key)
  pushServers()
}
const openGuard = createOpenGuard()
const handedToVscode = new Map<string, number>()
const PROMPT_QUIET_MS = 1500
const PROMPT_WAIT_MS = 20000

const sessionById = (id: string): Session | undefined => lastSessions.find((s) => s.id === id)

const isAttachedElsewhere = async (id: string): Promise<boolean> =>
  !ptyHost.isOpen(id) && (isHandedOff(handedToVscode.get(id), Date.now()) || (await runningAttaches()).has(id.slice(0, 8)))

const modeOf = async (id: string): Promise<TerminalMode> =>
  terminalMode({
    isBackground: bgAgents.has(id),
    isLive: sessionById(id)?.isLive ?? false,
    isAttachedElsewhere: await isAttachedElsewhere(id)
  })

const CANCELLED = { error: 'cancelled' }

const openTerminal = (id: string, cols: number, rows: number): Promise<{ error: string | null }> =>
  openGuard.run(id, (isCurrent) => openTerminalNow(id, cols, rows, isCurrent))

const openTerminalNow = async (
  id: string,
  cols: number,
  rows: number,
  isCurrent: () => boolean
): Promise<{ error: string | null }> => {
  const s = sessionById(id)
  const exe = resolveClaudeExe()
  if (!s) return { error: 'session not found' }
  if (!exe) return { error: 'claude.exe not found' }
  const mode = await modeOf(id)
  if (!isCurrent()) return CANCELLED
  if (mode === 'attach') {
    ptyHost.open(id, exe, attachArgs(id), s.projectPath, cols, rows)
    return { error: null }
  }
  if (mode !== 'resume') return { error: mode === 'vscode' ? 'this session runs in a VS Code terminal' : 'this session is attached in VS Code' }
  if (s.ticket) prepareTaskBrowser(s.ticket.toUpperCase(), s.projectPath)
  const out = await spawnBackground(exe, s.projectPath, resumeBackgroundArgs(id, s.ticket))
  const shortId = parseBgId(out)
  if (!shortId) return { error: out.trim().split(/\r?\n/).pop() || 'claude did not resume' }
  void refreshAgents().then(() => pushSessions())
  if (!isCurrent()) return CANCELLED
  ptyHost.open(id, exe, ['attach', shortId], s.projectPath, cols, rows)
  return { error: null }
}

const waitForQuietOutput = async (id: string): Promise<boolean> => {
  const deadline = Date.now() + PROMPT_WAIT_MS
  while (Date.now() < deadline) {
    const at = ptyHost.lastOutputAt(id)
    if (at !== null && Date.now() - at >= PROMPT_QUIET_MS) return true
    await new Promise((r) => setTimeout(r, 250))
  }
  return ptyHost.isOpen(id)
}

const sendPrompt = async (id: string, text: string): Promise<{ error: string | null }> => {
  if (!ptyHost.isOpen(id)) {
    const opened = await openTerminal(id, 120, 32)
    if (opened.error) return opened
  }
  if (!(await waitForQuietOutput(id))) return { error: 'the session did not answer' }
  ptyHost.write(id, pasteInput(text))
  return { error: null }
}

const takeOver = async (id: string, cols: number, rows: number): Promise<{ error: string | null }> => {
  handedToVscode.delete(id)
  const pid = (await runningAttaches()).get(id.slice(0, 8))
  if (pid) await killProcess(pid, true)
  await new Promise((r) => setTimeout(r, 500))
  return openTerminal(id, cols, rows)
}

const openTerminalInVscode = async (id: string): Promise<void> => {
  const s = sessionById(id)
  openGuard.cancel(id)
  ptyHost.close(id)
  handedToVscode.set(id, Date.now())
  if (!s) return
  await new Promise((r) => setTimeout(r, 500))
  if (bgAgents.has(id)) await attachInVsCode(id, s.projectPath)
  else openSession(s)
}

const clip = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

function notifyNeedsYou(s: Session): void {
  if (!Notification.isSupported()) return
  const who = s.ticket ? `${s.ticket} · ${s.name ?? lastTasks[s.ticket]?.title ?? s.projectName}` : (s.name ?? s.projectName)
  const question = sessionQuestion(s.id)
  const n = new Notification({
    title: clip(`Claude needs you: ${who}`, 120),
    body: clip(question ?? `${s.projectName} is waiting for your answer. Click to open the session.`, 240),
    icon,
    silent: true
  })
  shownNotifications.add(n)
  n.on('close', () => shownNotifications.delete(n))
  n.on('click', () => {
    shownNotifications.delete(n)
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
    tray.setToolTip(parts.length ? `Claude Cockpit — ${parts.join(' · ')}` : 'Claude Cockpit')
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

const DASHBOARD_SIZE = { width: 1400, height: 860 }

const loadRenderer = (win: BrowserWindow, hash?: string): void => {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) void win.loadURL(process.env['ELECTRON_RENDERER_URL'] + (hash ? `#${hash}` : ''))
  else void win.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined)
}

const openDashboard = (): void => {
  if (dashboardWindow) {
    if (dashboardWindow.isMinimized()) dashboardWindow.restore()
    dashboardWindow.show()
    dashboardWindow.focus()
    return
  }
  const bounds = visibleBounds(appState.dashboardBounds, screen.getAllDisplays().map((d) => d.workArea))
  const win = new BrowserWindow({
    ...(bounds ?? DASHBOARD_SIZE),
    minWidth: 900,
    minHeight: 500,
    show: false,
    title: 'Claude Cockpit',
    backgroundColor: '#1b1b1b',
    icon,
    autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  })
  if (!bounds) win.center()
  win.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })
  win.once('ready-to-show', () => win.show())
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('my-mrs', myMrs())
    win.webContents.send('my-tasks', myTasks)
    win.webContents.send('usage-update', lastUsage)
    void pushSessions()
  })
  win.on('close', () => {
    appState = { ...appState, dashboardBounds: win.getBounds() }
    saveState(statePath, appState)
  })
  const closeTerminals = (): void => ptyHost.closeAll()
  win.webContents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) closeTerminals()
  })
  win.webContents.on('render-process-gone', closeTerminals)
  win.on('closed', () => {
    ptyHost.closeAll()
    dashboardWindow = null
  })
  dashboardWindow = win
  loadRenderer(win, 'dashboard')
}

let launcherWindow: BrowserWindow | null = null

const showSidebar = (): void => {
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

const openView = (view: StartView): void => {
  if (view === 'dashboard') openDashboard()
  else if (view === 'sidebar') showSidebar()
  else openLauncher()
}

const openLauncher = (): void => {
  if (launcherWindow) {
    launcherWindow.show()
    launcherWindow.focus()
    return
  }
  const win = new BrowserWindow({
    width: 620,
    height: 400,
    useContentSize: true,
    resizable: false,
    maximizable: false,
    show: false,
    title: 'Claude Cockpit',
    backgroundColor: '#141414',
    icon,
    autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  })
  win.center()
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => {
    launcherWindow = null
  })
  launcherWindow = win
  loadRenderer(win, 'launcher')
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
    backgroundColor: '#1b1b1b',
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
    void refreshMyTasks()
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
  setInterval(refreshMyTasks, 120000)
  void refreshMyMrs()
  setInterval(refreshMyMrs, 120000)
}

function buildTray(win: BrowserWindow): void {
  tray = new Tray(icon)
  const toggle = (): void => (win.isVisible() ? win.hide() : win.show())
  tray.setToolTip('Claude Cockpit')
  tray.on('click', toggle)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show / Hide', click: toggle },
      { label: 'Open dashboard', click: () => openDashboard() },
      { label: 'Choose a window…', click: () => openLauncher() },
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

  migrateUserData(join(app.getPath('appData'), 'claude-session-switcher'), app.getPath('userData'))
  startBridge(join(homedir(), '.claude', 'cockpit.json'), bridgeRoutes)
  statePath = join(app.getPath('userData'), 'state.json')
  appState = loadState(statePath)
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://*/api/v4/projects/*/uploads/*', 'http://*/api/v4/projects/*/uploads/*'] },
    (details, callback) => {
      const token = appState.settings.gitlabToken.trim()
      const origin = ((): string | null => {
        try {
          return new URL(appState.settings.gitlabBase).origin
        } catch {
          return null
        }
      })()
      const isOurs = !!token && !!origin && details.url.startsWith(`${origin}/`)
      callback({ requestHeaders: isOurs ? { ...details.requestHeaders, 'PRIVATE-TOKEN': token } : details.requestHeaders })
    }
  )
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
      isDockOnTop: appState.settings.isDockOnTop,
      taskJql: appState.settings.taskJql,
      startPrompt: appState.settings.startPrompt,
      quickActions: appState.settings.quickActions,
      gitlabBase: appState.settings.gitlabBase,
      gitlabToken: appState.settings.gitlabToken,
      mrProjects: appState.settings.mrProjects,
      startView: appState.settings.startView,
      mrMention: appState.settings.mrMention
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
    if (typeof patch.taskJql === 'string') appState.settings.taskJql = patch.taskJql
    if (typeof patch.startPrompt === 'string') appState.settings.startPrompt = patch.startPrompt
    if (Array.isArray(patch.quickActions))
      appState.settings.quickActions = patch.quickActions.filter(
        (a) => typeof a?.label === 'string' && typeof a?.prompt === 'string' && a.label.trim() && a.prompt.trim()
      )
    if (typeof patch.taskJql === 'string' || typeof patch.jiraToken === 'string') void refreshMyTasks()
    if (typeof patch.gitlabBase === 'string') appState.settings.gitlabBase = patch.gitlabBase
    if (typeof patch.gitlabToken === 'string') appState.settings.gitlabToken = patch.gitlabToken
    if (typeof patch.mrProjects === 'string') appState.settings.mrProjects = patch.mrProjects
    if (typeof patch.mrMention === 'string') appState.settings.mrMention = patch.mrMention
    if (typeof patch.gitlabBase === 'string' || typeof patch.gitlabToken === 'string' || typeof patch.mrMention === 'string') void refreshMyMrs()
    if (typeof patch.mrProjects === 'string') pushMyMrs()
    if (patch.startView === 'ask' || patch.startView === 'sidebar' || patch.startView === 'dashboard')
      appState.settings.startView = patch.startView
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
  ipcMain.on('open-dashboard', () => openDashboard())
  ipcMain.on('show-sidebar', () => showSidebar())
  ipcMain.on('launch-view', (_e, view: StartView, isRemembered: boolean) => {
    if (view !== 'sidebar' && view !== 'dashboard') return
    if (isRemembered) {
      appState.settings.startView = view
      saveState(statePath, appState)
    }
    launcherWindow?.close()
    openView(view)
  })
  ipcMain.handle(
    'server-start',
    (_e, key: string, cwd: string, spec: ServerSpec, port: number | null, cols: number, rows: number) =>
      startServer(key, cwd, spec, port, cols, rows)
  )
  ipcMain.handle('ide-files', (_e, cwd: string) => ideFiles(cwd))
  ipcMain.handle('ide-status', (_e, cwd: string) => ideStatus(cwd))
  ipcMain.handle('ide-changes', (_e, cwd: string) => ideChanges(cwd))
  ipcMain.handle('ide-ref-changes', (_e, cwd: string, source: string, target: string) => ideRefChanges(cwd, source, target))
  ipcMain.handle('ide-ref-read', (_e, cwd: string, source: string, target: string, rel: string, isBase: boolean) =>
    ideReadRef(cwd, source, target, rel, isBase)
  )
  ipcMain.handle('ide-ref-files', (_e, cwd: string, source: string) => ideRefFiles(cwd, source))
  ipcMain.handle('explain-doc', (_e, key: string) => findExplainFile(key))
  ipcMain.handle('agent-tree', () => {
    const live = new Set(lastSessions.filter((s) => s.isLive).map((s) => s.id))
    return listAgentGroups(projectsDir(), (id) => live.has(id), Date.now())
  })
  ipcMain.handle('agent-run', (_e, sessionId: string, agentId: string) => readAgentRun(projectsDir(), sessionId, agentId))
  ipcMain.handle('explain-start', (_e, key: string, cwd: string, sourceSessionId: string | null) =>
    startExplain(key, cwd, sourceSessionId)
  )
  ipcMain.handle('explain-md-text', (_e, key: string) => {
    const found = findExplainFile(key)
    return found && existsSync(found.mdPath) ? readText(found.mdPath) : null
  })
  ipcMain.on('open-explain-md', (_e, key: string) => {
    const found = findExplainFile(key)
    if (found && existsSync(found.mdPath)) void shell.openPath(found.mdPath)
  })
  ipcMain.handle('ide-read', (_e, cwd: string, rel: string) => ideRead(cwd, rel))
  ipcMain.handle('ide-read-head', (_e, cwd: string, rel: string, isLastCommit?: boolean) => ideReadHead(cwd, rel, isLastCommit === true))
  ipcMain.handle('ide-write', (_e, cwd: string, rel: string, text: string) => ideWrite(cwd, rel, text))
  ipcMain.handle('ticket-detail', (_e, key: string) => {
    const token = appState.settings.jiraToken.trim()
    return token ? fetchTicketDetail(appState.settings.jiraBase, token, key) : null
  })
  ipcMain.on('server-profile', (e, cwd: string) => {
    e.returnValue = serverProfile(cwd)
  })
  ipcMain.on('open-in-chrome', (_e, url: string, key?: string) => {
    if (/^https?:\/\/[a-z0-9.-]+(:\d+)?(\/|$)/i.test(url)) openInChrome(url, typeof key === 'string' && /^[A-Z][A-Z0-9]+-\d+$/.test(key) ? key : null)
  })
  ipcMain.handle('jira-transitions', (_e, key: string) => {
    const token = appState.settings.jiraToken.trim()
    return token ? fetchTransitions(appState.settings.jiraBase, token, key) : null
  })
  ipcMain.handle('jira-transition', async (_e, key: string, id: string) => {
    const token = appState.settings.jiraToken.trim()
    if (!token) return { error: 'Add a Jira token in Settings first' }
    if (!(await doTransition(appState.settings.jiraBase, token, key, id))) return { error: 'Jira did not accept the status change' }
    void refreshMyTasks()
    return { error: null }
  })
  ipcMain.on('server-stop', (_e, key: string) => stopServer(key))
  ipcMain.on('server-write', (_e, key: string, data: string) => serverHost.write(key, data))
  ipcMain.on('server-resize', (_e, key: string, cols: number, rows: number) => serverHost.resize(key, cols, rows))
  ipcMain.on('get-servers', (e) => {
    e.returnValue = [...servers.values()]
  })
  ipcMain.on('server-log', (e, key: string) => {
    e.returnValue = serverLogs.get(key) ?? ''
  })
  ipcMain.on('get-my-mrs', (e) => {
    e.returnValue = myMrs()
  })
  ipcMain.handle('mr-files', (_e, key: string) => mrFiles(key))
  ipcMain.handle('start-review', (_e, key: string) => startReview(key))
  const MR_ACTION_TEXT: Record<MrAction, { question: string; button: string }> = {
    approve: { question: 'Approve this merge request?', button: 'Approve' },
    unapprove: { question: 'Remove your approval from this merge request?', button: 'Unapprove' },
    merge: { question: 'Merge this merge request now?', button: 'Merge' },
    rebase: { question: 'Rebase this merge request onto its target branch?', button: 'Rebase' }
  }
  const confirmMr = async (question: string, button: string, detail: string): Promise<boolean> => {
    const options = { type: 'question' as const, buttons: ['Cancel', button], defaultId: 0, cancelId: 0, title: 'Claude Cockpit', message: question, detail }
    const parent = dashboardWindow && !dashboardWindow.isDestroyed() ? dashboardWindow : null
    const answer = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options)
    return answer.response === 1
  }
  const mrForAction = (key: string): { mr: MrItem; token: string } | null => {
    const mr = mrItems.find((m) => m.key === key)
    const token = appState.settings.gitlabToken.trim()
    return mr && token ? { mr, token } : null
  }
  ipcMain.handle('mr-version-diff', async (_e, key: string, diffId: number, startSha: string, path: string | null) => {
    const mr = mrItems.find((m) => m.key === key)
    const token = appState.settings.gitlabToken.trim()
    if (!mr || !token || !/^[0-9a-f]+$/.test(startSha)) return { files: [], problem: 'This merge request is no longer in your list' }
    return fetchVersionDiff(appState.settings.gitlabBase, token, mr.projectId, mr.iid, diffId, startSha, path)
  })
  ipcMain.handle('mr-branch-folder', async (_e, key: string) => {
    const mr = mrItems.find((m) => m.key === key)
    const repo = mr ? repoForProject(mr.projectPath, repoRoots(lastSessions)) : null
    if (!mr || !repo) return { repo: null, folder: null }
    const list = await runGit(repo, ['worktree', 'list', '--porcelain'])
    const folder = list.isOk ? worktreeForBranch(list.out, mr.sourceBranch) : null
    return { repo, folder: folder ? folder.replace(/\//g, '\\') : null }
  })
  ipcMain.handle('local-hosts', () => listLocalHosts())
  ipcMain.handle('close-chrome', async (_e, key: string | null) => ({ error: await closeChrome(typeof key === 'string' ? key : null) }))
  ipcMain.handle('ticket-server', async (_e, key: string, cwd: string | null) => bridgeRoutes['/server']({ ticket: key, cwd: cwd ?? '' }))
  ipcMain.handle('refresh-lists', async () => {
    forgetApprovals()
    await Promise.all([refreshMyTasks(), refreshMyMrs()])
    return true
  })
  ipcMain.handle('mr-repo', (_e, key: string) => {
    const mr = mrItems.find((m) => m.key === key)
    return mr ? repoForProject(mr.projectPath, repoRoots(lastSessions)) : null
  })
  ipcMain.handle('mr-status', async (_e, key: string) => {
    const found = mrForAction(key)
    if (!found) return { state: null, overview: null, approvals: null, discussions: null, problem: 'This merge request is no longer in your list' }
    return fetchMrStatus(appState.settings.gitlabBase, found.token, found.mr.projectId, found.mr.iid)
  })
  ipcMain.handle('mr-action', async (_e, key: string, action: MrAction, options: MergeOptions | null) => {
    const found = mrForAction(key)
    const text = MR_ACTION_TEXT[action]
    if (!found || !text) return { error: 'This merge request is no longer in your list', isCancelled: false }
    const extras = action === 'merge' && options ? `\n\nSquash commits: ${options.isSquash ? 'yes' : 'no'} · Delete source branch: ${options.isSourceRemoved ? 'yes' : 'no'}` : ''
    const detail = `!${found.mr.iid} ${found.mr.title}\n${found.mr.projectPath} · ${found.mr.sourceBranch} → ${found.mr.targetBranch}${extras}`
    if (!(await confirmMr(text.question, text.button, detail))) return { error: null, isCancelled: true }
    const error = await runMrAction(appState.settings.gitlabBase, found.token, found.mr.projectId, found.mr.iid, action, options ?? null)
    forgetApprovals(key)
    if (!error) void refreshMyMrs()
    return { error, isCancelled: false }
  })
  ipcMain.handle('mr-reply', async (_e, key: string, discussionId: string, body: string) => {
    const found = mrForAction(key)
    if (!found) return { error: 'This merge request is no longer in your list', isCancelled: false }
    if (!body.trim()) return { error: 'The reply is empty', isCancelled: false }
    const preview = body.length > 600 ? `${body.slice(0, 600)}…` : body
    if (!(await confirmMr(`Post this reply on !${found.mr.iid}?`, 'Post reply', preview))) return { error: null, isCancelled: true }
    return { error: await postMrReply(appState.settings.gitlabBase, found.token, found.mr.projectId, found.mr.iid, discussionId, body), isCancelled: false }
  })
  ipcMain.handle('mr-comment', async (_e, key: string, body: string) => {
    const found = mrForAction(key)
    if (!found) return { error: 'This merge request is no longer in your list', isCancelled: false }
    if (!body.trim()) return { error: 'The comment is empty', isCancelled: false }
    const preview = body.length > 600 ? `${body.slice(0, 600)}…` : body
    if (!(await confirmMr(`Post this comment on !${found.mr.iid}?`, 'Post comment', preview))) return { error: null, isCancelled: true }
    return { error: await postMrComment(appState.settings.gitlabBase, found.token, found.mr.projectId, found.mr.iid, body), isCancelled: false }
  })
  ipcMain.on('set-mr-projects-all', (_e, isAll: boolean) => {
    isAllProjects = isAll
    pushMyMrs()
  })
  ipcMain.on('get-starred', (e) => {
    e.returnValue = appState.starred
  })
  ipcMain.on('set-starred', (_e, key: string, isOn: boolean) => {
    const rest = appState.starred.filter((k) => k !== key)
    appState = { ...appState, starred: isOn ? [...rest, key] : rest }
    saveState(statePath, appState)
    sendAll('starred', appState.starred)
  })
  ipcMain.handle('terminal-mode', (_e, id: string) => modeOf(id))
  ipcMain.handle('terminal-open', (_e, id: string, cols: number, rows: number) => openTerminal(id, cols, rows))
  ipcMain.on('terminal-write', (_e, id: string, data: string) => ptyHost.write(id, data))
  ipcMain.on('terminal-resize', (_e, id: string, cols: number, rows: number) => ptyHost.resize(id, cols, rows))
  ipcMain.on('terminal-close', (_e, id: string) => {
    openGuard.cancel(id)
    ptyHost.close(id)
  })
  ipcMain.handle('terminal-send-prompt', (_e, id: string, text: string) => sendPrompt(id, text))
  ipcMain.on('terminal-stop-turn', (_e, id: string) => ptyHost.write(id, STOP_TURN))
  ipcMain.handle('terminal-take-over', (_e, id: string, cols: number, rows: number) => takeOver(id, cols, rows))
  ipcMain.handle('terminal-open-vscode', (_e, id: string) => openTerminalInVscode(id))
  ipcMain.handle('session-detail', (_e, id: string) => sessionDetail(id))
  ipcMain.handle('ticket-description', (_e, key: string) =>
    appState.settings.jiraToken ? fetchDescription(appState.settings.jiraBase, appState.settings.jiraToken, key) : null
  )
  ipcMain.handle('jira-comment', async (_e, key: string, body: string) => {
    const token = appState.settings.jiraToken.trim()
    if (!token) return { error: 'Add a Jira token in Settings first' }
    if (!body.trim()) return { error: 'The comment is empty' }
    return (await postComment(appState.settings.jiraBase, token, key, body)) ? { error: null } : { error: 'Jira did not accept the comment' }
  })
  ipcMain.on('copy-resume', (_e, id: string) => {
    const s = sessionById(id)
    if (s) clipboard.writeText(resumeCommand(s.id, s.ticket))
  })
  ipcMain.handle('worktree-check', (_e, path: string) => checkWorktree(path))
  ipcMain.handle('worktree-delete', (_e, path: string, branch: string) =>
    deleteWorktree(path, branch)
  )
  ipcMain.on('worktree-open', (_e, path: string) => openWorktree(path))
  ipcMain.handle(
    'start-task',
    (_e, key: string, title: string, repo: string, mode: 'vscode' | 'background') =>
      startTask(key, title, repo, mode)
  )
  ipcMain.on('open-task-code', (_e, key: string) => openTaskCode(key))
  ipcMain.on('task-repos', (e) => {
    e.returnValue = { roots: repoRoots(lastSessions), byPrefix: appState.repoByPrefix }
  })
  ipcMain.on('get-my-tasks', (e) => {
    e.returnValue = myTasks
  })
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
  ipcMain.on('read-clipboard', (e) => {
    e.returnValue = clipboard.readText()
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

  if (!process.argv.includes('--hidden')) openView(appState.settings.startView)

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
      wireSessions(mainWindow)
    }
  })
  })
}

app.on('before-quit', () => {
  serverHost.closeAll()
  ptyHost.closeAll()
  console.log('[diag] before-quit')
  ;(app as unknown as { isQuiting?: boolean }).isQuiting = true
  releaseAppBar()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
