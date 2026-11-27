import type { Autonomy, Job, JobKind, JobRequest, JobState } from './orchestrator'
import type { PendingTool, Status } from '../renderer/src/types'
import { isForbiddenDispatcherQuestion, isForbiddenPrompt, isForbiddenRequest } from './guard'
import { JUDGEABLE_TOOLS, allowedKeys, isPlainObject } from './judge'
import { PERMISSION_KEYS } from '../renderer/src/dashboard/inbox'

export interface DispatchOption {
  key: string
  label: string
}

export interface DispatchEvent {
  seq: number
  at: number
  type: 'job' | 'waiting' | 'session'
  jobId: string
  key: string
  kind: JobKind | 'session'
  state: JobState | Status
  text: string
  toolUseId: string | null
  tool: string | null
  options: DispatchOption[]
}

export const EVENT_LIMIT = 500
export const DISPATCHER_NAME = 'dispatcher'

type NewEvent = Omit<DispatchEvent, 'seq'>

export const appendEvents = (events: DispatchEvent[], added: NewEvent[]): DispatchEvent[] => {
  const last = events.length > 0 ? events[events.length - 1].seq : 0
  const numbered = added.map((event, index) => ({ ...event, seq: last + index + 1 }))
  return [...events, ...numbered].slice(-EVENT_LIMIT)
}

export const eventsSince = (
  events: DispatchEvent[],
  since: number
): { events: DispatchEvent[]; latest: number; isReset: boolean } => {
  const latest = events.length > 0 ? events[events.length - 1].seq : 0
  const isReset = since > latest
  return { events: isReset ? events : events.filter((event) => event.seq > since), latest, isReset }
}

export const jobLogEvents = (prev: Job[], next: Job[], at: number): NewEvent[] =>
  next.flatMap((job) => {
    const before = prev.find((candidate) => candidate.id === job.id)
    const known = new Set(before?.log)
    return job.log
      .filter((line) => !known.has(line))
      .map((line) => ({
        at,
        type: 'job' as const,
        jobId: job.id,
        key: job.key,
        kind: job.kind,
        state: job.state,
        text: line.text,
        toolUseId: null,
        tool: null,
        options: []
      }))
  })

export const pendingOptions = (pending: PendingTool, questionOptions: string[]): DispatchOption[] => {
  const labels = pending.name === 'AskUserQuestion' ? questionOptions : ['Yes', 'No']
  const toOption = (key: string, index: number): DispatchOption => ({ key, label: labels[index] })
  return allowedKeys(pending, questionOptions).map(toOption)
}

const MIN_ID_REF = 8

export const findSessionRef = <T extends { id: string; label: string }>(rows: T[], ref: string): T | null => {
  const wanted = ref.trim().toLowerCase()
  if (!wanted) return null
  const isIdMatch = (row: T): boolean => wanted.length >= MIN_ID_REF && row.id.toLowerCase().startsWith(wanted)
  const isLabelMatch = (row: T): boolean => row.label.toLowerCase() === wanted
  const byId = rows.filter(isIdMatch)
  if (byId.length === 1) return byId[0]
  const byLabel = rows.filter(isLabelMatch)
  return byLabel.length === 1 ? byLabel[0] : null
}

export const waitingEvent = (job: Job, pending: PendingTool, questionOptions: string[], at: number): NewEvent => {
  return {
    at,
    type: 'waiting',
    jobId: job.id,
    key: job.key,
    kind: job.kind,
    state: job.state,
    text: pending.input,
    toolUseId: pending.toolUseId,
    tool: pending.name,
    options: pendingOptions(pending, questionOptions)
  }
}

export interface SessionEventInput {
  id: string
  status: Status
  isLive: boolean
  label: string
  title: string
}

const REPORTED_STATUSES: Status[] = ['waiting', 'checkout']

