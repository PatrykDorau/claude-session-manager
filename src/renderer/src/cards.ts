import type { Session, Status, TaskMeta } from './types'
import { RANK, sortSessions, type SortMode } from './sort'
import { matchesQuery } from './filter'

export interface Card {
  ticket: string
  meta: TaskMeta | null
  sessions: Session[]
  status: Status
  lastActive: number
  projects: string[]
  isActive: boolean
}

const ACTIVE: Status[] = ['waiting', 'working', 'checkout']

const byUrgency = (a: Session, b: Session): number =>
  RANK[a.status] - RANK[b.status] ||
  Number(b.isLive) - Number(a.isLive) ||
  b.lastActive - a.lastActive

export function buildCards(sessions: Session[], tasks: Record<string, TaskMeta>): Card[] {
  const groups = new Map<string, Session[]>()
  for (const s of sessions) if (s.ticket) groups.set(s.ticket, [...(groups.get(s.ticket) ?? []), s])
  return [...groups].map(([ticket, list]) => {
    const sorted = [...list].sort(byUrgency)
    return {
      ticket,
      meta: tasks[ticket] ?? null,
      sessions: sorted,
      status: sorted[0].status,
      lastActive: Math.max(...list.map((s) => s.lastActive)),
      projects: [...new Set(list.map((s) => s.projectName))],
      isActive: list.some((s) => s.isLive || ACTIVE.includes(s.status))
    }
  })
}

export function primarySession(card: Card): Session {
  return card.sessions[0]
}

export function splitSections(
  cards: Card[],
  noTask: Session[]
): { tasks: Card[]; noTask: Session[]; finishedCards: Card[]; finishedSessions: Session[] } {
  const isCardFinished = (c: Card): boolean => !!c.meta?.isFinished && !c.isActive
  const isSessionFinished = (s: Session): boolean => !!s.finished && !s.isLive
  return {
    tasks: cards.filter((c) => !isCardFinished(c)),
    finishedCards: cards.filter(isCardFinished),
    noTask: noTask.filter((s) => !isSessionFinished(s)),
    finishedSessions: noTask.filter(isSessionFinished)
  }
}

export function sortCards(cards: Card[], mode: SortMode): Card[] {
  const byMode = (a: Card, b: Card): number => {
    if (mode === 'recency') return b.lastActive - a.lastActive
    if (mode === 'project')
      return a.projects[0].localeCompare(b.projects[0]) || b.lastActive - a.lastActive
    return byUrgency(primarySession(a), primarySession(b))
  }
  return [...cards].sort(
    (a, b) => Number(!!b.meta?.isWatched) - Number(!!a.meta?.isWatched) || byMode(a, b)
  )
}

export function sortNoTask(list: Session[], mode: SortMode): Session[] {
  const tier = (s: Session): number => (s.watched ? 0 : s.isLive ? 1 : 2)
  return sortSessions(list, mode).sort((a, b) => tier(a) - tier(b))
}

export function cardMatches(card: Card, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if ((card.meta?.title ?? '').toLowerCase().includes(q)) return true
  return card.sessions.some((s) => matchesQuery(s, q))
}
