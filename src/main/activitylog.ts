import { join } from 'node:path'
import { dayOf, type AttentionEvent } from './timesheet'

export const ACTIVITY_THROTTLE_MS = 30_000
export const ACTIVITY_KEEP_DAYS = 90
export const IDLE_DROP_MS = 5 * 60_000

export const isIdleMark = (idleSeconds: number): boolean => idleSeconds * 1000 >= IDLE_DROP_MS

const FILE_PATTERN = /^(\d{4}-\d{2}-\d{2})\.jsonl$/

export const activityFile = (dir: string, day: string): string =>
  join(dir, 'activity', `${day}.jsonl`)

const parseLine = (line: string): AttentionEvent | null => {
  try {
    const parsed = JSON.parse(line)
    if (typeof parsed?.at !== 'number') return null
    const ticket = typeof parsed.ticket === 'string' ? parsed.ticket : null
    return { at: parsed.at, ticket, source: 'cockpit' }
  } catch {
    return null
  }
}

const isEvent = (event: AttentionEvent | null): event is AttentionEvent => event !== null

export const parseActivity = (text: string): AttentionEvent[] =>
  text.split('\n').filter(isNotBlank).map(parseLine).filter(isEvent)

const isNotBlank = (line: string): boolean => line.trim() !== ''

export const createActivityLog = (
  dir: string,
  now: () => number,
  append: (file: string, line: string) => void
): { mark: (ticket: string | null) => void } => {
  let lastWrite: { ticket: string | null; at: number } | null = null
  const mark = (ticket: string | null): void => {
    const at = now()
    if (lastWrite?.ticket === ticket && at - lastWrite.at < ACTIVITY_THROTTLE_MS) return
    lastWrite = { ticket, at }
    try {
      append(activityFile(dir, dayOf(at)), `${JSON.stringify({ at, ticket })}\n`)
    } catch {
      return
    }
  }
  return { mark }
}

export const staleActivityFiles = (names: string[], today: string, keepDays: number): string[] => {
  const toUtcDay = (day: string): number => {
    const [year, month, date] = day.split('-').map(Number)
    return Date.UTC(year, month - 1, date) / 86_400_000
  }
  const cutoff = toUtcDay(today) - keepDays
  const isStale = (name: string): boolean => {
    const match = FILE_PATTERN.exec(name)
    return match !== null && toUtcDay(match[1]) < cutoff
  }
  return names.filter(isStale)
}
