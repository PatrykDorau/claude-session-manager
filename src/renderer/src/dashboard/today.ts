import type { JiraTicket, MrRow, Session } from '../types'
import type { InboxRow } from './inbox'

export type TodayTarget =
  | { kind: 'inbox'; sessionId: string }
  | { kind: 'ticket'; key: string }
  | { kind: 'mr'; key: string }
  | { kind: 'session'; sessionId: string; ticket: string | null; mrKey: string | null }

export interface TodayItem {
  id: string
  label: string
  title: string
  detail: string
  since: number | null
  target: TodayTarget
}

export interface TodayInput {
  inbox: InboxRow[]
  sessions: Session[]
  titles: Record<string, string | null>
  mrs: MrRow[]
  myName: string | null
  tickets: JiraTicket[]
}

const TESTING = ['internal testing']
const COMPLETED = ['to release', 'done']
const REJECTED = ['rejected']
const TO_REVIEW: MrRow['review'][] = ['new-changes', 'not-reviewed']

const isStatusIn = (status: string, list: string[]): boolean => list.includes(status.toLowerCase())
const mrSince = (m: MrRow): number | null => {
  const at = Date.parse(m.updatedAt)
  return Number.isFinite(at) ? at : null
}
const mrItem = (m: MrRow, detail: string): TodayItem => ({
  id: `mr:${m.key}`,
  label: `!${m.iid}`,
  title: m.title,
  detail,
  since: mrSince(m),
  target: { kind: 'mr', key: m.key }
})
const ticketItem = (t: JiraTicket): TodayItem => ({
  id: `ticket:${t.key}`,
  label: t.key,
  title: t.summary,
  detail: t.status,
  since: null,
  target: { kind: 'ticket', key: t.key }
})
const approvalsText = (m: MrRow): string =>
  [m.isDraft ? 'Draft' : null, `${m.approvals} ${m.approvals === 1 ? 'approval' : 'approvals'}`]
    .filter(Boolean)
    .join(' · ')

export const buildToday = (
  input: TodayInput
): { onMe: TodayItem[]; onClaude: TodayItem[]; onOthers: TodayItem[] } => {
  const { inbox, sessions, titles, mrs, myName, tickets } = input
  const mine = myName ? mrs.filter((m) => m.author === myName) : []
  const toReview = myName
    ? mrs.filter((m) => m.author !== myName && !m.isDraft && TO_REVIEW.includes(m.review))
    : []
  const startedKeys = new Set(sessions.map((s) => s.ticket).filter((k): k is string => !!k))
  const isOpenOnMe = (t: JiraTicket): boolean =>
    isStatusIn(t.status, REJECTED) ||
    (!startedKeys.has(t.key) && !isStatusIn(t.status, TESTING) && !isStatusIn(t.status, COMPLETED))
  const sessionMr = (s: Session): MrRow | undefined =>
    s.ticket
      ? undefined
      : mrs.find((m) => !!m.sessionId && (m.sessionId === s.id || s.id.startsWith(m.sessionId)))

  const inboxTickets = new Set(inbox.map((r) => r.ticket).filter((k): k is string => !!k))
  const inboxMrs = new Set(inbox.map((r) => r.mrKey).filter((k): k is string => !!k))
  const onMe: TodayItem[] = [
    ...inbox.map((r) => ({
      id: `inbox:${r.sessionId}`,
      label: r.label,
      title: r.title,
      detail: r.status === 'waiting' ? 'waiting for you' : 'turn finished',
      since: r.since,
      target: { kind: 'inbox' as const, sessionId: r.sessionId }
    })),
    ...toReview
      .filter((m) => !inboxMrs.has(m.key))
      .map((m) => mrItem(m, m.review === 'new-changes' ? 'new changes to review' : 'to review')),
    ...mine
      .filter((m) => m.openThreads > 0 && !inboxMrs.has(m.key))
      .map((m) => mrItem(m, `${m.openThreads} open threads`)),
    ...tickets.filter((t) => isOpenOnMe(t) && !inboxTickets.has(t.key)).map(ticketItem)
  ]
  const onClaude: TodayItem[] = sessions
    .filter((s) => s.isLive && s.status === 'working')
    .map((s) => {
      const m = sessionMr(s)
      return {
        id: `session:${s.id}`,
        label: s.ticket ?? (m ? `!${m.iid}` : (s.name ?? s.projectName)),
        title: (s.ticket ? titles[s.ticket] : undefined) ?? m?.title ?? s.firstPrompt ?? '',
        detail: 'working',
        since: s.lastActive,
        target: {
          kind: 'session' as const,
          sessionId: s.id,
          ticket: s.ticket,
          mrKey: m?.key ?? null
        }
      }
    })
  const onOthers: TodayItem[] = [
    ...mine.filter((m) => m.openThreads === 0).map((m) => mrItem(m, approvalsText(m))),
    ...tickets.filter((t) => isStatusIn(t.status, TESTING)).map(ticketItem)
  ]
  return { onMe, onClaude, onOthers }
}