export const sessionEvents = (
  prev: Record<string, Status>,
  sessions: SessionEventInput[],
  skipIds: string[],
  at: number
): { events: NewEvent[]; next: Record<string, Status> } => {
  const isLive = (s: SessionEventInput): boolean => s.isLive
  const live = sessions.filter(isLive)
  const isReported = (s: SessionEventInput): boolean =>
    !skipIds.includes(s.id) && !!prev[s.id] && prev[s.id] !== s.status && REPORTED_STATUSES.includes(s.status)
  const toEvent = (s: SessionEventInput): NewEvent => ({
    at,
    type: 'session',
    jobId: s.id,
    key: s.label,
    kind: 'session',
    state: s.status,
    text: s.title,
    toolUseId: null,
    tool: null,
    options: []
  })
  const toEntry = (s: SessionEventInput): [string, Status] => [s.id, s.status]
  return { events: live.filter(isReported).map(toEvent), next: Object.fromEntries(live.map(toEntry)) }
}

export const refusedAnswer =(pending: PendingTool, rawInput: unknown, questionOptions: string[], key: string): string | null => {
  if (!JUDGEABLE_TOOLS.includes(pending.name) || !isPlainObject(rawInput)) return 'only the user can answer this prompt'
  if (isForbiddenRequest(pending.name, rawInput)) return 'forbidden request'
  if (pending.name === 'AskUserQuestion' && isForbiddenDispatcherQuestion(rawInput)) return 'forbidden request'
  if (pending.name !== 'AskUserQuestion' && key === PERMISSION_KEYS.always) return 'always-allow is not permitted'
  if (!allowedKeys(pending, questionOptions).includes(key)) return 'key not allowed'
  return null
}

export const refusedPrompt = (text: string, status: Status | null): string | null => {
  if (status !== 'idle') return 'session is not ready for a prompt'
  if (isForbiddenPrompt(text)) return 'forbidden request'
  return null
}

export interface DispatchJobRow {
  id: string
  kind: JobKind
  key: string
  title: string
  state: JobState
  autonomy: Autonomy
  log: string[]
  pending: { toolUseId: string; tool: string; text: string; options: DispatchOption[] } | null
}

export const jobRow = (job: Job, pending: PendingTool | null, questionOptions: string[]): DispatchJobRow => ({
  id: job.id,
  kind: job.kind,
  key: job.key,
  title: job.title,
  state: job.state,
  autonomy: job.autonomy,
  log: job.log.slice(-3).map((line) => line.text),
  pending: pending
    ? { toolUseId: pending.toolUseId, tool: pending.name, text: pending.input, options: waitingEvent(job, pending, questionOptions, 0).options }
    : null
})

interface StartInput {
  ticket: string
  review: string
  watch: string
  autonomy: string
}

interface StartLookups {
  jiraTitles: Record<string, string | undefined>
  mrs: { key: string; iid: number; title: string }[]
  repoFor: (key: string) => string | null
}

export const startRequestOf = (input: StartInput, lookups: StartLookups): JobRequest | null => {
  const ticket = input.ticket.toUpperCase()
  if (ticket) {
    const title = lookups.jiraTitles[ticket]
    if (title === undefined) return null
    return {
      kind: 'ticket',
      key: ticket,
      title,
      repo: lookups.repoFor(ticket),
      autonomy: input.autonomy === 'autonomous' ? 'autonomous' : 'manual'
    }
  }
  const mrRef = input.review || input.watch
  const mr = lookups.mrs.find((m) => m.key === mrRef || String(m.iid) === mrRef)
  if (!mrRef || !mr) return null
  return { kind: input.review ? 'review' : 'watch', key: mr.key, title: mr.title, repo: null, autonomy: 'routine' }
}

export const isDispatcherLive = (status: Status | null): boolean => status !== null && status !== 'closed'

export const dispatcherStartError = (out: string): string => {
  const lines = out.trim().split(/\r?\n/).map((line) => line.trim())
  return lines.find((line) => /workspace not trusted/i.test(line)) ?? (lines.pop() || 'claude did not start')
}

export const findDispatcherSession = <T extends { id: string }>(sessions: T[], knownId: string | null): T | undefined =>
  knownId ? sessions.find((s) => s.id.startsWith(knownId)) : undefined

export const dispatcherArgs = (): string[] => ['--bg', '--name', DISPATCHER_NAME, '--model', 'sonnet', 'Use the dispatcher skill.']
