import type { TaskRow } from '../taskview'
import type { Status } from '../types'

export type DashboardPage = 'tickets' | 'mrs' | 'starred' | 'tree' | 'hosts'

export const filterRows = (rows: TaskRow[], query: string, starred: string[], isStarredOnly: boolean): TaskRow[] => {
  const needle = query.trim().toLowerCase()
  const starredKeys = new Set(starred)
  return rows.filter(
    (r) =>
      (!isStarredOnly || starredKeys.has(r.key)) &&
      (!needle || r.key.toLowerCase().includes(needle) || r.summary.toLowerCase().includes(needle))
  )
}

const CHIPS: Partial<Record<Status, { label: string; color: string }>> = {
  working: { label: 'working', color: '#58a6ff' },
  waiting: { label: 'needs you', color: '#d29922' },
  checkout: { label: 'check output', color: '#5ec8ff' },
  idle: { label: 'idle', color: '#737373' }
}

export const rowChip = (row: TaskRow): { label: string; color: string } | null => {
  const live = row.sessions.find((s) => s.isLive)
  return live ? (CHIPS[live.status] ?? null) : null
}

export const lastActivity = (row: TaskRow): number | null =>
  row.sessions.length ? Math.max(...row.sessions.map((s) => s.lastActive)) : null

const QUICK_EXIT_MS = 10000

export const isQuickExit = (openedAt: number, exitedAt: number): boolean => exitedAt - openedAt < QUICK_EXIT_MS

export const clampSize = (size: number, min: number, max: number): number =>
  Number.isFinite(size) ? Math.min(max, Math.max(min, size)) : min

export const readSize = (key: string, fallback: number): number => {
  try {
    const saved = Number(localStorage.getItem(key))
    return saved > 0 ? saved : fallback
  } catch {
    return fallback
  }
}

export const writeSize = (key: string, value: number | boolean): void => {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    return
  }
}

export const readFlag = (key: string): boolean => {
  try {
    return localStorage.getItem(key) === 'true'
  } catch {
    return false
  }
}

const PRIORITY_LEVELS: Record<string, number> = {
  blocker: 2,
  highest: 2,
  critical: 2,
  high: 1,
  major: 1,
  medium: 0,
  normal: 0,
  low: -1,
  minor: -1,
  lowest: -2,
  trivial: -2
}

const PRIORITY_COLORS: Record<number, string> = { 2: '#f2706a', 1: '#f0883e', 0: '#e8b84a', [-1]: '#6aa9ff', [-2]: '#8d949f' }

export const priorityLook = (name: string | undefined): { level: number; color: string; label: string } | null => {
  const level = name ? PRIORITY_LEVELS[name.trim().toLowerCase()] : undefined
  return level === undefined ? null : { level, color: PRIORITY_COLORS[level], label: name as string }
}
