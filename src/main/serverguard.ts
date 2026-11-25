export type ServerAction = 'reuse' | 'start' | 'restart' | 'blocked'

export const serverAction = (r: { isRunning: boolean; isMismatch: boolean; isUserStopped: boolean; isUserAction: boolean }): ServerAction => {
  if (r.isUserAction) return r.isRunning ? (r.isMismatch ? 'restart' : 'reuse') : 'start'
  if (r.isUserStopped) return r.isRunning ? 'reuse' : 'blocked'
  if (r.isRunning && r.isMismatch) return 'restart'
  return r.isRunning ? 'reuse' : 'start'
}

export const userStoppedMessage = (key: string): string =>
  `The dev server for ${key} was stopped by the user. Ask the user to start it in Cockpit.`
