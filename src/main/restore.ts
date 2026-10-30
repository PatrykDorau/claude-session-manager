import { normalizePath } from './lock'

export interface SnapshotEntry {
  id: string
  projectPath: string
  lastLiveAt: number
}

export interface RestoreState {
  snapshot: SnapshotEntry[]
  pendingRemoval: Record<string, number>
  lastScanAt: number
}

const REMOVE_AFTER = 10_000
const SCAN_GAP = 60_000
const MAX_AGE = 3 * 24 * 3600 * 1000

export function updateSnapshot(
  state: RestoreState,
  live: { id: string; projectPath: string }[],
  isAnyWindowOpen: boolean,
  now: number
): RestoreState {
  const liveIds = new Set(live.map((s) => s.id))
  const isContinuous = state.lastScanAt > 0 && now - state.lastScanAt <= SCAN_GAP
  const pendingRemoval = { ...state.pendingRemoval }
  for (const e of state.snapshot) {
    const isJustClosed = isContinuous && e.lastLiveAt === state.lastScanAt && !liveIds.has(e.id)
    if (isJustClosed && isAnyWindowOpen) pendingRemoval[e.id] = now
  }
  for (const id of liveIds) delete pendingRemoval[id]
  const kept = state.snapshot.filter((e) => !liveIds.has(e.id))
  const isExpired = (e: SnapshotEntry): boolean =>
    isAnyWindowOpen && e.id in pendingRemoval && now - pendingRemoval[e.id] >= REMOVE_AFTER
  const removed = new Set(kept.filter(isExpired).map((e) => e.id))
  for (const id of removed) delete pendingRemoval[id]
  return {
    snapshot: [
      ...kept.filter((e) => !removed.has(e.id)),
      ...live.map((s) => ({ id: s.id, projectPath: s.projectPath, lastLiveAt: now }))
    ],
    pendingRemoval: isAnyWindowOpen ? pendingRemoval : {},
    lastScanAt: now
  }
}

export function restorable(
  snapshot: SnapshotEntry[],
  liveIds: string[],
  now: number
): SnapshotEntry[] {
  const live = new Set(liveIds)
  return snapshot.filter((e) => !live.has(e.id) && now - e.lastLiveAt <= MAX_AGE)
}

export function restoreQueue(
  snapshot: SnapshotEntry[],
  liveIds: string[],
  knownIds: string[],
  now: number
): SnapshotEntry[] {
  const known = new Set(knownIds)
  const folder = (e: SnapshotEntry): string => normalizePath(e.projectPath)
  return restorable(snapshot, liveIds, now)
    .filter((e) => known.has(e.id))
    .sort((x, y) => folder(x).localeCompare(folder(y)))
}

export const forgetSessions = (state: RestoreState, ids: string[]): RestoreState => {
  const forgotten = new Set(ids)
  return {
    snapshot: state.snapshot.filter((e) => !forgotten.has(e.id)),
    pendingRemoval: Object.fromEntries(
      Object.entries(state.pendingRemoval).filter(([id]) => !forgotten.has(id))
    ),
    lastScanAt: state.lastScanAt
  }
}
