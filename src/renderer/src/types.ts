export type Status = 'working' | 'waiting' | 'checkout' | 'idle' | 'closed'

export type Stage =
  | 'brainstorm'
  | 'repro'
  | 'plan'
  | 'impl'
  | 'verify'
  | 'qa'
  | 'review'
  | 'mr'
  | 'testing'
  | 'done'

export const STAGES: Stage[] = [
  'brainstorm',
  'repro',
  'plan',
  'impl',
  'verify',
  'qa',
  'review',
  'mr',
  'testing',
  'done'
]

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
  model: string | null
  contextTokens: number | null
  dirty: boolean
  changes?: number
  stages: Stage[]
  bg?: boolean
  worktree?: boolean
  repo?: string | null
  finished?: boolean
  jiraStatus?: string | null
  manualTicket?: boolean
}

export interface TaskMeta {
  ticket: string
  title: string | null
  jiraStatus: string | null
  stage: Stage | null
  reached: Stage[]
  folder: string | null
  mrUrl: string | null
  isWatched: boolean
  isFinished: boolean
  isRejected: boolean
}

export interface CloseCandidate {
  id: string
  ticket: string
  title: string
  projectName: string
  status: Status
}

export interface JiraTicket {
  key: string
  summary: string
  status: string
  priority?: string
}

export type TerminalMode = 'attach' | 'resume' | 'vscode' | 'elsewhere'

export interface SessionDetail {
  turns: number
  messages: { role: 'user' | 'assistant'; text: string }[]
}

export interface QuickAction {
  label: string
  prompt: string
}

export interface MrItem {
  key: string
  projectId: number
  projectPath: string
  projectName: string
  iid: number
  title: string
  author: string
  sourceBranch: string
  targetBranch: string
  sha: string
  url: string
  description: string
  updatedAt: string
  ticket: string | null
  hasOpenThreads: boolean
  notes: number
  openThreads: number
  approvals: number
  isDraft: boolean
}

export type MrReviewState = 'new-changes' | 'not-reviewed' | 'reviewed'

export interface MrRow extends MrItem {
  review: MrReviewState
  sessionId: string | null
  priority?: string
}

export interface MrFile {
  path: string
  added: number
  removed: number
}

export interface DevServer {
  key: string
  port: number
  command: string
  cwd: string
  startedAt: number
  url: string
  label: string
}

export interface ServerChoice {
  tenant: string
  environment: string
  platform: string
  resolution: string
}

export interface ServerProfile {
  kind: 'stv' | 'web' | 'custom'
  tenants: string[]
  environments: string[]
  platforms: string[]
  resolutions: string[]
  choice: ServerChoice
  command: string
  isWorktree: boolean
}

export interface ServerSpec {
  kind: 'stv' | 'web' | 'custom'
  choice: ServerChoice
  command: string
}

export interface JiraTransition {
  id: string
  name: string
  to: string
}

export interface MyMrs {
  items: MrRow[]
  error: 'no-token' | 'failed' | null
  errorDetail?: string | null
  myName?: string | null
  isLoading?: boolean
  isAllProjects: boolean
}

export interface MyTasks {
  tickets: JiraTicket[]
  error: 'no-token' | 'failed' | null
}

export interface WorktreeRow {
  path: string
  repo: string
  name: string
  branch: string | null
  sessionCount: number
  isLive: boolean
  isDirty: boolean
}

export interface VscodeProfile {
  profileDir: string
  name: string
  status: 'configured' | 'missing' | 'conflict'
}

export type Severity = 'normal' | 'warning' | 'critical'

export interface Gauge {
  key: string
  label: string
  percent: number
  severity: Severity
  resetsAt: number | null
}

export type UsageResult =
  | { ok: true; gauges: Gauge[]; fetchedAt: number }
  | { ok: false; error: 'no-credentials' | 'expired' | 'network'; fetchedAt: number }

export interface ChangedFile {
  path: string
  state: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'
}

export interface TicketComment {
  author: string
  created: string
  body: string
}

export interface TicketDetail {
  key: string
  summary: string
  description: string
  status: string
  type: string
  priority: string
  reporter: string
  assignee: string
  labels: string[]
  fixVersions: string[]
  created: string
  updated: string
  attachments: { name: string; url: string }[]
  comments: TicketComment[]
}

export interface BranchChanges {
  branch: string
  target: string
  base: string
  files: ChangedFile[]
  isReadOnly?: boolean
  folder?: string
  uncommitted?: string[]
}


export interface FlowStep {
  step: number
  title: string
  before: string
  after: string
  isChanged: boolean
  ms: number | null
}

export interface ExplainChange {
  file: string
  line: number
  step: number
  title: string
  why: string
}

export interface ExplainDoc {
  ticket: string
  branch: string
  base: string
  process: string
  flow: FlowStep[]
  changes: ExplainChange[]
}

export interface ExplainFile {
  doc: ExplainDoc
  mdPath: string
  updatedAt: number
}

export interface MenuItem {
  label: string
  hint?: string
  icon?: import('./dashboard/icons').IconName
  isDisabled?: boolean
  run: () => void
}

export type AgentState = 'working' | 'stuck' | 'interrupted' | 'finished'
export type ModelTier = 'opus' | 'sonnet' | 'haiku' | 'other'

