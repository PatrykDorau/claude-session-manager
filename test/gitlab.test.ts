import { describe, it, expect } from 'vitest'
import { mrKey, parseTodos, parseReviewMrs, mergeMrs, mentionPath, countOpenThreads, countApprovals, isInProjects, reviewState, sortMrs, parseDiffStats, parseMrSha } from '../src/main/gitlab'
import type { MrRow } from '../src/renderer/src/types'

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
        approvals: 0,
        isDraft: false
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

describe('sortMrs', () => {
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
