import { describe, it, expect } from 'vitest'
import { mrKey, parseTodos, parseReviewMrs, mergeMrs, mentionPath, countOpenThreads, threadCounts, countApprovals, isApprovedBy, approvalState, carryEnrichment, pruneApproved, isInProjects, reviewState, sortMrs, parseDiffStats, parseMrSha, lastReplyToMe, seenShas } from '../src/main/gitlab'
import type { MrItem, MrRow } from '../src/renderer/src/types'

const mrTodo = {
  target_type: 'MergeRequest',
  project: { id: 7, path_with_namespace: 'telco/tigo-fo-web', name: 'tigo-fo-web' },
  target: {
    iid: 42,
    project_id: 7,
    title: 'Fix player focus',
    author: { name: 'Anna Nowak' },
    source_branch: 'fix/SOFRMPT-1-x',
    target_branch: 'develop',
    sha: 'abc',
    web_url: 'https://gitlab/telco/tigo-fo-web/-/merge_requests/42',
    description: 'Steps',
    updated_at: '2026-11-08T10:00:00Z'
  }
}

describe('parseTodos', () => {
  it('maps merge request to-dos once and skips other to-dos', () => {
    const issue = { target_type: 'Issue', project: mrTodo.project, target: { iid: 1 } }
    expect(parseTodos([mrTodo, issue, mrTodo])).toEqual([
      {
        key: '7!42',
        projectId: 7,
        projectPath: 'telco/tigo-fo-web',
        projectName: 'tigo-fo-web',
        iid: 42,
        title: 'Fix player focus',
        author: 'Anna Nowak',
        sourceBranch: 'fix/SOFRMPT-1-x',
        targetBranch: 'develop',
        sha: 'abc',
        url: 'https://gitlab/telco/tigo-fo-web/-/merge_requests/42',
        description: 'Steps',
        updatedAt: '2026-11-08T10:00:00Z',
        ticket: 'SOFRMPT-1',
        hasOpenThreads: false,
        notes: 0,
        openThreads: 0,
        waitingThreads: null,
        othersNotes: null,
        replyToMeId: null,
        approvals: 0,
        isApprovedByMe: false,
        isDraft: false,
        state: 'opened'
      }
    ])
  })
  it('takes the ticket from the title when the branch has none', () => {
    const t = { ...mrTodo, target: { ...mrTodo.target, source_branch: 'feature/x', title: 'SOFNJJ-9 EPG' } }
    expect(parseTodos([t])[0].ticket).toBe('SOFNJJ-9')
  })
  it('returns nothing for garbage', () => {
    expect(parseTodos(null)).toEqual([])
    expect(parseTodos({ a: 1 })).toEqual([])
  })
  it('builds the key from project id and iid', () => {
    expect(mrKey(7, 42)).toBe('7!42')
  })
})

describe('isInProjects', () => {
  it('matches the last path segment case-insensitively', () => {
    expect(isInProjects('telco/tigo-fo-web', 'Tigo-fo-web, x')).toBe(true)
    expect(isInProjects('telco/other', 'tigo-fo-web')).toBe(false)
  })
  it('shows everything when the filter is blank', () => {
    expect(isInProjects('a/b', ' ')).toBe(true)
  })
})

describe('reviewState', () => {
  it('compares the head sha with the sha at the last review', () => {
    expect(reviewState('a', undefined)).toBe('not-reviewed')
    expect(reviewState('a', 'a')).toBe('reviewed')
    expect(reviewState('b', 'a')).toBe('new-changes')
  })
})

describe('approvalState', () => {
  it('is null when I have not approved', () => {
    expect(approvalState('a', false, 'a')).toBeNull()
  })
  it('is approved without a stored sha or when the head is unchanged', () => {
    expect(approvalState('a', true, undefined)).toBe('approved')
    expect(approvalState('a', true, 'a')).toBe('approved')
  })
  it('is new-changes when commits landed after my approve', () => {
    expect(approvalState('b', true, 'a')).toBe('new-changes')
  })
})

