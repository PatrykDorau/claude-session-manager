import type { Status } from '../renderer/src/types'
import { handoffPath } from '../renderer/src/dashboard/context'
import { isDispatcherLive } from './dispatcher'

export type Autonomy = 'manual' | 'autonomous' | 'routine'
export type AutonomyChoice = 'off' | 'routine' | 'autonomous'
export type JobKind = 'ticket' | 'review' | 'address' | 'watch'
export type JobState = 'queued' | 'starting' | 'working' | 'waiting' | 'handoff' | 'finished' | 'failed'
export type HandoffPhase = 'none' | 'handoff' | 'clearing' | 'resuming'

export interface JobLog {
  at: number
  text: string
}

export interface Job {
  id: string
  kind: JobKind
  key: string
  title: string
  repo: string | null
  autonomy: Autonomy
  state: JobState
  sessionId: string | null
  handoffPhase: HandoffPhase
  lastSeenNoteId: number | null
  isCommentsPending: boolean
  autoHandoffs: number
  log: JobLog[]
  createdAt: number
}

export interface OrchestratorState {
  jobs: Job[]
  dispatcherSessionId: string | null
  isCoordinatorOn: boolean
}

export const LOG_LIMIT = 20

const AUTONOMIES: Autonomy[] = ['manual', 'autonomous', 'routine']
const JOB_KINDS: JobKind[] = ['ticket', 'review', 'address', 'watch']
const JOB_STATES: JobState[] = ['queued', 'starting', 'working', 'waiting', 'handoff', 'finished', 'failed']
const HANDOFF_PHASES: HandoffPhase[] = ['none', 'handoff', 'clearing', 'resuming']

export const emptyOrchestrator = (): OrchestratorState => ({ jobs: [], dispatcherSessionId: null, isCoordinatorOn: true })

export const defaultAutonomy = (issueType: string | null): Autonomy =>
  issueType === 'Bug' ? 'autonomous' : 'manual'

export const jobId = (kind: JobKind, key: string): string => `${kind}:${key}`

export const addLog = (job: Job, text: string, at: number): Job => ({
  ...job,
  log: [...job.log, { at, text }].slice(-LOG_LIMIT)
})

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

const isNullableString = (v: unknown): v is string | null => v === null || typeof v === 'string'

const isNullableNumber = (v: unknown): v is number | null => v === null || typeof v === 'number'

const isJobLog = (v: unknown): v is JobLog =>
  isRecord(v) && typeof v.at === 'number' && typeof v.text === 'string'

const loadJob = (raw: unknown): Job | null => {
  if (!isRecord(raw)) return null
  if (
    typeof raw.id !== 'string' ||
    !JOB_KINDS.includes(raw.kind as JobKind) ||
    typeof raw.key !== 'string' ||
    typeof raw.title !== 'string' ||
    !isNullableString(raw.repo) ||
    !AUTONOMIES.includes(raw.autonomy as Autonomy) ||
    !JOB_STATES.includes(raw.state as JobState) ||
    !isNullableString(raw.sessionId) ||
    !HANDOFF_PHASES.includes(raw.handoffPhase as HandoffPhase) ||
    !isNullableNumber(raw.lastSeenNoteId) ||
    typeof raw.isCommentsPending !== 'boolean' ||
    !Array.isArray(raw.log) ||
    !raw.log.every(isJobLog) ||
    typeof raw.createdAt !== 'number'
  )
    return null
  const state = raw.state === 'starting' && raw.sessionId === null ? 'queued' : (raw.state as JobState)
  return {
    id: raw.id,
    kind: raw.kind as JobKind,
    key: raw.key,
    title: raw.title,
    repo: raw.repo,
    autonomy: raw.autonomy as Autonomy,
    state,
    sessionId: raw.sessionId,
    handoffPhase: raw.handoffPhase as HandoffPhase,
    lastSeenNoteId: raw.lastSeenNoteId,
    isCommentsPending: raw.isCommentsPending,
    autoHandoffs: typeof raw.autoHandoffs === 'number' && raw.autoHandoffs >= 0 ? raw.autoHandoffs : 0,
    log: raw.log,
    createdAt: raw.createdAt
  }
}

