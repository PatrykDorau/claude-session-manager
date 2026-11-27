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
  screen,
  powerMonitor
} from 'electron'
import type { NativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import chokidar from 'chokidar'
import icon from '../../resources/icon.png?asset'
import attentionPng from '../../resources/attention.png?asset'
import { STAGES, type Session, type TaskMeta, type InboxItem } from '../renderer/src/types'
import { appendFileSync, rmSync, readdirSync, existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, createReadStream, openSync, readSync, closeSync, fstatSync, statSync, symlinkSync } from 'node:fs'
import { parseTail, countTurns, lastMessages, createDetailCache, pendingRawInput } from './transcript'
import { createPtyHost } from './ptyhost'
import { staleTerminals } from './terminalsweep'
import { createOnDemandWriter } from './ondemandwrite'
import { createStampedCache } from './basecache'
import { pickPort, serverCommand, bashCandidates, isPortFree, DEFAULT_SERVER_COMMAND } from './devserver'
import { stvOptions, webOptions, mergeEnvLocal, stvCommand, serverHost as serverHostName, chromeArgs, sideScreen, isChoiceMismatch, type StvChoice } from './serverprofile'
import { createConnection } from 'node:net'
import type { LocalHost, BranchChanges, ChangedFile, ExplainFile, ReviewDoc, ServerProfile, ServerSpec } from '../renderer/src/types'
import { terminalMode, attachArgs, attachStep, resumeBackgroundArgs, pasteInput, STOP_TURN, createOpenGuard, isHandedOff, type TerminalMode } from './terminal'
import { readdir, readFile } from 'node:fs/promises'
import { join as joinPath, dirname, basename } from 'node:path'
import { createHash } from 'node:crypto'
import { spawn, execFile, execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { release } from 'node:os'
import { scanRaw, type ScanResult } from './scanner'
import { isSameSessions } from './filecache'
import { buildSessions, type RawSession } from './aggregate'
import { pruneSlept, sessionsToSleep, sleepSession, sleptAtOf, type SleepCandidate } from './sleep'
import { normalizePath } from './lock'
import {
  claudeProcesses,
  extractResumeIds,
  runningAttachIds,
  runningAttaches,
  extractAttachPids,
  runningResumePids,
  listAgents,
  type AgentInfo,
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
import { contextAlerts, idleAlerts } from './contextalert'
import { parseHandoffSize, type HandoffSize } from './handoffsize'
import { isHandoffDue, autoHandoffArgs, autoHandoffPrompt } from './autohandoff'
import { findContinuations, carryOver, launchIdsOf, linksToKnown, type Continuations } from './continuation'
import { parseWorkflow, parseHandoffStage, parseAgentFile, parseBoosters } from './flow'
import { collectDigests, ensureGuide, dayStamp, parseInsights, applyProposal, isInsightsDue, dismissedList, withDismissed, latestDay, reportDay, migrateFactoryDir, aggregateDay, expiredDayFiles, recentDayFiles, isEmptyInsights, storedInsights, appliedList, withProposalStates, type InsightsProposal, type DayMetrics, type Incident } from './insights'
import type { InsightsReport, FlowAgent, FlowState, FlowTicket } from '../renderer/src/types'
import { inboxReason, isAnswerCurrent, isFinishedNotifiable, finishedTransitions } from './inbox'
import { parseHistory, type PromptEntry } from './prompthistory'
import {
  createActivityLog,
  staleActivityFiles,
  activityFile,
  parseActivity,
  isIdleMark,
  ACTIVITY_KEEP_DAYS
} from './activitylog'
import { createInterface } from 'node:readline'
import {
  dayOf,
  dayBounds,
  transcriptEvents,
  slimEntry,
  buildDay,
  isDayCacheFresh,
  type AttentionEvent,
  type DayResult
} from './timesheet'
import { recentTranscripts } from './insights'
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
import { worktreeRows, parseCount, isLinkedWorktreeGitFile, branchToDelete, nodeModulesAction, removeWorktreeFolder } from './worktrees'
import { parseWorktreeList, ticketFromBranch, gitlabProjectPath, mrStateOf, parseJiraStatus, isWorktreeFinished, createLimiter } from './worktreeoverview'
import type { WorktreeEntry, WorktreeStatus } from '../renderer/src/types'
import { serverAction, createStartRequests, userStartAnswer, waitingAgentReply } from './serverguard'
import { taskContext, startPrompt, parseBgId, ticketPrefix, repoRoots, startArgs, claudeExeCandidates, attachCommand, repoForProject, reviewArgs, addressArgs, addressFollowUp, scoreArgs, insightsTestArgs, warmUpTask, mediaFiles } from './tasks'
import { searchIssues, fetchDescription, postComment, fetchTransitions, doTransition, fetchTicketDetail, fetchPriority, releaseTransition, unassignIssue, fetchStatus } from './jira'
import { checkRelease, isReleasable, releaseTicket, findTestCases, type ReleaseDeps } from './release'
import { internalReleaseRow, internalReleaseTicket, internalReleaseBlocker, type InternalReleaseDeps } from './internalrelease'
import { isSafeRef, worktreeForBranch, parseStatusPaths, safeRelPath, parseStatus, isNoisePath, parseNameStatus, countChanges, parseGrep, searchArgs, parseNumstat, parseRawBlobs, type CodeMatch, type LineCounts } from './ide'
import { parseExplainDoc, explainArgs, explainName } from './explaindoc'
import { buildCatalog, readCatalogItem, isInsideDir } from './catalog'
import { parseReviewDoc, reviewArgs as reviewPartsArgs, reviewName } from './reviewdoc'
import { fetchMrsToReview, enrichMrs, forgetApprovals, fetchDiffStats, fetchMrSha, isInProjects, reviewState, approvalState, carryEnrichment, pruneApproved, sortMrs, seenShas, fetchBranchMrs } from './gitlab'
import type { JiraTicket, MrFile, MrItem, MyMrs } from '../renderer/src/types'
import {
  loadState,
  saveState,
  DEFAULT_STATE,
  applyWatched,
  applyName,
  applyFinished,
  applyTicketOverride,
  resolveById,
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
import { idleHosts } from './hostidle'
import { dirtyTargets, mergeDirty, isAttachedByCache } from './dirty'
import { playwrightCliPath, pickChromePort, taskChromeProfile, writeTaskMcp, seedProfile, writeTaskMcpFile, taskMcpArgs } from './taskbrowser'
import { writeSessionSettings, sessionSettingsArgs } from './sessionsettings'
import {
  fetchMrStatus,
  runMrAction,
  postMrComment,
  postMrReply,
  fetchVersionDiff,
  fetchMrHead,
  findTicketMr,
  fetchMrDiffFile,
  createDraftNote,
  recreateDraft,
  draftOpsFor,
  updateDraftNote,
  deleteDraftNote,
  publishDraftNotes,
  postLineComment,
  setDiscussionResolved,
  updateNote,
  deleteNote,
  updateMr,
  type MrAction,
  type MergeOptions
} from './mractions'
import { anchorPosition, withDraftTitle, commentableState, reviewConfirm, explanationFiles } from './mrreview'
import type { MrCommentable, MrLineAnchor, MrLinePosition, MrReviewAction, ReleaseResult, ReleaseRow, InternalReleaseRow } from '../renderer/src/types'
import { clearInheritedSessionMarker } from './env'
import { nearestEdge, dockBounds, pickDisplay } from './dock'
import { registerAppBar, unregisterAppBar } from './appbar'
import { fetchUsage } from './usage'
import type { UsageResult } from '../renderer/src/types'
import {
  addLog,
  followSession,
  isClearConfirmed,
  isHandoffHeld,
  isHandoffClockReset,
  handoffStopAction,
  handAddressToLiveTicket,
  AUTO_HANDOFF_LIMIT,
  nextHandoffTick,
  requeueFromRequest,
  isJobOver,
  adoptJob,
  withAdopted,
  withAutonomy,
  isAdopted,
  isPromptSkipping,
  jobId,
  type ClearMark,
  jobsToStart,
  newJob,
  nextJobState,
  queueAddressJob,
  resumePrompt,
  PROMPT_SKIP_WARNING,
  type Autonomy,
  type AutonomyChoice,
  type Job,
  type JobRequest,
  type SessionView
} from './orchestrator'
import {
  appendEvents,
  dispatcherArgs,
  dispatcherStartError,
  eventsSince,
  findDispatcherSession,
  findSessionRef,
  pendingOptions,
  isDispatcherLive,
  jobLogEvents,
  jobRow,
  refusedAnswer,
  refusedPrompt,
  sessionEvents,
  startRequestOf,
  waitingEvent,
  type DispatchEvent,
  type SessionEventInput
} from './dispatcher'
import { decideWaiting, allowedKeys, judgePrompt, judgeArgs, parseVerdict, JUDGE_TIMEOUT_MS, type Verdict } from './judge'
import { isForbiddenRequest } from './guard'
import { parseBots, newHumanNotes, watchAction, watchStep, newCommentsPrompt, parseMrKey, ownMrsToWatch } from './mrwatch'
import { fetchMyUsername, fetchMrState, fetchMrDiscussions, fetchBlobText } from './gitlab'
import { handoffPrompt } from '../renderer/src/dashboard/context'

let mainWindow: BrowserWindow
let tray: Tray
let appState: State = DEFAULT_STATE()
let statePath = ''
const appendActivityLine = (file: string, line: string): void => {
  mkdirSync(dirname(file), { recursive: true })
  appendFileSync(file, line)
}
const pruneActivity = (): void => {
  try {
    const dir = dirname(activityFile(app.getPath('userData'), dayOf(Date.now())))
    if (!existsSync(dir)) return
    for (const name of staleActivityFiles(readdirSync(dir), dayOf(Date.now()), ACTIVITY_KEEP_DAYS))
      rmSync(join(dir, name), { force: true })
  } catch {
    return
  }
}
const activityLog = createActivityLog(app.getPath('userData'), Date.now, appendActivityLine)
const onActivityMark = (_e: unknown, ticket: string | null): void => {
  if (isIdleMark(powerMonitor.getSystemIdleTime())) return
  activityLog.mark(ticket)
}
ipcMain.on('activity-mark', onActivityMark)
app.whenReady().then(pruneActivity)
const readTranscriptEntries = async (
  path: string,
  bounds: { start: number; end: number }
): Promise<Record<string, unknown>[]> => {
  const entries: Record<string, unknown>[] = []
  const lines = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity })
  try {
    for await (const line of lines) {
      try {
        const parsed = JSON.parse(line)
        const slim = parsed && typeof parsed === 'object' ? slimEntry(parsed, bounds) : null
        if (slim) entries.push(slim)
      } catch {
        continue
      }
    }
  } catch {
    return entries
  }
  return entries
}
const readActivityEvents = async (day: string): Promise<AttentionEvent[]> => {
  try {
    return parseActivity(await readFile(activityFile(app.getPath('userData'), day), 'utf8'))
  } catch {
    return []
  }
}
const computeDay = async (day: string): Promise<DayResult> => {
  const bounds = dayBounds(day)
  const events: AttentionEvent[] = []
  try {
    for (const t of recentTranscripts(projectsDir(), bounds.start)) {
      if ((statSync(t.path, { throwIfNoEntry: false })?.birthtimeMs ?? 0) >= bounds.end) continue
      const entries = await readTranscriptEntries(t.path, bounds)
      events.push(...transcriptEvents(entries, homedir(), bounds))
    }
  } catch {
    events.length = 0
  }
  events.push(...(await readActivityEvents(day)))
  return buildDay(day, events, appState.settings.timesheetHours)
}
const dayCache = new Map<string, { at: number; result: DayResult }>()
const dayInFlight = new Map<string, Promise<DayResult>>()
const loadDay = async (key: string, day: string, now: number): Promise<DayResult> => {
  try {
    const result = await computeDay(day)
    dayCache.set(key, { at: now, result })
    return result
  } finally {
    dayInFlight.delete(key)
  }
}
const onTimesheetDay = (_e: unknown, day: string, isForced: boolean): Promise<DayResult> => {
  const now = Date.now()
  const key = `${day}|${appState.settings.timesheetHours}`
  const cached = dayCache.get(key)
  const isFresh = isDayCacheFresh(cached?.at ?? null, day, dayOf(now), now, isForced === true)
  if (cached && isFresh) return Promise.resolve(cached.result)
  const pending = dayInFlight.get(key) ?? loadDay(key, day, now)
  dayInFlight.set(key, pending)
  return pending
}
ipcMain.handle('timesheet-day', onTimesheetDay)
const onSetTimesheetHours = (_e: unknown, hours: unknown): void => {
  const isValid = typeof hours === 'number' && hours >= 1 && hours <= 24
  if (!isValid) return
  appState.settings.timesheetHours = Math.round(hours * 4) / 4
  saveState(statePath, appState)
}
ipcMain.on('set-timesheet-hours', onSetTimesheetHours)
let liveAgentIds = new Set<string>()
let agentStatus = new Map<string, string>()
let cachedRunningIds: string[] = []
let cachedAttaches = new Map<string, number>()
const sleepingSessions = new Map<string, number>()
let attentionIcon: NativeImage | null = null
let dirtyMap: Record<string, boolean> = {}
let changeMap: Record<string, number> = {}
let lastUsage: UsageResult | null = null
let bgAgents = new Map<string, { status: string; name: string | null }>()
let agentNames = new Map<string, string>()
let clearedIds = new Map<string, string>()
let isAutoHandoffRunning = false
let continuations: Continuations = { links: new Map(), seen: new Map(), active: new Map() }
let followLinks = new Map<string, string>()
let activeLinks = new Map<string, string>()
const throughCleared = (links: Map<string, string>): Map<string, string> =>
  new Map(
    [...links]
      .map(([from, to]): [string, string] => [clearedIds.get(from) ?? from, clearedIds.get(to) ?? to])
      .filter(([from, to]) => from !== to)
  )
const triedHandoffs = new Map<string, number>()
const liveSince = new Map<string, number>()
const AUTO_HANDOFF_TIMEOUT = 10 * 60_000
let claudeOk = true
let editorOk = true
let claudeVersion: string | null = null
let lastCounts = { total: 0, live: 0, waiting: 0 }
let menuClosedAt = 0
let lastSessions: Session[] = []
let lastNeedsInputMtimes = new Map<string, number | null>()
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
let lastTurnStatus = new Map<string, Session['status']>()
let viewingSessionId: string | null = null
let pendingInboxNext = false
let isJumpKeyReady = false
let tasksSyncedAt: number | null = null
let mrsSyncedAt: number | null = null
let alertedContext = new Set<string>()
let alertedIdle = new Set<string>()
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
    const ov = resolveById(appState.ticketOverride, s.id)
    const before = [...followLinks].filter(([, to]) => to === s.id).map(([from]) => from)
    const inherited = s.ticket ?? before.map((id) => sessions.find((x) => x.id === id)?.ticket).find((t) => !!t) ?? null
    const next = followLinks.get(s.id)
    return {
      ...s,
      continuedAs: next && sessions.some((x) => x.id === next) ? next : null,
      ticket: overrideTicket(inherited, ov),
      manualTicket: ov !== undefined,
      worktree: !!repo,
      repo: repo ?? null,
      watched: appState.watched.includes(s.id),
      name: resolveById(appState.names, s.id) ?? bgAgents.get(s.id)?.name ?? agentNames.get(s.id) ?? s.name ?? null,
      dirty: dirtyMap[key] ?? false,
      changes: changeMap[key] ?? 0,
      bg: bgAgents.has(s.id),
      sleptAt: sleptAtOf(appState.sleptSessions, sleepingSessions, s.id),
      finished: fin.finished,
      jiraStatus: fin.jiraStatus,
      status
    }
  })
}

async function refreshRunning(): Promise<void> {
  const procs = await claudeProcesses()
  continuations = findContinuations(procs, sessionFiles(), continuations)
  const isKnownSession = (id: string): boolean => !!sessionById(id)
  const nextFollow = linksToKnown(throughCleared(continuations.links), isKnownSession)
  const fresh = [...nextFollow].filter(([from, to]) => followLinks.get(from) !== to)
  followLinks = nextFollow
  activeLinks = linksToKnown(throughCleared(continuations.active), isKnownSession)
  if (fresh.length) {
    for (const [from, to] of fresh) if (ptyHost.isOpen(from) && !ptyHost.isOpen(to)) rekeyTerminal(from, to)
    appState = fresh.reduce((state, [from, to]) => carryOver(state, from, to), appState)
    saveState(statePath, appState)
  }
  cachedRunningIds = [...new Set(extractResumeIds(procs.map((p) => p.commandLine)).map((id) => activeLinks.get(id) ?? id))]
  cachedAttaches = extractAttachPids(procs)
  warnPromptSkips(procs)
}

async function refreshAgents(): Promise<void> {
  const found = await listAgents()
  if (!found) return
  const all = found.map((a) => ({ ...a, sessionId: clearedIds.get(a.sessionId) ?? a.sessionId }))
  const isRunning = (a: AgentInfo): boolean => a.isRunning
  const list = all.filter(isRunning)
  const isNamed = (a: AgentInfo): boolean => !!a.name
  const toNameEntry = (a: AgentInfo): [string, string] => [a.sessionId, a.name as string]
  agentNames = new Map(all.filter(isNamed).map(toNameEntry))
  liveAgentIds = new Set(list.map((a) => a.sessionId))
  agentStatus = new Map(list.map((a) => [a.sessionId, a.status]))
  bgAgents = new Map(
    list.filter((a) => a.kind === 'background').map((a) => [a.sessionId, { status: a.status, name: a.name }])
  )
}

async function refreshDirty(): Promise<void> {
  const isWanted = (s: Session): boolean =>
    !!s.projectPath && (s.isLive || (!!s.ticket && appState.watchedTickets.includes(s.ticket)))
  const folderKeyOf = (s: Session): string => normalizePath(s.projectPath)
  const wanted = new Set(lastSessions.filter(isWanted).map(folderKeyOf))
  const entries = dirtyTargets([...knownFolders.entries()], wanted, existsSync)
  const next: Record<string, boolean> = {}
  const counts: Record<string, number> = {}
  await Promise.all(
    entries.map(async ([key, path]) => {
      const status = await runGit(path, ['status', '--porcelain'])
      next[key] = status.isOk ? status.out.trim().length > 0 : await gitDirty(path)
      counts[key] = status.isOk ? countChanges(status.out) : 0
    })
  )
  const isExistingKey = (key: string): boolean => existsSync(knownFolders.get(key) ?? key)
  dirtyMap = mergeDirty(dirtyMap, next, isExistingKey)
  changeMap = mergeDirty(changeMap, counts, isExistingKey)
}

let lastScan: ScanResult | null = null
let sentSessions: unknown = null
let sentTasks: unknown = null
let sentCloseCandidates: unknown = null
let sentWorktrees: unknown = null

const resetSentSessions = (): void => {
  sentSessions = null
  sentTasks = null
  sentCloseCandidates = null
  sentWorktrees = null
}

const rescan = async (): Promise<void> => {
  lastScan = await scanRaw()
}

