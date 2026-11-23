import type { Session, Status } from '../types'

export const PIN_KEY = 'orch.pinned'
const MAX_HOPS = 10

const RANK: Record<Status, number> = { waiting: 0, checkout: 0, working: 1, idle: 2, closed: 3 }

export const panelSessions = (sessions: Session[]): Session[] =>
  sessions.filter((s) => s.isLive).sort((a, b) => RANK[a.status] - RANK[b.status] || b.lastActive - a.lastActive)

export const followPin = (id: string, sessions: Session[]): Session | null => {
  let current = sessions.find((s) => s.id === id)
  for (let hop = 0; current?.continuedAs && hop < MAX_HOPS; hop += 1) {
    const nextId = current.continuedAs
    current = sessions.find((s) => s.id === nextId)
  }
  return current?.isLive ? current : null
}

export const pinnedSessions = (pins: string[], sessions: Session[]): Session[] => {
  const found = pins.map((pin) => followPin(pin, sessions)).filter((s): s is Session => !!s)
  return found.filter((s, i) => found.findIndex((o) => o.id === s.id) === i)
}

export const resolvePins = (pins: string[], sessions: Session[]): string[] => {
  const resolved = pins.map((pin) => followPin(pin, sessions)?.id ?? pin)
  return resolved.filter((id, i) => resolved.indexOf(id) === i)
}

export const togglePin =(pins: string[], id: string): string[] => (pins.includes(id) ? pins.filter((p) => p !== id) : [...pins, id])

export const gridColumns = (count: number): number => (count <= 1 ? 1 : count <= 4 ? 2 : 3)
