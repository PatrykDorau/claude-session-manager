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

export interface RepoChoices {
  roots: { path: string; name: string }[]
  repoFor: (key: string) => string | null
}

export const repoChoices = (repos: { roots: { path: string; name: string }[]; byPrefix: Record<string, string> }): RepoChoices => {
  const toKey = (p: string): string => p.toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '')
  const extra = [...new Set(Object.values(repos.byPrefix))]
    .filter((p) => !repos.roots.some((r) => toKey(r.path) === toKey(p)))
    .map((p) => ({ path: p, name: p.split(/[\\/]/).filter(Boolean).pop() ?? p }))
  const roots = [...repos.roots, ...extra]
  const repoFor = (key: string): string | null => repos.byPrefix[key.split('-')[0].toUpperCase()] ?? roots[0]?.path ?? null
  return { roots, repoFor }
}

export const liveLast =(rows: PickRow[]): PickRow[] => [...rows.filter((r) => !r.isLive), ...rows.filter((r) => r.isLive)]

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

export const AUTONOMY_LEVELS: { value: Autonomy; label: string; hint: string }[] = [
  { value: 'manual', label: 'I decide', hint: 'Nothing is answered for you' },
  { value: 'routine', label: 'Permissions', hint: 'The judge answers tool permissions, never questions; handoffs wait for you' },
  { value: 'autonomous', label: 'Autonomous', hint: 'The judge also answers single questions; handoff, /clear and resume run on their own' }
]

export interface ActivityEntry {
  at: number
  jobId: string
  key: string
  kind: JobKind
  text: string
}

export const activityFeed = (jobs: Job[], jobFilter: string | null): ActivityEntry[] =>
  jobs
    .filter((j) => !jobFilter || j.id === jobFilter)
    .flatMap((j) => j.log.map((entry) => ({ at: entry.at, jobId: j.id, key: j.key, kind: j.kind, text: entry.text })))
    .sort((a, b) => b.at - a.at)

export const activityTone = (text: string): 'auto' | 'ask' | 'fail' | 'info' => {
  if (text.startsWith('auto:')) return 'auto'
  if (text.startsWith('escalated')) return 'ask'
  if (/fail|stall/i.test(text)) return 'fail'
  return 'info'
}

export const attentionCount =(jobs: Job[]): number =>
  jobs.filter((j) => j.state === 'waiting' || j.state === 'handoff').length
