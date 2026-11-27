import type { MrRow, Session } from '../types'
import type { TaskRow } from '../taskview'
import { findMineSession, findReviewSession } from './mrs'

export type SessionWorkRow =
  | { kind: 'ticket'; key: string; title: string; session: Session; mr: MrRow | null }
  | { kind: 'mr'; key: string; title: string; session: Session; mr: MrRow; isMine: boolean }

export const WITH_SESSION_FLAG = 'dash.withSession'

const statusRank = (s: Session): number => (s.status === 'waiting' || s.status === 'checkout' ? 0 : s.status === 'working' ? 1 : 2)

const pickLive = (candidates: (Session | undefined)[]): Session | null =>
  candidates
    .filter((s): s is Session => !!s?.isLive)
    .sort((a, b) => statusRank(a) - statusRank(b) || b.lastActive - a.lastActive)[0] ?? null

const isSameTicket = (a: string | null, b: string): boolean => !!a && a.toUpperCase() === b.toUpperCase()

export const sessionWorkRows = (tasks: TaskRow[], mrs: MrRow[], sessions: Session[], me: string | null): SessionWorkRow[] => {
  const isMine = (m: MrRow): boolean => !!me && m.author === me
  const ticketRows = tasks.flatMap((t): SessionWorkRow[] => {
    const own = mrs.find((m) => isMine(m) && isSameTicket(m.ticket, t.key)) ?? null
    const live = pickLive([...t.sessions, own ? findMineSession(sessions, own) : undefined])
    return live ? [{ kind: 'ticket', key: t.key, title: t.summary, session: live, mr: own }] : []
  })
  const mrRows = mrs.flatMap((m): SessionWorkRow[] => {
    const isOwn = isMine(m)
    if (isOwn && tasks.some((t) => isSameTicket(m.ticket, t.key))) return []
    const live = pickLive([isOwn ? findMineSession(sessions, m) : findReviewSession(sessions, m.sessionId)])
    return live ? [{ kind: 'mr', key: m.key, title: m.title, session: live, mr: m, isMine: isOwn }] : []
  })
  return [...ticketRows, ...mrRows].sort((a, b) => statusRank(a.session) - statusRank(b.session) || b.session.lastActive - a.session.lastActive)
}

export const mrListTarget = (rows: SessionWorkRow[], ticketKey: string): { kind: 'mr' | 'ticket'; key: string } => {
  const isTicketRow = (r: SessionWorkRow): boolean => r.kind === 'ticket' && r.key === ticketKey
  const mr = rows.find(isTicketRow)?.mr
  return mr ? { kind: 'mr', key: mr.key } : { kind: 'ticket', key: ticketKey }
}
