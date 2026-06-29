import type { Session } from './types'

export type SortMode = 'status' | 'recency' | 'project'

const RANK: Record<string, number> = { working: 0, waiting: 1, checkout: 2, idle: 3, closed: 4 }

export function sortSessions(list: Session[], mode: SortMode): Session[] {
  const out = [...list]
  if (mode === 'recency') {
    out.sort((a, b) => b.lastActive - a.lastActive)
  } else if (mode === 'project') {
    out.sort((a, b) => a.projectName.localeCompare(b.projectName) || b.lastActive - a.lastActive)
  } else {
    out.sort((a, b) => RANK[a.status] - RANK[b.status] || b.lastActive - a.lastActive)
  }
  return out
}

export function groupByProject(list: Session[]): { project: string; sessions: Session[] }[] {
  const map = new Map<string, Session[]>()
  for (const s of list) {
    const arr = map.get(s.projectName)
    if (arr) arr.push(s)
    else map.set(s.projectName, [s])
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([project, sessions]) => ({ project, sessions }))
}
