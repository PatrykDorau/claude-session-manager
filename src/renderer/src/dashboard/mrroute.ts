import type { MrRow } from '../types'

export type TicketTab = 'work' | 'mr' | 'server' | 'ticket'

export interface TabRequest {
  key: string
  tab: TicketTab
  sessionId: string | null
  at: number
}

export type MrRoute = { page: 'tickets'; key: string } | { page: 'mrs' }

export const routeMr = (mr: MrRow | null, myName: string | null, ticketKeys: string[], isFromMrList = false): MrRoute => {
  if (!isFromMrList && mr && mr.ticket && mr.author === myName && ticketKeys.includes(mr.ticket)) return { page: 'tickets', key: mr.ticket }
  return { page: 'mrs' }
}
