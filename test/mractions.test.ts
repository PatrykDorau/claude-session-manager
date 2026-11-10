import { describe, it, expect } from 'vitest'
import { parseMrState, parseApprovals, parseDiscussions, parseMrOverview, snippetAround, snippetFromDiff, diffRows } from '../src/main/mractions'

describe('parseMrState', () => {
  it('reads merge readiness, pipeline, conflicts and how far behind it is', () => {
    expect(
      parseMrState({
        state: 'opened',
        detailed_merge_status: 'mergeable',
        has_conflicts: false,
        diverged_commits_count: 3,
        head_pipeline: { status: 'success' },
        user: { can_merge: true }
      })
    ).toEqual({ state: 'opened', mergeStatus: 'mergeable', isMergeable: true, hasConflicts: false, behind: 3, pipeline: 'success', canMerge: true })
  })
  it('falls back for missing fields', () => {
    expect(parseMrState({})).toEqual({ state: '', mergeStatus: '', isMergeable: false, hasConflicts: false, behind: 0, pipeline: null, canMerge: false })
  })
})

describe('parseApprovals', () => {
  const json = { approvals_left: 1, approved_by: [{ user: { id: 5, name: 'Anna Nowak' } }, { user: { id: 9, name: 'Me' } }] }
  it('lists who approved and whether I did', () => {
    expect(parseApprovals(json, 9)).toEqual({ approvedBy: ['Anna Nowak', 'Me'], left: 1, isApprovedByMe: true })
    expect(parseApprovals(json, 1).isApprovedByMe).toBe(false)
  })
  it('handles a bad answer', () => {
    expect(parseApprovals(null, 9)).toEqual({ approvedBy: [], left: 0, isApprovedByMe: false })
  })
})

describe('parseDiscussions', () => {
  it('keeps system notes as one-line events', () => {
    const json = [{ id: 'd3', individual_note: true, notes: [{ id: 4, body: 'assigned to @pd', author: { name: 'Patryk' }, created_at: 't', system: true }] }]
    expect(parseDiscussions(json)).toEqual([
      { id: 'd3', isSystem: true, isResolved: false, isResolvable: false, where: null, anchor: null, snippet: null, notes: [{ id: 4, author: 'Patryk', body: 'assigned to @pd', createdAt: 't' }] }
    ])
  })
  it('keeps human notes and drops empty threads', () => {
    const json = [
      {
        id: 'd1',
        notes: [
          { id: 1, body: 'Looks good', author: { name: 'Anna' }, created_at: '2026-11-10T10:00:00Z', system: false, resolvable: true, resolved: false, position: { new_path: 'a.ts', new_line: 4, head_sha: 'h1', base_sha: 'b1' } },
          { id: 2, body: 'Thanks', author: { name: 'Jan' }, created_at: '2026-11-10T10:05:00Z', system: false }
        ]
      },
      { id: 'd2', notes: [] }
    ]
    expect(parseDiscussions(json)).toEqual([
      {
        id: 'd1',
        isSystem: false,
        isResolved: false,
        isResolvable: true,
        where: 'a.ts:4',
        anchor: { path: 'a.ts', line: 4, sha: 'h1', side: 'new' },
        snippet: null,
        notes: [
          { id: 1, author: 'Anna', body: 'Looks good', createdAt: '2026-11-10T10:00:00Z' },
          { id: 2, author: 'Jan', body: 'Thanks', createdAt: '2026-11-10T10:05:00Z' }
        ]
      }
    ])
  })
})