describe('sortMrs', () => {
  it('puts approved after reviewed', () => {
    const sorted = sortMrs([
      { key: 'a', review: 'approved', updatedAt: '2026-11-10' } as MrRow,
      { key: 'r', review: 'reviewed', updatedAt: '2026-11-09' } as MrRow
    ])
    expect(sorted.map((r) => r.key)).toEqual(['r', 'a'])
  })
  const row = (key: string, review: MrRow['review'], updatedAt: string): MrRow =>
    ({ key, review, updatedAt }) as MrRow
  it('puts new changes first, then not reviewed, then reviewed, newest first inside', () => {
    const sorted = sortMrs([
      row('r', 'reviewed', '2026-11-09'),
      row('n1', 'not-reviewed', '2026-11-01'),
      row('c', 'new-changes', '2026-11-02'),
      row('n2', 'not-reviewed', '2026-11-05')
    ])
    expect(sorted.map((r) => r.key)).toEqual(['c', 'n2', 'n1', 'r'])
  })
})

describe('parseDiffStats', () => {
  it('counts added and removed lines per file', () => {
    expect(parseDiffStats([{ new_path: 'a.ts', diff: '@@ -1 +1 @@\n+x\n+y\n-z\n' }])).toEqual([
      { path: 'a.ts', added: 2, removed: 1 }
    ])
  })
  it('ignores file header lines and garbage', () => {
    expect(parseDiffStats([{ new_path: 'b', diff: '--- a/b\n+++ b/b\n+k' }])).toEqual([{ path: 'b', added: 1, removed: 0 }])
    expect(parseDiffStats(null)).toEqual([])
  })
})

describe('parseMrSha', () => {
  it('reads the head sha of a merge request', () => {
    expect(parseMrSha({ sha: 'def' })).toBe('def')
    expect(parseMrSha(null)).toBeNull()
  })
})

describe('parseDiffStats line signs', () => {
  it('counts removed lines that start with dashes, since /diffs has no file headers', () => {
    expect(parseDiffStats([{ new_path: 'a.sql', diff: '@@ -1 +1 @@\n--- old comment\n+++i\n' }])).toEqual([
      { path: 'a.sql', added: 1, removed: 1 }
    ])
  })
})

describe('parseReviewMrs', () => {
  const mr = {
    project_id: 7,
    iid: 43,
    title: 'Add PIN retry',
    author: { name: 'Jan Kowalski' },
    source_branch: 'feat/SOFRMPT-2-pin',
    target_branch: 'develop',
    sha: 'def',
    web_url: 'https://gitlab/telco/tigo-fo-web/-/merge_requests/43',
    description: '',
    updated_at: '2026-11-09T10:00:00Z',
    references: { full: 'telco/tigo-fo-web!43' }
  }
  it('maps merge requests and reads the project from the full reference', () => {
    const [item] = parseReviewMrs([mr])
    expect(item.key).toBe('7!43')
    expect(item.projectPath).toBe('telco/tigo-fo-web')
    expect(item.projectName).toBe('tigo-fo-web')
    expect(item.ticket).toBe('SOFRMPT-2')
  })
  it('reads the merge request state, defaulting to opened', () => {
    expect(parseReviewMrs([{ ...mr, state: 'merged' }])[0].state).toBe('merged')
    expect(parseReviewMrs([{ ...mr, state: 'closed' }])[0].state).toBe('closed')
    expect(parseReviewMrs([mr])[0].state).toBe('opened')
  })
  it('skips entries without a project or iid', () => {
    expect(parseReviewMrs([{ title: 'x' }, 'junk'])).toEqual([])
    expect(parseReviewMrs(null)).toEqual([])
  })
})

describe('mergeMrs', () => {
  it('keeps the first copy of each merge request', () => {
    const a = parseTodos([mrTodo])
    const b = [{ ...a[0], title: 'other' }]
    expect(mergeMrs(a, b)).toEqual(a)
  })
})

describe('mentionPath', () => {
  it('searches open merge requests whose description mentions the group', () => {
    expect(mentionPath('@telco-frontend')).toBe('/merge_requests?state=opened&scope=all&in=description&search=%40telco-frontend&per_page=100')
  })
  it('skips an empty mention', () => {
    expect(mentionPath('  ')).toBeNull()
  })
})

describe('open threads on a merge request', () => {
  it('flags unresolved threads and keeps the comment count', () => {
    const [item] = parseReviewMrs([
      { project_id: 7, iid: 9, title: 'x', references: { full: 'g/p!9' }, blocking_discussions_resolved: false, user_notes_count: 4 }
    ])
    expect(item.hasOpenThreads).toBe(true)
    expect(item.notes).toBe(4)
  })
  it('treats missing data as no open threads', () => {
    const [item] = parseReviewMrs([{ project_id: 7, iid: 9, title: 'x', references: { full: 'g/p!9' } }])
    expect(item.hasOpenThreads).toBe(false)
    expect(item.notes).toBe(0)
  })
})

