import type { MrRow, Session, Status } from '../types'
import { isJobOver, jobId, type Job } from '../../../main/orchestrator'
import type { PickRow } from './orchestrator'

export const PIN_KEY = 'orch.pinned'
const MAX_HOPS = 10

const RANK: Record<Status, number> = { waiting: 0, checkout: 0, working: 1, idle: 2, closed: 3 }

export const panelSessions = (sessions: Session[]): Session[] =>
  sessions.filter((s) => s.isLive).sort((a, b) => RANK[a.status] - RANK[b.status] || b.lastActive - a.lastActive)

const resolveSession = (id: string, sessions: Session[]): Session | null => {
  let current = sessions.find((s) => s.id === id)
  for (let hop = 0; current?.continuedAs && hop < MAX_HOPS; hop += 1) {
    const nextId = current.continuedAs
    current = sessions.find((s) => s.id === nextId)
  }
  return current ?? null
}

export const followPin = (id: string, sessions: Session[]): Session | null => {
  const found = resolveSession(id, sessions)
  return found?.isLive ? found : null
}

export const needsYou = (session: Session): boolean => session.status === 'waiting'

export const parsePins = (text: string): string[] => {
  try {
    const parsed: unknown = JSON.parse(text)
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : []
  } catch {
    return []
  }
}

export const readPins = (): string[] => {
  try {
    return parsePins(localStorage.getItem(PIN_KEY) ?? '[]')
  } catch {
    return []
  }
}

export const writePins = (pins: string[]): void => {
  try {
    localStorage.setItem(PIN_KEY, JSON.stringify(pins))
  } catch {
    return
  }
}

export const pinnedSessions = (pins: string[], sessions: Session[]): Session[] => {
  const found = pins.map((pin) => resolveSession(pin, sessions)).filter((s): s is Session => !!s)
  return found.filter((s, i) => found.findIndex((o) => o.id === s.id) === i)
}

export const resolvePins = (pins: string[], sessions: Session[]): string[] => {
  const resolved = pins.map((pin) => followPin(pin, sessions)?.id ?? pin)
  return resolved.filter((id, i) => resolved.indexOf(id) === i)
}

export const lastClosedSession = (ticket: string, sessions: Session[]): Session | null =>
  sessions.filter((s) => !s.isLive && s.ticket?.toUpperCase() === ticket.toUpperCase()).sort((a, b) => b.lastActive - a.lastActive)[0] ?? null

export const togglePin =(pins: string[], id: string): string[] => (pins.includes(id) ? pins.filter((p) => p !== id) : [...pins, id])

export const movePin = (pins: string[], fromId: string, toId: string): string[] => {
  const from = pins.indexOf(fromId)
  const to = pins.indexOf(toId)
  if (from < 0 || to < 0 || from === to) return pins
  const next = pins.filter((p) => p !== fromId)
  next.splice(to, 0, fromId)
  return next
}

export interface CellLook {
  color?: string
  title?: string
}

export const LOOK_KEY = 'orch.cellLooks'

export const cellKey = (session: Session): string => session.ticket?.toUpperCase() ?? session.id

export const parseCellLooks = (text: string): Record<string, CellLook> => {
  try {
    const parsed: unknown = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const looks: Record<string, CellLook> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (!value || typeof value !== 'object') continue
      const raw = value as Record<string, unknown>
      looks[key] = {
        ...(typeof raw.color === 'string' ? { color: raw.color } : {}),
        ...(typeof raw.title === 'string' ? { title: raw.title } : {})
      }
    }
    return looks
  } catch {
    return {}
  }
}

export const readCellLooks = (): Record<string, CellLook> => {
  try {
    return parseCellLooks(localStorage.getItem(LOOK_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export const writeCellLooks = (looks: Record<string, CellLook>): void => {
  try {
    localStorage.setItem(LOOK_KEY, JSON.stringify(looks))
  } catch {
    return
  }
}

export const gridColumns =(count: number): number => (count <= 1 ? 1 : count <= 4 ? 2 : 3)

export const startableRows = (rows: PickRow[], jobs: Job[]): PickRow[] =>
  rows.filter((r) => !r.isLive && !jobs.some((j) => j.id === jobId(r.kind, r.key) && !isJobOver(j)))

export const isDoneStatus = (status: string | null | undefined, doneCsv: string): boolean =>
  !!status && doneCsv.split(',').some((s) => s.trim().toLowerCase() === status.trim().toLowerCase())

export const matchesQuery = (query: string, texts: (string | null | undefined)[]): boolean => {
  const haystack = texts.join(' ').toLowerCase()
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((word) => haystack.includes(word))
}

export const groupByStatus = <T>(rows: T[], statusOf: (row: T) => string | null | undefined): { status: string; rows: T[] }[] => {
  const groups = new Map<string, T[]>()
  const rest: T[] = []
  for (const row of rows) {
    const status = statusOf(row)
    if (!status) rest.push(row)
    else groups.set(status, [...(groups.get(status) ?? []), row])
  }
  const list = [...groups].map(([status, items]) => ({ status, rows: items }))
  return rest.length ? [...list, { status: 'Other', rows: rest }] : list
}

export const pinStarted =(pins: string[], awaiting: string[], jobs: Job[]): { pins: string[]; awaiting: string[] } => {
  const started = awaiting.flatMap((id) => jobs.find((j) => j.id === id && j.sessionId)?.sessionId ?? [])
  const isStillAwaiting = (id: string): boolean => {
    const found = jobs.find((j) => j.id === id)
    return !!found && !found.sessionId && !isJobOver(found)
  }
  return { pins: [...pins, ...started.filter((id) => !pins.includes(id))], awaiting: awaiting.filter(isStillAwaiting) }
}

export const mrOfSession =(session: Session, mrs: MrRow[]): MrRow | null =>
  mrs.find((m) => !!m.sessionId && (session.id === m.sessionId || session.id.startsWith(m.sessionId))) ?? null
