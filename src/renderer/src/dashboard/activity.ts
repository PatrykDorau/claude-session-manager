export const FOCUS_PING_MS = 60_000

export type ActivitySurface =
  | { kind: 'session'; ticket: string | null }
  | { kind: 'ticket'; key: string }
  | { kind: 'mr'; ticket: string | null }
  | { kind: 'code'; ticket: string | null }
  | null

export const surfaceTicket = (surface: ActivitySurface): string | null | undefined => {
  if (!surface) return undefined
  return surface.kind === 'ticket' ? surface.key : surface.ticket
}

export const startFocusPing = (
  current: () => Parameters<typeof surfaceTicket>[0],
  isFocused: () => boolean,
  mark: (ticket: string | null) => void,
  every: number
): (() => void) => {
  const ping = (): void => {
    if (!isFocused()) return
    const ticket = surfaceTicket(current())
    if (ticket !== undefined) mark(ticket)
  }
  const timer = setInterval(ping, every)
  const stop = (): void => clearInterval(timer)
  return stop
}