describe('countOpenThreads', () => {
  it('counts resolvable threads that are not resolved yet', () => {
    const json = [
      { notes: [{ resolvable: true, resolved: false }, { resolvable: true, resolved: false }] },
      { notes: [{ resolvable: true, resolved: true }] },
      { notes: [{ resolvable: false, system: true }] },
      { notes: [{ resolvable: true, resolved: false }] }
    ]
    expect(countOpenThreads(json)).toBe(2)
  })
  it('returns zero for a bad answer', () => {
    expect(countOpenThreads(null)).toBe(0)
  })
})

const note = (name: string, over: Record<string, unknown> = {}): Record<string, unknown> => ({
  resolvable: true,
  resolved: false,
  system: false,
  author: { name },
  ...over
})

describe('threadCounts', () => {
  it('counts an unresolved thread whose last note is by someone else as waiting', () => {
    expect(threadCounts([{ notes: [note('Me'), note('Bob')] }], 'Me')).toEqual({
      openThreads: 1,
      waitingThreads: 1,
      othersNotes: 1
    })
  })
  it('does not count a thread as waiting when my note is last, ignoring system notes', () => {
    const json = [{ notes: [note('Bob'), note('Me'), note('Bob', { system: true })] }]
    expect(threadCounts(json, 'Me')).toEqual({ openThreads: 1, waitingThreads: 0, othersNotes: 1 })
  })
  it('ignores resolved and non-resolvable threads for open and waiting', () => {
    const json = [
      { notes: [note('Bob', { resolved: true })] },
      { notes: [note('Bob', { resolvable: false })] }
    ]
    expect(threadCounts(json, 'Me')).toMatchObject({ openThreads: 0, waitingThreads: 0 })
  })
  it('counts every non-system note of others across all discussions', () => {
    const json = [
      { notes: [note('Bob', { resolved: true }), note('Me')] },
      { notes: [note('Ann', { resolvable: false }), note('Ann', { system: true })] }
    ]
    expect(threadCounts(json, 'Me').othersNotes).toBe(2)
  })
  it('does not count notes of the dao-gitlab bot as notes of others', () => {
    const json = [{ notes: [note('PR Agent', { resolvable: false, author: { name: 'PR Agent', username: 'dao-gitlab' } })] }]
    expect(threadCounts(json, 'Me').othersNotes).toBe(0)
  })
  it('returns zeros for a bad answer', () => {
    expect(threadCounts(null, 'Me')).toEqual({ openThreads: 0, waitingThreads: 0, othersNotes: 0 })
  })
})

describe('carryEnrichment', () => {
  it('carries waiting threads and others notes from the previous item', () => {
    const fresh = [{ key: '7!1', waitingThreads: null, othersNotes: null } as MrItem]
    const previous = [{ key: '7!1', waitingThreads: 2, othersNotes: 5 } as MrItem]
    expect(carryEnrichment(fresh, previous).map((m) => [m.waitingThreads, m.othersNotes])).toEqual([
      [2, 5]
    ])
  })

  it('keeps approvals, threads and my approval from the previous poll until enrichment ends', () => {
    const fresh = [{ key: '7!1', approvals: 0, openThreads: 0, isApprovedByMe: false } as MrItem, { key: '7!2', approvals: 0, openThreads: 0, isApprovedByMe: false } as MrItem]
    const previous = [{ key: '7!1', approvals: 2, openThreads: 1, isApprovedByMe: true } as MrItem]
    expect(carryEnrichment(fresh, previous).map((m) => [m.key, m.approvals, m.openThreads, m.isApprovedByMe])).toEqual([
      ['7!1', 2, 1, true],
      ['7!2', 0, 0, false]
    ])
  })
})

describe('pruneApproved', () => {
  it('drops stored approve shas of MRs I no longer approve', () => {
    const items = [{ key: '7!1', isApprovedByMe: true } as MrItem, { key: '7!2', isApprovedByMe: false } as MrItem]
    expect(pruneApproved({ '7!1': 'a', '7!2': 'b', '7!3': 'c' }, items)).toEqual({ '7!1': 'a', '7!3': 'c' })
  })
})

