import type { Session } from '../types'

const pad = (n: number): string => String(n).padStart(2, '0')

export const dayKey = (at: number): string => {
  const d = new Date(at)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const startOfDay = (at: number): number => {
  const d = new Date(at)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export const msToMidnight = (now: number): number => {
  const d = new Date(startOfDay(now))
  d.setDate(d.getDate() + 1)
  return d.getTime() - now
}

export const isActiveToday = (sessions: (Session | undefined)[], now: number): boolean => {
  const from = startOfDay(now)
  return sessions.some((s) => !!s && s.lastActive >= from)
}

export const readFinished = (raw: string | null, now: number): string[] => {
  if (!raw) return []
  try {
    const o = JSON.parse(raw) as { date?: unknown; keys?: unknown }
    const isFresh = o.date === dayKey(now) && Array.isArray(o.keys)
    return isFresh ? (o.keys as unknown[]).filter((k): k is string => typeof k === 'string') : []
  } catch {
    return []
  }
}

export const finishedJson = (keys: string[], now: number): string => JSON.stringify({ date: dayKey(now), keys })

export const toggleFinished = (keys: string[], key: string): string[] =>
  keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]
