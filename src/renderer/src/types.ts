export type Status = 'working' | 'waiting' | 'checkout' | 'idle' | 'closed'

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
  bg?: boolean
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
