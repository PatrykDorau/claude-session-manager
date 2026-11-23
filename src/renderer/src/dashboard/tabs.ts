import type { Session } from '../types'

export type SessionRole = 'explain' | 'review' | 'mr' | 'main'

export const isSideSessionName = (name: string | null | undefined): boolean => /\bexplain$/.test(name ?? '') || / review$/.test(name ?? '')

export const sessionRole = (s: Session, _key: string, mrSessionId: string | null): SessionRole => {
  if (mrSessionId && s.id.startsWith(mrSessionId)) return 'mr'
  if (/\bexplain$/.test(s.name ?? '')) return 'explain'
  if (/ review$/.test(s.name ?? '')) return 'review'
  return 'main'
}

export const roleLabel = (role: SessionRole, s: Session, key: string): string => {
  if (role === 'explain') return 'Explain'
  if (role === 'review') return 'Review'
  if (role === 'mr') return 'Comments'
  return (s.name ?? '').replace(new RegExp(`^${key}\\s*`), '') || key
}