describe('parseMrOverview', () => {
  it('reads the description, people, labels and the pipeline', () => {
    expect(
      parseMrOverview({
        description: 'Hi',
        description_html: '<p>Hi</p>',
        draft: true,
        created_at: '2026-11-10T10:00:00Z',
        author: { name: 'Patryk' },
        assignees: [{ name: 'Patryk' }],
        reviewers: [],
        labels: ['Review effort 3/5'],
        milestone: { title: 'R1' },
        squash: true,
        force_remove_source_branch: true,
        merge_when_pipeline_succeeds: false,
        head_pipeline: { id: 576042, status: 'success', sha: 'abcdef123', web_url: 'https://g/p/-/pipelines/576042', coverage: '0.80' }
      })
    ).toEqual({
      description: 'Hi',
      descriptionHtml: '<p>Hi</p>',
      isDraft: true,
      createdAt: '2026-11-10T10:00:00Z',
      author: 'Patryk',
      assignees: ['Patryk'],
      reviewers: [],
      labels: ['Review effort 3/5'],
      milestone: 'R1',
      isSquash: true,
      isSourceRemoved: true,
      pipeline: { id: 576042, status: 'success', sha: 'abcdef12', url: 'https://g/p/-/pipelines/576042', coverage: '0.80' }
    })
  })
  it('handles a bare merge request', () => {
    expect(parseMrOverview({}).pipeline).toBeNull()
    expect(parseMrOverview({}).labels).toEqual([])
  })
})

const NL = String.fromCharCode(10)
const row = (no: number | null, mark: string, text: string, isHit = false): unknown => ({ no, mark, text, isHit })

describe('snippetAround', () => {
  const text = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7'].join(NL)
  it('cuts a few lines before and one after the commented line', () => {
    expect(snippetAround(text, 5)?.rows).toEqual([
      row(1, ' ', 'l1'),
      row(2, ' ', 'l2'),
      row(3, ' ', 'l3'),
      row(4, ' ', 'l4'),
      row(5, ' ', 'l5', true),
      row(6, ' ', 'l6')
    ])
  })
  it('gives nothing for a line outside the file', () => {
    expect(snippetAround(text, 40)).toBeNull()
  })
})

describe('snippetFromDiff', () => {
  const diff = ['@@ -10,5 +10,6 @@ const a = 1', ' keep1', '-old2', '+new2', '+new3', ' keep4', ' keep5', ' keep6'].join(NL)
  it('shows the diff lines around a comment on the new side', () => {
    expect(snippetFromDiff(diff, 12, 'new')?.rows).toEqual([
      row(10, ' ', 'keep1'),
      row(null, '-', 'old2'),
      row(11, '+', 'new2'),
      row(12, '+', 'new3', true),
      row(13, ' ', 'keep4')
    ])
  })
  it('finds a comment on a removed line by its old number', () => {
    expect(snippetFromDiff(diff, 11, 'old')?.rows.find((r) => r.isHit)).toEqual(row(11, '-', 'old2', true))
  })
  it('gives nothing when the line is outside every hunk', () => {
    expect(snippetFromDiff(diff, 99, 'new')).toBeNull()
  })
})

describe('parseDiscussions — old side', () => {
  it('anchors a comment on a removed line to the base commit', () => {
    const json = [
      { id: 'd9', notes: [{ id: 9, body: 'why?', author: { name: 'A' }, created_at: 't', resolvable: true, position: { old_path: 'b.ts', old_line: 3, new_line: null, head_sha: 'h', base_sha: 'b' } }] }
    ]
    expect(parseDiscussions(json)[0].anchor).toEqual({ path: 'b.ts', line: 3, sha: 'b', side: 'old' })
  })
})

describe('diffRows', () => {
  it('lists every diff line with its old and new number', () => {
    const diff = ['@@ -3,2 +3,3 @@', ' a', '-b', '+c', '+d'].join(String.fromCharCode(10))
    expect(diffRows(diff)).toEqual([
      { kind: 'hunk', old: null, new: null, text: '@@ -3,2 +3,3 @@' },
      { kind: ' ', old: 3, new: 3, text: 'a' },
      { kind: '-', old: 4, new: null, text: 'b' },
      { kind: '+', old: null, new: 4, text: 'c' },
      { kind: '+', old: null, new: 5, text: 'd' }
    ])
  })
})