export const loadOrchestrator = (raw: unknown): OrchestratorState => {
  if (!isRecord(raw) || !Array.isArray(raw.jobs)) return emptyOrchestrator()
  return {
    jobs: raw.jobs.map(loadJob).filter((j): j is Job => j !== null),
    dispatcherSessionId: typeof raw.dispatcherSessionId === 'string' ? raw.dispatcherSessionId : null,
    isCoordinatorOn: raw.isCoordinatorOn !== false
  }
}

export const isCoordinatorActive = (state: OrchestratorState, dispatcherStatus: Status | null): boolean =>
  state.isCoordinatorOn && isDispatcherLive(dispatcherStatus)

export const isAutoHandoff = (job: Job, isCoordinatorLive: boolean): boolean =>
  job.autonomy === 'autonomous' || (job.autonomy === 'manual' && isCoordinatorLive)

export interface SessionView {
  id: string
  status: Status
  ticket: string | null
  isLive: boolean
  isAsleep?: boolean
}

const isTurnOver = (status: Status): boolean => status === 'idle' || status === 'checkout'

const RUNNING_STATES: JobState[] = ['starting', 'working', 'waiting', 'handoff']

const workKeys = (job: Job, mrTickets: Map<string, string>): string[] => {
  const ticket = job.kind === 'address' ? mrTickets.get(job.key) : undefined
  return ticket === undefined ? [job.key] : [job.key, ticket]
}

export const jobsToStart = (
  state: OrchestratorState,
  maxParallel: number,
  liveKeys: Set<string>,
  mrTickets: Map<string, string> = new Map()
): Job[] => {
  const isStarting = (j: Job): boolean => j.state === 'starting'
  const workKeysOf = (j: Job): string[] => workKeys(j, mrTickets)
  const isRunningTicket = (j: Job): boolean => j.kind === 'ticket' && RUNNING_STATES.includes(j.state)
  const starting = state.jobs.filter(isStarting)
  const seenKeys = new Set([...liveKeys, ...starting.flatMap(workKeysOf)])
  const running = state.jobs.filter(isRunningTicket).length
  const free = Math.max(0, maxParallel - running)
  const isFree = (job: Job): boolean => {
    const keys = workKeys(job, mrTickets)
    if (keys.some((k) => seenKeys.has(k))) return false
    for (const key of keys) seenKeys.add(key)
    return true
  }
  const isQueued = (j: Job): boolean => j.state === 'queued' && j.kind !== 'watch'
  const byCreatedAt = (a: Job, b: Job): number => a.createdAt - b.createdAt
  const isTicket = (j: Job): boolean => j.kind === 'ticket'
  const startable = state.jobs.filter(isQueued).sort(byCreatedAt).filter(isFree)
  const slotted = startable.filter(isTicket).slice(0, free)
  const isWithinSlots = (j: Job): boolean => !isTicket(j) || slotted.includes(j)
  return startable.filter(isWithinSlots)
}

export const handAddressToLiveTicket = (
  jobs: Job[],
  liveKeys: Set<string>,
  mrTickets: Map<string, string>,
  now: number
): Job[] => {
  const isHanded = (job: Job): boolean =>
    job.kind === 'address' && job.state === 'queued' && liveKeys.has(mrTickets.get(job.key) ?? '')
  const handed = new Set(jobs.filter(isHanded).map((j) => j.key))
  if (!handed.size) return jobs
  return jobs.map((j) => {
    if (isHanded(j)) return addLog({ ...j, state: 'finished' }, 'the live ticket session takes the comments', now)
    if (j.kind === 'watch' && handed.has(j.key) && !isJobOver(j))
      return addLog({ ...j, isCommentsPending: true }, 'new comments: waiting for the ticket session', now)
    return j
  })
}

export const nextJobState = (job: Job, session: SessionView | null): JobState => {
  if (!session) return job.state
  if (session.status === 'closed') return session.isAsleep ? job.state : 'finished'
  if (job.handoffPhase !== 'none') return 'handoff'
  if (session.status === 'checkout' && job.kind !== 'ticket') return 'finished'
  return session.status === 'working' ? 'working' : 'waiting'
}

