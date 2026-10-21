import type { DockEdge, Rect } from './store'

const MIN_WIDTH = 180

export function nearestEdge(win: Rect, workArea: Rect): DockEdge {
  const winCentre = win.x + win.width / 2
  const areaCentre = workArea.x + workArea.width / 2
  return winCentre < areaCentre ? 'left' : 'right'
}

export function dockBounds(workArea: Rect, edge: DockEdge, width: number): Rect {
  const w = Math.round(Math.min(Math.max(width, MIN_WIDTH), workArea.width / 2))
  return {
    x: edge === 'left' ? workArea.x : workArea.x + workArea.width - w,
    y: workArea.y,
    width: w,
    height: workArea.height
  }
}

export function pickDisplay<T extends { id: number; workArea: Rect }>(
  displays: T[],
  savedId: number | null,
  primaryId: number
): T {
  return (
    displays.find((d) => d.id === savedId) ??
    displays.find((d) => d.id === primaryId) ??
    displays[0]
  )
}
