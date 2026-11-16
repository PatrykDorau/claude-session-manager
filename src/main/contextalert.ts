const CONTEXT_WARN = 150_000
const CONTEXT_DANGER = 250_000

export const contextAlerts = (
  sessions: { id: string; contextTokens: number | null }[],
  alerted: ReadonlySet<string>
): { toNotify: string[]; alerted: Set<string> } => {
  const toNotify: string[] = []
  const next = new Set<string>()
  for (const { id, contextTokens } of sessions) {
    const isAlerted = alerted.has(id)
    if (contextTokens === null || contextTokens < CONTEXT_WARN) continue
    if (contextTokens >= CONTEXT_DANGER && !isAlerted) toNotify.push(id)
    if (contextTokens >= CONTEXT_DANGER || isAlerted) next.add(id)
  }
  return { toNotify, alerted: next }
}

export const IDLE_LARGE_TOKENS = 100_000
export const IDLE_LARGE_MS = 30 * 60_000

export const idleAlerts = (
  sessions: { id: string; contextTokens: number | null; lastActive: number; status: string }[],
  alerted: ReadonlySet<string>,
  now: number
): { toNotify: string[]; alerted: Set<string> } => {
  const toNotify: string[] = []
  const next = new Set<string>()
  for (const { id, contextTokens, lastActive, status } of sessions) {
    const isIdleLarge = (contextTokens ?? 0) >= IDLE_LARGE_TOKENS && now - lastActive >= IDLE_LARGE_MS && status !== 'working' && status !== 'waiting'
    if (!isIdleLarge) continue
    if (!alerted.has(id)) toNotify.push(id)
    next.add(id)
  }
  return { toNotify, alerted: next }
}