const rescanAndPush = async (): Promise<void> => {
  await rescan()
  await pushSessions()
}

async function pushSessions(): Promise<void> {
  if (!mainWindow || !lastScan) return
  const { raw, lockedFolders, cleared } = lastScan
  clearedIds = cleared
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
  const isLiveSession = (s: Session): boolean => s.isLive
  const idOfSession = (s: Session): string => s.id
  const prunedSlept = pruneSlept(appState.sleptSessions, new Set(sessions.filter(isLiveSession).map(idOfSession)))
  if (Object.keys(prunedSlept).length !== Object.keys(appState.sleptSessions).length) {
    appState.sleptSessions = prunedSlept
    saveState(statePath, appState)
  }
  const needsInputEntry = (r: RawSession): [string, number | null] => [r.id, r.needsInputMtimeMs ?? null]
  lastNeedsInputMtimes = new Map(raw.map(needsInputEntry))
  const decorated = decorate(sessions)
  lastSessions = decorated
  runAutoHandoff(decorated, cleared)
  tickJobs()
  lastCounts = {
    total: sessions.length,
    live: sessions.filter((s) => s.isLive).length,
    waiting: sessions.filter((s) => s.status === 'waiting').length
  }
  lastTasks = buildTaskMeta(decorated)
  trackRestore(decorated, lockedFolders.length > 0)
  if (!isSameSessions(sentTasks, lastTasks)) {
    sentTasks = lastTasks
    sendAll('tasks', lastTasks)
  }
  if (!isSameSessions(sentSessions, decorated)) {
    sentSessions = decorated
    sendAll('sessions', decorated)
  }
  const closeCandidatesNow = openCloseCandidates()
  if (!isSameSessions(sentCloseCandidates, closeCandidatesNow)) {
    sentCloseCandidates = closeCandidatesNow
    mainWindow.webContents.send('close-candidates', closeCandidatesNow)
  }
  const rows = worktreeRows(decorated, (path) => existsSync(joinPath(path, '.git')))
  for (const row of rows) {
    const root = parseWorktreeRoot(readText(joinPath(row.path, '.git')) ?? '')
    if (root) linkNodeModules(row.path, root)
  }
  if (!isSameSessions(sentWorktrees, rows)) {
    sentWorktrees = rows
    mainWindow.webContents.send('worktrees', rows)
  }
  updateAttention(sessions, decorated)
  const contextCheck = contextAlerts(sessions.filter((s) => s.isLive), alertedContext)
  alertedContext = contextCheck.alerted
  for (const id of contextCheck.toNotify) {
    const s = sessions.find((x) => x.id === id)
    if (s) notifyContext(s)
  }
  const idleCheck = idleAlerts(sessions.filter((s) => s.isLive), alertedIdle, Date.now())
  alertedIdle = idleCheck.alerted
  for (const id of idleCheck.toNotify) {
    const s = sessions.find((x) => x.id === id)
    if (s) notifyIdle(s)
  }
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
  void rescanAndPush()
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

const isSessionLive = (s: Session): boolean => s.isLive

const checkWorktree = async (
  path: string
): Promise<{ branch: string; isDirty: boolean; unpushed: number; liveSessions: number }> => {
  const ctx = await worktreeContext(path)
  const status = await runGit(path, ['status', '--porcelain'])
  const excluded = ctx?.branch && ctx.branch !== 'HEAD' ? [`--exclude=${ctx.branch}`] : []
  const unpushed = parseCount(
    (await runGit(path, ['rev-list', '--count', 'HEAD', '--not', '--remotes', ...excluded, '--branches'])).out
  )
  return {
    branch: ctx?.target ?? '',
    isDirty: !status.isOk || status.out.trim().length > 0,
    unpushed,
    liveSessions: sessionsAt(path).filter(isSessionLive).length
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
  const isFolderRemoved = removeWorktreeFolder(path)
  const pruned = await runGit(ctx.root, ['worktree', 'prune'])
  const isUnregistered = !existsSync(joinPath(path, '.git'))
  if (!isUnregistered) return { error: pruned.err || 'the worktree folder is in use, close what uses it and retry', notice: null }
  appState = {
    ...appState,
    restore: forgetSessions(
      appState.restore,
      sessionsAt(path).map((s) => s.id)
    )
  }
  saveState(statePath, appState)
  const deleted = ctx.target ? await runGit(ctx.root, ['branch', '-D', ctx.target]) : null
  void rescanAndPush()
  const notices = [
    ...(isFolderRemoved ? [] : [`folder ${path} could not be fully removed (a file is in use), delete it by hand`]),
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

const knownRepoRoots = (): string[] => {
  const roots = new Map<string, string>()
  const toRootPath = (r: { path: string }): string => r.path
  for (const p of [...repoRoots(lastSessions).map(toRootPath), ...Object.values(appState.repoByPrefix)])
    if (!roots.has(normalizePath(p))) roots.set(normalizePath(p), p)
  return [...roots.values()]
}

const listWorktrees = async (): Promise<WorktreeEntry[]> => {
  const listRepoWorktrees = async (root: string): Promise<WorktreeEntry[]> => {
    const res = await runGit(root, ['worktree', 'list', '--porcelain'])
    if (!res.isOk) return []
    const repo = worktreeName(/^worktree (.+)$/m.exec(res.out)?.[1] ?? root)
    const toEntry = (w: { path: string; branch: string | null }): WorktreeEntry => {
      const sessions = sessionsAt(w.path)
      return {
        path: w.path,
        repo,
        name: worktreeName(w.path),
        branch: w.branch,
        sessionCount: sessions.length,
        isLive: sessions.some(isSessionLive)
      }
    }
    return parseWorktreeList(res.out).map(toEntry)
  }
  const lists = await Promise.all(knownRepoRoots().map(listRepoWorktrees))
  const seen = new Set<string>()
  const isFirstSeen = (w: WorktreeEntry): boolean => {
    const key = normalizePath(w.path)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }
  const byRepoAndName = (a: WorktreeEntry, b: WorktreeEntry): number => a.repo.localeCompare(b.repo) || a.name.localeCompare(b.name)
  return lists.flat().filter(isFirstSeen).sort(byRepoAndName)
}

const statusLimit = createLimiter(3)

const isNonBlankLine = (line: string): boolean => !!line.trim()

const readWorktreeStatus = async (path: string): Promise<WorktreeStatus> => {
  const ctx = await worktreeContext(path)
  const branch = ctx?.branch && ctx.branch !== 'HEAD' ? ctx.branch : null
  const [status, revs, remote] = await Promise.all([
    runGit(path, ['status', '--porcelain']),
    runGit(path, ['rev-list', '--count', 'HEAD', '--not', '--remotes', ...(branch ? [`--exclude=${branch}`] : []), '--branches']),
    ctx ? runGit(ctx.root, ['remote', 'get-url', 'origin']) : Promise.resolve(null)
  ])
  const porcelain = status.isOk ? status.out : null
  const unpushed = revs.isOk ? parseCount(revs.out) : null
  const project = remote?.isOk ? gitlabProjectPath(remote.out) : null
  const ticket = ticketFromBranch(branch)
  const gitlabToken = appState.settings.gitlabToken.trim()
  const jiraToken = appState.settings.jiraToken.trim()
  const [mrs, issue] = await Promise.all([
    project && branch && gitlabToken ? fetchBranchMrs(appState.settings.gitlabBase, gitlabToken, project, branch) : null,
    ticket && jiraToken ? fetchStatus(appState.settings.jiraBase, jiraToken, ticket) : null
  ])
  const mrState = mrStateOf(mrs)
  const jira = parseJiraStatus(issue)
  return {
    uncommitted: porcelain === null ? null : porcelain.split(/\r?\n/).filter(isNonBlankLine).length,
    unpushed,
    mrState,
    jiraStatus: jira?.name ?? null,
    isFinished: isWorktreeFinished({ mrState, unpushed, porcelain, jiraCategory: jira?.category ?? null })
  }
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
  tasksSyncedAt = Date.now()
  sendAll('my-tasks', { ...myTasks, syncedAt: tasksSyncedAt })
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
        review: approvalState(m.sha, m.isApprovedByMe, appState.approvedMrs[m.key]) ?? reviewState(m.sha, appState.reviewedMrs[m.key]),
        sessionId: appState.mrSessions[m.key] ?? null,
        ...(priorityOf(m.ticket) ? { priority: priorityOf(m.ticket) } : {})
      }))
  ),
  error: mrError,
  errorDetail: mrErrorDetail,
  isLoading: !isMrsLoaded,
  myName: gitlabMe,
  isAllProjects,
  syncedAt: mrsSyncedAt
})

const pushMyMrs = (): void => sendAll('my-mrs', myMrs())

const isMrKey =
  (key: string) =>
  (m: MrItem): boolean =>
    m.key === key

const markMrSeen = (key: string): void => {
  const mr = mrItems.find(isMrKey(key))
  const seen = mr ? seenShas(mr, { reviewedMrs: appState.reviewedMrs, approvedMrs: appState.approvedMrs }) : null
  if (!seen) return
  appState = { ...appState, ...seen }
  saveState(statePath, appState)
  pushMyMrs()
}

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
      mrItems = carryEnrichment(found.items, mrItems)
      isMrsLoaded = true
      pushMyMrs()
      const wanted = mrItems.filter((m) => isInProjects(m.projectPath, appState.settings.mrProjects))
      const enrichedList = await enrichMrs(appState.settings.gitlabBase, token, wanted, gitlabMe, parseBots(appState.settings.orchestratorBots))
      const enriched = new Map(enrichedList.map((m) => [m.key, m]))
      mrItems = mrItems.map((m) => enriched.get(m.key) ?? m)
      const approvedMrs = pruneApproved(appState.approvedMrs, enrichedList)
      if (Object.keys(approvedMrs).length !== Object.keys(appState.approvedMrs).length) {
        appState = { ...appState, approvedMrs }
        saveState(statePath, appState)
      }
      void watchMrs(token)
    }
    void refreshPriorities()
  }
  isMrsLoaded = true
  mrsSyncedAt = Date.now()
  pushMyMrs()
}

const mrFiles = (key: string): Promise<MrFile[] | null> => {
  const mr = mrItems.find((m) => m.key === key)
  const token = appState.settings.gitlabToken.trim()
  return mr && token ? fetchDiffStats(appState.settings.gitlabBase, token, mr.projectId, mr.iid) : Promise.resolve(null)
}

