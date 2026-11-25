export interface StampedCache<T> {
  get: (key: string, stampOf: () => Promise<string | null>, compute: () => Promise<T>) => Promise<T>
  drop: (key: string) => void
}

export const createStampedCache = <T>(
  ttlMs: number,
  now: () => number = Date.now
): StampedCache<T> => {
  const entries = new Map<string, { value: T; stamp: string; at: number }>()
  const get = async (
    key: string,
    stampOf: () => Promise<string | null>,
    compute: () => Promise<T>
  ): Promise<T> => {
    const stamp = await stampOf()
    const hit = entries.get(key)
    if (hit && stamp !== null && hit.stamp === stamp && now() - hit.at < ttlMs) return hit.value
    const value = await compute()
    if (stamp === null) entries.delete(key)
    else entries.set(key, { value, stamp, at: now() })
    return value
  }
  const drop = (key: string): void => {
    entries.delete(key)
  }
  return { get, drop }
}
