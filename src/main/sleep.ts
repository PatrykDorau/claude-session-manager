import type { Status } from '../renderer/src/types'

export const SLEEP_HOUR_MS = 3_600_000

export interface SleepCandidate {
  id: string
  status: Status
  isBackground: boolean
  transcriptMtimeMs: number
  markerMtimesMs: number[]
  lastInputAt: number | null
}

export const lastActivityMs = (c: SleepCandidate): number => {
  const times = [c.transcriptMtimeMs, ...c.markerMtimesMs]
  if (c.lastInputAt !== null) times.push(c.lastInputAt)
  return Math.max(...times)
}

export const isSleepable = (c: SleepCandidate, now: number, afterHours: number): boolean =>
  c.isBackground &&
  (c.status === 'idle' || c.status === 'checkout') &&
  now - lastActivityMs(c) > afterHours * SLEEP_HOUR_MS

export const pruneSlept = (slept: Record<string, number>, liveIds: Set<string>): Record<string, number> =>
  Object.fromEntries(Object.entries(slept).filter(([id]) => !liveIds.has(id)))

export const sleptAtOf = (slept: Record<string, number>, sleeping: Map<string, number>, id: string): number | null =>
  slept[id] ?? sleeping.get(id) ?? null

export const sleepSession = async (
  id: string,
  at: number,
  sleeping: Map<string, number>,
  stop: (id: string) => Promise<{ error: string | null }>,
  mark: (id: string, at: number) => void
): Promise<boolean> => {
  sleeping.set(id, at)
  try {
    const result = await stop(id)
    if (result.error) return false
    mark(id, at)
    return true
  } finally {
    sleeping.delete(id)
  }
}

export const sessionsToSleep = (candidates: SleepCandidate[], now: number, afterHours: number): string[] => {
  const ids: string[] = []
  for (const c of candidates) if (isSleepable(c, now, afterHours)) ids.push(c.id)
  return ids
}
