import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  LocalHost,
  MrVersionDiff,
  MrStatus,
  AgentGroup,
  AgentStep,
  CloseCandidate,
  BranchChanges,
  ChangedFile,
  DevServer,
  ExplainFile,
  ReviewDoc,
  InsightsReport,
  CatalogGroup,
  CatalogRead,
  FlowState,
  JiraTransition,
  ServerProfile,
  ServerSpec,
  TicketDetail,
  MyMrs,
  MrFile,
  MyTasks,
  QuickAction,
  Session,
  SessionDetail,
  InboxItem,
  TerminalMode,
  PromptEntry,
  TaskMeta,
  UsageResult,
  VscodeProfile,
  WorktreeRow
} from '../renderer/src/types'

// Custom APIs for renderer
const api = {
  onSessions: (cb: (s: Session[]) => void): void => {
    ipcRenderer.on('sessions', (_e, s) => cb(s))
  },
  onTasks: (cb: (t: Record<string, TaskMeta>) => void): void => {
    ipcRenderer.on('tasks', (_e, t) => cb(t))
  },
  openTaskFolder: (ticket: string): void => {
    ipcRenderer.send('open-task-folder', ticket)
  },
  openMr: (ticket: string): void => {
    ipcRenderer.send('open-mr', ticket)
  },
  setTaskWatched: (ticket: string, on: boolean): void => {
    ipcRenderer.send('set-task-watched', ticket, on)
  },
  setTaskFinished: (ticket: string, on: boolean): void => {
    ipcRenderer.send('set-task-finished', ticket, on)
  },
  onRestoreState: (cb: (r: { count: number }) => void): void => {
    ipcRenderer.on('restore-state', (_e, r) => cb(r))
  },
  restoreSessions: (): void => {
    ipcRenderer.send('restore-sessions')
  },
  dismissRestore: (): void => {
    ipcRenderer.send('dismiss-restore')
  },
  onCloseCandidates: (cb: (list: CloseCandidate[]) => void): void => {
    ipcRenderer.on('close-candidates', (_e, list) => cb(list))
  },
  closeSessions: (ids: string[]): Promise<string[]> => ipcRenderer.invoke('close-sessions', ids),
  onWorktrees: (cb: (rows: WorktreeRow[]) => void): void => {
    ipcRenderer.on('worktrees', (_e, rows) => cb(rows))
  },
  checkWorktree: (path: string): Promise<{ branch: string; isDirty: boolean; unpushed: number }> =>
    ipcRenderer.invoke('worktree-check', path),
  deleteWorktree: (path: string, branch: string): Promise<{ error: string | null; notice: string | null }> =>
    ipcRenderer.invoke('worktree-delete', path, branch),
  openWorktree: (path: string): void => {
    ipcRenderer.send('worktree-open', path)
  },
  onMyTasks: (cb: (result: MyTasks) => void): void => {
    ipcRenderer.on('my-tasks', (_e, result) => cb(result))
  },
  getMyTasks: (): MyTasks => ipcRenderer.sendSync('get-my-tasks'),
  startTask: (
    key: string,
    title: string,
    repo: string,
    mode: 'vscode' | 'background'
  ): Promise<{ error: string | null; sessionId?: string }> => ipcRenderer.invoke('start-task', key, title, repo, mode),
  openTaskCode: (key: string): void => {
    ipcRenderer.send('open-task-code', key)
  },
  getTaskRepos: (): { roots: { path: string; name: string }[]; byPrefix: Record<string, string> } =>
    ipcRenderer.sendSync('task-repos'),
  pickRepo: (): Promise<{ repo: { path: string; name: string } | null; error: string | null }> => ipcRenderer.invoke('pick-repo'),
  getVscodeLayout: (): VscodeProfile[] => ipcRenderer.sendSync('vscode-layout-status'),
  applyVscodeLayout: (): VscodeProfile[] => ipcRenderer.sendSync('vscode-layout-apply'),
  openSession: (s: Session): void => {
    ipcRenderer.send('open-session', s)
  },
  openTicket: (code: string): void => {
    ipcRenderer.send('open-ticket', code)
  },
  copyText: (text: string): void => {
    ipcRenderer.send('copy-text', text)
  },
  readClipboard: (): string => ipcRenderer.sendSync('read-clipboard'),
  setWatched: (id: string, on: boolean): void => {
    ipcRenderer.send('set-watched', id, on)
  },
  setName: (id: string, name: string | null): void => {
    ipcRenderer.send('set-name', id, name)
  },
  removeSession: (id: string, label: string): void => {
    ipcRenderer.send('remove-session', id, label)
  },
  getVersion: (): string => ipcRenderer.sendSync('get-version'),
  getDiagnostics: (): string => ipcRenderer.sendSync('get-diagnostics'),
  onClaudeStatus: (cb: (s: { claude: boolean; editor: boolean }) => void): void => {
    ipcRenderer.on('claude-status', (_e, s) => cb(s))
  },
  onUsage: (cb: (u: UsageResult) => void): void => {
    ipcRenderer.on('usage-update', (_e, u) => cb(u))
  },
  getUsage: (): UsageResult | null => ipcRenderer.sendSync('get-usage'),
  getSettings: (): {
    jiraBase: string
    jiraToken: string
    jiraDoneStatuses: string
    alwaysOnTop: boolean
    clickAction: string
    launchOnStartup: boolean
    ticketPrefixes: string
    isDockReserving: boolean
    isDockOnTop: boolean
    taskJql: string
    startPrompt: string
    quickActions: QuickAction[]
    gitlabBase: string
    gitlabToken: string
    mrProjects: string
    startView: 'ask' | 'sidebar' | 'dashboard'
    mrMention: string
  } => ipcRenderer.sendSync('get-settings'),
  setSettings: (patch: {
    jiraBase?: string
    jiraToken?: string
    jiraDoneStatuses?: string
    alwaysOnTop?: boolean
    clickAction?: string
    launchOnStartup?: boolean
    ticketPrefixes?: string
    isDockReserving?: boolean
    isDockOnTop?: boolean
    taskJql?: string
    startPrompt?: string
    quickActions?: QuickAction[]
    gitlabBase?: string
    gitlabToken?: string
    mrProjects?: string
    startView?: 'ask' | 'sidebar' | 'dashboard'
    mrMention?: string
  }): void => {
    ipcRenderer.send('set-settings', patch)
  },
  showSidebar: (): void => ipcRenderer.send('show-sidebar'),
  launchView: (view: 'sidebar' | 'dashboard', isRemembered: boolean): void =>
    ipcRenderer.send('launch-view', view, isRemembered),
  setFinished: (id: string, on: boolean): void => {
    ipcRenderer.send('set-finished', id, on)
  },
  syncJira: (): Promise<void> => ipcRenderer.invoke('sync-jira'),
  listBranchTickets: (projectPath: string): Promise<{ ticket: string; branch: string }[]> =>
    ipcRenderer.invoke('list-branch-tickets', projectPath),
  verifyTicket: (
    input: string
  ): Promise<{ configured: boolean; status: string | null; code: string | null }> =>
    ipcRenderer.invoke('verify-ticket', input),
  setTicket: (id: string, value: string | null): void => {
    ipcRenderer.send('set-ticket', id, value)
  },
  onOpenTicketPicker: (cb: (s: Session) => void): void => {
    ipcRenderer.on('open-ticket-picker', (_e, s) => cb(s))
  },
  sessionMenu: (s: Session): void => {
    ipcRenderer.send('session-menu', s)
  },
  switchAccount: (): void => {
    ipcRenderer.send('switch-account')
  },
  minimizeWindow: (): void => {
    ipcRenderer.send('minimize-window')
  },
  onResumeFailed: (cb: (info: { label: string; command: string }) => void): void => {
    ipcRenderer.on('resume-failed', (_e, info) => cb(info))
  },
  installHooks: (): { ok: boolean; error?: string } => ipcRenderer.sendSync('install-hooks'),
  onFocusSession: (cb: (target: { ticket: string | null; sessionId: string }) => void): void => {
    ipcRenderer.on('focus-session', (_e, target) => cb(target))
  },
  onPlayAlert: (cb: () => void): void => {
    ipcRenderer.on('play-alert', () => cb())
  },
  toggleDock: (): void => {
    ipcRenderer.send('toggle-dock')
  },
  getDockState: (): { isDocked: boolean; edge: 'left' | 'right' } => ipcRenderer.sendSync('get-dock-state'),
  onDockState: (cb: (s: { isDocked: boolean; edge: 'left' | 'right' }) => void): void => {
    ipcRenderer.on('dock-state', (_e, s) => cb(s))
  },
  onMenuState: (cb: (open: boolean) => void): void => {
    ipcRenderer.on('menu-state', (_e, open) => cb(open))
  },
  terminalMode: (id: string): Promise<TerminalMode> => ipcRenderer.invoke('terminal-mode', id),
  openTerminal: (id: string, cols: number, rows: number): Promise<{ error: string | null }> =>
    ipcRenderer.invoke('terminal-open', id, cols, rows),
  writeTerminal: (id: string, data: string): void => ipcRenderer.send('terminal-write', id, data),
  resizeTerminal: (id: string, cols: number, rows: number): void => ipcRenderer.send('terminal-resize', id, cols, rows),
  closeTerminal: (id: string): void => ipcRenderer.send('terminal-close', id),
  sendPrompt: (id: string, text: string): Promise<{ error: string | null }> =>
    ipcRenderer.invoke('terminal-send-prompt', id, text),
  stopTurn: (id: string): void => ipcRenderer.send('terminal-stop-turn', id),
  closeSession: (id: string): Promise<{ error: string | null }> => ipcRenderer.invoke('session-close', id),
  takeOverInteractive: (id: string, cols: number, rows: number): Promise<{ error: string | null }> =>
    ipcRenderer.invoke('terminal-take-over-interactive', id, cols, rows),
  takeOver: (id: string, cols: number, rows: number): Promise<{ error: string | null }> =>
    ipcRenderer.invoke('terminal-take-over', id, cols, rows),
  openInVscode: (id: string): Promise<void> => ipcRenderer.invoke('terminal-open-vscode', id),
  getSessionDetail: (id: string): Promise<SessionDetail> => ipcRenderer.invoke('session-detail', id),
  getInboxItem: (id: string): Promise<InboxItem | null> => ipcRenderer.invoke('inbox-item', id),
  answerInbox: (id: string, toolUseId: string, key: string): Promise<{ error: string | null }> =>
    ipcRenderer.invoke('inbox-answer', id, toolUseId, key),
  dismissInbox: (id: string): void => ipcRenderer.send('inbox-dismiss', id),
  getTicketReadiness: (key: string, cwd: string | null): Promise<{ handoffAt: number | null; lastCommitAt: number | null }> =>
    ipcRenderer.invoke('ticket-readiness', key, cwd),
  getPromptHistory: (): Promise<PromptEntry[]> => ipcRenderer.invoke('prompt-history'),
  getTaskFiles: (ticket: string): Promise<{ name: string; kind: 'video' | 'image' }[] | null> =>
    ipcRenderer.invoke('task-files', ticket),
  openTaskFile: (ticket: string, name: string): void => ipcRenderer.send('open-task-file', ticket, name),
  setViewingSession: (id: string | null): void => ipcRenderer.send('viewing-session', id),
  onInboxNext: (cb: () => void): void => {
    ipcRenderer.on('inbox-next', () => cb())
  },
  isJumpKeyReady: (): boolean => ipcRenderer.sendSync('get-jump-key'),
  getTicketDescription: (key: string): Promise<string | null> => ipcRenderer.invoke('ticket-description', key),
  copyResume: (id: string): void => ipcRenderer.send('copy-resume', id),
  postJiraComment: (key: string, body: string): Promise<{ error: string | null }> =>
    ipcRenderer.invoke('jira-comment', key, body),
  onPtyData: (cb: (id: string, chunk: string) => void): (() => void) => {
    const onData = (_e: unknown, id: string, chunk: string): void => cb(id, chunk)
    ipcRenderer.on('pty-data', onData)
    return () => ipcRenderer.removeListener('pty-data', onData)
  },
  onPtyRekey: (cb: (from: string, to: string) => void): (() => void) => {
    const onRekey = (_e: unknown, from: string, to: string): void => cb(from, to)
    ipcRenderer.on('pty-rekey', onRekey)
    return () => ipcRenderer.removeListener('pty-rekey', onRekey)
  },
  onPtyExit: (cb: (id: string, code: number) => void): (() => void) => {
    const onExit = (_e: unknown, id: string, code: number): void => cb(id, code)
    ipcRenderer.on('pty-exit', onExit)
    return () => ipcRenderer.removeListener('pty-exit', onExit)
  },
  openDashboard: (): void => ipcRenderer.send('open-dashboard'),
  startServer: (
    key: string,
    cwd: string,
    spec: ServerSpec,
    port: number | null,
    cols: number,
    rows: number
  ): Promise<{ error: string | null; port?: number }> => ipcRenderer.invoke('server-start', key, cwd, spec, port, cols, rows),
  getServerProfile: (cwd: string): ServerProfile => ipcRenderer.sendSync('server-profile', cwd),
  listFiles: (cwd: string): Promise<string[]> => ipcRenderer.invoke('ide-files', cwd),
  searchCode: (cwd: string, query: string, scope: string, isWord: boolean): Promise<{ path: string; line: number; text: string }[]> => ipcRenderer.invoke('ide-search', cwd, query, scope, isWord),
  listChanges: (cwd: string): Promise<ChangedFile[]> => ipcRenderer.invoke('ide-status', cwd),
  listBranchChanges: (cwd: string): Promise<BranchChanges> => ipcRenderer.invoke('ide-changes', cwd),
  getExplainDoc: (key: string): Promise<ExplainFile | null> => ipcRenderer.invoke('explain-doc', key),
  listRefChanges: (cwd: string, source: string, target: string, isPushedOnly = false): Promise<BranchChanges> =>
    ipcRenderer.invoke('ide-ref-changes', cwd, source, target, isPushedOnly),
  readRefFile: (cwd: string, source: string, target: string, rel: string, isBase: boolean): Promise<string | null> =>
    ipcRenderer.invoke('ide-ref-read', cwd, source, target, rel, isBase),
  listRefFiles: (cwd: string, source: string): Promise<string[]> => ipcRenderer.invoke('ide-ref-files', cwd, source),
  getAgentTree: (): Promise<AgentGroup[]> => ipcRenderer.invoke('agent-tree'),
  getAgentRun: (sessionId: string, agentId: string): Promise<AgentStep[]> => ipcRenderer.invoke('agent-run', sessionId, agentId),
  startExplain: (key: string, cwd: string, sourceSessionId: string | null): Promise<{ error: string | null; sessionId?: string }> =>
    ipcRenderer.invoke('explain-start', key, cwd, sourceSessionId),
  startReviewParts: (key: string, cwd: string, mr: { iid: number; source: string; target: string } | null): Promise<{ error: string | null; sessionId?: string }> =>
    ipcRenderer.invoke('review-parts-start', key, cwd, mr),
  getReviewDoc: (key: string): Promise<(ReviewDoc & { updatedAt: number }) | null> => ipcRenderer.invoke('review-parts-doc', key),
  openExplainMd: (key: string): void => ipcRenderer.send('open-explain-md', key),
  readExplainMd: (key: string): Promise<string | null> => ipcRenderer.invoke('explain-md-text', key),
  readFile: (cwd: string, rel: string): Promise<{ text: string | null; error: string | null }> =>
    ipcRenderer.invoke('ide-read', cwd, rel),
  readHeadFile: (cwd: string, rel: string, isLastCommit?: boolean): Promise<string> =>
    ipcRenderer.invoke('ide-read-head', cwd, rel, isLastCommit === true),
  writeFile: (cwd: string, rel: string, text: string): Promise<{ error: string | null }> =>
    ipcRenderer.invoke('ide-write', cwd, rel, text),
  getTicketDetail: (key: string): Promise<TicketDetail | null> => ipcRenderer.invoke('ticket-detail', key),
  openInChrome: (url: string, key?: string): void => ipcRenderer.send('open-in-chrome', url, key),
  getTransitions: (key: string): Promise<JiraTransition[] | null> => ipcRenderer.invoke('jira-transitions', key),
  transitionTicket: (key: string, id: string): Promise<{ error: string | null }> => ipcRenderer.invoke('jira-transition', key, id),
  stopServer: (key: string): void => ipcRenderer.send('server-stop', key),
  writeServer: (key: string, data: string): void => ipcRenderer.send('server-write', key, data),
  resizeServer: (key: string, cols: number, rows: number): void => ipcRenderer.send('server-resize', key, cols, rows),
  getServers: (): DevServer[] => ipcRenderer.sendSync('get-servers'),
  getServerLog: (key: string): string => ipcRenderer.sendSync('server-log', key),
  onServers: (cb: (list: DevServer[]) => void): void => {
    ipcRenderer.on('servers', (_e, list) => cb(list))
  },
  onServerData: (cb: (key: string, chunk: string) => void): (() => void) => {
    const onData = (_e: unknown, key: string, chunk: string): void => cb(key, chunk)
    ipcRenderer.on('server-data', onData)
    return () => ipcRenderer.removeListener('server-data', onData)
  },
  getMyMrs: (): MyMrs => ipcRenderer.sendSync('get-my-mrs'),
  onMyMrs: (cb: (mrs: MyMrs) => void): void => {
    ipcRenderer.on('my-mrs', (_e, mrs) => cb(mrs))
  },
  getMrFiles: (key: string): Promise<MrFile[] | null> => ipcRenderer.invoke('mr-files', key),
  getMrStatus: (key: string): Promise<MrStatus> => ipcRenderer.invoke('mr-status', key),
  getMrRepo: (key: string): Promise<string | null> => ipcRenderer.invoke('mr-repo', key),
  refreshLists: (): Promise<boolean> => ipcRenderer.invoke('refresh-lists'),
  getLocalHosts: (): Promise<LocalHost[]> => ipcRenderer.invoke('local-hosts'),
  getCatalog: (): Promise<CatalogGroup[]> => ipcRenderer.invoke('catalog-list'),
  readCatalogItem: (path: string): Promise<CatalogRead | null> => ipcRenderer.invoke('catalog-read', path),
  openCatalogFolder: (path: string): void => ipcRenderer.send('catalog-open-folder', path),
  getInsightsReport: (): Promise<InsightsReport> => ipcRenderer.invoke('insights-report'),
  getFlow: (keys: string[]): Promise<FlowState> => ipcRenderer.invoke('flow-state', keys),
  openFlowSkill: (): void => ipcRenderer.send('flow-open-skill'),
  runInsightsNow: (): Promise<{ error: string | null }> => ipcRenderer.invoke('insights-run-now'),
  applyInsightsProposal: (id: string): Promise<{ error: string | null }> => ipcRenderer.invoke('insights-apply', id),
  dismissInsightsProposal: (id: string): Promise<{ error: string | null }> => ipcRenderer.invoke('insights-dismiss', id),
  testInsightsProposal: (id: string): Promise<{ error: string | null; sessionId?: string }> => ipcRenderer.invoke('insights-test', id),
  onInsightsChanged: (cb: () => void): (() => void) => {
    const onChanged = (): void => cb()
    ipcRenderer.on('insights-changed', onChanged)
    return () => ipcRenderer.removeListener('insights-changed', onChanged)
  },
  closeChrome: (key: string | null): Promise<{ error: string | null }> => ipcRenderer.invoke('close-chrome', key),
  startTicketServer: (key: string, cwd: string | null): Promise<{ error?: string; url?: string }> => ipcRenderer.invoke('ticket-server', key, cwd),
  getMrBranchFolder: (key: string): Promise<{ repo: string | null; folder: string | null }> => ipcRenderer.invoke('mr-branch-folder', key),
  getMrVersionDiff: (key: string, diffId: number, startSha: string, path: string | null): Promise<MrVersionDiff> =>
    ipcRenderer.invoke('mr-version-diff', key, diffId, startSha, path),
  runMrAction: (
    key: string,
    action: 'approve' | 'unapprove' | 'merge' | 'rebase',
    options?: { isSquash: boolean; isSourceRemoved: boolean }
  ): Promise<{ error: string | null; isCancelled: boolean; notice?: string | null }> => ipcRenderer.invoke('mr-action', key, action, options ?? null),
  postMrReply: (key: string, discussionId: string, body: string): Promise<{ error: string | null; isCancelled: boolean }> =>
    ipcRenderer.invoke('mr-reply', key, discussionId, body),
  postMrComment: (key: string, body: string): Promise<{ error: string | null; isCancelled: boolean }> =>
    ipcRenderer.invoke('mr-comment', key, body),
  signInGitlab: (): Promise<boolean> => ipcRenderer.invoke('gitlab-sign-in'),
  getMrExplanations: (key: string): Promise<Record<string, string>> => ipcRenderer.invoke('mr-explanations', key),
  getTicketMr: (ticket: string): Promise<import('../renderer/src/types').TicketMr | null> => ipcRenderer.invoke('ticket-mr', ticket),
  mrReview: (key: string, action: import('../renderer/src/types').MrReviewAction): Promise<{ error: string | null; isCancelled: boolean }> =>
    ipcRenderer.invoke('mr-review', key, action),
  mrCommentable: (key: string, folder: string | null, isReadOnly: boolean, path: string | null): Promise<import('../renderer/src/types').MrCommentable> =>
    ipcRenderer.invoke('mr-commentable', key, folder, isReadOnly, path),
  startReview: (key: string): Promise<{ error: string | null; sessionId?: string }> => ipcRenderer.invoke('start-review', key),
  startAddress: (key: string): Promise<{ error: string | null; sessionId?: string }> => ipcRenderer.invoke('mr-start-address', key),
  setAllProjects: (isAll: boolean): void => ipcRenderer.send('set-mr-projects-all', isAll),
  getStarred: (): string[] => ipcRenderer.sendSync('get-starred'),
  setStarred: (key: string, isOn: boolean): void => ipcRenderer.send('set-starred', key, isOn),
  onStarred: (cb: (keys: string[]) => void): void => {
    ipcRenderer.on('starred', (_e, keys) => cb(keys))
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
