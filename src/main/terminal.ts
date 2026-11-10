export type TerminalMode = 'attach' | 'resume' | 'vscode' | 'elsewhere'

export const terminalMode = (s: {
  isBackground: boolean
  isLive: boolean
  isAttachedElsewhere: boolean
}): TerminalMode => {
  if (s.isBackground) return s.isAttachedElsewhere ? 'elsewhere' : 'attach'
  return s.isLive ? 'vscode' : 'resume'
}

export const attachArgs = (sessionId: string): string[] => ['attach', sessionId.slice(0, 8)]

export const resumeBackgroundArgs = (sessionId: string, ticket: string | null): string[] =>
  ticket ? ['--bg', '--resume', sessionId, '--name', ticket] : ['--bg', '--resume', sessionId]

const PASTE_START = '\x1b[200~'
const PASTE_END = '\x1b[201~'

export const pasteInput = (text: string): string => `${PASTE_START}${text}${PASTE_END}\r`

export const STOP_TURN = '\x1b'

export interface OpenGuard {
  run: <T>(id: string, open: (isCurrent: () => boolean) => Promise<T>) => Promise<T>
  cancel: (id: string) => void
}

export const createOpenGuard = (): OpenGuard => {
  const inFlight = new Map<string, Promise<unknown>>()
  const generation = new Map<string, number>()
  const run = <T>(id: string, open: (isCurrent: () => boolean) => Promise<T>): Promise<T> => {
    const pending = inFlight.get(id)
    if (pending) return pending as Promise<T>
    const mine = generation.get(id) ?? 0
    const isCurrent = (): boolean => (generation.get(id) ?? 0) === mine
    const started = open(isCurrent).finally(() => inFlight.delete(id))
    inFlight.set(id, started)
    return started
  }
  const cancel = (id: string): void => {
    generation.set(id, (generation.get(id) ?? 0) + 1)
  }
  return { run, cancel }
}

const HANDOFF_MS = 60000

export const isHandedOff = (handedAt: number | undefined, now: number): boolean =>
  handedAt !== undefined && now - handedAt < HANDOFF_MS
