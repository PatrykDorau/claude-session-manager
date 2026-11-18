import type { Session } from '../types'

export const followId = (sessions: Session[], id: string | null): string | null => {
  if (id === null) return null
  const next = sessions.find((s) => s.id === id)?.continuedAs
  return next && sessions.some((s) => s.id === next) ? next : id
}

export const followIds = (sessions: Session[], ids: string[]): string[] => [...new Set(ids.map((id) => followId(sessions, id) as string))]
