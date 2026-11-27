import type { MrRow, Session } from '../types'
import { findAddressSession } from './mrs'

export const PERMISSION_KEYS: Record<'yes' | 'always' | 'no', string> = { yes: '1', always: '2', no: '3' }

export const optionKey = (index: number): string => String(index + 1)

export interface InboxRow {
  sessionId: string
  label: string
  title: string
  status: Session['status']
  since: number
  ticket: string | null
  mrKey: string | null
}

const isInboxStatus = (status: Session['status']): boolean => status === 'waiting' || status === 'checkout'

const mrOfSession = (mrs: MrRow[], s: Session): MrRow | undefined =>
  mrs.find((m) => !!m.sessionId && (m.sessionId === s.id || s.id.startsWith(m.sessionId))) ??
  mrs.find((m) => findAddressSession([s], m))

const toRow = (s: Session, status: InboxRow['status'], titles: Record<string, string | null>, mrs: MrRow[]): InboxRow => {
  const mr = s.ticket ? undefined : mrOfSession(mrs, s)
  return {
    sessionId: s.id,
    label: s.ticket ?? (mr ? `!${mr.iid}` : (s.name ?? s.projectName)),
    title: (s.ticket ? titles[s.ticket] : undefined) ?? mr?.title ?? s.firstPrompt ?? '',
    status,
    since: s.lastActive,
    ticket: s.ticket,
    mrKey: mr?.key ?? null
  }
}

export const buildInboxRows = (sessions: Session[], titles: Record<string, string | null>, mrs: MrRow[]): InboxRow[] =>
  sessions
    .flatMap((s) => (s.isLive && isInboxStatus(s.status) ? [toRow(s, s.status, titles, mrs)] : []))
    .sort((a, b) => Number(a.status === 'checkout') - Number(b.status === 'checkout') || a.since - b.since)

export const dispatcherRows = (rows: InboxRow[], dispatcherId: string | null): InboxRow[] => {
  const isOwnRow = (r: InboxRow): boolean => !!dispatcherId && r.sessionId.startsWith(dispatcherId)
  const isOtherRow = (r: InboxRow): boolean => !isOwnRow(r)
  return rows.filter(isOtherRow)
}

export type LiveOrder = 'attention' | 'newest'

const ATTENTION: Partial<Record<Session['status'], number>> = { waiting: 0, checkout: 1, working: 2 }
const rankOf = (status: Session['status']): number => ATTENTION[status] ?? 3

export const buildLiveRows = (sessions: Session[], titles: Record<string, string | null>, mrs: MrRow[], order: LiveOrder): InboxRow[] =>
  sessions
    .flatMap((s) => (s.isLive ? [toRow(s, s.status, titles, mrs)] : []))
    .sort((a, b) => (order === 'attention' ? rankOf(a.status) - rankOf(b.status) : 0) || b.since - a.since)

export const nextInboxId = (rows: InboxRow[], currentId: string | null): string | null => {
  if (!rows.length) return null
  const at = rows.findIndex((r) => r.sessionId === currentId)
  return rows[at < 0 ? 0 : (at + 1) % rows.length].sessionId
}
