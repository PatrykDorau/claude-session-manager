import { reactive } from 'vue'
import type { TicketTime } from '../../../main/timesheet'
import type { Session, TicketDetail } from '../types'
import { identityOf, type CellLook, type Identity } from './commandpanel'

export interface DayEdits {
  hours: Record<string, number>
  moves: Record<string, string>
  added: string[]
}

export interface EditedRow {
  ticket: string | null
  hours: number
  isEdited: boolean
}

export const NO_TICKET = ''

export const emptyEdits = (): DayEdits => ({ hours: {}, moves: {}, added: [] })

export const editsKey = (day: string): string => `timesheet.edits.${day}`

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const isHoursEntry = (entry: [string, unknown]): entry is [string, number] =>
  typeof entry[1] === 'number' && Number.isFinite(entry[1])

const isMoveEntry = (entry: [string, unknown]): entry is [string, string] =>
  typeof entry[1] === 'string' && entry[1] !== ''

const isText = (value: unknown): value is string => typeof value === 'string' && value !== ''

export const parseEdits = (text: string): DayEdits => {
  try {
    const parsed: unknown = JSON.parse(text)
    if (!isRecord(parsed)) return emptyEdits()
    return {
      hours: isRecord(parsed.hours)
        ? Object.fromEntries(Object.entries(parsed.hours).filter(isHoursEntry))
        : {},
      moves: isRecord(parsed.moves)
        ? Object.fromEntries(Object.entries(parsed.moves).filter(isMoveEntry))
        : {},
      added: Array.isArray(parsed.added) ? parsed.added.filter(isText) : []
    }
  } catch {
    return emptyEdits()
  }
}

export const readEdits = (day: string): DayEdits => {
  try {
    return parseEdits(localStorage.getItem(editsKey(day)) ?? '{}')
  } catch {
    return emptyEdits()
  }
}

export const writeEdits = (day: string, edits: DayEdits): void => {
  try {
    localStorage.setItem(editsKey(day), JSON.stringify(edits))
  } catch {
    return
  }
}

export const clearEdits = (day: string): void => {
  try {
    localStorage.removeItem(editsKey(day))
  } catch {
    return
  }
}

export const applyEdits = (rows: TicketTime[], edits: DayEdits): EditedRow[] => {
  const target = edits.moves[NO_TICKET] ?? null
  const noTicketRow = rows.find(isNoTicketRow)
  const movedHours = target && noTicketRow ? (edits.hours[NO_TICKET] ?? noTicketRow.hours) : 0
  const keyOf = (ticket: string | null): string => ticket ?? NO_TICKET
  const valueOf = (ticket: string | null, computed: number): EditedRow => {
    const key = keyOf(ticket)
    const isMoveTarget = !!target && key === target
    const isHoursEdited = key in edits.hours
    const hours = isHoursEdited ? edits.hours[key] : computed + (isMoveTarget ? movedHours : 0)
    return { ticket, hours, isEdited: isHoursEdited || isMoveTarget }
  }
  const isKept = (r: TicketTime): boolean => !(target && r.ticket === null)
  const toEdited = (r: TicketTime): EditedRow => valueOf(r.ticket, r.hours)
  const result = rows.filter(isKept).map(toEdited)
  const seen = new Set(rows.map(toKey))
  const extras = [...(target ? [target] : []), ...edits.added]
  for (const key of extras) {
    if (key === NO_TICKET || seen.has(key)) continue
    seen.add(key)
    result.push(valueOf(key, 0))
  }
  return result
}

const isNoTicketRow = (r: TicketTime): boolean => r.ticket === null

const toKey = (r: TicketTime): string => r.ticket ?? NO_TICKET

export const formatHours = (hours: number): string => String(Math.round(hours * 100) / 100)

export const copyText = (
  rows: { ticket: string | null; hours: number }[],
  titleOf: (key: string) => string
): string => {
  const hasHours = (r: { hours: number }): boolean => Math.round(r.hours * 100) !== 0
  const toLine = (r: { ticket: string | null; hours: number }): string =>
    r.ticket === null
      ? `-\t${formatHours(r.hours)}\tNo ticket`
      : `${r.ticket}\t${formatHours(r.hours)}\t${titleOf(r.ticket)}`
  return rows.filter(hasHours).map(toLine).join('\n')
}

export const localDay = (at: number): string => {
  const date = new Date(at)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export const shiftDay = (day: string, delta: number): string => {
  const [year, month, date] = day.split('-').map(Number)
  return localDay(new Date(year, month - 1, date + delta).getTime())
}

export const formatActivity = (minutes: number): string => {
  const total = Math.max(0, Math.round(minutes))
  return `${Math.floor(total / 60)} h ${total % 60} min`
}

export interface TicketInfo {
  summary: string
  status: string
}

const ticketInfos = reactive<Record<string, TicketInfo | null>>({})
const requestedInfos = new Set<string>()

export const cachedTicketInfo = (key: string): TicketInfo | null =>
  ticketInfos[key.toUpperCase()] ?? null

export const requestTicketInfo = (
  key: string,
  fetchDetail: (key: string) => Promise<TicketDetail | null>
): void => {
  const upper = key.toUpperCase()
  if (requestedInfos.has(upper)) return
  requestedInfos.add(upper)
  const store = (detail: TicketDetail | null): void => {
    ticketInfos[upper] = detail ? { summary: detail.summary, status: detail.status } : null
  }
  const storeNothing = (): void => store(null)
  void fetchDetail(upper).then(store, storeNothing)
}

export const hashColor = (key: string): string => {
  const addChar = (hash: number, char: string): number => (hash * 31 + char.charCodeAt(0)) % 3600
  const hue = [...key].reduce(addChar, 7) % 360
  return `hsl(${hue} 55% 60%)`
}

export const ticketColor = (
  ticket: string,
  sessions: Session[],
  identities: Record<string, Identity>,
  looks: Record<string, CellLook>
): string => {
  const key = ticket.toUpperCase()
  const look = looks[key] ?? {}
  const isOfTicket = (s: Session): boolean => s.ticket?.toUpperCase() === key && s.id in identities
  const byLiveThenRecent = (a: Session, b: Session): number =>
    Number(b.isLive) - Number(a.isLive) || b.lastActive - a.lastActive
  const session = sessions.filter(isOfTicket).sort(byLiveThenRecent)[0]
  if (session) return identityOf(identities[session.id], look).color
  return look.color ?? hashColor(key)
}