export const AUTO_HANDOFF_LIMIT = 2

export const handoffStopAction = (
  job: Job,
  prev: Status | undefined,
  now: Status,
  handoffWrittenAt: number | null,
  turnStartedAt: number,
  isCoordinatorLive: boolean
): 'none' | 'hold' | 'limit' | 'auto' => {
  if (prev === undefined || !isHandoffStop(prev, now, handoffWrittenAt, turnStartedAt)) return 'none'
  if (!isAutoHandoff(job, isCoordinatorLive)) return 'hold'
  return job.autoHandoffs >= AUTO_HANDOFF_LIMIT ? 'limit' : 'auto'
}

export const isHandoffStop = (
  prev: Status,
  now: Status,
  handoffWrittenAt: number | null,
  turnStartedAt: number
): boolean =>
  prev === 'working' && isTurnOver(now) && handoffWrittenAt !== null && handoffWrittenAt >= turnStartedAt

export const nextHandoffStep = (
  phase: HandoffPhase,
  prev: Status,
  now: Status
): { phase: HandoffPhase; action: 'none' | 'clear' | 'resume' } => {
  if (phase === 'none') return { phase, action: 'none' }
  if (now === 'closed') return { phase: 'none', action: 'none' }
  if (phase === 'handoff' && prev === 'working' && isTurnOver(now)) return { phase: 'clearing', action: 'clear' }
  if (phase === 'clearing' && isTurnOver(now)) return { phase: 'resuming', action: 'resume' }
  if (phase === 'resuming' && now === 'working') return { phase: 'none', action: 'none' }
  return { phase, action: 'none' }
}

export const resumePrompt = (ticket: string, now: Date): string =>
  `Przeczytaj ${handoffPath(ticket, now)} według skilla handoff i kontynuuj następny krok workflow zadania.`

export interface JobRequest {
  kind: 'ticket' | 'review' | 'watch'
  key: string
  title: string
  repo: string | null
  autonomy: Autonomy
}

export const newJob = (request: JobRequest, now: number, isThreadOpen: boolean): Job => ({
  id: jobId(request.kind, request.key),
  kind: request.kind,
  key: request.key,
  title: request.title,
  repo: request.repo,
  autonomy: request.kind !== 'ticket' ? 'routine' : AUTONOMIES.includes(request.autonomy) ? request.autonomy : 'manual',
  state: request.kind === 'watch' ? 'working' : 'queued',
  sessionId: null,
  handoffPhase: 'none',
  lastSeenNoteId: request.kind === 'watch' && isThreadOpen ? 0 : null,
  isCommentsPending: false,
  autoHandoffs: 0,
  log: [{ at: now, text: request.kind === 'watch' ? 'watching comments' : 'queued' }],
  createdAt: now
})

export const adoptJob = (session: { id: string; ticket: string; repo: string | null; title: string }, now: number): Job => {
  const key = session.ticket
  return {
    id: jobId('ticket', key),
    kind: 'ticket',
    key,
    title: session.title,
    repo: session.repo,
    autonomy: 'manual',
    state: 'working',
    sessionId: session.id,
    handoffPhase: 'none',
    lastSeenNoteId: null,
    isCommentsPending: false,
    autoHandoffs: 0,
    log: [{ at: now, text: 'adopted' }],
    createdAt: now
  }
}

export interface LiveTicketSession {
  id: string
  repo: string | null
}

export const requestedJob = (request: JobRequest, now: number, isThreadOpen: boolean, live: LiveTicketSession | null): Job =>
  request.kind === 'ticket' && live
    ? {
        ...adoptJob({ id: live.id, ticket: request.key, repo: live.repo ?? request.repo, title: request.title }, now),
        autonomy: newJob(request, now, false).autonomy
      }
    : newJob(request, now, isThreadOpen)

export const withAutonomy = (job: Job, autonomy: Autonomy, now: number): Job =>
  !AUTONOMIES.includes(autonomy) || job.autonomy === autonomy ? job : addLog({ ...job, autonomy }, `autonomy: ${autonomy}`, now)

