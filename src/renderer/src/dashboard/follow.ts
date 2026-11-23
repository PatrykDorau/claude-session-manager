import type { Session } from '../types'

export const followId = (sessions: Session[], id: string | null): string | null => {
  if (id === null) return null
  const visited = new Set([id])
  let current = id
  for (;;) {
    const next = sessions.find((s) => s.id === current)?.continuedAs
    if (!next || visited.has(next) || !sessions.some((s) => s.id === next)) return current
    visited.add(next)
    current = next
  }
}

export const isSuperseded = (sessions: Session[], s: Session): boolean =>
  !!s.continuedAs && sessions.some((other) => other.id === s.continuedAs)

export const visibleTabs = (sessions: Session[], openedIds: string[]): Session[] =>
  sessions.filter((s) => openedIds.includes(s.id) || (s.isLive && !isSuperseded(sessions, s)))

export const followIds = (sessions: Session[], ids: string[]): string[] => [...new Set(ids.map((id) => followId(sessions, id) as string))]