const startReview = async (key: string, isOrchestrated = false): Promise<{ error: string | null; sessionId?: string }> => {
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
    const out = await spawnBackground(exe, isExisting ? worktree : repo, reviewArgs(mr.iid, mr.url, isExisting), isOrchestrated)
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
    void refreshAgents().then(rescanAndPush)
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

const spawnBackground = (exe: string, cwd: string, args: string[], isOrchestrated = false): Promise<string> =>
  new Promise((resolve) => {
    let out = ''
    const env = { ...process.env }
    delete env.NO_COLOR
    const settingsFile = writeSessionSettings(app.getPath('userData'), appState.settings.gitlabToken.trim(), isOrchestrated)
    const p = spawn(exe, sessionSettingsArgs(args, settingsFile), {
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

const waitForCheckout = async (worktree: string): Promise<boolean> =>
  (await waitForFolder(joinPath(worktree, 'package.json'), 60000)) && existsSync(joinPath(worktree, '.git'))

const isPortAccepting = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })

const waitForPortOpen = async (url: string, timeoutMs: number): Promise<boolean> => {
  const port = Number(new URL(url).port)
  if (!port) return false
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isPortAccepting(port)) return true
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

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
  void rescanAndPush()
  return isOpened
}

const startTask = async (
  key: string,
  title: string,
  repo: string,
  mode: 'vscode' | 'background',
  onWarmUpDone?: () => void,
  isOrchestrated = false
): Promise<{ error: string | null; sessionId?: string }> => {
  if (startingTasks.has(key)) {
    onWarmUpDone?.()
    return { error: 'this ticket is already starting' }
  }
  const exe = resolveClaudeExe()
  if (!exe) {
    onWarmUpDone?.()
    return { error: 'claude.exe not found' }
  }
  startingTasks.add(key)
  let isStarted = false
  let isWarmingUp = false
  try {
    appState = { ...appState, repoByPrefix: { ...appState.repoByPrefix, [ticketPrefix(key)]: repo } }
    saveState(statePath, appState)
    const worktree = taskWorktree(repo, key)
    const isExisting = isLinkedWorktreeGitFile(readText(joinPath(worktree, '.git')) ?? '')
    const mcpConfig = prepareTaskBrowser(key, worktree)
    const prompt = `${startPrompt(appState.settings.startPrompt, key, title)}\n\n${taskContext(key, worktree, repo, new Date())}`
    const out = await spawnBackground(exe, isExisting ? worktree : repo, taskMcpArgs(startArgs(key, prompt, isExisting), mcpConfig), isOrchestrated)
    const shortId = parseBgId(out)
    if (!shortId) return { error: out.trim().split(/\r?\n/).pop() || 'claude did not start' }
    isStarted = true
    const warmUp = (link: () => void): void => {
      isWarmingUp = true
      void warmUpTask({
        waitFolder: () => waitForCheckout(worktree),
        link,
        startServer: async () => (await serverRoute({ ticket: key, cwd: worktree }, true)) as { url?: string; error?: string },
        waitServer: (url) => waitForPortOpen(url, 180000),
        openChrome: (url) => bridgeRoutes['/chrome']({ ticket: key, cwd: worktree, url }),
        log: (message) => console.error(`[warm-up] ${key}: ${message}`)
      }).finally(() => onWarmUpDone?.())
    }
    if (mode === 'background') {
      warmUp(() => linkNodeModules(worktree, repo))
      const id = await waitForSessionId(shortId, 20000)
      if (!id) return { error: null, sessionId: shortId }
      appState = applyTicketOverride(appState, id, key)
      saveState(statePath, appState)
      await refreshAgents()
      void rescanAndPush()
      return { error: null, sessionId: id }
    }
    if (!(await waitForFolder(worktree, 30000))) return { error: 'worktree folder did not appear' }
    linkNodeModules(worktree, repo)
    const id = sessionFiles().find((f) => f.sessionId.startsWith(shortId))?.sessionId ?? shortId
    const isOpened = await attachInVsCode(id, worktree)
    warmUp(() => undefined)
    return { error: isOpened ? null : 'could not open the session in VS Code' }
  } finally {
    if (!isWarmingUp) onWarmUpDone?.()
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
  void rescanAndPush()
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

const sessionTail = (id: string): ReturnType<typeof parseTail> | null => {
  const f = transcriptFile(id)
  try {
    return f ? parseTail(readTailLines(f)) : null
  } catch {
    return null
  }
}

const inboxItem = async (id: string): Promise<InboxItem | null> => {
  const s = sessionById(id)
  const tail = sessionTail(id)
  const reason = s && tail ? inboxReason(s.status, tail) : null
  if (!s || !tail || !reason) return null
  return {
    reason,
    pendingTool: tail.pendingTool,
    isOpaqueRequest: tail.isOpaqueRequest,
    question: tail.question,
    questionOptions: tail.questionOptions,
    messages: sessionDetail(id).messages,
    isWritable: (await modeOf(id)) === 'attach' && !tail.isOpaqueRequest
  }
}

const NOT_PENDING = { error: 'This request is no longer pending' }

const answeredToolUses = new Set<string>()

const isStillPending = (id: string, toolUseId: string): boolean =>
  isAnswerCurrent({ status: sessionById(id)?.status ?? 'closed', toolUseId: sessionTail(id)?.pendingTool?.toolUseId ?? null }, toolUseId)

const answerInbox = async (id: string, toolUseId: string, key: string): Promise<{ error: string | null }> => {
  if (!isStillPending(id, toolUseId)) return NOT_PENDING
  if ((await modeOf(id)) !== 'attach') return { error: 'This session runs outside Cockpit' }
  if (!ptyHost.isOpen(id)) {
    const opened = await openFromMain(id)
    if (opened.error) return opened
  }
  if (!(await waitForQuietOutput(id, true))) return { error: 'Claude is busy in the terminal, so nothing was sent' }
  if (!isStillPending(id, toolUseId) || answeredToolUses.has(toolUseId)) return NOT_PENDING
  answeredToolUses.add(toolUseId)
  ptyHost.write(id, key)
  return { error: null }
}

const dismissInbox = (id: string): void => {
  try {
    rmSync(joinPath(doneDir(), id), { force: true })
  } catch {
    return
  }
  void rescanAndPush()
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
  void refreshRunning()
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

const MAX_SEARCH_MATCHES = 300

const ideSearch = async (cwd: string, query: string, scope: string, isWord: boolean): Promise<CodeMatch[]> => {
  if (!query.trim()) return []
  const res = await runGit(cwd, searchArgs(query, scope, isWord))
  return res.isOk ? parseGrep(res.out, MAX_SEARCH_MATCHES) : []
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

type DiffBase = { base: string; target: string; branch: string }

const diffBases = createStampedCache<DiffBase>(60000)

const headStamp = async (cwd: string): Promise<string | null> => {
  const res = await runGit(cwd, ['rev-parse', 'HEAD', 'origin/HEAD', '--abbrev-ref', 'HEAD'])
  if (res.isOk) return res.out.trim() || null
  const local = await runGit(cwd, ['rev-parse', 'HEAD', '--abbrev-ref', 'HEAD'])
  return local.isOk ? local.out.trim() || null : null
}

const diffBase = (cwd: string): Promise<DiffBase> => {
  const readStamp = (): Promise<string | null> => headStamp(cwd)
  const compute = (): Promise<DiffBase> => computeDiffBase(cwd)
  return diffBases.get(cwd, readStamp, compute)
}

const computeDiffBase = async (cwd: string): Promise<DiffBase> => {
  const branch = (await runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])).out.trim()
  const head = await runGit(cwd, ['rev-parse', '--abbrev-ref', 'origin/HEAD'])
  const target = head.isOk && head.out.trim() ? head.out.trim() : 'HEAD'
  const merge = target === 'HEAD' ? null : await runGit(cwd, ['merge-base', 'HEAD', target])
  return { base: merge?.isOk ? merge.out.trim() : 'HEAD', target, branch }
}

const ideChanges = async (cwd: string): Promise<BranchChanges> => {
  const { base, target, branch } = await diffBase(cwd)
  const [tracked, untracked, status, numstat, headNumstat, head] = await Promise.all([
    runGit(cwd, ['diff', '--name-status', base]),
    runGit(cwd, ['ls-files', '-o', '--exclude-standard']),
    runGit(cwd, ['status', '--porcelain', '--untracked-files=all']),
    runGit(cwd, ['diff', '--numstat', base]),
    runGit(cwd, ['diff', '--numstat', 'HEAD']),
    runGit(cwd, ['rev-parse', 'HEAD'])
  ])
  const counts = parseNumstat(numstat.out)
  const untrackedFiles = untracked.out
    .split(/\r?\n/)
    .filter((path) => path && !isNoisePath(path))
    .map((path) => ({ path, state: 'untracked' as const, ...untrackedCounts(cwd, path), contentId: contentIdOf(cwd, path) }))
  const files = [
    ...parseNameStatus(tracked.out)
      .filter((f) => !isNoisePath(f.path))
      .map((f) => ({ ...f, ...(counts.get(f.path) ?? { added: null, removed: null }), contentId: contentIdOf(cwd, f.path) })),
    ...untrackedFiles
  ]
  const uncommitted = parseStatusPaths(status.out).filter((p) => !isNoisePath(p))
  const uncommittedCounts = Object.fromEntries([
    ...parseNumstat(headNumstat.out),
    ...untrackedFiles.map((f): [string, LineCounts] => [f.path, { added: f.added, removed: f.removed }])
  ])
  return { branch, target: target.replace(/^origin\//, ''), base: base.slice(0, 8), head: head.isOk ? head.out.trim() : undefined, files, folder: cwd, uncommitted, uncommittedCounts }
}

const contentIdOf = (cwd: string, path: string): string => {
  const full = safeRelPath(cwd, path)
  try {
    if (!full) return 'unknown'
    const info = statSync(full)
    if (info.size > MAX_FILE_BYTES) return `${info.size}:${info.mtimeMs}`
    return createHash('sha1').update(readFileSync(full)).digest('hex')
  } catch {
    return 'gone'
  }
}

const untrackedCounts = (cwd: string, path: string): LineCounts => {
  const full = safeRelPath(cwd, path)
  try {
    if (!full || statSync(full).size > MAX_FILE_BYTES) return { added: null, removed: 0 }
    const bytes = readFileSync(full)
    if (bytes.subarray(0, 8000).includes(0)) return { added: null, removed: null }
    const text = bytes.toString('utf8')
    return { added: text ? text.split(/\r?\n/).length - (/\r?\n$/.test(text) ? 1 : 0) : 0, removed: 0 }
  } catch {
    return { added: null, removed: 0 }
  }
}

const refFetchedAt = new Map<string, number>()
const REF_FETCH_MS = 60000

const fetchRefs = async (cwd: string, source: string, target: string): Promise<void> => {
  const key = `${cwd}|${source}|${target}`
  if (Date.now() - (refFetchedAt.get(key) ?? 0) < REF_FETCH_MS) return
  refFetchedAt.set(key, Date.now())
  await runGit(cwd, ['fetch', '--quiet', 'origin', source, target])
  refBases.drop(key)
}

const refBases = createStampedCache<string | null>(REF_FETCH_MS)

const noStamp = async (): Promise<string> => ''

const refBase = async (cwd: string, source: string, target: string): Promise<string | null> => {
  const key = `${cwd}|${source}|${target}`
  const compute = (): Promise<string | null> => computeRefBase(cwd, source, target)
  const base = await refBases.get(key, noStamp, compute)
  if (base === null) refBases.drop(key)
  return base
}

const computeRefBase = async (
  cwd: string,
  source: string,
  target: string
): Promise<string | null> => {
  const merge = await runGit(cwd, ['merge-base', `origin/${target}`, `origin/${source}`])
  return merge.isOk ? merge.out.trim() : null
}

const ideRefChanges = async (cwd: string, source: string, target: string, isPushedOnly = false): Promise<BranchChanges> => {
  if (isPushedOnly && (!isSafeRef(source) || !isSafeRef(target))) return { branch: source, target, base: '', files: [], isReadOnly: true }
  if (!isPushedOnly) {
    const branch = (await runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])).out.trim()
    if (!isSafeRef(source) || !isSafeRef(target) || branch === source) return ideChanges(cwd)
    const list = await runGit(cwd, ['worktree', 'list', '--porcelain'])
    const local = list.isOk ? worktreeForBranch(list.out, source) : null
    if (local && existsSync(local)) return ideChanges(local.replace(/\//g, '\\'))
  }
  await fetchRefs(cwd, source, target)
  const base = await refBase(cwd, source, target)
  if (!base) return { branch: source, target, base: '', files: [], isReadOnly: true }
  const [diff, numstat, raw] = await Promise.all([
    runGit(cwd, ['diff', '--name-status', base, `origin/${source}`]),
    runGit(cwd, ['diff', '--numstat', base, `origin/${source}`]),
    runGit(cwd, ['diff', '--raw', base, `origin/${source}`])
  ])
  const counts = parseNumstat(numstat.out)
  const blobs = parseRawBlobs(raw.out)
  const files = parseNameStatus(diff.out)
    .filter((f) => !isNoisePath(f.path))
    .map((f) => ({ ...f, ...(counts.get(f.path) ?? { added: null, removed: null }), contentId: blobs.get(f.path) ?? null }))
  return { branch: source, target, base: base.slice(0, 8), files, isReadOnly: true }
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

const startNamedBackground = async (
  starting: Set<string>,
  busy: string,
  key: string,
  cwd: string,
  args: () => string[],
  name: string
): Promise<{ error: string | null; sessionId?: string }> => {
  if (starting.has(key)) return { error: busy }
  const exe = resolveClaudeExe()
  if (!exe) return { error: 'claude.exe not found' }
  if (!existsSync(cwd)) return { error: `Folder not found: ${cwd}` }
  starting.add(key)
  try {
    const out = await spawnBackground(exe, cwd, args())
    const shortId = parseBgId(out)
    if (!shortId) return { error: out.trim().split(/\r?\n/).pop() || 'claude did not start' }
    const id = (await waitForSessionId(shortId, 10000)) ?? shortId
    appState = applyTicketOverride(appState, id, key)
    appState = applyName(appState, id, name)
    saveState(statePath, appState)
    void refreshAgents().then(rescanAndPush)
    return { error: null, sessionId: id }
  } finally {
    setTimeout(() => starting.delete(key), 30000)
  }
}

const startExplain = (key: string, cwd: string, sourceSessionId: string | null): Promise<{ error: string | null; sessionId?: string }> => {
  const buildExplainArgs = (): string[] => {
    const transcript = sourceSessionId ? transcriptFile(sourceSessionId) : null
    return explainArgs(key, transcript ? transcript.replace(/\\/g, '/') : null)
  }
  return startNamedBackground(startingExplains, 'The explanation is already starting', key, cwd, buildExplainArgs, explainName(key))
}

const startingReviewParts = new Set<string>()

const startReviewParts = (
  key: string,
  cwd: string,
  mr: { iid: number; source: string; target: string } | null
): Promise<{ error: string | null; sessionId?: string }> => {
  const buildReviewArgs = (): string[] => reviewPartsArgs(key, mr)
  return startNamedBackground(startingReviewParts, 'The review in parts is already starting', key, cwd, buildReviewArgs, reviewName(key))
}

const INSIGHTS_DIR = joinPath(homedir(), '.claude', 'insights')
const LEGACY_FACTORY_DIR = joinPath(homedir(), '.claude', 'factory')
const INSIGHTS_WINDOW = 24 * 3_600_000
const INSIGHTS_TIMEOUT = 15 * 60_000
const INSIGHTS_CHECK = 3_600_000
let isInsightsRunning = false
let insightsError: string | null = null

const insightsPath = (...parts: string[]): string => joinPath(INSIGHTS_DIR, ...parts)

const readJson = (path: string): unknown => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

const pushInsights = (): void => sendToDashboard('insights-changed')

const runScoring = (exe: string, day: string): Promise<{ error: string | null }> =>
  new Promise((resolve) => {
    const env = { ...process.env }
    delete env.NO_COLOR
    let errorText = ''
    let output = ''
    let isTimedOut = false
    const p = spawn(exe, scoreArgs(day, homedir().replace(/\\/g, '/')), {
      cwd: INSIGHTS_DIR,
      shell: false,
      windowsHide: true,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    p.stdout?.on('data', (d: Buffer) => {
      output += d.toString()
    })
    const timer = setTimeout(() => {
      isTimedOut = true
      if (p.pid) void killProcess(p.pid, true)
      else p.kill()
    }, INSIGHTS_TIMEOUT)
    p.stderr?.on('data', (d: Buffer) => {
      errorText = (errorText + d.toString()).slice(-2000)
    })
    p.on('error', (e) => {
      clearTimeout(timer)
      resolve({ error: e.message })
    })
    p.on('close', (code) => {
      clearTimeout(timer)
      if (isTimedOut) return resolve({ error: 'The scoring run did not finish within 15 min' })
      if (code === 0 && output.trim()) {
        const parsed = parseInsights(output, { home: homedir(), day, applied: insightsApplied(), dismissed: insightsDismissed() })
        if (isEmptyInsights(parsed)) return resolve({ error: 'The analysis returned no usable JSON' })
        writeDayJson('findings', day, parsed)
      }
      resolve({ error: code === 0 ? null : errorText.trim().split(/\r?\n/).pop() || `claude exited with code ${code}` })
    })
  })

const pruneInsights = (day: string): void => {
  for (const dir of ['metrics', 'incidents', 'findings']) {
    for (const name of expiredDayFiles(listDir(insightsPath(dir)), day)) {
      try {
        if (statSync(insightsPath(dir, name)).isFile()) rmSync(insightsPath(dir, name), { force: true })
      } catch (e) {
        console.error('[insights] prune failed:', name, e)
      }
    }
  }
}

const writeDayJson = (dir: string, day: string, value: unknown): void => {
  mkdirSync(insightsPath(dir), { recursive: true })
  writeFileSync(insightsPath(dir, `${day}.json`), JSON.stringify(value, null, 2), 'utf8')
}

const runInsights = async (): Promise<{ error: string | null }> => {
  if (isInsightsRunning) return { error: 'Insights is already running' }
  const exe = resolveClaudeExe()
  if (!exe) return { error: 'claude.exe not found' }
  isInsightsRunning = true
  pushInsights()
  const now = Date.now()
  const day = dayStamp(new Date(now))
  let result: { error: string | null } = { error: null }
  try {
    migrateFactoryDir(LEGACY_FACTORY_DIR, INSIGHTS_DIR)
    ensureGuide(insightsPath('guide.md'))
    if (!existsSync(insightsPath('dismissed.json'))) writeFileSync(insightsPath('dismissed.json'), '[]', 'utf8')
    const sizeOf = (ticket: string): HandoffSize | null => {
      const handoff = findHandoff(ticket)
      return handoff ? handoffSizeOf(handoff) : null
    }
    pruneInsights(day)
    const collected = await collectDigests(projectsDir(), now - INSIGHTS_WINDOW, sizeOf, homedir())
    if (collected.digests.length) {
      writeDayJson('metrics', day, aggregateDay(day, collected.digests))
      writeDayJson('incidents', day, collected.incidents)
      result = await runScoring(exe, day)
    }
  } catch (e) {
    result = { error: e instanceof Error ? e.message : String(e) }
  } finally {
    appState = { ...appState, insightsLastRun: now }
    saveState(statePath, appState)
    insightsError = result.error
    isInsightsRunning = false
    pushInsights()
  }
  return result
}

const checkInsights = (): void => {
  if (isInsightsDue(appState.insightsLastRun, Date.now())) void runInsights()
}

const insightsDay = (): string | null => latestDay(listDir(insightsPath('findings')))

const insightsResult = (day: string | null) => (day ? storedInsights(readJson(insightsPath('findings', `${day}.json`)), homedir()) : null)

const insightsProposal = (id: string): InsightsProposal | null => insightsResult(insightsDay())?.proposals.find((p) => p.id === id) ?? null

const insightsDismissed = (): ReturnType<typeof dismissedList> => dismissedList(readJson(insightsPath('dismissed.json')))

const insightsApplied = (): ReturnType<typeof appliedList> => appliedList(readJson(insightsPath('applied.json')))

const insightsReport = (): InsightsReport => {
  const result = insightsResult(insightsDay())
  const day = reportDay(listDir(insightsPath('findings')), listDir(insightsPath('metrics')))
  const incidents = day ? readJson(insightsPath('incidents', `${day}.json`)) : null
  return {
    day,
    result: result ? withProposalStates(result, insightsDismissed(), insightsApplied()) : null,
    history: recentDayFiles(listDir(insightsPath('metrics'))).flatMap((name) => {
      const metrics = readJson(insightsPath('metrics', name))
      return metrics ? [metrics as DayMetrics] : []
    }),
    incidents: Array.isArray(incidents) ? (incidents as Incident[]) : [],
    applied: insightsApplied(),
    isRunning: isInsightsRunning,
    lastRun: appState.insightsLastRun,
    lastError: insightsError
  }
}

const confirmInsights = async (p: InsightsProposal): Promise<boolean> => {
  const options = {
    type: 'question' as const,
    buttons: ['Cancel', 'Apply'],
    defaultId: 0,
    cancelId: 0,
    title: 'Claude Cockpit',
    message: `Apply "${p.title}"?`,
    detail: `${p.target}\n\n${p.why}\n\n- ${p.find}\n\n+ ${p.replace}`
  }
  const parent = dashboardWindow && !dashboardWindow.isDestroyed() ? dashboardWindow : null
  const answer = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options)
  return answer.response === 1
}

const applyInsightsProposal = async (id: string): Promise<{ error: string | null }> => {
  const p = insightsProposal(id)
  if (!p) return { error: 'Proposal not found' }
  if (insightsApplied().some((a) => a.id === id)) return { error: 'Already applied' }
  if (!(await confirmInsights(p))) return { error: 'cancelled' }
  const text = readText(p.target)
  if (text === null) return { error: `Cannot read ${p.target}` }
  const result = applyProposal(text, p)
  if ('error' in result) return { error: result.error }
  try {
    writeFileSync(p.target, result.text, 'utf8')
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
  let recordError: string | null = null
  try {
    const entry = { id: p.id, target: p.target, title: p.title, day: dayStamp(new Date()), metric: p.metric }
    const stored = readJson(insightsPath('applied.json'))
    mkdirSync(INSIGHTS_DIR, { recursive: true })
    writeFileSync(insightsPath('applied.json'), JSON.stringify([...(Array.isArray(stored) ? stored : []), entry], null, 2), 'utf8')
  } catch (e) {
    recordError = `Applied, but not recorded in applied.json: ${e instanceof Error ? e.message : String(e)}`
  }
  pushInsights()
  return { error: recordError }
}

const dismissInsightsProposal = (id: string): { error: string | null } => {
  const p = insightsProposal(id)
  if (!p) return { error: 'Proposal not found' }
  try {
    mkdirSync(INSIGHTS_DIR, { recursive: true })
    writeFileSync(insightsPath('dismissed.json'), JSON.stringify(withDismissed(insightsDismissed(), p), null, 2), 'utf8')
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
  pushInsights()
  return { error: null }
}

const testInsightsProposal = async (id: string): Promise<{ error: string | null; sessionId?: string }> => {
  const p = insightsProposal(id)
  if (!p) return { error: 'Proposal not found' }
  const exe = resolveClaudeExe()
  if (!exe) return { error: 'claude.exe not found' }
  const out = await spawnBackground(exe, joinPath(homedir(), '.claude'), insightsTestArgs(p))
  const shortId = parseBgId(out)
  if (!shortId) return { error: out.trim().split(/\r?\n/).pop() || 'claude did not start' }
  const sessionId = (await waitForSessionId(shortId, 10000)) ?? shortId
  void refreshAgents().then(rescanAndPush)
  return { error: null, sessionId }
}

const branchFolder = async (repo: string, branch: string): Promise<string | null> => {
  const list = await runGit(repo, ['worktree', 'list', '--porcelain'])
  const folder = list.isOk ? worktreeForBranch(list.out, branch) : null
  return folder ? folder.replace(/\//g, '\\') : null
}

const addBranchWorktree = async (repo: string, key: string, branch: string): Promise<string | null> => {
  const worktree = taskWorktree(repo, key)
  if (existsSync(worktree)) return null
  await runGit(repo, ['fetch', 'origin', branch])
  const added = await runGit(repo, ['worktree', 'add', worktree, branch])
  if (!added.isOk) return null
  linkNodeModules(worktree, repo)
  return worktree
}

const handoffMtime = (path: string | null): number | null => {
  if (!path) return null
  try {
    return statSync(path).mtimeMs
  } catch {
    return null
  }
}

const runAutoHandoff = (sessions: Session[], cleared: Map<string, string>): void => {
  const now = Date.now()
  for (const id of liveSince.keys()) if (!sessions.some((x) => x.id === id && x.isLive)) liveSince.delete(id)
  for (const x of sessions) if (x.isLive && !liveSince.has(x.id)) liveSince.set(x.id, now)
  if (isAutoHandoffRunning) return
  const isUntried = (x: Session): boolean => triedHandoffs.get(x.id) !== x.lastActive
  const isDue = (x: Session, handoffAt: number | null): boolean => !/\bexplain$| review$/.test(x.name ?? '') && isHandoffDue({ ...x, liveSince: liveSince.get(x.id) ?? now }, handoffAt, now)
  const s = sessions.find((x) => {
    if (!x.ticket || !isUntried(x) || !isDue(x, null)) return false
    if (isDue(x, handoffMtime(findHandoff(x.ticket)))) return true
    triedHandoffs.set(x.id, x.lastActive)
    return false
  })
  if (!s?.ticket || !s.projectPath) return
  const exe = resolveClaudeExe()
  if (!exe) return
  const ticket = s.ticket
  triedHandoffs.set(s.id, s.lastActive)
  const existing = findHandoff(ticket)
  const month = `${String(new Date(now).getMonth() + 1).padStart(2, '0')}-${new Date(now).getFullYear()}`
  const path = existing ?? joinPath(opisDir(), month, ticket, 'handoff.md')
  const resumeId = [...cleared].find(([, root]) => root === s.id)?.[0] ?? s.id
  const env = { ...process.env }
  delete env.NO_COLOR
  isAutoHandoffRunning = true
  const p = spawn(exe, autoHandoffArgs(resumeId, autoHandoffPrompt(path, ticket), opisDir()), {
    cwd: s.projectPath,
    shell: false,
    windowsHide: true,
    env,
    stdio: 'ignore'
  })
  let isDone = false
  const timer = setTimeout(() => {
    if (p.pid) void killProcess(p.pid, true)
    else p.kill()
    finish('timeout')
  }, AUTO_HANDOFF_TIMEOUT)
  const finish = (result: string | number | null): void => {
    if (isDone) return
    isDone = true
    clearTimeout(timer)
    isAutoHandoffRunning = false
    console.log('[auto-handoff]', ticket, result)
  }
  p.on('error', (e) => finish(e.message))
  p.on('close', finish)
}

const findHandoff = (ticket: string): string | null => {
  const candidates = listDir(opisDir()).flatMap((month) => {
    const path = joinPath(opisDir(), month, ticket, 'handoff.md')
    try {
      return [{ path, updatedAt: statSync(path).mtimeMs }]
    } catch {
      return []
    }
  })
  return candidates.sort((a, b) => b.updatedAt - a.updatedAt)[0]?.path ?? null
}

const handoffSizeOf = (path: string): HandoffSize | null => {
  try {
    return parseHandoffSize(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

const FLOW_SKILL = joinPath(homedir(), '.claude', 'skills', 'task-workflow', 'SKILL.md')

const flowTicket = (key: string): FlowTicket => {
  const path = findHandoff(key)
  const text = path ? readText(path) : null
  if (!text) return { key, n: null, stage: '', next: '', firstStep: '', size: null, risk: null }
  const size = parseHandoffSize(text)
  return { key, ...parseHandoffStage(text), size: size?.size ?? null, risk: size?.risk ?? null }
}

const FLOW_AGENTS = joinPath(homedir(), '.claude', 'agents')
const FLOW_SETTINGS = joinPath(homedir(), '.claude', 'settings.json')

const flowAgents = (): FlowAgent[] =>
  listDir(FLOW_AGENTS)
    .filter((file) => file.endsWith('.md'))
    .flatMap((file) => parseAgentFile(readText(joinPath(FLOW_AGENTS, file)) ?? '') ?? [])

const flowState = (keys: string[]): FlowState => {
  const raw = readText(FLOW_SKILL)
  const agents = flowAgents()
  const names = agents.map((a) => a.name)
  const skill = raw === null ? { stages: [], sizes: [], risk: [], error: 'SKILL.md not found' } : parseWorkflow(raw, names)
  const updatedAt = raw === null ? 0 : (statSync(FLOW_SKILL, { throwIfNoEntry: false })?.mtimeMs ?? 0)
  const boosters = parseBoosters(readText(FLOW_SETTINGS) ?? '')
  return { skill, raw: raw ?? '', skillPath: FLOW_SKILL, updatedAt, tickets: keys.map(flowTicket), agents, boosters }
}

const readExplanations = (ticket: string): Record<string, string> => {
  const folders = listDir(opisDir())
    .map((month) => joinPath(opisDir(), month, ticket, 'odpowiedzi-cr'))
    .flatMap((dir) => {
      try {
        return [{ dir, updatedAt: statSync(joinPath(dir, 'index.json')).mtimeMs }]
      } catch {
        return []
      }
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
  const dir = folders[0]?.dir
  if (!dir) return {}
  try {
    const files = explanationFiles(JSON.parse(readFileSync(joinPath(dir, 'index.json'), 'utf8').replace(/^﻿/, '')))
    return Object.fromEntries(
      Object.entries(files).flatMap(([id, file]) => {
        const text = readText(joinPath(dir, file))
        return text ? [[id, text.slice(0, 20000)]] : []
      })
    )
  } catch {
    return {}
  }
}

const startingAddress = new Set<string>()

const startAddress = async (key: string, isOrchestrated = false): Promise<{ error: string | null; sessionId?: string }> => {
  const mr = mrItems.find((m) => m.key === key)
  if (!mr) return { error: 'merge request not found' }
  if (startingAddress.has(key)) return { error: 'Addressing comments is already starting' }
  const repo = repoForProject(mr.projectPath, repoRoots(lastSessions))
  if (!repo) return { error: `No local repo for ${mr.projectName}` }
  const exe = resolveClaudeExe()
  if (!exe) return { error: 'claude.exe not found' }
  startingAddress.add(key)
  let isStarted = false
  try {
    const ticket = mr.ticket ?? `MR-${mr.iid}`
    const isAddressSession = (s: Session): boolean => s.name === `${ticket}-cr`
    const byRecent = (a: Session, b: Session): number => b.lastActive - a.lastActive
    const previous = lastSessions.filter(isAddressSession).sort(byRecent)[0]
    if (previous) {
      const sent = await sendPrompt(previous.id, addressFollowUp(mr.iid, mr.url))
      if (sent.error) return sent
      isStarted = true
      appState = { ...appState, mrSessions: { ...appState.mrSessions, [key]: previous.id } }
      saveState(statePath, appState)
      pushMyMrs()
      return { error: null, sessionId: previous.id }
    }
    const folder = (await branchFolder(repo, mr.sourceBranch)) ?? (await addBranchWorktree(repo, ticket, mr.sourceBranch))
    const mcpConfig = folder ? prepareTaskBrowser(ticket.toUpperCase(), folder) : null
    const handoff = findHandoff(ticket)
    const model = handoff && handoffSizeOf(handoff)?.risk === 'critical' ? 'opus' : 'sonnet'
    const args = addressArgs({ iid: mr.iid, url: mr.url, ticket, folder, repo, branch: mr.sourceBranch, handoff, model })
    const out = await spawnBackground(exe, folder ?? repo, taskMcpArgs(args, mcpConfig), isOrchestrated)
    const shortId = parseBgId(out)
    if (!shortId) return { error: out.trim().split(/\r?\n/).pop() || 'claude did not start' }
    isStarted = true
    const id = (await waitForSessionId(shortId, 10000)) ?? shortId
    appState = applyTicketOverride(appState, id, ticket)
    appState = { ...appState, mrSessions: { ...appState.mrSessions, [key]: id } }
    saveState(statePath, appState)
    pushMyMrs()
    void refreshAgents().then(rescanAndPush)
    return { error: null, sessionId: id }
  } finally {
    if (isStarted) setTimeout(() => startingAddress.delete(key), 30000)
    else startingAddress.delete(key)
  }
}

const STARTING_SLOT_MS = 120_000
const HANDOFF_STALL_MS = 5 * 60_000
const JOB_REQUEST_KINDS = ['ticket', 'review', 'watch']
const launchingJobs = new Map<string, number>()
const jobStatus = new Map<string, Session['status']>()
const turnStarts = new Map<string, number>()
const phaseSince = new Map<string, number>()
const clearSentAt = new Map<string, number>()
const clearMarks = new Map<string, ClearMark>()
const waitMarks = new Map<string, string>()
const transcriptPaths = new Map<string, string>()
const busyJobs = new Set<string>()
const judgedToolUses = new Set<string>()
const announcedToolUses = new Set<string>()
const dispatcherWaits = new Map<string, string>()
const warnedSkips = new Set<string>()
let dispatchEvents: DispatchEvent[] = []
let sessionStatuses: Record<string, Session['status']> = {}
const FEED_ID = Date.now()
let gitlabUsername: string | null = null
let isWatchingMrs = false

const dispatcherLive = (): boolean => {
  const id = appState.orchestrator.dispatcherSessionId
  return isDispatcherLive(findDispatcherSession(lastSessions, id)?.status ?? null)
}

let isDispatcherStarting = false

const openDispatcher = async (): Promise<{ error: string | null; sessionId?: string }> => {
  const known = findDispatcherSession(lastSessions, appState.orchestrator.dispatcherSessionId)
  if (known && dispatcherLive()) return { error: null, sessionId: known.id }
  if (isDispatcherStarting) return { error: 'dispatcher is already starting' }
  const exe = resolveClaudeExe()
  if (!exe) return { error: 'claude.exe not found' }
  isDispatcherStarting = true
  try {
    const out = await spawnBackground(exe, joinPath(homedir(), '.claude'), dispatcherArgs(), true)
    const shortId = parseBgId(out)
    if (!shortId) return { error: dispatcherStartError(out) }
    const id = (await waitForSessionId(shortId, 10000)) ?? shortId
    appState = { ...appState, orchestrator: { ...appState.orchestrator, dispatcherSessionId: id } }
    saveState(statePath, appState)
    sendAll('orchestrator', appState.orchestrator)
    await refreshAgents()
    await rescanAndPush()
    return { error: null, sessionId: findDispatcherSession(lastSessions, id)?.id ?? id }
  } finally {
    isDispatcherStarting = false
  }
}

const setJobs = (jobs: Job[]): void => {
  dispatchEvents = appendEvents(dispatchEvents, jobLogEvents(appState.orchestrator.jobs, jobs, Date.now()))
  appState = { ...appState, orchestrator: { ...appState.orchestrator, jobs } }
  saveState(statePath, appState)
  sendAll('orchestrator', appState.orchestrator)
}

const updateJob = (id: string, fn: (job: Job) => Job): void => {
  if (!appState.orchestrator.jobs.some((j) => j.id === id)) return
  setJobs(appState.orchestrator.jobs.map((j) => (j.id === id ? fn(j) : j)))
}

const logJob = (id: string, text: string): void => updateJob(id, (j) => addLog(j, text, Date.now()))

const findJob = (id: string): Job | undefined => appState.orchestrator.jobs.find((j) => j.id === id)

const boundSessionId = (id: string, links: Map<string, string>): string => {
  const rebound = followSession(id, links, lastSessions.map((s) => s.id))
  return sessionById(rebound) ? rebound : id
}

const sessionViewOf = (s: Session | undefined): SessionView | null =>
  s ? { id: s.id, status: s.status, ticket: s.ticket, isLive: s.isLive, isAsleep: !!s.sleptAt } : null

const orchestratorLiveKeys = (): Set<string> => {
  const links = throughCleared(continuations.links)
  const isLiveId = (id: string): boolean => !!sessionById(boundSessionId(id, links))?.isLive
  return new Set([
    ...lastSessions.flatMap((s) => (s.isLive && s.ticket ? [s.ticket] : [])),
    ...Object.entries(appState.mrSessions).flatMap(([key, id]) => (isLiveId(id) ? [key] : []))
  ])
}

const mrTicketMap = (): Map<string, string> =>
  new Map(mrItems.flatMap((m): [string, string][] => (m.ticket ? [[m.key, m.ticket.toUpperCase()]] : [])))

const addressSessionId = (key: string, links: Map<string, string>): string | null => {
  const mrSession = appState.mrSessions[key]
  const sessionId = mrSession ? boundSessionId(mrSession, links) : null
  if (sessionId && sessionById(sessionId)?.isLive) return sessionId
  const ticket = mrTicketMap().get(key)
  return (ticket && lastSessions.find((s) => s.isLive && s.ticket?.toUpperCase() === ticket)?.id) || sessionId
}

const startJob = async (job: Job): Promise<void> => {
  const onWarmUpDone = (): void => {
    launchingJobs.delete(job.id)
    updateJob(job.id, (j) => (j.state === 'starting' ? addLog({ ...j, state: 'working' }, 'warm-up done', Date.now()) : j))
    pumpQueue()
  }
  const launch = (): Promise<{ error: string | null; sessionId?: string }> => {
    if (job.kind === 'review') return startReview(job.key, true)
    if (job.kind === 'address') return startAddress(job.key, true)
    if (!job.repo) return Promise.resolve({ error: 'no repo chosen for this ticket' })
    return startTask(job.key, job.title, job.repo, 'background', onWarmUpDone, true)
  }
  const result = await launch().catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e), sessionId: undefined }))
  if (result.error) {
    launchingJobs.delete(job.id)
    updateJob(job.id, (j) => addLog({ ...j, state: 'failed' }, `start failed: ${result.error}`, Date.now()))
    pumpQueue()
    return
  }
  updateJob(job.id, (j) => addLog({ ...j, sessionId: result.sessionId ?? j.sessionId }, 'session started', Date.now()))
}

const pumpQueue = (): void => {
  if (!isProcessScanReady || !isMrsLoaded || !appState.orchestrator.jobs.some((j) => j.state === 'queued')) return
  const liveKeys = orchestratorLiveKeys()
  const mrTickets = mrTicketMap()
  const handed = handAddressToLiveTicket(appState.orchestrator.jobs, liveKeys, mrTickets, Date.now())
  if (handed !== appState.orchestrator.jobs) setJobs(handed)
  const toStart = jobsToStart(appState.orchestrator, appState.settings.orchestratorMaxParallel, liveKeys, mrTickets)
  if (!toStart.length) return
  const now = Date.now()
  const ids = new Set(toStart.map((j) => j.id))
  for (const id of ids) launchingJobs.set(id, now)
  setJobs(appState.orchestrator.jobs.map((j) => (ids.has(j.id) ? addLog({ ...j, state: 'starting' }, 'starting', now) : j)))
  for (const job of toStart) void startJob(job)
}

const runJudge = (prompt: string, allowed: string[]): Promise<Verdict> =>
  new Promise((resolve) => {
    const escalate = (reason: string): Verdict => ({ action: 'escalate', key: null, reason })
    const exe = resolveClaudeExe()
    if (!exe) return resolve(escalate('claude.exe not found'))
    let out = ''
    const env = { ...process.env }
    delete env.NO_COLOR
    const p = spawn(exe, judgeArgs(prompt), {
      cwd: homedir(),
      shell: false,
      windowsHide: true,
      env,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    let isDone = false
    const finish = (verdict: Verdict): void => {
      if (isDone) return
      isDone = true
      clearTimeout(timer)
      resolve(verdict)
    }
    const timer = setTimeout(() => {
      if (p.pid) void killProcess(p.pid, true)
      else p.kill()
      finish(escalate('judge timed out'))
    }, JUDGE_TIMEOUT_MS)
    p.stdout?.on('data', (d: Buffer) => (out += d.toString()))
    p.on('error', (e) => finish(escalate(`judge failed: ${e.message}`)))
    p.on('close', (code) => finish(code === 0 ? parseVerdict(out, allowed) : escalate(`judge exited with ${code}`)))
  })

const handleWaiting = async (id: string, sessionId: string): Promise<void> => {
  const file = cachedTranscript(sessionId)
  const lines = file ? readTailLines(file) : []
  const tail = parseTail(lines)
  const pending = tail.pendingTool
  const rawInput = pendingRawInput(lines)
  const job = findJob(id)
  const isDispatcherUp = dispatcherLive()
  if (!isDispatcherUp) dispatcherWaits.delete(id)
  if (!job || (pending && judgedToolUses.has(pending.toolUseId))) return
  if (pending && !announcedToolUses.has(pending.toolUseId)) {
    announcedToolUses.add(pending.toolUseId)
    dispatchEvents = appendEvents(dispatchEvents, [waitingEvent(job, pending, tail.questionOptions, Date.now())])
  }
  if (pending && job.autonomy === 'autonomous' && isDispatcherUp) {
    if (dispatcherWaits.get(id) === pending.toolUseId) return
    dispatcherWaits.set(id, pending.toolUseId)
    return logJob(id, 'waiting for the dispatcher')
  }
  const decision = decideWaiting(job.autonomy, pending, rawInput, (await modeOf(sessionId)) === 'attach')
  if (decision === 'escalate' || !pending) {
    if (pending) judgedToolUses.add(pending.toolUseId)
    if (job.autonomy !== 'manual') logJob(id, 'escalated: needs your answer')
    return
  }
  judgedToolUses.add(pending.toolUseId)
  const allowed = allowedKeys(pending, tail.questionOptions)
  const prompt = judgePrompt({
    ticket: job.key,
    title: job.title,
    pending,
    rawInput,
    questionOptions: tail.questionOptions,
    tail: lastMessages(lines, 10)
  })
  const verdict = await runJudge(prompt, allowed)
  const current = findJob(id)
  if (!current || current.autonomy === 'manual') return
  if (verdict.action !== 'answer' || !verdict.key) return logJob(id, `escalated: ${verdict.reason}`)
  if (isForbiddenRequest(pending.name, rawInput)) return logJob(id, 'escalated: forbidden request')
  const answered = await answerInbox(sessionId, pending.toolUseId, verdict.key)
  logJob(id, answered.error ? `escalated: ${answered.error}` : `auto: ${verdict.key} — ${verdict.reason}`)
}

const runBusy = (id: string, work: () => Promise<void>): (() => Promise<void>) => {
  busyJobs.add(id)
  const run = async (): Promise<void> => {
    try {
      await work()
    } catch (e) {
      logJob(id, `escalated: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      busyJobs.delete(id)
    }
  }
  return run
}

const abortHandoff = (id: string, text: string): void =>
  updateJob(id, (j) => addLog({ ...j, handoffPhase: 'none', state: 'waiting' }, text, Date.now()))

const sendHandoffStep = (id: string, sessionId: string, data: string, isClear: boolean): (() => Promise<void>) =>
  runBusy(id, async () => {
    const sent = await sendKeys(sessionId, data)
    if (sent.error) return abortHandoff(id, `handoff step failed: ${sent.error}`)
    if (isClear) clearSentAt.set(id, Date.now())
  })

const clearMarkOf = (sessionId: string): ClearMark => ({
  sessionId,
  contextTokens: sessionById(sessionId)?.contextTokens ?? null,
  clearLinks: [...clearedIds].filter(([from, to]) => from === sessionId || to === sessionId).map(([from, to]) => `${from}>${to}`)
})

const isClearDone = (id: string, sessionId: string): boolean => {
  const before = clearMarks.get(id)
  return clearSentAt.has(id) && !!before && isClearConfirmed(before, clearMarkOf(sessionId))
}

const cachedTranscript = (sessionId: string): string | null => {
  const cached = transcriptPaths.get(sessionId)
  if (cached && existsSync(cached)) return cached
  const found = transcriptFile(sessionId)
  if (found) transcriptPaths.set(sessionId, found)
  else transcriptPaths.delete(sessionId)
  return found
}

const transcriptMark = (sessionId: string): string => {
  const file = cachedTranscript(sessionId)
  try {
    const stat = file ? statSync(file) : null
    return stat ? `${stat.size}:${stat.mtimeMs}` : ''
  } catch {
    transcriptPaths.delete(sessionId)
    return ''
  }
}

const tickHandoff = (
  job: Job,
  sessionId: string,
  view: SessionView,
  prev: Session['status'] | undefined,
  now: number,
  actions: (() => Promise<void>)[]
): Job => {
  const status = view.status
  if (job.handoffPhase === 'none') {
    if (prev !== 'working' || status === 'working') return job
    const stop = handoffStopAction(job, prev, status, handoffMtime(findHandoff(job.key)), turnStarts.get(job.id) ?? Number.POSITIVE_INFINITY)
    if (stop === 'none') return job
    if (stop === 'hold') return addLog({ ...job, state: 'handoff' }, 'waiting for Clear + handoff', now)
    if (stop === 'limit')
      return addLog({ ...job, state: 'handoff' }, `${AUTO_HANDOFF_LIMIT} automatic handoffs done: waiting for Clear + handoff`, now)
    phaseSince.set(job.id, now)
    actions.push(sendHandoffStep(job.id, sessionId, pasteInput(handoffPrompt(job.key, new Date())), false))
    return addLog({ ...job, state: 'handoff', handoffPhase: 'handoff', autoHandoffs: job.autoHandoffs + 1 }, 'handoff point: writing handoff.md', now)
  }
  if (job.autonomy !== 'autonomous') return addLog({ ...job, handoffPhase: 'none', state: nextJobState({ ...job, handoffPhase: 'none' }, view) }, 'handoff left to you', now)
  if (!phaseSince.has(job.id) || isHandoffClockReset(job.handoffPhase, status)) phaseSince.set(job.id, now)
  const elapsed = now - (phaseSince.get(job.id) ?? now)
  const step = nextHandoffTick(job.handoffPhase, prev ?? status, status, isClearDone(job.id, sessionId), elapsed, HANDOFF_STALL_MS)
  if (step.action === 'stall') return addLog({ ...job, handoffPhase: 'none', state: 'waiting' }, 'handoff stalled', now)
  if (step.phase === job.handoffPhase) return job
  phaseSince.set(job.id, now)
  const next = { ...job, handoffPhase: step.phase }
  if (step.action === 'clear') {
    clearSentAt.delete(job.id)
    clearMarks.set(job.id, clearMarkOf(sessionId))
    actions.push(sendHandoffStep(job.id, sessionId, '/clear\r', true))
    return addLog(next, 'handoff written: clearing', now)
  }
  if (step.action === 'resume') {
    actions.push(sendHandoffStep(job.id, sessionId, pasteInput(resumePrompt(job.key, new Date())), false))
    return addLog(next, 'resuming from handoff.md', now)
  }
  return addLog({ ...next, state: nextJobState(next, view) }, 'handoff done', now)
}

const tickStartingState = (job: Job, view: SessionView | null, now: number): Job['state'] => {
  const launchedAt = launchingJobs.get(job.id)
  if (launchedAt !== undefined && (job.kind === 'ticket' || (view?.status !== 'working' && now - launchedAt < STARTING_SLOT_MS)))
    return 'starting'
  launchingJobs.delete(job.id)
  return view ? nextJobState(job, view) : 'working'
}

const tickWatch = (job: Job, links: Map<string, string>, now: number, actions: (() => Promise<void>)[]): Job => {
  if (!job.isCommentsPending || busyJobs.has(job.id)) return job
  const sessionId = addressSessionId(job.key, links)
  const session = sessionId ? sessionById(sessionId) : undefined
  const action = watchAction(true, session ? { status: session.status, isLive: session.isLive } : null)
  if (action === 'hold') return job
  if (action === 'start' || !sessionId) {
    actions.push(
      runBusy(job.id, async () => {
        setJobs(queueAddressJob(appState.orchestrator.jobs, job.key, job.title, Date.now()))
        pumpQueue()
      })
    )
    return addLog({ ...job, isCommentsPending: false }, 'new comments: address queued', now)
  }
  const iid = parseMrKey(job.key)?.iid ?? 0
  actions.push(
    runBusy(job.id, async () => {
      const sent = await sendPrompt(sessionId, newCommentsPrompt(iid))
      if (sent.error) logJob(job.id, `new comments: prompt failed: ${sent.error}`)
    })
  )
  return addLog({ ...job, isCommentsPending: false }, 'new comments: sent to the address session', now)
}

const tickJob = (job: Job, links: Map<string, string>, now: number, actions: (() => Promise<void>)[]): Job => {
  if (job.kind === 'watch') return tickWatch(job, links, now, actions)
  if (job.state === 'queued' || job.state === 'finished' || job.state === 'failed') return job
  const sessionId = job.sessionId ? boundSessionId(job.sessionId, links) : null
  const view = sessionViewOf(sessionId ? sessionById(sessionId) : undefined)
  const bound = { ...job, sessionId }
  const state = job.state === 'starting' ? tickStartingState(bound, view, now) : isHandoffHeld(bound, view) ? 'handoff' : nextJobState(bound, view)
  const next = state === 'finished' ? addLog({ ...bound, state }, 'finished', now) : { ...bound, state }
  if (!sessionId || !view || state === 'finished' || busyJobs.has(job.id)) return next
  const prev = jobStatus.get(job.id)
  const status = view.status
  jobStatus.set(job.id, status)
  if (status === 'working' && prev !== 'working') turnStarts.set(job.id, now)
  const mark = status === 'waiting' ? transcriptMark(sessionId) : ''
  const isHandedOffToDeadDispatcher = dispatcherWaits.has(job.id) && !dispatcherLive()
  if (status === 'waiting' && (prev !== 'waiting' || mark !== waitMarks.get(job.id) || isHandedOffToDeadDispatcher)) {
    waitMarks.set(job.id, mark)
    actions.push(runBusy(job.id, () => handleWaiting(job.id, sessionId)))
    return next
  }
  return job.kind === 'ticket' && state !== 'starting' ? tickHandoff(next, sessionId, view, prev, now, actions) : next
}

const tickJobs = (): void => {
  try {
    const jobs = appState.orchestrator.jobs
    if (!jobs.length) return
    const now = Date.now()
    const links = throughCleared(continuations.links)
    const actions: (() => Promise<void>)[] = []
    const next = jobs.map((job) => tickJob(job, links, now, actions))
    if (JSON.stringify(next) !== JSON.stringify(jobs)) setJobs(next)
    for (const action of actions) void action()
    pumpQueue()
  } catch (e) {
    console.error('[orchestrator] tick failed:', e)
  }
}

const isThreadOpen = (key: string): boolean => {
  const mr = mrItems.find((m) => m.key === key)
  return !!mr && (mr.openThreads > 0 || mr.hasOpenThreads)
}

const isJobRequest = (r: unknown): r is JobRequest => {
  const o = r as Partial<JobRequest> | null
  return (
    !!o &&
    typeof o === 'object' &&
    JOB_REQUEST_KINDS.includes(o.kind as string) &&
    typeof o.key === 'string' &&
    o.key !== '' &&
    typeof o.title === 'string' &&
    (o.repo === null || typeof o.repo === 'string')
  )
}

const startJobs = (requests: unknown): { error: string | null } => {
  if (!Array.isArray(requests) || !requests.every(isJobRequest)) return { error: 'invalid jobs' }
  const now = Date.now()
  const ids = new Set(appState.orchestrator.jobs.map((j) => j.id))
  const added = requests.flatMap((r) => {
    const job = newJob(r, now, r.kind === 'watch' && isThreadOpen(r.key))
    if (ids.has(job.id)) return []
    ids.add(job.id)
    return [job]
  })
  const isRequeued = (id: string): boolean => {
    const existing = findJob(id)
    return !!existing && isJobOver(existing)
  }
  const requeued = new Map(requests.map((r): [string, JobRequest] => [jobId(r.kind, r.key), r]).filter(([id]) => isRequeued(id)))
  for (const id of requeued.keys()) forgetJob(id)
  const requeue = (j: Job): Job => {
    const request = requeued.get(j.id)
    return request ? requeueFromRequest(j, request, now) : j
  }
  if (added.length || requeued.size) setJobs([...appState.orchestrator.jobs.map(requeue), ...added])
  pumpQueue()
  const token = appState.settings.gitlabToken.trim()
  if (token && [...added.map((j) => j.id), ...requeued.keys()].some((id) => id.startsWith('watch:'))) void watchMrs(token)
  return { error: null }
}

const setJobAutonomy = (id: string, autonomy: Autonomy): void =>
  updateJob(id, (j) => withAutonomy(j, autonomy, Date.now()))

const forgetJob = (id: string): void => {
  for (const map of [launchingJobs, jobStatus, turnStarts, phaseSince, clearSentAt, clearMarks, waitMarks, dispatcherWaits]) map.delete(id)
  warnedSkips.delete(id)
}

const removeJob = (id: string): void => {
  if (!findJob(id)) return
  forgetJob(id)
  setJobs(appState.orchestrator.jobs.filter((j) => j.id !== id))
}

const adoptSession = (sessionId: string): { error: string | null } => {
  const session = lastSessions.find((s) => s.id === sessionId)
  if (!session?.isLive) return { error: 'The session is not live' }
  if (isAdopted(appState.orchestrator.jobs, sessionId)) return { error: null }
  const ticket = session.ticket?.toUpperCase()
  if (!ticket) return { error: 'Only a session with a ticket can be adopted' }
  const job = adoptJob({ id: session.id, ticket, repo: session.repo ?? null, title: appState.jira[ticket]?.summary || session.firstPrompt || '' }, Date.now())
  const next = withAdopted(appState.orchestrator.jobs, job)
  if (!next) return { error: `A running job already handles ${ticket}` }
  forgetJob(job.id)
  setJobs(next)
  return { error: null }
}

const setSessionAutonomy = (sessionId: string, choice: AutonomyChoice): { error: string | null } => {
  const jobOfSession = (): Job | undefined => appState.orchestrator.jobs.find((j) => j.sessionId === sessionId)
  const existing = jobOfSession()
  if (choice === 'off') {
    if (existing) removeJob(existing.id)
    return { error: null }
  }
  const autonomy: Autonomy = choice === 'autonomous' ? 'autonomous' : 'routine'
  if (!existing) {
    const adopted = adoptSession(sessionId)
    if (adopted.error) return adopted
  }
  const job = jobOfSession()
  if (job) setJobAutonomy(job.id, autonomy)
  return { error: null }
}

const watchMr = async (job: Job, token: string, me: string): Promise<void> => {
  const base = appState.settings.gitlabBase
  const mr = mrItems.find((m) => m.key === job.key)
  const ref = mr ? { projectId: mr.projectId, iid: mr.iid } : parseMrKey(job.key)
  if (!ref) return
  if (!mr) {
    const state = await fetchMrState(base, token, ref.projectId, ref.iid)
    if (state === 'merged' || state === 'closed') updateJob(job.id, (j) => addLog({ ...j, state: 'finished' }, `MR ${state}`, Date.now()))
    return
  }
  const json = await fetchMrDiscussions(base, token, ref.projectId, ref.iid)
  const current = findJob(job.id)
  if (json === null || !current) return
  const notes = newHumanNotes(json, current.lastSeenNoteId, me, parseBots(appState.settings.orchestratorBots))
  const step = watchStep(current.lastSeenNoteId, notes)
  if (step.lastSeenId !== current.lastSeenNoteId) updateJob(job.id, (j) => ({ ...j, lastSeenNoteId: step.lastSeenId }))
  if (!step.isNewComment) return
  const sessionId = addressSessionId(job.key, throughCleared(continuations.links))
  const session = sessionId ? sessionById(sessionId) : undefined
  const action = watchAction(true, session ? { status: session.status, isLive: session.isLive } : null)
  if (action === 'start' || !sessionId) {
    setJobs(queueAddressJob(appState.orchestrator.jobs, job.key, job.title, Date.now()))
    logJob(job.id, 'new comments: address queued')
    pumpQueue()
    return
  }
  if (action === 'hold') return updateJob(job.id, (j) => addLog({ ...j, isCommentsPending: true }, 'new comments: waiting for the address session', Date.now()))
  const sent = await sendPrompt(sessionId, newCommentsPrompt(mr.iid))
  logJob(job.id, sent.error ? `new comments: prompt failed: ${sent.error}` : 'new comments: sent to the address session')
}

const watchMrs = async (token: string): Promise<void> => {
  if (isWatchingMrs) return
  isWatchingMrs = true
  try {
    const added = ownMrsToWatch(mrItems, gitlabMe, appState.orchestrator.jobs)
    const now = Date.now()
    if (added.length)
      setJobs([
        ...appState.orchestrator.jobs,
        ...added.map((m) => newJob({ kind: 'watch', key: m.key, title: m.title, repo: null, autonomy: 'routine' }, now, false))
      ])
    const watches = appState.orchestrator.jobs.filter((j) => j.kind === 'watch' && j.state !== 'finished' && j.state !== 'failed')
    if (!watches.length) return
    gitlabUsername = gitlabUsername ?? (await fetchMyUsername(appState.settings.gitlabBase, token))
    if (!gitlabUsername) return
    for (const job of watches) await watchMr(job, token, gitlabUsername)
  } catch (e) {
    console.error('[orchestrator] MR watch failed:', e)
  } finally {
    isWatchingMrs = false
  }
}

const warnPromptSkips = (procs: { pid: number; commandLine: string }[]): void => {
  const jobs = appState.orchestrator.jobs.filter((j) => j.sessionId && !warnedSkips.has(j.id) && j.state !== 'finished' && j.state !== 'failed')
  if (!jobs.length) return
  const files = sessionFiles()
  for (const job of jobs) {
    const id = job.sessionId as string
    const pid = files.find((f) => f.sessionId === id)?.pid
    const proc = procs.find((p) => p.pid === pid || p.commandLine.includes(id))
    if (!proc || !isPromptSkipping(proc.commandLine)) continue
    warnedSkips.add(job.id)
    if (!job.log.some((l) => l.text === PROMPT_SKIP_WARNING)) logJob(job.id, PROMPT_SKIP_WARNING)
  }
}

const newestTaskFile = (key: string, fileName: string): { json: string; updatedAt: number } | null => {
  const candidates = listDir(EXPLAIN_ROOT).flatMap((month) => {
    const json = joinPath(EXPLAIN_ROOT, month, key, fileName)
    try {
      return [{ json, updatedAt: statSync(json).mtimeMs }]
    } catch {
      return []
    }
  })
  return candidates.sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null
}

const readTaskJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''))

const findExplainFile = (key: string): ExplainFile | null => {
  const newest = newestTaskFile(key, 'wyjasnienie-zmian.json')
  if (!newest) return null
  try {
    const doc = parseExplainDoc(readTaskJson(newest.json))
    return doc ? { doc, mdPath: joinPath(dirname(newest.json), 'wyjasnienie-zmian.md'), updatedAt: newest.updatedAt } : null
  } catch {
    return null
  }
}

const findReviewFile = (key: string): (ReviewDoc & { updatedAt: number }) | null => {
  const newest = newestTaskFile(key, 'review-parts.json')
  if (!newest) return null
  try {
    const doc = parseReviewDoc(readTaskJson(newest.json))
    return doc ? { ...doc, updatedAt: newest.updatedAt } : null
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
const PLAYWRIGHT_CLI = process.env.APPDATA ? playwrightCliPath(process.env.APPDATA, existsSync) : null

const chromePortFor = (key: string): number => {
  const known = appState.chromePorts[key]
  if (known) return known
  const port = pickChromePort(Object.values(appState.chromePorts))
  appState = { ...appState, chromePorts: { ...appState.chromePorts, [key]: port } }
  saveState(statePath, appState)
  return port
}

const prepareTaskBrowser = (key: string, folder: string): string | null => {
  const port = chromePortFor(key)
  if (ticketFromPath(folder) === key) writeTaskMcp(join(homedir(), '.claude.json'), folder, port, PLAYWRIGHT_CONFIG, PLAYWRIGHT_CLI)
  return writeTaskMcpFile(join(app.getPath('userData'), 'mcp'), key, port, PLAYWRIGHT_CONFIG, PLAYWRIGHT_CLI)
}

const openInChrome = async (url: string, key?: string | null): Promise<void> => {
  const exe = existsSync(CHROME_PATH) ? CHROME_PATH : 'chrome.exe'
  if (key) delete hostIdleSince[key.toUpperCase()]
  if (key) await seedProfile(CHROME_PROFILE, taskChromeProfile(key))
  const area = sideScreen(screen.getAllDisplays(), screen.getPrimaryDisplay().id)
  const args = key ? chromeArgs(taskChromeProfile(key), chromePortFor(key), url, key.toUpperCase(), area) : chromeArgs(CHROME_PROFILE, CHROME_DEBUG_PORT, url, undefined, area)
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

const serverStarts = new Map<string, Promise<unknown>>()

const startServerFor = async (key: string, cwd: string, body: Record<string, unknown>): Promise<unknown> => {
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
}

const pushStartRequests = (keys: string[]): void => sendToDashboard('server-requests', keys)
const startRequests = createStartRequests(pushStartRequests)

const notifyStartRequest = (key: string): void => {
  if (!Notification.isSupported()) return
  const n = new Notification({
    title: clip(`Agent wants the ${key} dev server`, 120),
    body: 'You stopped it earlier. Click to open Cockpit and choose Start or Keep stopped.',
    icon,
    silent: true
  })
  shownNotifications.add(n)
  n.on('close', () => shownNotifications.delete(n))
  n.on('click', () => {
    shownNotifications.delete(n)
    openDashboard()
  })
  n.show()
}

const askToStart = async (key: string, body: Record<string, unknown>): Promise<unknown> => {
  if (!startRequests.keys().includes(key)) notifyStartRequest(key)
  const decision = await startRequests.ask(key)
  const reply = waitingAgentReply(key, decision, servers.get(key) ?? null)
  return reply === 'route' ? serverRoute(body, false) : reply
}

const allowStart = (key: string): void => {
  clearUserStopped(key)
  startRequests.answer(key, 'start')
}

const answerUserStart = <T extends object>(key: string, isUserAction: boolean, result: T): T => {
  const answer = isUserAction ? userStartAnswer(result) : null
  if (answer) startRequests.answer(key, answer)
  return result
}

const answerStartRequest = (key: string, isStart: boolean): void => {
  if (isStart) allowStart(key)
  else startRequests.answer(key, 'keep')
}

const clearUserStopped = (key: string): void => {
  if (!appState.userStoppedServers.includes(key)) return
  const isOtherKey = (k: string): boolean => k !== key
  appState = { ...appState, userStoppedServers: appState.userStoppedServers.filter(isOtherKey) }
  saveState(statePath, appState)
}

const serverRoute = async (body: Record<string, unknown>, isUserAction: boolean): Promise<unknown> => {
  const cwd = asString(body.cwd)
  const key = asString(body.ticket).toUpperCase() || ticketFromPath(cwd)
  if (!key) return { error: 'Pass --ticket <KEY> or run it from the ticket worktree' }
  const pending = serverStarts.get(key)
  const ignoreStartError = (): undefined => undefined
  if (pending) await pending.catch(ignoreStartError)
  const running = servers.get(key)
  const action = serverAction({
    isRunning: !!running,
    isMismatch: !!running && isChoiceMismatch(running.label, asString(body.tenant), asString(body.environment)),
    isUserStopped: appState.userStoppedServers.includes(key),
    isUserAction
  })
  if (action === 'blocked') return askToStart(key, body)
  if (isUserAction) clearUserStopped(key)
  if (action === 'restart') stopServer(key)
  else if (running) return answerUserStart(key, isUserAction, { key, url: running.url, port: running.port, cwd: running.cwd, label: running.label, isNew: false })
  const started = startServerFor(key, cwd, body)
  serverStarts.set(key, started)
  try {
    return answerUserStart(key, isUserAction, (await started) as { error?: string | null })
  } finally {
    if (serverStarts.get(key) === started) serverStarts.delete(key)
  }
}

const jobPendingPrompt = (job: Job) => {
  const sessionId = job.sessionId ? boundSessionId(job.sessionId, throughCleared(continuations.links)) : null
  const file = sessionId && sessionById(sessionId)?.status === 'waiting' ? cachedTranscript(sessionId) : null
  const lines = file ? readTailLines(file) : []
  const tail = parseTail(lines)
  return { sessionId, pending: tail.pendingTool, rawInput: pendingRawInput(lines), questionOptions: tail.questionOptions }
}

const sessionPendingPrompt = (sessionId: string) => {
  const file = sessionById(sessionId)?.status === 'waiting' ? cachedTranscript(sessionId) : null
  const lines = file ? readTailLines(file) : []
  const tail = parseTail(lines)
  return { pending: tail.pendingTool, rawInput: pendingRawInput(lines), questionOptions: tail.questionOptions }
}

const LAST_REPLY_CHARS = 600
const isAssistantMessage = (m: { role: string }): boolean => m.role === 'assistant'
const lastReplyOf = (id: string): string => {
  const text = [...sessionDetail(id).messages].reverse().find(isAssistantMessage)?.text.trim() ?? ''
  return text.length > LAST_REPLY_CHARS ? `${text.slice(0, LAST_REPLY_CHARS - 1)}…` : text
}

const dispatchableSessions = (): (SessionEventInput & { jobId: string | null })[] => {
  const dispatcherId = findDispatcherSession(lastSessions, appState.orchestrator.dispatcherSessionId)?.id
  const isDispatchable = (s: Session): boolean => s.isLive && s.id !== dispatcherId
  const jobIdOf = (s: Session): string | null => {
    const isSessionJob = (job: Job): boolean => !!job.sessionId && s.id.startsWith(job.sessionId)
    return appState.orchestrator.jobs.find(isSessionJob)?.id ?? null
  }
  const toDispatchable = (s: Session): SessionEventInput & { jobId: string | null } => ({ ...toSessionEventInput(s), jobId: jobIdOf(s) })
  return lastSessions.filter(isDispatchable).map(toDispatchable)
}

const sessionBridgeRow = (s: SessionEventInput & { jobId: string | null }): unknown => {
  const { pending, questionOptions } = sessionPendingPrompt(s.id)
  return {
    id: s.id.slice(0, 8),
    label: s.label,
    title: s.title,
    status: s.status,
    jobId: s.jobId,
    pending: pending ? { toolUseId: pending.toolUseId, tool: pending.name, text: pending.input, options: pendingOptions(pending, questionOptions) } : null,
    lastReply: lastReplyOf(s.id)
  }
}

const answerSession = async (body: Record<string, unknown>): Promise<unknown> => {
  const target = findSessionRef(dispatchableSessions(), asString(body.session))
  if (!target) return { error: 'unknown or ambiguous session' }
  const { pending, rawInput, questionOptions } = sessionPendingPrompt(target.id)
  const toolUseId = asString(body.toolUseId)
  if (!pending || pending.toolUseId !== toolUseId) return { error: 'no such pending prompt' }
  const key = asString(body.key)
  const reason = refusedAnswer(pending, rawInput, questionOptions, key)
  if (reason) return { error: reason }
  return answerInbox(target.id, toolUseId, key)
}

const promptSession = async (body: Record<string, unknown>): Promise<unknown> => {
  const target = findSessionRef(dispatchableSessions(), asString(body.session))
  if (!target) return { error: 'unknown or ambiguous session' }
  const text = asString(body.text)
  if (!text) return { error: 'empty prompt' }
  const reason = refusedPrompt(text, sessionById(target.id)?.status ?? null)
  if (reason) return { error: reason }
  const isStillIdle = (): boolean => sessionById(target.id)?.status === 'idle' && !sessionTail(target.id)?.pendingTool
  return sendPrompt(target.id, text, isStillIdle)
}

const dispatcherRefusal = (job: Job, reason: string): { error: string } => {
  logJob(job.id, `dispatcher refused: ${reason}`)
  return { error: reason }
}

const bridgeRoutes = {
  '/jobs': async (): Promise<unknown> => ({
    jobs: appState.orchestrator.jobs.map((job) => {
      const { pending, questionOptions } = jobPendingPrompt(job)
      return jobRow(job, pending, questionOptions)
    })
  }),
  '/events': async (body: Record<string, unknown>): Promise<unknown> => ({
    ...eventsSince(dispatchEvents, typeof body.since === 'number' ? body.since : 0),
    feedId: FEED_ID
  }),
  '/sessions': async (): Promise<unknown> => ({ sessions: dispatchableSessions().map(sessionBridgeRow) }),
  '/answer': async (body: Record<string, unknown>): Promise<unknown> => {
    if (asString(body.session)) return answerSession(body)
    const job = findJob(asString(body.job))
    if (!job) return { error: 'unknown job' }
    const { sessionId, pending, rawInput, questionOptions } = jobPendingPrompt(job)
    if (!sessionId) return { error: 'job has no session' }
    const toolUseId = asString(body.toolUseId)
    if (!pending || pending.toolUseId !== toolUseId) return { error: 'no such pending prompt' }
    const key = asString(body.key)
    const reason = refusedAnswer(pending, rawInput, questionOptions, key)
    if (reason) return dispatcherRefusal(job, reason)
    const answered = await answerInbox(sessionId, toolUseId, key)
    if (answered.error) return answered
    logJob(job.id, `dispatcher: ${key}`)
    return { error: null }
  },
  '/prompt': async (body: Record<string, unknown>): Promise<unknown> => {
    if (asString(body.session)) return promptSession(body)
    const job = findJob(asString(body.job))
    if (!job) return { error: 'unknown job' }
    const text = asString(body.text)
    if (!text) return { error: 'empty prompt' }
    const { sessionId } = jobPendingPrompt(job)
    if (!sessionId) return { error: 'job has no session' }
    const reason = refusedPrompt(text, sessionById(sessionId)?.status ?? null)
    if (reason) return dispatcherRefusal(job, reason)
    const isStillIdle = (): boolean => sessionById(sessionId)?.status === 'idle' && !sessionTail(sessionId)?.pendingTool
    const sent = await sendPrompt(sessionId, text, isStillIdle)
    if (sent.error) return sent
    logJob(job.id, 'dispatcher prompt sent')
    return { error: null }
  },
  '/start': async (body: Record<string, unknown>): Promise<unknown> => {
    const asked = asString(body.ticket).toUpperCase()
    const isAsked = (t: JiraTicket): boolean => t.key === asked
    const titleEntry = (t: JiraTicket): [string, string] => [t.key, t.summary ?? '']
    const isKnown = !asked || !!appState.jira[asked] || myTasks.tickets.some(isAsked)
    if (!isKnown) await fetchTickets([asked])
    const request = startRequestOf(
      { ticket: asString(body.ticket), review: asString(body.review), watch: asString(body.watch), autonomy: asString(body.autonomy) },
      {
        jiraTitles: {
          ...Object.fromEntries(myTasks.tickets.map(titleEntry)),
          ...Object.fromEntries(Object.entries(appState.jira).map(([k, v]) => [k, v.summary ?? '']))
        },
        mrs: mrItems,
        repoFor: (key) => appState.repoByPrefix[ticketPrefix(key)] ?? repoRoots(lastSessions)[0]?.path ?? null
      }
    )
    return request ? startJobs([request]) : { error: 'unknown ticket or MR' }
  },
  '/autonomy': async (body: Record<string, unknown>): Promise<unknown> => {
    const job = findJob(asString(body.job))
    if (!job) return { error: 'unknown job' }
    const level = asString(body.level)
    if (!['manual', 'autonomous', 'routine'].includes(level)) return { error: 'invalid level' }
    setJobAutonomy(job.id, level as Autonomy)
    return { error: null }
  },
  '/remove': async (body: Record<string, unknown>): Promise<unknown> => {
    const job = findJob(asString(body.job))
    if (!job) return { error: 'unknown job' }
    removeJob(job.id)
    return { error: null }
  },
  '/server': async (body: Record<string, unknown>): Promise<unknown> => serverRoute(body, false),
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
  void refreshRunning()
}

let hostIdleSince: Record<string, number> = {}

const closeIdleHosts = async (): Promise<void> => {
  const chromeKeys = await Promise.all(Object.keys(appState.chromePorts).map(async (key) => ((await isChromeDebugUp(chromePortFor(key))) ? key : null)))
  const openKeys = [...new Set([...servers.keys(), ...chromeKeys.filter((k): k is string => !!k)])]
  const liveSessions = lastSessions.filter((s) => s.isLive)
  const mrTickets = mrTicketMap()
  const mrTicketOf = (key: string): string | undefined => mrItems.find((m) => `MR-${m.iid}` === key)?.ticket?.toUpperCase() ?? mrTickets.get(key)
  const sessionKeys = liveSessions.flatMap((s) => [s.ticket?.toUpperCase(), s.projectPath ? ticketFromPath(s.projectPath) : null])
  const mrKeys = Object.entries(appState.mrSessions).filter(([, id]) => liveSessions.some((s) => s.id === id)).map(([key]) => key)
  const liveKeys = [...sessionKeys, ...mrKeys].filter((k): k is string => !!k)
  const liveTickets = new Set([...liveKeys, ...liveKeys.map(mrTicketOf).filter((k): k is string => !!k)])
  const since = { ...hostIdleSince }
  for (const [key, server] of servers) if (since[key] !== undefined) since[key] = Math.max(since[key], server.startedAt)
  const result = idleHosts(openKeys, liveTickets, since, Date.now())
  hostIdleSince = result.idleSince
  for (const key of result.toClose) {
    if (servers.has(key)) stopServer(key)
    if (key in appState.chromePorts) await closeChrome(key)
  }
}

const checkIdleHosts = (): void => {
  void closeIdleHosts()
}
const openGuard = createOpenGuard()
const closeOwnTerminal = (id: string): void => {
  ptyHost.close(id)
  cachedAttaches.delete(id.slice(0, 8))
}
const closeOwnTerminals = (): void => ptyHost.ids().forEach(closeOwnTerminal)
const detachTerminal = (id: string): void => {
  closeOwnTerminal(id)
  sendToDashboard('pty-detached', id)
}
const sweepTerminals = (): void => staleTerminals(ptyHost.ids(), ptyHost.lastUseAt, Date.now()).forEach(detachTerminal)
const rekeyTerminal = (from: string, to: string): void => {
  openGuard.cancel(from)
  ptyHost.rekey(from, to)
  sendToDashboard('pty-rekey', from, to)
}
const handedToVscode = new Map<string, number>()
const PROMPT_QUIET_MS = 1500
const PROMPT_WAIT_MS = 20000

const sessionById = (id: string): Session | undefined => lastSessions.find((s) => s.id === id)

const isAttachedElsewhere = async (id: string): Promise<boolean> => {
  if (ptyHost.isOpen(id)) return false
  if (isHandedOff(handedToVscode.get(id), Date.now())) return true
  const checked = await isAttachedByCache(cachedAttaches, id.slice(0, 8), runningAttaches)
  cachedAttaches = checked.attaches
  return checked.isAttached
}

const modeOf = async (id: string): Promise<TerminalMode> =>
  terminalMode({
    isBackground: bgAgents.has(id),
    isLive: sessionById(id)?.isLive ?? false,
    isAttachedElsewhere: await isAttachedElsewhere(id)
  })

const CANCELLED = { error: 'cancelled' }

interface OpenOptions {
  isKeepSize?: boolean
  isAttachOnly?: boolean
}

const openTerminal = (id: string, cols: number, rows: number, options: OpenOptions = {}): Promise<{ error: string | null }> => {
  const openNow = (isCurrent: () => boolean): Promise<{ error: string | null }> => openTerminalNow(id, cols, rows, isCurrent, options)
  return openGuard.run(id, openNow)
}

const openTerminalNow = async (
  id: string,
  cols: number,
  rows: number,
  isCurrent: () => boolean,
  { isKeepSize = false, isAttachOnly = false }: OpenOptions
): Promise<{ error: string | null }> => {
  const s = sessionById(id)
  const exe = resolveClaudeExe()
  if (!s) return { error: 'session not found' }
  if (!exe) return { error: 'claude.exe not found' }
  const mode = await modeOf(id)
  if (!isCurrent()) return CANCELLED
  if (mode === 'attach') {
    const step = attachStep(ptyHost.isOpen(id), isKeepSize)
    if (step === 'resize') ptyHost.resize(id, cols, rows)
    if (step === 'spawn') {
      ptyHost.open(id, exe, attachArgs(id), s.projectPath, cols, rows)
      void refreshRunning()
      if (isKeepSize) sendToDashboard('pty-attached', id, cols, rows)
    }
    return { error: null }
  }
  if (isAttachOnly) return { error: 'this session is not attachable' }
  if (mode !== 'resume') return { error: mode === 'vscode' ? 'this session runs in a VS Code terminal' : 'this session is attached in VS Code' }
  const mcpConfig = s.ticket ? prepareTaskBrowser(s.ticket.toUpperCase(), s.projectPath) : null
  const out = await spawnBackground(exe, s.projectPath, taskMcpArgs(resumeBackgroundArgs(id, s.name ?? s.ticket), mcpConfig))
  const shortId = parseBgId(out)
  if (!shortId) return { error: out.trim().split(/\r?\n/).pop() || 'claude did not resume' }
  void refreshAgents().then(rescanAndPush)
  if (!isCurrent()) return CANCELLED
  ptyHost.open(id, exe, ['attach', shortId], s.projectPath, cols, rows)
  void refreshRunning()
  if (isKeepSize) sendToDashboard('pty-attached', id, cols, rows)
  return { error: null }
}

const waitForQuietOutput = async (id: string, isStrict = false): Promise<boolean> => {
  const deadline = Date.now() + PROMPT_WAIT_MS
  while (Date.now() < deadline) {
    const at = ptyHost.lastOutputAt(id)
    if (at !== null && Date.now() - at >= PROMPT_QUIET_MS) return true
    await new Promise((r) => setTimeout(r, 250))
  }
  return !isStrict && ptyHost.isOpen(id)
}

const openFromMain = (id: string): Promise<{ error: string | null }> => openTerminal(id, 120, 32, { isKeepSize: true })

const openOnDemand = async (id: string): Promise<boolean> => {
  const opened = await openTerminal(id, 120, 32, { isKeepSize: true, isAttachOnly: true })
  if (opened.error) return false
  return waitForQuietOutput(id)
}

const terminalWriter = createOnDemandWriter({ isOpen: ptyHost.isOpen, open: openOnDemand, write: ptyHost.write })

const sendKeys = async (id: string, data: string, isStillSafe?: () => boolean): Promise<{ error: string | null }> => {
  await terminalWriter.whenFlushed(id)
  if (!ptyHost.isOpen(id)) {
    const opened = await openFromMain(id)
    if (opened.error) return opened
  }
  if (!(await waitForQuietOutput(id))) return { error: 'the session did not answer' }
  if (isStillSafe && !isStillSafe()) return { error: 'the session is no longer idle, so nothing was sent' }
  ptyHost.write(id, data)
  return { error: null }
}

const sendPrompt = (id: string, text: string, isStillSafe?: () => boolean): Promise<{ error: string | null }> =>
  sendKeys(id, pasteInput(text), isStillSafe)

const takeOver = async (id: string, cols: number, rows: number): Promise<{ error: string | null }> => {
  handedToVscode.delete(id)
  const pid = (await runningAttaches()).get(id.slice(0, 8))
  if (pid) await killProcess(pid, true)
  await new Promise((r) => setTimeout(r, 500))
  return openTerminal(id, cols, rows)
}

const takeOverInteractive = async (id: string, cols: number, rows: number): Promise<{ error: string | null }> => {
  const s = sessionById(id)
  if (!s) return { error: 'session not found' }
  const options = {
    type: 'question' as const,
    buttons: ['Cancel', 'Take over here'],
    defaultId: 0,
    cancelId: 0,
    title: 'Claude Cockpit',
    message: 'Take this session over in the dashboard?',
    detail: `${s.name ?? s.ticket ?? s.projectName}\n\nThe Claude process that keeps it open (a VS Code terminal, or one left over after VS Code closed) is stopped, and the session continues here with its whole conversation. If Claude is in the middle of a turn, that turn stops.`
  }
  const parent = dashboardWindow && !dashboardWindow.isDestroyed() ? dashboardWindow : null
  const answer = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options)
  if (answer.response !== 1) return { error: 'cancelled' }
  handedToVscode.delete(id)
  for (const launchId of launchIdsOf(id, activeLinks)) for (const pid of await runningResumePids(launchId)) await killProcess(pid, true)
  await new Promise((r) => setTimeout(r, 800))
  await Promise.all([refreshRunning(), refreshAgents()])
  await rescanAndPush()
  return openTerminal(id, cols, rows)
}

const stopBackground = (exe: string, id: string): Promise<boolean> =>
  new Promise((resolve) => {
    execFile(exe, ['stop', id.slice(0, 8)], { windowsHide: true, timeout: 20000 }, (error) => resolve(!error))
  })

const closingIds = new Set<string>()
let isSleepTickRunning = false

const stopSession = async (id: string): Promise<{ error: string | null }> => {
  openGuard.cancel(id)
  const isOwnOpen = ptyHost.isOpen(id)
  closeOwnTerminal(id)
  handedToVscode.delete(id)
  const exe = resolveClaudeExe()
  if (exe && bgAgents.has(id)) await stopBackground(exe, id)
  await killSessions([id])
  for (const launchId of launchIdsOf(id, activeLinks)) for (const pid of await runningResumePids(launchId)) await killProcess(pid, true)
  await new Promise((r) => setTimeout(r, 800))
  await Promise.all([refreshRunning(), refreshAgents()])
  await rescanAndPush()
  const isStillRunning = (await Promise.all(launchIdsOf(id, activeLinks).map(runningResumePids))).some((pids) => pids.length)
  if (isOwnOpen) sendToDashboard('pty-detached', id)
  return isStillRunning ? { error: 'The Claude process is still running' } : { error: null }
}

const closeSessionTab = async (id: string): Promise<{ error: string | null }> => {
  const s = sessionById(id)
  if (!s) return { error: 'session not found' }
  const options = {
    type: 'question' as const,
    buttons: ['Cancel', 'Close session'],
    defaultId: 0,
    cancelId: 0,
    title: 'Claude Cockpit',
    message: 'Close this Claude session?',
    detail: `${s.name ?? s.ticket ?? s.projectName}\n\nThe Claude process is stopped wherever it runs (here, a VS Code terminal or another window). If Claude is in the middle of a turn, that turn stops. The conversation stays and can be resumed later.`
  }
  const parent = dashboardWindow && !dashboardWindow.isDestroyed() ? dashboardWindow : null
  const answer = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options)
  if (answer.response !== 1) return { error: 'cancelled' }
  closingIds.add(id)
  try {
    return await stopSession(id)
  } finally {
    closingIds.delete(id)
  }
}

const isMtime = (t: number | null | undefined): t is number => typeof t === 'number'

const toSleepCandidate = (s: Session): SleepCandidate => ({
  id: s.id,
  status: s.status,
  isBackground: bgAgents.has(s.id),
  transcriptMtimeMs: s.lastActive,
  markerMtimesMs: [lastNeedsInputMtimes.get(s.id)].filter(isMtime),
  lastInputAt: ptyHost.lastInputAt(s.id)
})

const markSlept = (id: string, at: number): void => {
  appState.sleptSessions[id] = at
  saveState(statePath, appState)
}

const sleepSessionNow = async (id: string): Promise<{ error: string | null }> => {
  if (!sessionById(id)) return { error: 'session not found' }
  if (closingIds.has(id)) return { error: null }
  closingIds.add(id)
  try {
    const isSlept = await sleepSession(id, Date.now(), sleepingSessions, stopSession, markSlept)
    return isSlept ? { error: null } : { error: 'The Claude process is still running' }
  } finally {
    closingIds.delete(id)
  }
}

const sleepTick = async (): Promise<void> => {
  if (!appState.settings.isSleepEnabled || isSleepTickRunning) return
  isSleepTickRunning = true
  try {
    const afterHours = appState.settings.sleepAfterHours
    const dispatcherId = findDispatcherSession(lastSessions, appState.orchestrator.dispatcherSessionId)?.id
    const isNotDispatcher = (id: string): boolean => id !== dispatcherId
    const due = sessionsToSleep(lastSessions.map(toSleepCandidate), Date.now(), afterHours).filter(isNotDispatcher)
    for (const id of due) {
      if (closingIds.has(id)) continue
      try {
        await rescan()
        await pushSessions()
        if (closingIds.has(id)) continue
        const isDueId = (s: Session): boolean => s.id === id
        const fresh = lastSessions.filter(isDueId).map(toSleepCandidate)
        if (!sessionsToSleep(fresh, Date.now(), afterHours).length) continue
        await sleepSession(id, Date.now(), sleepingSessions, stopSession, markSlept)
      } catch (e) {
        console.error('[sleep] stop failed:', id, e)
      }
    }
  } finally {
    isSleepTickRunning = false
  }
}

const openTerminalInVscode = async (id: string): Promise<void> => {
  const s = sessionById(id)
  openGuard.cancel(id)
  closeOwnTerminal(id)
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
    focusInDashboard({ ticket: s.ticket ?? null, sessionId: s.id })
  })
  n.show()
  mainWindow?.webContents.send('play-alert')
}

function notifyFinished(s: Session): void {
  if (!Notification.isSupported()) return
  const who = s.ticket ? `${s.ticket} · ${s.name ?? lastTasks[s.ticket]?.title ?? s.projectName}` : (s.name ?? s.projectName)
  const last = [...sessionDetail(s.id).messages].reverse().find((m) => m.role === 'assistant')?.text
  const n = new Notification({
    title: clip(`Claude finished: ${who}`, 120),
    body: clip(last ?? 'Claude finished its turn. Click to open the session.', 240),
    icon,
    silent: true
  })
  shownNotifications.add(n)
  n.on('close', () => shownNotifications.delete(n))
  n.on('click', () => {
    shownNotifications.delete(n)
    focusInDashboard({ ticket: s.ticket ?? null, sessionId: s.id })
  })
  n.show()
}

function notifyIdle(s: Session): void {
  if (!Notification.isSupported()) return
  const n = new Notification({
    title: clip(`Idle with a large context: ${s.ticket ?? s.name ?? s.projectName}`, 120),
    body: `${Math.round((s.contextTokens ?? 0) / 1000)}k tokens — the cache has expired, so the next turn re-reads everything. Hand off and /clear before resuming.`,
    icon,
    silent: true
  })
  shownNotifications.add(n)
  n.on('close', () => shownNotifications.delete(n))
  n.on('click', () => {
    shownNotifications.delete(n)
    focusInDashboard({ ticket: s.ticket ?? null, sessionId: s.id })
  })
  n.show()
}

function notifyContext(s: Session): void {
  if (!Notification.isSupported()) return
  const n = new Notification({
    title: clip(`Context is large: ${s.ticket ?? s.name ?? s.projectName}`, 120),
    body: `${Math.round((s.contextTokens ?? 0) / 1000)}k tokens are re-read on every turn. Compact it or hand off to a fresh session.`,
    icon,
    silent: true
  })
  shownNotifications.add(n)
  n.on('close', () => shownNotifications.delete(n))
  n.on('click', () => {
    shownNotifications.delete(n)
    focusInDashboard({ ticket: s.ticket ?? null, sessionId: s.id })
  })
  n.show()
}

const toSessionEventInput = (s: Session): SessionEventInput => ({
  id: s.id,
  status: s.status,
  isLive: s.isLive,
  label: s.ticket ?? s.name ?? s.projectName,
  title: (s.ticket ? lastTasks[s.ticket]?.title : null) ?? s.firstPrompt ?? ''
})

const jobSessionId = (job: Job): string | null => job.sessionId
const isPresent = (id: string | null): id is string => !!id
const isPrefixOf =
  (full: string) =>
  (prefix: string): boolean =>
    full.startsWith(prefix)
const sessionIdOf = (s: Session): string => s.id

const reportSessionEvents = (shown: Session[]): void => {
  const jobSessionIds = appState.orchestrator.jobs.map(jobSessionId).filter(isPresent)
  const isJobSession = (s: Session): boolean => jobSessionIds.some(isPrefixOf(s.id))
  const dispatcherId = findDispatcherSession(lastSessions, appState.orchestrator.dispatcherSessionId)?.id
  const skipIds = shown.filter(isJobSession).map(sessionIdOf).concat(dispatcherId ? [dispatcherId] : [])
  const result = sessionEvents(sessionStatuses, shown.map(toSessionEventInput), skipIds, Date.now())
  sessionStatuses = result.next
  if (result.events.length) dispatchEvents = appendEvents(dispatchEvents, result.events)
}

function updateAttention(sessions: Session[], shown: Session[]): void {
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
  reportSessionEvents(shown)
  if (isProcessScanReady) {
    const check = finishedTransitions(lastTurnStatus, shown)
    lastTurnStatus = check.next
    const isFocused = !!dashboardWindow && !dashboardWindow.isDestroyed() && dashboardWindow.isFocused()
    for (const id of check.finished) {
      const s = shown.find((x) => x.id === id)
      if (s && isFinishedNotifiable(id, { isFocused, viewingId: viewingSessionId })) notifyFinished(s)
    }
  }
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
    win.webContents.send('my-tasks', { ...myTasks, syncedAt: tasksSyncedAt })
    win.webContents.send('usage-update', lastUsage)
    resetSentSessions()
    void rescanAndPush()
    if (pendingFocus) win.webContents.send('focus-session', pendingFocus)
    pendingFocus = null
    if (pendingInboxNext) win.webContents.send('inbox-next')
    pendingInboxNext = false
  })
  win.on('close', () => {
    appState = { ...appState, dashboardBounds: win.getBounds() }
    saveState(statePath, appState)
  })
  const closeTerminals = (): void => closeOwnTerminals()
  win.webContents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) closeTerminals()
  })
  win.webContents.on('render-process-gone', closeTerminals)
  win.on('closed', () => {
    closeOwnTerminals()
    dashboardWindow = null
  })
  dashboardWindow = win
  loadRenderer(win, 'dashboard')
}

type FocusTarget = { ticket: string | null; sessionId: string }
let pendingFocus: FocusTarget | null = null

const focusInDashboard = (target: FocusTarget): void => {
  const isOpen = !!dashboardWindow && !dashboardWindow.isDestroyed()
  if (!isOpen) pendingFocus = target
  openDashboard()
  if (isOpen) dashboardWindow?.webContents.send('focus-session', target)
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
    timer = setTimeout(rescanAndPush, 1000)
  }
  let aTimer: NodeJS.Timeout | null = null
  const scheduleAgents = (): void => {
    if (aTimer) clearTimeout(aTimer)
    aTimer = setTimeout(async () => {
      await refreshAgents()
      await rescanAndPush()
    }, 600)
  }
  chokidar
    .watch([projectsDir(), ideDir(), needsInputDir(), activeDir(), doneDir()], { ignoreInitial: true, depth: 2 })
    .on('all', schedule)
  chokidar.watch(sessionsDir(), { ignoreInitial: true, depth: 0 }).on('all', scheduleAgents)
  win.webContents.on('did-finish-load', async () => {
    await refreshRunning()
    await refreshAgents()
    isProcessScanReady = true
    void probeEnv()
    resetSentSessions()
    await rescanAndPush()
    pumpQueue()
    void pushUsage()
    void refreshFinishSignals()
    void refreshTaskSources().then(pushSessions)
    void refreshMyTasks()
  })
  setInterval(pushSessions, 2000)
  setInterval(rescan, 10_000)
  setInterval(refreshRunning, 30_000)
  setInterval(refreshAgents, 30_000)
  setInterval(refreshDirty, 30_000)
  setInterval(refreshTaskSources, 8000)
  setInterval(pushUsage, 60000)
  setInterval(sleepTick, 60_000)
  setInterval(probeEnv, 600_000)
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

const setFullScreen = (e: Electron.IpcMainEvent, isOn: boolean): void => {
  BrowserWindow.fromWebContents(e.sender)?.setFullScreen(isOn)
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

  const gitlabOrigin = (): string | null => {
    try {
      return new URL(appState.settings.gitlabBase).origin
    } catch {
      return null
    }
  }
  const withGitlabCookies = async (origin: string, headers: Record<string, string>): Promise<Record<string, string>> => {
    if (headers.Cookie) return headers
    const cookies = await session.defaultSession.cookies.get({ url: origin }).catch(() => [])
    return cookies.length ? { ...headers, Cookie: cookies.map((c) => `${c.name}=${c.value}`).join('; ') } : headers
  }
  const SIGN_IN_PATH = /^\/users\/(sign_in|auth|password|two_factor|sign_up)|^\/oauth\//
  const signInGitlab = (parent: BrowserWindow | null): Promise<boolean> =>
    new Promise((resolve) => {
      const origin = gitlabOrigin()
      if (!origin) {
        resolve(false)
        return
      }
      const win = new BrowserWindow({ width: 560, height: 760, parent: parent ?? undefined, autoHideMenuBar: true, title: 'Sign in to GitLab' })
      let isDone = false
      const finish = (isSignedIn: boolean): void => {
        if (isDone) return
        isDone = true
        resolve(isSignedIn)
        if (!win.isDestroyed()) win.close()
      }
      const onNavigate = (_e: unknown, url: string): void => {
        const isOrigin = url.startsWith(`${origin}/`)
        if (isOrigin && !SIGN_IN_PATH.test(new URL(url).pathname)) finish(true)
      }
      win.webContents.on('did-navigate', onNavigate)
      win.on('closed', () => finish(false))
      void win.loadURL(`${origin}/users/sign_in`)
    })

  app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron.app')

  migrateUserData(join(app.getPath('appData'), 'claude-session-switcher'), app.getPath('userData'))
  startBridge(join(homedir(), '.claude', 'cockpit.json'), bridgeRoutes)
  statePath = join(app.getPath('userData'), 'state.json')
  appState = loadState(statePath)
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://*/api/v4/projects/*/uploads/*', 'http://*/api/v4/projects/*/uploads/*', 'https://*/-/project/*/uploads/*', 'http://*/-/project/*/uploads/*'] },
    (details, callback) => {
      const token = appState.settings.gitlabToken.trim()
      const origin = gitlabOrigin()
      const isOurs = !!origin && details.url.startsWith(`${origin}/`)
      if (isOurs && !details.url.includes('/api/v4/')) {
        void withGitlabCookies(origin, details.requestHeaders).then((requestHeaders) => callback({ requestHeaders }))
        return
      }
      callback({ requestHeaders: isOurs && token ? { ...details.requestHeaders, 'PRIVATE-TOKEN': token } : details.requestHeaders })
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
      mrMention: appState.settings.mrMention,
      orchestratorMaxParallel: appState.settings.orchestratorMaxParallel,
      orchestratorBots: appState.settings.orchestratorBots,
      timesheetHours: appState.settings.timesheetHours,
      isSleepEnabled: appState.settings.isSleepEnabled,
      sleepAfterHours: appState.settings.sleepAfterHours
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
    if (Number.isInteger(patch.orchestratorMaxParallel) && (patch.orchestratorMaxParallel as number) >= 1) {
      appState.settings.orchestratorMaxParallel = patch.orchestratorMaxParallel as number
      pumpQueue()
    }
    if (typeof patch.orchestratorBots === 'string') appState.settings.orchestratorBots = patch.orchestratorBots
    if (patch.startView === 'ask' || patch.startView === 'sidebar' || patch.startView === 'dashboard')
      appState.settings.startView = patch.startView
    if (typeof patch.launchOnStartup === 'boolean') {
      appState.settings.launchOnStartup = patch.launchOnStartup
      applyLaunchOnStartup(patch.launchOnStartup)
    }
    if (typeof patch.isSleepEnabled === 'boolean') appState.settings.isSleepEnabled = patch.isSleepEnabled
    if (typeof patch.sleepAfterHours === 'number' && patch.sleepAfterHours > 0)
      appState.settings.sleepAfterHours = patch.sleepAfterHours
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
  const onServerStart = async (_e: unknown, key: string, cwd: string, spec: ServerSpec, port: number | null, cols: number, rows: number): ReturnType<typeof startServer> => {
    clearUserStopped(key)
    return answerUserStart(key, true, await startServer(key, cwd, spec, port, cols, rows))
  }
  ipcMain.handle('server-start', onServerStart)
  ipcMain.on('server-request-answer', (_e, key: string, isStart: boolean) => answerStartRequest(key, isStart === true))
  ipcMain.on('get-server-requests', (e) => {
    e.returnValue = startRequests.keys()
  })
  ipcMain.handle('ide-files', (_e, cwd: string) => ideFiles(cwd))
  ipcMain.handle('ide-search', (_e, cwd: string, query: string, scope: string, isWord: boolean) => ideSearch(cwd, query, scope, isWord))
  ipcMain.handle('ide-status', (_e, cwd: string) => ideStatus(cwd))
  ipcMain.handle('ide-changes', (_e, cwd: string) => ideChanges(cwd))
  ipcMain.handle('ide-ref-changes', (_e, cwd: string, source: string, target: string, isPushedOnly?: boolean) => ideRefChanges(cwd, source, target, isPushedOnly === true))
  ipcMain.handle('ide-ref-read', (_e, cwd: string, source: string, target: string, rel: string, isBase: boolean) =>
    ideReadRef(cwd, source, target, rel, isBase)
  )
  ipcMain.handle('ide-ref-files', (_e, cwd: string, source: string) => ideRefFiles(cwd, source))
  ipcMain.handle('explain-doc', (_e, key: string) => findExplainFile(key))
  ipcMain.handle('agent-tree', async () => {
    const live = new Set(lastSessions.filter((s) => s.isLive).map((s) => s.id))
    const groups = await listAgentGroups(projectsDir(), (id) => live.has(clearedIds.get(id) ?? id), Date.now())
    return groups.map((g) => ({ ...g, sessionId: clearedIds.get(g.sessionId) ?? g.sessionId }))
  })
  ipcMain.handle('agent-run', (_e, sessionId: string, agentId: string) => readAgentRun(projectsDir(), sessionId, agentId))
  ipcMain.handle('explain-start', (_e, key: string, cwd: string, sourceSessionId: string | null) =>
    startExplain(key, cwd, sourceSessionId)
  )
  ipcMain.handle('review-parts-doc', (_e, key: string) => findReviewFile(key))
  ipcMain.handle('review-parts-start', (_e, key: string, cwd: string, mr: { iid: number; source: string; target: string } | null) =>
    startReviewParts(key, cwd, mr)
  )
  ipcMain.handle('catalog-list', () => buildCatalog(homedir()))
  ipcMain.handle('catalog-read', (_e, path: string) => readCatalogItem(homedir(), path))
  ipcMain.on('catalog-open-folder', (_e, path: string) => {
    if (typeof path === 'string' && isInsideDir(joinPath(homedir(), '.claude'), path)) void shell.openPath(dirname(path))
  })
  ipcMain.handle('insights-report', () => insightsReport())
  ipcMain.handle('flow-state', (_e, keys: string[]) => flowState(keys))
  ipcMain.on('flow-open-skill', () => void shell.openPath(FLOW_SKILL))
  ipcMain.handle('insights-run-now', () => runInsights())
  ipcMain.handle('insights-apply', (_e, id: string) => applyInsightsProposal(id))
  ipcMain.handle('insights-dismiss', (_e, id: string) => dismissInsightsProposal(id))
  ipcMain.handle('insights-test', (_e, id: string) => testInsightsProposal(id))
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
  const onServerStop = (_e: unknown, key: string): void => {
    if (!appState.userStoppedServers.includes(key)) {
      appState = { ...appState, userStoppedServers: [...appState.userStoppedServers, key] }
      saveState(statePath, appState)
    }
    stopServer(key)
  }
  ipcMain.on('server-stop', onServerStop)
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
    return { repo, folder: await branchFolder(repo, mr.sourceBranch) }
  })
  ipcMain.handle('mr-start-address', (_e, key: string) => startAddress(key))
  ipcMain.on('mr-seen', (_e, key: string) => markMrSeen(key))
  ipcMain.handle('orchestrator-start', (_e, jobs: unknown) => startJobs(jobs))
  ipcMain.handle('orchestrator-set-autonomy', (_e, id: string, autonomy: Autonomy) => setJobAutonomy(id, autonomy))
  ipcMain.handle('orchestrator-remove', (_e, id: string) => removeJob(id))
  ipcMain.handle('orchestrator-adopt', (_e, sessionId: string) => adoptSession(sessionId))
  ipcMain.handle('orchestrator-session-autonomy', (_e, sessionId: string, choice: AutonomyChoice) => setSessionAutonomy(sessionId, choice))
  ipcMain.handle('orchestrator-get', () => appState.orchestrator)
  ipcMain.handle('dispatcher-open', () => openDispatcher())
  ipcMain.handle('local-hosts', () => listLocalHosts())
  ipcMain.handle('close-chrome', async (_e, key: string | null) => ({ error: await closeChrome(typeof key === 'string' ? key : null) }))
  ipcMain.handle('ticket-server', async (_e, key: string, cwd: string | null) => serverRoute({ ticket: key, cwd: cwd ?? '' }, true))
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
    if (!found) return { state: null, overview: null, approvals: null, discussions: null, drafts: null, commits: null, diffRefs: null, problem: 'This merge request is no longer in your list' }
    return fetchMrStatus(appState.settings.gitlabBase, found.token, found.mr.projectId, found.mr.iid, parseBots(appState.settings.orchestratorBots))
  })
  ipcMain.handle('mr-blob', async (_e, projectPath: string, ref: string, path: string) => {
    const token = appState.settings.gitlabToken.trim()
    if (!token || typeof projectPath !== 'string' || typeof ref !== 'string' || typeof path !== 'string') return null
    return fetchBlobText(appState.settings.gitlabBase, token, projectPath, ref, path)
  })
  const offerReleaseStatus = async (ticket: string | null): Promise<string | null> => {
    const token = appState.settings.jiraToken.trim()
    if (!ticket || !token) return null
    const list = await fetchTransitions(appState.settings.jiraBase, token, ticket)
    const step = list ? releaseTransition(list) : null
    if (!step) return `${ticket} cannot move to Waiting for internal release from its current status, so it stays where it is.`
    const isConfirmed = await confirmMr(
      `Move ${ticket} to ${step.to}?`,
      `Move to ${step.to}`,
      `The merge request is merged, so ${ticket} no longer needs to be in code review.`
    )
    if (!isConfirmed) return null
    if (!(await doTransition(appState.settings.jiraBase, token, ticket, step.id))) return `Jira did not accept moving ${ticket} to ${step.to}.`
    void refreshMyTasks()
    return `${ticket} moved to ${step.to}.`
  }
  ipcMain.handle('mr-action', async (_e, key: string, action: MrAction, options: MergeOptions | null) => {
    const found = mrForAction(key)
    const text = MR_ACTION_TEXT[action]
    if (!found || !text) return { error: 'This merge request is no longer in your list', isCancelled: false }
    const extras = action === 'merge' && options ? `\n\nSquash commits: ${options.isSquash ? 'yes' : 'no'} · Delete source branch: ${options.isSourceRemoved ? 'yes' : 'no'}` : ''
    const detail = `!${found.mr.iid} ${found.mr.title}\n${found.mr.projectPath} · ${found.mr.sourceBranch} → ${found.mr.targetBranch}${extras}`
    if (!(await confirmMr(text.question, text.button, detail))) return { error: null, isCancelled: true }
    const error = await runMrAction(appState.settings.gitlabBase, found.token, found.mr.projectId, found.mr.iid, action, options ?? null)
    forgetApprovals(key)
    if (!error && (action === 'approve' || action === 'unapprove')) {
      const approvedMrs = Object.fromEntries(Object.entries(appState.approvedMrs).filter(([k]) => k !== key))
      appState = { ...appState, approvedMrs: action === 'approve' ? { ...approvedMrs, [key]: found.mr.sha } : approvedMrs }
      saveState(statePath, appState)
    }
    if (!error) void refreshMyMrs()
    const notice = action === 'merge' && !error ? await offerReleaseStatus(found.mr.ticket) : null
    return { error, isCancelled: false, notice }
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
  const linePosition = async (found: { mr: MrItem; token: string }, anchor: MrLineAnchor): Promise<{ position: MrLinePosition } | { error: string }> => {
    const base = appState.settings.gitlabBase
    const [head, file] = await Promise.all([
      fetchMrHead(base, found.token, found.mr.projectId, found.mr.iid),
      fetchMrDiffFile(base, found.token, found.mr.projectId, found.mr.iid, anchor.path)
    ])
    return anchorPosition(head.diffRefs, file, anchor)
  }
  const runReview = async (found: { mr: MrItem; token: string }, action: MrReviewAction): Promise<string | null> => {
    const base = appState.settings.gitlabBase
    const { projectId, iid } = found.mr
    const token = found.token
    switch (action.kind) {
      case 'draft-add': {
        const placed = action.anchor ? await linePosition(found, action.anchor) : null
        if (placed && 'error' in placed) return placed.error
        return createDraftNote(base, token, projectId, iid, { body: action.body, position: placed?.position, replyTo: action.replyTo, isResolving: action.isResolving })
      }
      case 'draft-edit':
        return updateDraftNote(base, token, projectId, iid, action.id, action.body)
      case 'draft-delete':
        return deleteDraftNote(base, token, projectId, iid, action.id)
      case 'draft-resolve': {
        const status = await fetchMrStatus(base, token, projectId, iid)
        if (status.problem) return status.problem
        const isTargetDraft = (d: { id: number }): boolean => d.id === action.id
        const draft = status.drafts?.find(isTargetDraft)
        if (!draft?.replyTo) return 'This draft is no longer a pending reply'
        return recreateDraft(
          draftOpsFor(base, token, projectId, iid),
          { id: draft.id, body: draft.body, replyTo: draft.replyTo },
          action.isResolving
        )
      }
      case 'submit-review':
        return publishDraftNotes(base, token, projectId, iid)
      case 'line-comment': {
        const placed = await linePosition(found, action.anchor)
        return 'error' in placed ? placed.error : postLineComment(base, token, projectId, iid, action.body, placed.position)
      }
      case 'reply':
        return postMrReply(base, token, projectId, iid, action.discussionId, action.body)
      case 'resolve':
        return setDiscussionResolved(base, token, projectId, iid, action.discussionId, action.isResolved)
      case 'note-edit':
        return updateNote(base, token, projectId, iid, action.discussionId, action.noteId, action.body)
      case 'note-delete':
        return deleteNote(base, token, projectId, iid, action.discussionId, action.noteId)
      case 'set-draft': {
        const head = await fetchMrHead(base, token, projectId, iid)
        if (head.problem) return head.problem
        return updateMr(base, token, projectId, iid, { title: withDraftTitle(head.title || action.title, action.isDraft) })
      }
      case 'edit-text': {
        const head = await fetchMrHead(base, token, projectId, iid)
        if (head.problem) return head.problem
        return updateMr(base, token, projectId, iid, {
          ...(action.title !== undefined ? { title: withDraftTitle(action.title, head.isDraft) } : {}),
          ...(action.description !== undefined ? { description: action.description } : {})
        })
      }
    }
  }
  const reviewDetail = (mr: MrItem, action: MrReviewAction): string => {
    const where = 'anchor' in action && action.anchor ? `On ${action.anchor.path}:${action.anchor.line}
` : ''
    const text = where + ('body' in action ? action.body : action.kind === 'edit-text' ? (action.description ?? action.title ?? '') : '')
    const line = `!${mr.iid} ${mr.title}
${mr.projectPath} · ${mr.sourceBranch} → ${mr.targetBranch}`
    return text ? `${line}

${text.length > 600 ? `${text.slice(0, 600)}…` : text}` : line
  }
  ipcMain.handle('ticket-mr', async (_e, ticket: string) => {
    const token = appState.settings.gitlabToken.trim()
    if (!token || !/^[A-Z][A-Z0-9]*-\d+$/i.test(ticket ?? '')) return null
    return findTicketMr(appState.settings.gitlabBase, token, ticket.toUpperCase())
  })
  ipcMain.handle('release-check', async (_e, tickets: { key: string; summary: string; status: string }[]): Promise<ReleaseRow[]> => {
    const token = appState.settings.gitlabToken.trim()
    if (!token) return []
    const rows: ReleaseRow[] = []
    for (const ticket of tickets ?? []) rows.push(await checkRelease(appState.settings.gitlabBase, token, ticket, opisDir()))
    return rows
  })
  ipcMain.handle('release-run', async (_e, requestedKeys: string[]): Promise<ReleaseResult[]> => {
    const keys = Array.isArray(requestedKeys) ? requestedKeys : []
    const jiraToken = appState.settings.jiraToken.trim()
    const gitlabToken = appState.settings.gitlabToken.trim()
    const toError = (key: string, error: string): ReleaseResult => ({ key, error, done: [] })
    const toMissingTokenError = (key: string): ReleaseResult => toError(key, 'Add a Jira and GitLab token in Settings first')
    if (!jiraToken || !gitlabToken) return keys.map(toMissingTokenError)
    const skipped: ReleaseResult[] = []
    const ready: string[] = []
    for (const key of keys) {
      const issue = await fetchIssue(appState.settings.jiraBase, jiraToken, key)
      if (!issue) {
        skipped.push(toError(key, `Not ready: could not read ${key} from Jira`))
        continue
      }
      const row = await checkRelease(appState.settings.gitlabBase, gitlabToken, { key, summary: issue.summary ?? '', status: issue.status }, opisDir())
      if (isReleasable(row)) ready.push(key)
      else skipped.push(toError(key, `Not ready: ${row.blockers[0] ?? 'status is not Waiting for internal release'}`))
    }
    if (!ready.length) return skipped
    const detail = `${ready.join('\n')}\n\nMoves each to Internal testing, posts test-case.md as a comment and removes you as assignee.`
    if (!(await confirmMr(`Hand ${ready.length} ticket(s) to QA?`, 'Hand to QA', detail))) return []
    const base = appState.settings.jiraBase
    const toBody = (c: { body: string }): string => c.body
    const readStatus = async (key: string): Promise<string | null> => (await fetchIssue(base, jiraToken, key))?.status ?? null
    const readTransitions = (key: string): ReturnType<typeof fetchTransitions> => fetchTransitions(base, jiraToken, key)
    const runTransition = (key: string, id: string): Promise<boolean> => doTransition(base, jiraToken, key, id)
    const readComments = async (key: string): Promise<string[] | null> => {
      const detailed = await fetchTicketDetail(base, jiraToken, key)
      return detailed ? detailed.comments.map(toBody) : null
    }
    const addComment = (key: string, body: string): Promise<boolean> => postComment(base, jiraToken, key, body)
    const removeAssignee = (key: string): Promise<boolean> => unassignIssue(base, jiraToken, key)
    const readTestCases = (key: string): string | null => findTestCases(opisDir(), key)
    const deps: ReleaseDeps = {
      status: readStatus,
      transitions: readTransitions,
      transition: runTransition,
      comments: readComments,
      comment: addComment,
      unassign: removeAssignee,
      testCases: readTestCases
    }
    const done: ReleaseResult[] = []
    for (const key of ready) done.push(await releaseTicket(key, deps))
    void refreshMyTasks()
    return [...skipped, ...done]
  })
  ipcMain.handle('internal-release-check', async (_e, tickets: { key: string; summary: string; status: string }[]): Promise<InternalReleaseRow[]> => {
    const gitlabToken = appState.settings.gitlabToken.trim()
    const jiraToken = appState.settings.jiraToken.trim()
    if (!gitlabToken) return []
    const rows: InternalReleaseRow[] = []
    for (const ticket of tickets ?? []) {
      const { checks } = await checkRelease(appState.settings.gitlabBase, gitlabToken, ticket, opisDir())
      const transitions = jiraToken ? await fetchTransitions(appState.settings.jiraBase, jiraToken, ticket.key) : null
      rows.push(internalReleaseRow(ticket, checks, transitions))
    }
    return rows
  })
  ipcMain.handle('internal-release-run', async (_e, requestedKeys: string[]): Promise<ReleaseResult[]> => {
    const keys = Array.isArray(requestedKeys) ? requestedKeys : []
    const jiraToken = appState.settings.jiraToken.trim()
    const gitlabToken = appState.settings.gitlabToken.trim()
    const toError = (key: string, error: string): ReleaseResult => ({ key, error, done: [] })
    const toMissingTokenError = (key: string): ReleaseResult => toError(key, 'Add a Jira and GitLab token in Settings first')
    if (!jiraToken || !gitlabToken) return keys.map(toMissingTokenError)
    const base = appState.settings.jiraBase
    const skipped: ReleaseResult[] = []
    const ready: string[] = []
    for (const key of keys) {
      const issue = await fetchIssue(base, jiraToken, key)
      const status = issue?.status ?? null
      const { checks } = issue ? await checkRelease(appState.settings.gitlabBase, gitlabToken, { key, summary: issue.summary ?? '', status: issue.status }, opisDir()) : { checks: [] }
      const blocker = internalReleaseBlocker(key, status, checks)
      if (blocker) skipped.push(toError(key, blocker))
      else ready.push(key)
    }
    if (!ready.length) return skipped
    const detail = `${ready.join('\n')}\n\nMoves each to Internal release and removes you as assignee. No comment is posted.`
    if (!(await confirmMr(`Move ${ready.length} ticket(s) to Internal release?`, 'Move to Internal release', detail))) return []
    const readStatus = async (key: string): Promise<string | null> => (await fetchIssue(base, jiraToken, key))?.status ?? null
    const readTransitions = (key: string): ReturnType<typeof fetchTransitions> => fetchTransitions(base, jiraToken, key)
    const runTransition = (key: string, id: string): Promise<boolean> => doTransition(base, jiraToken, key, id)
    const removeAssignee = (key: string): Promise<boolean> => unassignIssue(base, jiraToken, key)
    const deps: InternalReleaseDeps = { status: readStatus, transitions: readTransitions, transition: runTransition, unassign: removeAssignee }
    const results: ReleaseResult[] = []
    for (const key of ready) results.push(await internalReleaseTicket(key, deps))
    void refreshMyTasks()
    return [...skipped, ...results]
  })
  ipcMain.handle('mr-review', async (_e, key: string, action: MrReviewAction) => {
    const found = mrForAction(key)
    if (!found || !action?.kind) return { error: 'This merge request is no longer in your list', isCancelled: false }
    if ('body' in action && !action.body.trim()) return { error: 'The comment is empty', isCancelled: false }
    const ask = reviewConfirm(action, found.mr.iid)
    if (ask && !(await confirmMr(ask.question, ask.button, reviewDetail(found.mr, action)))) return { error: null, isCancelled: true }
    const error = await runReview(found, action)
    if (!error && (action.kind === 'set-draft' || action.kind === 'edit-text')) void refreshMyMrs()
    return { error, isCancelled: false }
  })
  ipcMain.handle('mr-explanations', (_e, key: string) => {
    const mr = mrItems.find((m) => m.key === key)
    return readExplanations(mr?.ticket ?? `MR-${mr?.iid ?? ''}`)
  })
  ipcMain.handle('gitlab-sign-in',(e) => signInGitlab(BrowserWindow.fromWebContents(e.sender)))
  ipcMain.handle('mr-commentable',async (_e, key: string, folder: string | null, isReadOnly: boolean, path: string | null): Promise<MrCommentable> => {
    const found = mrForAction(key)
    if (!found) return { isAllowed: false, reason: 'This merge request is no longer in your list' }
    const head = await fetchMrHead(appState.settings.gitlabBase, found.token, found.mr.projectId, found.mr.iid)
    const repo = isReadOnly ? repoForProject(found.mr.projectPath, repoRoots(lastSessions)) : folder
    if (!repo) return { isAllowed: false, reason: 'No local folder for this repository.' }
    const shown = await runGit(repo, ['rev-parse', isReadOnly ? `origin/${found.mr.sourceBranch}` : 'HEAD'])
    const dirty = !isReadOnly && path ? await runGit(repo, ['status', '--porcelain', '--', path]) : null
    const headSha = head.diffRefs?.headSha ?? null
    const state = commentableState({ headSha, shownSha: shown.isOk ? shown.out.trim() : null, isFileDirty: !!dirty?.out.trim(), isLatestVersion: true })
    return { ...state, headSha, path: path ?? undefined }
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
  ipcMain.on('set-full-screen', setFullScreen)
  ipcMain.handle('terminal-mode', (_e, id: string) => modeOf(id))
  ipcMain.handle('terminal-open', (_e, id: string, cols: number, rows: number) => openTerminal(id, cols, rows))
  const onTerminalWrite = (_e: unknown, id: string, data: string): void => terminalWriter.write(id, data)
  ipcMain.on('terminal-write', onTerminalWrite)
  ipcMain.on('terminal-resize', (_e, id: string, cols: number, rows: number) => ptyHost.resize(id, cols, rows))
  ipcMain.on('terminal-close', (_e, id: string) => {
    openGuard.cancel(id)
    closeOwnTerminal(id)
  })
  const onTerminalSeen = (_e: unknown, id: string): void => ptyHost.touch(id)
  ipcMain.on('terminal-seen', onTerminalSeen)
  ipcMain.handle('terminal-send-prompt', (_e, id: string, text: string) => sendPrompt(id, text))
  const onTerminalStopTurn = (_e: unknown, id: string): void => terminalWriter.write(id, STOP_TURN)
  ipcMain.on('terminal-stop-turn', onTerminalStopTurn)
  ipcMain.handle('terminal-take-over', (_e, id: string, cols: number, rows: number) => takeOver(id, cols, rows))
  ipcMain.handle('terminal-take-over-interactive', (_e, id: string, cols: number, rows: number) => takeOverInteractive(id, cols, rows))
  ipcMain.handle('terminal-open-vscode', (_e, id: string) => openTerminalInVscode(id))
  ipcMain.handle('session-close', (_e, id: string) => closeSessionTab(id))
  const onSessionSleep = (_e: Electron.IpcMainInvokeEvent, id: string): Promise<{ error: string | null }> => sleepSessionNow(id)
  ipcMain.handle('session-sleep', onSessionSleep)
  ipcMain.handle('session-detail', (_e, id: string) => sessionDetail(id))
  ipcMain.handle('inbox-item', (_e, id: string) => inboxItem(id))
  ipcMain.handle('inbox-answer', (_e, id: string, toolUseId: string, key: string) => answerInbox(id, toolUseId, key))
  ipcMain.on('inbox-dismiss', (_e, id: string) => dismissInbox(id))
  ipcMain.handle('ticket-readiness', async (_e, key: string, cwd: string | null) => {
    const handoff = findHandoff(key)
    const handoffAt = handoff ? statSync(handoff).mtimeMs : null
    const log = cwd ? await runGit(cwd, ['log', '-1', '--format=%ct']) : null
    const seconds = log?.isOk ? Number(log.out.trim()) : NaN
    return { handoffAt, lastCommitAt: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null }
  })
  let promptCache: { mtime: number; entries: PromptEntry[] } | null = null
  const readPasteCache = (hash: string): string | null => {
    if (!/^[0-9a-f]+$/i.test(hash)) return null
    try {
      return readFileSync(joinPath(homedir(), '.claude', 'paste-cache', `${hash}.txt`), 'utf8')
    } catch {
      return null
    }
  }
  ipcMain.handle('prompt-history', () => {
    try {
      const file = joinPath(homedir(), '.claude', 'history.jsonl')
      const mtime = statSync(file).mtimeMs
      if (promptCache?.mtime !== mtime) promptCache = { mtime, entries: parseHistory(readFileSync(file, 'utf8').split(/\r?\n/), readPasteCache) }
      return promptCache.entries
    } catch {
      return []
    }
  })
  const folderMedia = (folder: string): ReturnType<typeof mediaFiles> =>
    mediaFiles(readdirSync(folder, { withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name))
  ipcMain.handle('task-files', (_e, ticket: string) => {
    const folder = lastTasks[ticket]?.folder
    if (!folder) return null
    try {
      return folderMedia(folder)
    } catch {
      return null
    }
  })
  ipcMain.on('open-task-file', (_e, ticket: string, name: string) => {
    const folder = lastTasks[ticket]?.folder
    if (!folder) return
    try {
      if (folderMedia(folder).some((f) => f.name === name)) void shell.openPath(joinPath(folder, name))
    } catch {
      return
    }
  })
  ipcMain.on('viewing-session', (_e, id: string | null) => {
    viewingSessionId = typeof id === 'string' ? id : null
  })
  ipcMain.on('get-jump-key', (e) => {
    e.returnValue = isJumpKeyReady
  })
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
  ipcMain.handle('worktree-list', () => listWorktrees())
  ipcMain.handle('worktree-status', (_e, path: string) => {
    const readStatus = (): Promise<WorktreeStatus> => readWorktreeStatus(path)
    return statusLimit(readStatus)
  })
  ipcMain.handle(
    'start-task',
    (_e, key: string, title: string, repo: string, mode: 'vscode' | 'background') =>
      startTask(key, title, repo, mode)
  )
  ipcMain.on('open-task-code', (_e, key: string) => openTaskCode(key))
  ipcMain.on('task-repos', (e) => {
    e.returnValue = { roots: repoRoots(lastSessions), byPrefix: appState.repoByPrefix }
  })
  ipcMain.handle('pick-repo', async (e) => {
    const parent = BrowserWindow.fromWebContents(e.sender)
    const options = { title: 'Choose the repository folder', properties: ['openDirectory' as const] }
    const picked = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
    const path = picked.canceled ? null : (picked.filePaths[0] ?? null)
    if (!path) return { repo: null, error: null }
    if (!existsSync(joinPath(path, '.git'))) return { repo: null, error: `${path} is not a git repository` }
    return { repo: { path, name: basename(path) }, error: null }
  })
  ipcMain.on('get-my-tasks', (e) => {
    e.returnValue = { ...myTasks, syncedAt: tasksSyncedAt }
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
    void rescanAndPush()
  })

  mainWindow = createWindow()
  wireSessions(mainWindow)
  buildTray(mainWindow)
  wireDock(mainWindow)
  try {
    migrateFactoryDir(LEGACY_FACTORY_DIR, INSIGHTS_DIR)
  } catch (e) {
    console.error('[insights] migration failed:', e)
  }
  checkInsights()
  setInterval(checkInsights, INSIGHTS_CHECK)
  setInterval(checkIdleHosts, 60_000)
  setInterval(sweepTerminals, 60_000)

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
