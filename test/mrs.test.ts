import { describe, it, expect } from 'vitest'
import { filterMrs, reviewLabel, findReviewSession, findWorkSession, mergeHint, groupMrs } from '../src/renderer/src/dashboard/mrs'
import type { MrRow, Session } from '../src/renderer/src/types'

const mr = (over: Partial<MrRow>): MrRow => ({
  key: '7!1',
  projectId: 7,
  projectPath: 'telco/tigo-fo-web',
  projectName: 'tigo-fo-web',
  iid: 1,
  title: 'Fix focus',
  author: 'Anna',
  sourceBranch: 'fix/SOFRMPT-1-x',
  targetBranch: 'develop',
  sha: 'a',
  url: 'u',
  description: '',
  updatedAt: '2026-11-08',
  ticket: 'SOFRMPT-1',
  review: 'not-reviewed',
  sessionId: null,
  ...over
})

const none = { query: '', project: '', author: '', isUnreviewedOnly: false, starred: [], isStarredOnly: false, myName: null, isMineHidden: false, isMineOnly: false }

describe('filterMrs', () => {
  const rows = [
    mr({}),
    mr({ key: '8!2', iid: 22, projectName: 'tigo-fo-smarttv', author: 'Bartek', title: 'EPG', ticket: null, sourceBranch: 'feat/epg', review: 'reviewed' })
  ]
  it('keeps everything without filters', () => {
    expect(filterMrs(rows, none)).toHaveLength(2)
  })
  it('matches the query on title, iid, branch and ticket', () => {
    expect(filterMrs(rows, { ...none, query: 'epg' }).map((r) => r.key)).toEqual(['8!2'])
    expect(filterMrs(rows, { ...none, query: '22' }).map((r) => r.key)).toEqual(['8!2'])
    expect(filterMrs(rows, { ...none, query: 'sofrmpt-1' }).map((r) => r.key)).toEqual(['7!1'])
  })
  it('filters by project, author and review state', () => {
    expect(filterMrs(rows, { ...none, project: 'tigo-fo-smarttv' }).map((r) => r.key)).toEqual(['8!2'])
    expect(filterMrs(rows, { ...none, author: 'Anna' }).map((r) => r.key)).toEqual(['7!1'])
    expect(filterMrs(rows, { ...none, isUnreviewedOnly: true }).map((r) => r.key)).toEqual(['7!1'])
  })
  it('keeps only starred MRs when asked', () => {
    expect(filterMrs(rows, { ...none, starred: ['8!2'], isStarredOnly: true }).map((r) => r.key)).toEqual(['8!2'])
  })
})

describe('reviewLabel', () => {
  it('labels each review state', () => {
    expect(reviewLabel('new-changes')).toEqual({ label: 'new changes since your review', color: '#f0883e' })
    expect(reviewLabel('not-reviewed')).toEqual({ label: 'not reviewed', color: '#9a9a9a' })
    expect(reviewLabel('reviewed')).toEqual({ label: 'reviewed', color: '#2ea043' })
  })
})

describe('findReviewSession', () => {
  const sessions = [{ id: '01edb0c6-135e-4504-9c5b-833736cd2587' }, { id: 'aa' }] as Session[]
  it('finds the session by its full id or by the short agent id', () => {
    expect(findReviewSession(sessions, '01edb0c6-135e-4504-9c5b-833736cd2587')?.id).toBe(sessions[0].id)
    expect(findReviewSession(sessions, '01edb0c6')?.id).toBe(sessions[0].id)
  })
  it('finds nothing without an id', () => {
    expect(findReviewSession(sessions, null)).toBeUndefined()
  })
})

describe('mergeHint', () => {
  it('says ready when GitLab allows the merge', () => {
    expect(mergeHint('mergeable')).toEqual({ text: 'Ready to merge!', isReady: true })
  })
  it('names the blocker', () => {
    expect(mergeHint('discussions_not_resolved')).toEqual({ text: 'All threads must be resolved', isReady: false })
    expect(mergeHint('need_rebase')).toEqual({ text: 'Needs a rebase onto the target branch', isReady: false })
    expect(mergeHint('something_new')).toEqual({ text: 'GitLab: something new', isReady: false })
  })
})

describe('filterMrs — my merge requests', () => {
  it('hides merge requests I wrote when asked', () => {
    const list = [mr({ key: '7!1', author: 'Patryk Dorau' }), mr({ key: '7!2', author: 'Anna' })]
    expect(filterMrs(list, { ...none, myName: 'Patryk Dorau', isMineHidden: true }).map((r) => r.key)).toEqual(['7!2'])
    expect(filterMrs(list, { ...none, myName: 'Patryk Dorau', isMineHidden: false })).toHaveLength(2)
  })
  it('keeps everything when my name is unknown', () => {
    const list = [mr({ key: '7!1', author: 'Patryk Dorau' })]
    expect(filterMrs(list, { ...none, myName: null, isMineHidden: true })).toHaveLength(1)
  })
})

describe('groupMrs', () => {
  it('groups by review state in the order new changes, not reviewed, reviewed', () => {
    const list = [mr({ key: '7!1', review: 'reviewed' }), mr({ key: '7!2', review: 'new-changes' }), mr({ key: '7!3' })]
    expect(groupMrs(list).map((g) => [g.state, g.rows.map((r) => r.key)])).toEqual([
      ['new-changes', ['7!2']],
      ['not-reviewed', ['7!3']],
      ['reviewed', ['7!1']]
    ])
  })
})

describe('filterMrs — only mine', () => {
  it('keeps only merge requests I wrote', () => {
    const list = [mr({ key: '7!1', author: 'Patryk Dorau' }), mr({ key: '7!2', author: 'Anna' })]
    expect(filterMrs(list, { ...none, myName: 'Patryk Dorau', isMineOnly: true }).map((r) => r.key)).toEqual(['7!1'])
  })
})

describe('findWorkSession', () => {
  const s = (id: string, ticket: string | null, name: string | null, lastActive: number): Session =>
    ({ id, ticket, name, lastActive, projectPath: `C:/wt/${id}` }) as Session
  it('picks the newest session that worked on the ticket and skips explain and review sessions', () => {
    const sessions = [
      s('old', 'SOFRMPT-3954', 'SOFRMPT-3954', 1),
      s('new', 'SOFRMPT-3954', 'SOFRMPT-3954', 5),
      s('exp', 'SOFRMPT-3954', 'SOFRMPT-3954 explain', 9),
      s('rev', 'SOFRMPT-3954', 'MR-527', 9),
      s('other', 'SOFRMPT-1', 'SOFRMPT-1', 9)
    ]
    expect(findWorkSession(sessions, 'SOFRMPT-3954')?.id).toBe('new')
  })
  it('finds nothing without a ticket', () => {
    expect(findWorkSession([s('a', null, null, 1)], null)).toBeUndefined()
  })
})
