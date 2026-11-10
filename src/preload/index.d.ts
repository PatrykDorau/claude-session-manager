import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  CloseCandidate,
  BranchChanges,
  ChangedFile,
  DevServer,
  ExplainFile,
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
  TerminalMode,
  TaskMeta,
  UsageResult,
  VscodeProfile,
  WorktreeRow
} from '../renderer/src/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      onSessions: (cb: (s: Session[]) => void) => void
      onTasks: (cb: (t: Record<string, TaskMeta>) => void) => void
      openTaskFolder: (ticket: string) => void
      openMr: (ticket: string) => void
      setTaskWatched: (ticket: string, on: boolean) => void
      setTaskFinished: (ticket: string, on: boolean) => void
      onRestoreState: (cb: (r: { count: number }) => void) => void
      restoreSessions: () => void
      dismissRestore: () => void
      onCloseCandidates: (cb: (list: CloseCandidate[]) => void) => void
      closeSessions: (ids: string[]) => Promise<string[]>
      onWorktrees: (cb: (rows: WorktreeRow[]) => void) => void
      checkWorktree: (path: string) => Promise<{ branch: string; isDirty: boolean; unpushed: number }>
      deleteWorktree: (path: string, branch: string) => Promise<{ error: string | null; notice: string | null }>
      openWorktree: (path: string) => void
      onMyTasks: (cb: (result: MyTasks) => void) => void
      getMyTasks: () => MyTasks
      startTask: (
        key: string,
        title: string,
        repo: string,
        mode: 'vscode' | 'background'
      ) => Promise<{ error: string | null; sessionId?: string }>
      openTaskCode: (key: string) => void
      getTaskRepos: () => { roots: { path: string; name: string }[]; byPrefix: Record<string, string> }
      getVscodeLayout: () => VscodeProfile[]
      applyVscodeLayout: () => VscodeProfile[]
      openSession: (s: Session) => void
      openTicket: (code: string) => void
      copyText: (text: string) => void
      readClipboard: () => string
      setWatched: (id: string, on: boolean) => void
      setName: (id: string, name: string | null) => void
      removeSession: (id: string, label: string) => void
      getVersion: () => string
      getDiagnostics: () => string
      onClaudeStatus: (cb: (s: { claude: boolean; editor: boolean }) => void) => void
      onUsage: (cb: (u: UsageResult) => void) => void
      getUsage: () => UsageResult | null
      getSettings: () => {
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
      }
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
      }) => void
      setFinished: (id: string, on: boolean) => void
      syncJira: () => Promise<void>
      listBranchTickets: (projectPath: string) => Promise<{ ticket: string; branch: string }[]>
      verifyTicket: (
        input: string
      ) => Promise<{ configured: boolean; status: string | null; code: string | null }>
      setTicket: (id: string, value: string | null) => void
      onOpenTicketPicker: (cb: (s: Session) => void) => void
      sessionMenu: (s: Session) => void
      switchAccount: () => void
      minimizeWindow: () => void
      onResumeFailed: (cb: (info: { label: string; command: string }) => void) => void
      installHooks: () => { ok: boolean; error?: string }
      onPlayAlert: (cb: () => void) => void
      toggleDock: () => void
      getDockState: () => { isDocked: boolean; edge: 'left' | 'right' }
      onDockState: (cb: (s: { isDocked: boolean; edge: 'left' | 'right' }) => void) => void
      onMenuState: (cb: (open: boolean) => void) => void
      terminalMode: (id: string) => Promise<TerminalMode>
      openTerminal: (id: string, cols: number, rows: number) => Promise<{ error: string | null }>
      writeTerminal: (id: string, data: string) => void
      resizeTerminal: (id: string, cols: number, rows: number) => void
      closeTerminal: (id: string) => void
      sendPrompt: (id: string, text: string) => Promise<{ error: string | null }>
      stopTurn: (id: string) => void
      takeOver: (id: string, cols: number, rows: number) => Promise<{ error: string | null }>
      openInVscode: (id: string) => Promise<void>
      getSessionDetail: (id: string) => Promise<SessionDetail>
      getTicketDescription: (key: string) => Promise<string | null>
      copyResume: (id: string) => void
      postJiraComment: (key: string, body: string) => Promise<{ error: string | null }>
      onPtyData: (cb: (id: string, chunk: string) => void) => () => void
      onPtyExit: (cb: (id: string, code: number) => void) => () => void
      openDashboard: () => void
      showSidebar: () => void
      launchView: (view: 'sidebar' | 'dashboard', isRemembered: boolean) => void
      startServer: (
        key: string,
        cwd: string,
        spec: ServerSpec,
        port: number | null,
        cols: number,
        rows: number
      ) => Promise<{ error: string | null; port?: number }>
      stopServer: (key: string) => void
      writeServer: (key: string, data: string) => void
      resizeServer: (key: string, cols: number, rows: number) => void
      getServers: () => DevServer[]
      getServerLog: (key: string) => string
      getServerProfile: (cwd: string) => ServerProfile
      listFiles: (cwd: string) => Promise<string[]>
      listChanges: (cwd: string) => Promise<ChangedFile[]>
      listBranchChanges: (cwd: string) => Promise<BranchChanges>
      getExplainDoc: (key: string) => Promise<ExplainFile | null>
      listRefChanges: (cwd: string, source: string, target: string) => Promise<BranchChanges>
      readRefFile: (cwd: string, source: string, target: string, rel: string, isBase: boolean) => Promise<string | null>
      listRefFiles: (cwd: string, source: string) => Promise<string[]>
      getAgentTree: () => Promise<import('../renderer/src/types').AgentGroup[]>
      getAgentRun: (sessionId: string, agentId: string) => Promise<import('../renderer/src/types').AgentStep[]>
      startExplain: (key: string, cwd: string, sourceSessionId: string | null) => Promise<{ error: string | null; sessionId?: string }>
      openExplainMd: (key: string) => void
      readExplainMd: (key: string) => Promise<string | null>
      readFile: (cwd: string, rel: string) => Promise<{ text: string | null; error: string | null }>
      readHeadFile: (cwd: string, rel: string, isLastCommit?: boolean) => Promise<string>
      writeFile: (cwd: string, rel: string, text: string) => Promise<{ error: string | null }>
      getTicketDetail: (key: string) => Promise<TicketDetail | null>
      openInChrome: (url: string, key?: string) => void
      getTransitions: (key: string) => Promise<JiraTransition[] | null>
      transitionTicket: (key: string, id: string) => Promise<{ error: string | null }>
      onServers: (cb: (list: DevServer[]) => void) => void
      onServerData: (cb: (key: string, chunk: string) => void) => () => void
      getMyMrs: () => MyMrs
      onMyMrs: (cb: (mrs: MyMrs) => void) => void
      getMrFiles: (key: string) => Promise<MrFile[] | null>
      getMrStatus: (key: string) => Promise<import('../renderer/src/types').MrStatus>
      getMrRepo: (key: string) => Promise<string | null>
      refreshLists: () => Promise<boolean>
      getLocalHosts: () => Promise<import('../renderer/src/types').LocalHost[]>
      closeChrome: (key: string | null) => Promise<{ error: string | null }>
      startTicketServer: (key: string, cwd: string | null) => Promise<{ error?: string; url?: string }>
      getMrBranchFolder: (key: string) => Promise<{ repo: string | null; folder: string | null }>
      getMrVersionDiff: (key: string, diffId: number, startSha: string, path: string | null) => Promise<import('../renderer/src/types').MrVersionDiff>
      runMrAction: (
        key: string,
        action: 'approve' | 'unapprove' | 'merge' | 'rebase',
        options?: { isSquash: boolean; isSourceRemoved: boolean }
      ) => Promise<{ error: string | null; isCancelled: boolean }>
      postMrReply: (key: string, discussionId: string, body: string) => Promise<{ error: string | null; isCancelled: boolean }>
      postMrComment: (key: string, body: string) => Promise<{ error: string | null; isCancelled: boolean }>
      startReview: (key: string) => Promise<{ error: string | null; sessionId?: string }>
      setAllProjects: (isAll: boolean) => void
      getStarred: () => string[]
      setStarred: (key: string, isOn: boolean) => void
      onStarred: (cb: (keys: string[]) => void) => void
    }
  }
}
