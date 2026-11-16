import { priorityLook } from './dashboard'

type Rank = { isActive: boolean; priority: string | undefined }
type Keyed = { key: string }

const priorityLevel = (name: string | undefined): number => priorityLook(name)?.level ?? -3

export const autoOrder = <T extends Keyed>(rows: T[], rank: (row: T) => Rank): T[] =>
  rows
    .map((row, index) => ({ row, index, rank: rank(row) }))
    .sort(
      (a, b) =>
        Number(b.rank.isActive) - Number(a.rank.isActive) ||
        priorityLevel(b.rank.priority) - priorityLevel(a.rank.priority) ||
        a.index - b.index
    )
    .map((entry) => entry.row)

export const orderRows = <T extends Keyed>(rows: T[], rank: (row: T) => Rank, manual: string[] | undefined): T[] => {
  if (!manual?.length) return autoOrder(rows, rank)
  const position = new Map(manual.map((key, index) => [key, index]))
  const known = rows.filter((row) => position.has(row.key)).sort((a, b) => (position.get(a.key) ?? 0) - (position.get(b.key) ?? 0))
  const unknown = autoOrder(
    rows.filter((row) => !position.has(row.key)),
    rank
  )
  return [...unknown.filter((row) => rank(row).isActive), ...known, ...unknown.filter((row) => !rank(row).isActive)]
}

export const moveKey = (order: string[], key: string, target: string, isAfter: boolean): string[] => {
  if (key === target) return order
  const rest = order.filter((k) => k !== key)
  const at = rest.indexOf(target)
  if (at < 0) return order
  return [...rest.slice(0, at + (isAfter ? 1 : 0)), key, ...rest.slice(at + (isAfter ? 1 : 0))]
}

export const readOrder = (key: string): string[] | undefined => {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null')
    return Array.isArray(saved) ? saved.filter((k): k is string => typeof k === 'string') : undefined
  } catch {
    return undefined
  }
}

export const writeOrder = (key: string, order: string[] | undefined): void => {
  try {
    if (order) localStorage.setItem(key, JSON.stringify(order))
    else localStorage.removeItem(key)
  } catch {
    return
  }
}
