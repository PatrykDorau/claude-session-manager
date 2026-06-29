import type { Session } from './types'

export type StatusFilter = 'all' | 'needs' | 'working' | 'live'

export function matchesFilter(s: Session, f: StatusFilter): boolean {
  switch (f) {
    case 'needs':
      return s.status === 'waiting'
    case 'working':
      return s.status === 'working'
    case 'live':
      return s.isLive
    default:
      return true
  }
}

export function matchesQuery(s: Session, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [s.projectName, s.ticket, s.name, s.firstPrompt].some((v) =>
    (v ?? '').toLowerCase().includes(q)
  )
}

export function colorForProject(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return `hsl(${h}, 45%, 55%)`
}
