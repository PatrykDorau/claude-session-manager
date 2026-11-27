import type { FlowMapStep } from '../../../main/flow'
import { isJobOver, type Autonomy, type Job, type JobState } from '../../../main/orchestrator'
import type { Session, Stage, Status } from '../types'

export type BarTrack = 'ticket' | 'review' | 'watch' | 'session'
export type BarStatus = 'queued' | 'working' | 'waiting' | 'turn-done' | 'idle' | 'handoff' | 'finished' | 'failed'

export interface BarStep {
  label: string
  isDone: boolean
  isCurrent: boolean
}

export interface CoordinatorBar {
  id: string
  key: string
  title: string
  track: BarTrack
  steps: BarStep[]
  status: BarStatus
  autonomy: Autonomy | null
  jobId: string | null
  sessionId: string | null
  isWaiting: boolean
}

export const TICKET_STEPS: Stage[] = ['repro', 'plan', 'impl', 'verify', 'qa', 'review', 'mr']

export const GATE_LABELS: Record<Autonomy, string> = {
  manual: 'Ask me at every gate',
  autonomous: 'Alone up to MR',
  routine: 'Routine'
}

const SESSION_STATUS: Record<Status, BarStatus> = {
  working: 'working',
  waiting: 'waiting',
  checkout: 'turn-done',
  idle: 'idle',
  closed: 'idle'
}

const JOB_STATUS: Record<JobState, BarStatus> = {
  queued: 'queued',
  starting: 'queued',
  working: 'working',
  waiting: 'waiting',
  handoff: 'handoff',
  finished: 'finished',
  failed: 'failed'
}

export const ticketStages = (key: string, sessions: Session[]): Stage[] => {
  const isOfTicket = (session: Session): boolean => session.ticket === key
  const stagesOf = (session: Session): Stage[] => session.stages
  return [...new Set(sessions.filter(isOfTicket).flatMap(stagesOf))]
}

const markCurrent = (labels: string[], isDoneAt: (label: string) => boolean): BarStep[] => {
  const isOpen = (label: string): boolean => !isDoneAt(label)
  const firstOpen = labels.findIndex(isOpen)
  const toStep = (label: string, index: number): BarStep => ({
    label,
    isDone: isDoneAt(label),
    isCurrent: index === firstOpen
  })
  return labels.map(toStep)
}

const stageSteps = (key: string, sessions: Session[]): BarStep[] => {
  const reached = ticketStages(key, sessions)
  const isReached = (label: string): boolean => reached.includes(label as Stage)
  return markCurrent(TICKET_STEPS, isReached)
}

const isNeverDone = (): boolean => false

export const jobSteps = (job: Job, sessions: Session[]): BarStep[] => {
  if (job.kind === 'watch') return markCurrent(['watching'], isNeverDone)
  if (job.kind === 'review' || job.kind === 'address') {
    const isPosted = (label: string): boolean => label === 'posted' && job.state === 'finished'
    return markCurrent(['review', 'posted'], isPosted)
  }
  return stageSteps(job.key, sessions)
}

const jobTrack = (job: Job): BarTrack => (job.kind === 'address' ? 'review' : job.kind)

const jobStatus = (job: Job, sessions: Session[]): BarStatus => {
  const isLinkedLive = (session: Session): boolean => session.id === job.sessionId && session.isLive
  const linked = sessions.find(isLinkedLive)
  if (isJobOver(job) || job.state === 'handoff' || !linked) return JOB_STATUS[job.state]
  return SESSION_STATUS[linked.status]
}

const jobBar = (job: Job, sessions: Session[], titleOf: (key: string) => string): CoordinatorBar => {
  const status = jobStatus(job, sessions)
  return {
    id: job.id,
    key: job.key,
    title: titleOf(job.key),
    track: jobTrack(job),
    steps: jobSteps(job, sessions),
    status,
    autonomy: job.autonomy,
    jobId: job.id,
    sessionId: job.sessionId,
    isWaiting: status === 'waiting'
  }
}

const sessionTitle = (session: Session, titleOf: (key: string) => string): string =>
  session.ticket ? titleOf(session.ticket) : (session.name ?? session.firstPrompt ?? session.projectName)

const sessionBar = (session: Session, sessions: Session[], titleOf: (key: string) => string): CoordinatorBar => {
  const status = SESSION_STATUS[session.status]
  return {
    id: session.id,
    key: session.ticket ?? session.id,
    title: sessionTitle(session, titleOf),
    track: 'session',
    steps: session.ticket ? stageSteps(session.ticket, sessions) : [],
    status,
    autonomy: null,
    jobId: null,
    sessionId: session.id,
    isWaiting: status === 'waiting'
  }
}

const OVER_STATUSES: BarStatus[] = ['finished', 'failed']

const barRank = (bar: CoordinatorBar): number => {
  if (bar.isWaiting) return 0
  if (bar.status === 'working') return 1
  return OVER_STATUSES.includes(bar.status) ? 3 : 2
}

export const coordinatorBars = (
  jobs: Job[],
  sessions: Session[],
  titleOf: (key: string) => string,
  dispatcherId: string | null
): CoordinatorBar[] => {
  const sessionIdOf = (job: Job): string | null => job.sessionId
  const isPresent = (id: string | null): id is string => id !== null
  const jobSessionIds = new Set(jobs.map(sessionIdOf).filter(isPresent))
  const isPlain = (session: Session): boolean =>
    session.isLive && session.id !== dispatcherId && !jobSessionIds.has(session.id)
  const plainSessions = sessions.filter(isPlain)
  const jobStamp = (job: Job): [string, number] => [job.id, job.createdAt]
  const sessionStamp = (session: Session): [string, number] => [session.id, session.lastActive]
  const stamps = new Map<string, number>([...jobs.map(jobStamp), ...plainSessions.map(sessionStamp)])
  const toJobBar = (job: Job): CoordinatorBar => jobBar(job, sessions, titleOf)
  const toSessionBar = (session: Session): CoordinatorBar => sessionBar(session, sessions, titleOf)
  const bars = [...jobs.map(toJobBar), ...plainSessions.map(toSessionBar)]
  const byRecency = (a: CoordinatorBar, b: CoordinatorBar): number =>
    barRank(a) - barRank(b) || (stamps.get(b.id) ?? 0) - (stamps.get(a.id) ?? 0)
  return bars.sort(byRecency)
}

const STAGE_STEP_PREFIX: Record<string, string> = {
  repro: 'repro',
  plan: 'plan',
  impl: 'implementation',
  verify: 'verify',
  qa: 'qa test cases',
  review: 'review self',
  mr: 'draft mr'
}

const STATIC_STAGE_INFO: Record<string, string> = {
  posted: 'The review comments are posted as draft notes on the MR.',
  watching: 'The coordinator keeps watching this item and reports changes.'
}

export const STAGE_INFO_FALLBACK = 'No description available for this stage.'

export const stageInfo = (label: string, steps: Pick<FlowMapStep, 'name' | 'summary'>[]): string => {
  if (STATIC_STAGE_INFO[label]) return STATIC_STAGE_INFO[label]
  const prefix = STAGE_STEP_PREFIX[label]
  if (!prefix) return STAGE_INFO_FALLBACK
  const isMatch = (step: Pick<FlowMapStep, 'name'>): boolean => step.name.toLowerCase().startsWith(prefix)
  return steps.find(isMatch)?.summary || STAGE_INFO_FALLBACK
}

export const stageState = (step: BarStep): 'done' | 'current' | 'not yet' => {
  if (step.isDone) return 'done'
  return step.isCurrent ? 'current' : 'not yet'
}
