import type { MrReviewState, MrRow, Session } from '../types'

export interface MrFilter {
  query: string
  project: string
  author: string
  isUnreviewedOnly: boolean
  starred: string[]
  isStarredOnly: boolean
  myName: string | null
  isMineHidden: boolean
  isMineOnly?: boolean
}

const isQueryMatch = (row: MrRow, needle: string): boolean =>
  !needle ||
  [row.title, String(row.iid), row.sourceBranch, row.ticket ?? ''].some((v) => v.toLowerCase().includes(needle))

export const filterMrs = (rows: MrRow[], f: MrFilter): MrRow[] => {
  const needle = f.query.trim().toLowerCase()
  const starred = new Set(f.starred)
  return rows.filter(
    (r) =>
      isQueryMatch(r, needle) &&
      (!f.project || r.projectName === f.project) &&
      (!f.author || r.author === f.author) &&
      (!f.isUnreviewedOnly || r.review !== 'reviewed') &&
      (!f.isStarredOnly || starred.has(r.key)) &&
      (!f.isMineHidden || !f.myName || r.author !== f.myName) &&
      (!f.isMineOnly || (!!f.myName && r.author === f.myName))
  )
}

const GROUP_ORDER: MrReviewState[] = ['new-changes', 'not-reviewed', 'reviewed']

export const groupMrs = (rows: MrRow[]): { state: MrReviewState; rows: MrRow[] }[] =>
  GROUP_ORDER.map((state) => ({ state, rows: rows.filter((r) => r.review === state) })).filter((g) => g.rows.length)

const LABELS: Record<MrReviewState, { label: string; color: string }> = {
  'new-changes': { label: 'new changes since your review', color: '#f0883e' },
  'not-reviewed': { label: 'not reviewed', color: '#9a9a9a' },
  reviewed: { label: 'reviewed', color: '#2ea043' }
}

export const reviewLabel = (state: MrReviewState): { label: string; color: string } => LABELS[state]

export const findReviewSession = (sessions: Session[], sessionId: string | null): Session | undefined =>
  sessionId ? sessions.find((s) => s.id === sessionId || s.id.startsWith(sessionId)) : undefined

const MERGE_HINTS: Record<string, string> = {
  mergeable: 'Ready to merge!',
  not_approved: 'Approvals are required',
  ci_must_pass: 'The pipeline must succeed',
  ci_still_running: 'The pipeline is still running',
  discussions_not_resolved: 'All threads must be resolved',
  draft_status: 'The merge request is a draft',
  need_rebase: 'Needs a rebase onto the target branch',
  conflict: 'Merge conflicts must be resolved',
  checking: 'GitLab is checking if it can merge',
  unchecked: 'GitLab is checking if it can merge',
  not_open: 'The merge request is not open',
  blocked_status: 'Blocked by another merge request',
  requested_changes: 'A reviewer requested changes'
}

export const mergeHint = (status: string): { text: string; isReady: boolean } => ({
  text: MERGE_HINTS[status] ?? `GitLab: ${status.replace(/_/g, ' ')}`,
  isReady: status === 'mergeable'
})

export const findWorkSession = (sessions: Session[], ticket: string | null): Session | undefined =>
  ticket
    ? sessions
        .filter((s) => s.ticket?.toUpperCase() === ticket.toUpperCase() && !/\bexplain$/.test(s.name ?? '') && !/^MR-\d+/.test(s.name ?? ''))
        .sort((a, b) => b.lastActive - a.lastActive)[0]
    : undefined