export const isAdopted =(jobs: Job[], sessionId: string): boolean => jobs.some((j) => j.sessionId === sessionId)

export const withAdopted = (jobs: Job[], job: Job): Job[] | null => {
  const existing = jobs.find((j) => j.id === job.id)
  if (existing && !isJobOver(existing)) return null
  return [...jobs.filter((j) => j.id !== job.id), job]
}

export const isJobOver = (job: Job): boolean => job.state === 'finished' || job.state === 'failed'

export const requeueJob = (job: Job, now: number): Job =>
  addLog(
    {
      ...job,
      state: job.kind === 'watch' ? 'working' : 'queued',
      sessionId: null,
      handoffPhase: 'none',
      isCommentsPending: false,
      autoHandoffs: 0,
      createdAt: now
    },
    'queued again',
    now
  )

export const queueAddressJob = (jobs: Job[], key: string, title: string, now: number): Job[] => {
  const id = jobId('address', key)
  const existing = jobs.find((j) => j.id === id)
  if (!existing) return [...jobs, { ...newJob({ kind: 'review', key, title, repo: null, autonomy: 'routine' }, now, false), id, kind: 'address' }]
  if (!isJobOver(existing)) return jobs
  return jobs.map((j) => (j.id === id ? requeueJob(j, now) : j))
}

export interface ClearMark {
  sessionId: string
  contextTokens: number | null
  clearLinks: string[]
}

export const CLEAR_TOKEN_DROP = 0.5

export const isClearConfirmed = (before: ClearMark, now: ClearMark): boolean =>
  now.sessionId !== before.sessionId ||
  now.clearLinks.some((link) => !before.clearLinks.includes(link)) ||
  (before.contextTokens !== null &&
    before.contextTokens > 0 &&
    now.contextTokens !== null &&
    now.contextTokens < before.contextTokens * CLEAR_TOKEN_DROP)

export const isHandoffStalled = (phase: HandoffPhase, status: Status, elapsedMs: number, stallMs: number): boolean =>
  phase !== 'none' && elapsedMs > stallMs && (phase !== 'handoff' || isTurnOver(status))

export const nextHandoffTick = (
  phase: HandoffPhase,
  prev: Status,
  now: Status,
  isClearDone: boolean,
  elapsedMs: number,
  stallMs: number
): { phase: HandoffPhase; action: 'none' | 'clear' | 'resume' | 'stall' } => {
  const step = phase === 'clearing' && !isClearDone ? { phase, action: 'none' as const } : nextHandoffStep(phase, prev, now)
  if (step.phase !== phase) return step
  return isHandoffStalled(phase, now, elapsedMs, stallMs) ? { phase: 'none', action: 'stall' } : step
}

export const isHandoffClockReset = (phase: HandoffPhase, status: Status): boolean =>
  phase === 'handoff' && (status === 'working' || status === 'waiting')

export const requeueFromRequest = (job: Job, request: JobRequest, now: number): Job => {
  const fresh = newJob(request, now, false)
  return requeueJob({ ...job, title: fresh.title, repo: fresh.repo, autonomy: fresh.autonomy }, now)
}

export const followSession = (id: string, links: Map<string, string>, knownIds: string[]): string => {
  const known = knownIds.includes(id) ? id : (knownIds.find((k) => k.startsWith(id)) ?? id)
  const seen = new Set<string>()
  let current = known
  while (links.has(current) && !seen.has(current)) {
    seen.add(current)
    current = links.get(current) as string
  }
  return current
}

export const isHandoffHeld = (job: Job, session: SessionView | null): boolean =>
  job.state === 'handoff' &&
  job.handoffPhase === 'none' &&
  session !== null &&
  session.status !== 'working' &&
  session.status !== 'closed'

export const isPromptSkipping = (commandLine: string): boolean =>
  /--dangerously-skip-permissions|--permission-mode[\s=]+["']?bypassPermissions/.test(commandLine)

export const PROMPT_SKIP_WARNING = 'prompts are skipped in this session, so the hard rules cannot see anything'
