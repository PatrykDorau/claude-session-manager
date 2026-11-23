import type { Autonomy, Job, JobKind, JobState } from '../../../main/orchestrator'
import type { MrRow } from '../types'

export interface PickRow {
  kind: 'ticket' | 'review' | 'watch'
  key: string
  title: string
  repo: string | null
  autonomy: Autonomy
  isLive: boolean
}

export const ticketPickRows = (
  tickets: { key: string; summary: string; type: string | null }[],
  repoFor: (key: string) => string | null,
  liveKeys: Set<string>
): PickRow[] =>
  tickets.map((t) => ({
    kind: 'ticket',
    key: t.key,
    title: t.summary,
    repo: repoFor(t.key),
    autonomy: t.type === 'Bug' ? 'autonomous' : 'manual',
    isLive: liveKeys.has(t.key)
  }))

export const mrPickRows = (mrs: MrRow[], me: string | null, liveKeys: Set<string>): PickRow[] =>
  mrs.map((m) => ({
    kind: me !== null && m.author === me ? 'watch' : 'review',
    key: m.key,
    title: m.title,
    repo: null,
    autonomy: 'routine',
    isLive: liveKeys.has(m.key)
  }))

const STATE_LABELS: Record<JobState, string> = {
  queued: 'queued',
  starting: 'starting',
  working: 'working',
  waiting: 'waiting for you',
  handoff: 'waiting for handoff',
  finished: 'finished',
  failed: 'failed'
}

export const stateLabel = (state: JobState, kind: JobKind): string =>
  kind === 'watch' && state === 'working' ? 'watching' : STATE_LABELS[state]

export const attentionCount = (jobs: Job[]): number =>
  jobs.filter((j) => j.state === 'waiting' || j.state === 'handoff').length
