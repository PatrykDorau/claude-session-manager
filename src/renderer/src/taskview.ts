import type { JiraTicket, Session } from './types'

export interface TaskRow {
  key: string
  summary: string
  status: string
  priority?: string
  sessions: Session[]
  isFromJira: boolean
}

const plainText = (text: string): string =>
  text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const newestFirst = (a: Session, b: Session): number => b.lastActive - a.lastActive

export const buildTaskRows = (
  tickets: JiraTicket[],
  sessions: Session[],
  finishedKeys: string[],
  titles: Record<string, string | null>
): TaskRow[] => {
  const byKey = new Map<string, Session[]>()
  for (const s of sessions.filter((x) => x.ticket)) {
    const key = (s.ticket as string).toUpperCase()
    byKey.set(key, [...(byKey.get(key) ?? []), s])
  }
  const jiraKeys = new Set(tickets.map((t) => t.key.toUpperCase()))
  const finished = new Set(finishedKeys.map((k) => k.toUpperCase()))
  const fromJira = tickets.map((t) => ({
    ...t,
    sessions: [...(byKey.get(t.key.toUpperCase()) ?? [])].sort(newestFirst),
    isFromJira: true
  }))
  const others = [...byKey.entries()]
    .filter(([key]) => !jiraKeys.has(key) && !finished.has(key))
    .map(([, list]) => {
      const sorted = [...list].sort(newestFirst)
      return {
        key: sorted[0].ticket as string,
        summary:
          titles[sorted[0].ticket as string] ?? sorted[0].name ?? plainText(sorted[0].firstPrompt ?? ''),
        status: '',
        sessions: sorted,
        isFromJira: false
      }
    })
    .sort((a, b) => b.sessions[0].lastActive - a.sessions[0].lastActive)
  return [...fromJira, ...others]
}

export interface Lane {
  key: string
  label: string
  color: string
}

const LANES: (Lane & { statuses: string[] })[] = [
  { key: 'progress', label: 'In progress', color: '#f0883e', statuses: ['in progress'] },
  { key: 'todo', label: 'To do', color: '#8b949e', statuses: ['to do', 'backlog'] },
  { key: 'review', label: 'Code review', color: '#e3b341', statuses: ['code review'] },
  {
    key: 'testing',
    label: 'Testing',
    color: '#56d364',
    statuses: ['internal testing', 'waiting for internal testing', 'user acceptance testing', 'testing']
  },
  {
    key: 'release',
    label: 'Ready to release',
    color: '#a8c94a',
    statuses: ['to release', 'waiting for internal release', 'ready for release']
  },
  { key: 'done', label: 'Done', color: '#2ea043', statuses: ['done', 'closed', 'accepted'] },
  { key: 'hold', label: 'On hold', color: '#6e7681', statuses: ['on hold'] },
  { key: 'rejected', label: 'Rejected', color: '#f85149', statuses: ['rejected'] },
  { key: 'other', label: 'Other statuses', color: '#a0a0a0', statuses: [] }
]

const OTHER_STATUS_LANE = LANES.find((l) => l.key === 'other') as Lane

export const statusLane = (status: string): Lane => {
  const s = status.trim().toLowerCase()
  const lane = LANES.find((l) => l.statuses.includes(s)) ?? OTHER_STATUS_LANE
  return { key: lane.key, label: lane.label, color: lane.color }
}

export const laneGroups = (rows: TaskRow[]): { lane: Lane; rows: TaskRow[] }[] =>
  LANES.map((l) => ({
    lane: { key: l.key, label: l.label, color: l.color },
    rows: rows.filter((r) => r.isFromJira && statusLane(r.status).key === l.key)
  })).filter((g) => g.rows.length)

export const splitTag = (summary: string): { tag: string; text: string } => {
  const tags: string[] = []
  let rest = summary.trim()
  let m = /^\[([^\]]+)\]\s*/.exec(rest)
  while (m) {
    tags.push(m[1])
    rest = rest.slice(m[0].length)
    m = /^\[([^\]]+)\]\s*/.exec(rest)
  }
  return { tag: tags.join(' / '), text: rest }
}