describe('isApprovedBy', () => {
  it('matches the current user by name', () => {
    expect(isApprovedBy({ approved_by: [{ user: { name: 'Ann' } }, { user: { name: 'Bob' } }] }, 'Bob')).toBe(true)
    expect(isApprovedBy({ approved_by: [{ user: { name: 'Ann' } }] }, 'Bob')).toBe(false)
  })
  it('is false without a known user or a usable list', () => {
    expect(isApprovedBy({ approved_by: [{ user: { name: 'Bob' } }] }, null)).toBe(false)
    expect(isApprovedBy({ approved_by: [{}, { user: {} }] }, 'Bob')).toBe(false)
    expect(isApprovedBy(null, 'Bob')).toBe(false)
  })
})

describe('countApprovals', () => {
  it('counts the people who approved', () => {
    expect(countApprovals({ approved_by: [{ user: { id: 1 } }, { user: { id: 2 } }] })).toBe(2)
  })
  it('returns zero for a bad answer', () => {
    expect(countApprovals(null)).toBe(0)
  })
})

describe('draft merge requests', () => {
  it('marks drafts by the flag or the title prefix and strips the prefix', () => {
    const [flagged] = parseReviewMrs([{ project_id: 7, iid: 1, title: 'feat: x', draft: true, references: { full: 'g/p!1' } }])
    const [titled] = parseReviewMrs([{ project_id: 7, iid: 2, title: 'Draft: feat(SOFRMPT-3675): Open TV Shop', references: { full: 'g/p!2' } }])
    expect(flagged.isDraft).toBe(true)
    expect(titled.isDraft).toBe(true)
    expect(titled.title).toBe('feat(SOFRMPT-3675): Open TV Shop')
  })
})

describe('lastReplyToMe', () => {
  const note = (id: number, name: string, extra: Record<string, unknown> = {}) => ({ id, body: 'x', author: { name, username: name.toLowerCase() }, ...extra })
  it('returns the newest note someone else wrote after me in my threads', () => {
    const json = [
      { notes: [note(1, 'Me'), note(2, 'Anna'), note(5, 'Jan')] },
      { notes: [note(3, 'Anna'), note(4, 'Me')] },
      { notes: [note(9, 'Anna'), note(10, 'Jan')] }
    ]
    expect(lastReplyToMe(json, 'Me', [])).toBe(5)
  })
  it('counts replies in a thread someone else started once I wrote in it', () => {
    const json = [{ notes: [note(1, 'Anna'), note(2, 'Me'), note(3, 'Anna')] }]
    expect(lastReplyToMe(json, 'Me', [])).toBe(3)
  })
  it('ignores bots, system notes and threads without my notes', () => {
    const json = [
      { notes: [note(1, 'Me'), note(2, 'dao-gitlab'), note(3, 'Group_1_bot_x'), note(4, 'Anna', { system: true })] },
      { notes: [note(6, 'Anna')] }
    ]
    expect(lastReplyToMe(json, 'Me', ['dao-gitlab'])).toBeNull()
  })
  it('returns null without me or discussions', () => {
    expect(lastReplyToMe(null, 'Me', [])).toBeNull()
    expect(lastReplyToMe([{ notes: [note(1, 'Anna')] }], null, [])).toBeNull()
  })
})

describe('seenShas', () => {
  const maps = { reviewedMrs: { a: 'old' }, approvedMrs: { b: 'old' } }
  it('moves the reviewed sha to the head when new changes were reviewed', () => {
    expect(seenShas({ key: 'a', sha: 'new', isApprovedByMe: false }, maps)).toEqual({ reviewedMrs: { a: 'new' }, approvedMrs: { b: 'old' } })
  })
  it('moves the approved sha to the head when new changes were approved', () => {
    expect(seenShas({ key: 'b', sha: 'new', isApprovedByMe: true }, maps)).toEqual({ reviewedMrs: { a: 'old' }, approvedMrs: { b: 'new' } })
  })
  it('returns null when there are no new changes', () => {
    expect(seenShas({ key: 'a', sha: 'old', isApprovedByMe: false }, maps)).toBeNull()
    expect(seenShas({ key: 'c', sha: 'x', isApprovedByMe: false }, maps)).toBeNull()
  })
})
