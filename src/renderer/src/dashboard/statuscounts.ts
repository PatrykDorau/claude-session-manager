import type { DevServer, Session } from '../types'

export const statusCounts = (
  sessions: Session[],
  servers: DevServer[]
): { waiting: number; finished: number; working: number; servers: number } => {
  const live = sessions.filter((s) => s.isLive)
  const count = (status: Session['status']): number => live.filter((s) => s.status === status).length
  return { waiting: count('waiting'), finished: count('checkout'), working: count('working'), servers: servers.length }
}
