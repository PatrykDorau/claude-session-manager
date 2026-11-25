import type { LocalHost, Session } from '../types'

const HOUR_MS = 3_600_000
const BUSY_STATUSES: Session['status'][] = ['working', 'waiting', 'checkout']

export interface IdleHost {
  host: LocalHost
  idleMs: number
  isServer: boolean
  isChrome: boolean
}

const isHostOpen = (h: LocalHost): boolean => !!h.server || h.chrome.isUp

export const countOpenHosts = (hosts: LocalHost[]): number => hosts.filter(isHostOpen).length

const lastSeenOf = (h: LocalHost, sessions: Session[]): number | null => {
  const own = sessions.filter((s) => s.ticket?.toUpperCase() === h.key?.toUpperCase())
  if (own.some((s) => BUSY_STATUSES.includes(s.status))) return null
  if (own.length) return Math.max(...own.map((s) => s.lastActive))
  return h.server?.lastOutputAt ?? null
}

export const idleHosts = (hosts: LocalHost[], sessions: Session[], now: number, hours: number): IdleHost[] =>
  hosts.flatMap((h) => {
    if (!h.key || !isHostOpen(h)) return []
    const lastSeen = lastSeenOf(h, sessions)
    if (lastSeen === null || now - lastSeen <= hours * HOUR_MS) return []
    return [{ host: h, idleMs: now - lastSeen, isServer: !!h.server, isChrome: h.chrome.isUp }]
  })
