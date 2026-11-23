export const HOST_IDLE_MS = 30 * 60_000

export const idleHosts = (
  openKeys: string[],
  liveTickets: Set<string>,
  idleSince: Record<string, number>,
  now: number
): { toClose: string[]; idleSince: Record<string, number> } => {
  const toClose: string[] = []
  const next: Record<string, number> = {}
  for (const key of openKeys) {
    if (liveTickets.has(key)) continue
    const since = idleSince[key] ?? now
    if (now - since >= HOST_IDLE_MS) toClose.push(key)
    else next[key] = since
  }
  return { toClose, idleSince: next }
}
