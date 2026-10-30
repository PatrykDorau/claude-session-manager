import { normalizePath } from './lock'

export type Pane = 'top' | 'bottom'

export interface Placement {
  pane: Pane
  folder: string
}

export function choosePane(
  folder: string,
  liveIds: string[],
  panes: Record<string, Placement>,
  pending: Placement[]
): Pane {
  const target = normalizePath(folder)
  const live = new Set(liveIds)
  const placed = [
    ...Object.entries(panes)
      .filter(([id]) => live.has(id))
      .map(([, p]) => p),
    ...pending
  ].filter((p) => normalizePath(p.folder) === target)
  const count = (pane: Pane): number => placed.filter((p) => p.pane === pane).length
  return count('bottom') < count('top') ? 'bottom' : 'top'
}