export interface AgentNode {
  id: string
  agentType: string
  description: string
  model: ModelTier
  state: AgentState
  toolCalls: number
  lastText: string
  lastAt: number | null
  task: string
  depth: number
}

export interface AgentGroup {
  sessionId: string
  agents: AgentNode[]
}

export interface AgentStep {
  role: 'user' | 'assistant'
  text: string
  tools: string[]
}

export interface MrState {
  state: string
  mergeStatus: string
  isMergeable: boolean
  hasConflicts: boolean
  behind: number
  pipeline: string | null
  canMerge: boolean
}

export interface MrApprovals {
  approvedBy: string[]
  left: number
  isApprovedByMe: boolean
}

export interface MrNote {
  id: number
  author: string
  body: string
  createdAt: string
  isMine: boolean
}

export interface MrSnippet {
  rows: { no: number | null; mark: string; text: string; isHit: boolean }[]
}

export interface MrDiscussion {
  id: string
  isSystem: boolean
  isResolved: boolean
  isResolvable: boolean
  where: string | null
  anchor: { path: string; line: number; sha: string; side: 'new' | 'old' } | null
  snippet: MrSnippet | null
  notes: MrNote[]
}

export interface MrPipeline {
  id: number
  status: string
  sha: string
  url: string
  coverage: string | null
}

export interface MrOverview {
  description: string
  descriptionHtml: string
  isDraft: boolean
  createdAt: string
  author: string
  assignees: string[]
  reviewers: string[]
  labels: string[]
  milestone: string | null
  isSquash: boolean
  isSourceRemoved: boolean
  pipeline: MrPipeline | null
}

export interface MrStatus {
  state: MrState | null
  overview: MrOverview | null
  approvals: MrApprovals | null
  discussions: MrDiscussion[] | null
  drafts: MrDraftNote[] | null
  diffRefs: MrDiffRefs | null
  problem: string | null
}

export interface CodeComment {
  id: string
  path: string
  line: number
  isResolved: boolean
  notes: { author: string; body: string; html?: string }[]
  isDraft?: boolean
  draftId?: number
  discussionId?: string
  isResolvable?: boolean
}

export interface DiffRow {
  kind: ' ' | '+' | '-' | 'hunk'
  old: number | null
  new: number | null
  text: string
}

export interface MrVersionDiff {
  files: { path: string; rows: DiffRow[] }[]
  problem: string | null
}

export interface LocalHost {
  key: string | null
  server: (DevServer & { lastOutputAt: number | null }) | null
  chrome: { port: number; isUp: boolean; pages: { title: string; url: string }[] }
}

export interface MrDiffRefs {
  baseSha: string
  startSha: string
  headSha: string
}

export interface MrLinePosition {
  position_type: 'text'
  base_sha: string
  start_sha: string
  head_sha: string
  old_path: string
  new_path: string
  new_line?: number
  old_line?: number
}

export interface MrDraftNote {
  id: number
  body: string
  anchor: MrDiscussion['anchor']
  replyTo: string | null
}

export interface MrCommentable {
  isAllowed: boolean
  reason: string | null
  headSha?: string | null
  path?: string
}

export interface MrLineAnchor {
  path: string
  line: number
  side: 'new' | 'old'
  sha: string
}

export type MrReviewAction =
  | { kind: 'draft-add'; body: string; anchor?: MrLineAnchor; replyTo?: string }
  | { kind: 'draft-edit'; id: number; body: string }
  | { kind: 'draft-delete'; id: number }
  | { kind: 'submit-review'; count: number }
  | { kind: 'line-comment'; body: string; anchor: MrLineAnchor }
  | { kind: 'resolve'; discussionId: string; isResolved: boolean }
  | { kind: 'reply'; discussionId: string; body: string }
  | { kind: 'note-edit'; discussionId: string; noteId: number; body: string }
  | { kind: 'note-delete'; discussionId: string; noteId: number }
  | { kind: 'set-draft'; isDraft: boolean; title: string }
  | { kind: 'edit-text'; title?: string; description?: string }

export interface TicketMr {
  iid: number
  projectId: number
  state: string
  title: string
  url: string
  description: string
}

export interface FactoryProposal {
  id: string
  target: string
  title: string
  evidence: string[]
  find: string
  replace: string
  isDismissed: boolean
}

export type FlowRole = { stage: string; who: string; model: string; isMain: boolean; agents: string[] }
export type FlowStage = { n: number; title: string; isGated: boolean; roles: FlowRole[] }
export type FlowAgent = { name: string; model: string; description: string }
export type FlowBooster = { id: string; name: string; detail: string }
export type FlowSkill = { stages: FlowStage[]; sizes: string[][]; risk: string[]; error: string | null }
export type FlowTicket = {
  key: string
  n: number | null
  stage: string
  next: string
  firstStep: string
  size: 'S' | 'M' | 'L' | null
  risk: 'low' | 'high' | 'critical' | null
}
export type FlowState = {
  skill: FlowSkill
  raw: string
  skillPath: string
  updatedAt: number
  tickets: FlowTicket[]
  agents: FlowAgent[]
  boosters: FlowBooster[]
}

export interface FactoryReport {
  day: string | null
  report: string | null
  proposals: FactoryProposal[]
  trend: { date: string; tokens: number }[]
  isRunning: boolean
  lastRun: number | null
  lastError: string | null
}
