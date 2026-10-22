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
