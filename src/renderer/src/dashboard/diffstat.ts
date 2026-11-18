export type BarCell = 'a' | 'r' | 'e'

export interface LineCounts {
  added: number | null
  removed: number | null
}

const CELLS = 5

export const barCells = (added: number | null, removed: number | null, biggest: number): BarCell[] => {
  const total = (added ?? 0) + (removed ?? 0)
  if (!total || biggest <= 0) return Array<BarCell>(CELLS).fill('e')
  const filled = Math.min(CELLS, Math.ceil((CELLS * total) / biggest))
  const addedCells = Math.round((filled * (added ?? 0)) / total)
  return Array.from({ length: CELLS }, (_, i): BarCell => (i < addedCells ? 'a' : i < filled ? 'r' : 'e'))
}
