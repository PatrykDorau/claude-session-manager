export type ServerAction = 'reuse' | 'start' | 'restart' | 'blocked'

export const serverAction = (r: { isRunning: boolean; isMismatch: boolean; isUserStopped: boolean; isUserAction: boolean }): ServerAction => {
  if (r.isUserAction) return r.isRunning ? (r.isMismatch ? 'restart' : 'reuse') : 'start'
  if (r.isRunning && r.isMismatch) return 'restart'
  return r.isRunning ? 'reuse' : 'start'
}

export const userStoppedMessage = (key: string): string =>
  `The dev server for ${key} was stopped by the user. Ask the user to start it in Cockpit.`

export const keptStoppedMessage = (key: string): string =>
  `The user chose to keep the dev server for ${key} stopped. Continue without it and do not start it another way.`

export type StartDecision = 'start' | 'started' | 'keep' | 'timeout'

export const START_REQUEST_MS = 90_000

export const userStartAnswer = (result: { error?: string | null }): 'started' | null => (result.error ? null : 'started')

export interface RunningServer { url: string; port: number; cwd: string; label: string }

export const waitingAgentReply = (
  key: string,
  decision: StartDecision,
  running: RunningServer | null
): 'route' | (RunningServer & { key: string; isNew: false }) | { error: string } => {
  if (decision === 'started' && running) return { key, url: running.url, port: running.port, cwd: running.cwd, label: running.label, isNew: false }
  if (decision === 'start' || decision === 'started') return 'route'
  return { error: decision === 'keep' ? keptStoppedMessage(key) : userStoppedMessage(key) }
}

export interface StartRequests {
  ask: (key: string) => Promise<StartDecision>
  answer: (key: string, decision: Exclude<StartDecision, 'timeout'>) => void
  keys: () => string[]
}

export const createStartRequests = (onChange: (keys: string[]) => void, timeoutMs = START_REQUEST_MS): StartRequests => {
  const waiting = new Map<string, { resolvers: ((decision: StartDecision) => void)[]; timer: ReturnType<typeof setTimeout> }>()
  const keys = (): string[] => [...waiting.keys()]

  const settle = (key: string, decision: StartDecision): void => {
    const request = waiting.get(key)
    if (!request) return
    clearTimeout(request.timer)
    waiting.delete(key)
    const resolveOne = (resolve: (d: StartDecision) => void): void => resolve(decision)
    request.resolvers.forEach(resolveOne)
    onChange(keys())
  }

  const ask = (key: string): Promise<StartDecision> => {
    const waitForDecision = (resolve: (decision: StartDecision) => void): void => {
      const request = waiting.get(key)
      if (request) {
        request.resolvers.push(resolve)
        return
      }
      const settleTimeout = (): void => settle(key, 'timeout')
      waiting.set(key, { resolvers: [resolve], timer: setTimeout(settleTimeout, timeoutMs) })
      onChange(keys())
    }
    return new Promise(waitForDecision)
  }

  const answer = (key: string, decision: Exclude<StartDecision, 'timeout'>): void => settle(key, decision)

  return { ask, answer, keys }
}
