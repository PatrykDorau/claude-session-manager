import type { Session } from '../types'

export type ZoneKey = 'needs-me' | 'working' | 'seen' | 'idle'

export const ZONE_KEYS: ZoneKey[] = ['needs-me', 'working', 'seen', 'idle']

export const SEEN_AT_KEY = 'orch.turnSeen'

export const trackTurnEndedAt = (
  previous: Record<string, number>,
  sessions: Session[]
): Record<string, number> => {
  const isCheckout = (s: Session): boolean => s.status === 'checkout'
  const endedAtOf = (s: Session): [string, number] => [s.id, previous[s.id] ?? s.lastActive]
  const next = Object.fromEntries(sessions.filter(isCheckout).map(endedAtOf))
  const isKept = ([id, at]: [string, number]): boolean => previous[id] === at
  const entries = Object.entries(next)
  const isUnchanged = entries.length === Object.keys(previous).length && entries.every(isKept)
  return isUnchanged ? previous : next
}

export const isTurnUnseen = (
  session: Session,
  turnEndedAt: Record<string, number>,
  seenAt: Record<string, number>
): boolean =>
  session.status === 'checkout' &&
  (seenAt[session.id] ?? -Infinity) < (turnEndedAt[session.id] ?? session.lastActive)

export const markSeen = (
  seenAt: Record<string, number>,
  id: string,
  now: number
): Record<string, number> => ({ ...seenAt, [id]: now })

export const pruneSeen = (
  seenAt: Record<string, number>,
  sessions: Session[]
): Record<string, number> => {
  const isPresent = ([id]: [string, number]): boolean => {
    const isSameId = (s: Session): boolean => s.id === id
    return sessions.some(isSameId)
  }
  return Object.fromEntries(Object.entries(seenAt).filter(isPresent))
}

const parseSeenAt = (text: string): Record<string, number> => {
  try {
    const parsed: unknown = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const isNumberEntry = (entry: [string, unknown]): entry is [string, number] =>
      typeof entry[1] === 'number' && Number.isFinite(entry[1])
    return Object.fromEntries(Object.entries(parsed).filter(isNumberEntry))
  } catch {
    return {}
  }
}

export const readSeenAt = (): Record<string, number> => {
  try {
    return parseSeenAt(localStorage.getItem(SEEN_AT_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export const writeSeenAt = (seenAt: Record<string, number>): void => {
  try {
    localStorage.setItem(SEEN_AT_KEY, JSON.stringify(seenAt))
  } catch {
    return
  }
}

export const zoneOf = (session: Session, isUnseen: boolean, isNewCr: boolean): ZoneKey => {
  if (session.status === 'waiting' || (session.status === 'checkout' && isUnseen)) return 'needs-me'
  if (session.status === 'working') return 'working'
  if (session.status === 'checkout' || isNewCr) return 'seen'
  return 'idle'
}

export interface LiveGroup {
  id: string
  ticket: string | null
  sessions: Session[]
}

export const groupByTicket = (sessions: Session[]): LiveGroup[] => {
  const groups = new Map<string, LiveGroup>()
  for (const session of sessions) {
    const id = session.ticket ? `ticket:${session.ticket.toUpperCase()}` : session.id
    const group = groups.get(id)
    if (group) group.sessions.push(session)
    else groups.set(id, { id, ticket: session.ticket, sessions: [session] })
  }
  return [...groups.values()]
}

export const zoneOfGroup = (zones: ZoneKey[]): ZoneKey => {
  const indexOfZone = (zone: ZoneKey): number => ZONE_KEYS.indexOf(zone)
  const lowest = Math.min(...zones.map(indexOfZone))
  return zones.length ? ZONE_KEYS[lowest] : 'idle'
}

export const holdZones = (
  previous: Record<string, ZoneKey>,
  next: Record<string, ZoneKey>,
  heldId: string | null
): Record<string, ZoneKey> => {
  if (heldId === null) return next
  const isHeldKept = Object.hasOwn(previous, heldId) && Object.hasOwn(next, heldId)
  if (!isHeldKept) return next
  return { ...next, [heldId]: previous[heldId] }
}

export const pickTab = (
  group: LiveGroup,
  storedId: string | undefined,
  zoneOfSession: (s: Session) => ZoneKey
): Session => {
  const isStored = (s: Session): boolean => s.id === storedId
  const stored = group.sessions.find(isStored)
  if (stored) return stored
  const indexOfSession = (s: Session): number => ZONE_KEYS.indexOf(zoneOfSession(s))
  const pickMoreUrgent = (best: Session, s: Session): Session =>
    indexOfSession(s) < indexOfSession(best) ? s : best
  return group.sessions.reduce(pickMoreUrgent)
}
