export const TERMINAL_IDLE_MS = 600_000

export const staleTerminals = (ids: string[], lastUseAt: (id: string) => number | null, now: number): string[] => {
  const isStale = (id: string): boolean => {
    const at = lastUseAt(id)
    return at !== null && now - at > TERMINAL_IDLE_MS
  }
  return ids.filter(isStale)
}
