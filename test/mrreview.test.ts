import { describe, it, expect } from 'vitest'
import { positionForLine, withDraftTitle, commentableState, reviewConfirm, anchorPosition, explanationFiles } from '../src/main/mrreview'
import { sortDrafts, draftsForThread, generalDrafts, rowsAround } from '../src/renderer/src/dashboard/mrreview'
import type { DiffRow, MrDraftNote } from '../src/renderer/src/types'
import { parseDraftNotes } from '../src/main/mractions'

const refs = { baseSha: 'b', startSha: 's', headSha: 'h' }
const diff = '@@ -10,3 +10,4 @@\n a\n-b\n+B\n+C\n d\n@@ -40,2 +41,3 @@\n x\n+y\n z'
const file = { oldPath: 'f.ts', newPath: 'f.ts', diff }

describe('positionForLine', () => {
  it('gives an added line only a new_line', () => {
    const p = positionForLine(refs, file, 11, 'new')
    expect(p?.new_line).toBe(11)
    expect(p && 'old_line' in p).toBe(false)
  })
  it('gives a removed line only an old_line', () => {
    const p = positionForLine(refs, file, 11, 'old')
    expect(p?.old_line).toBe(11)
    expect(p && 'new_line' in p).toBe(false)
  })
  it('gives a context line both numbers', () => {
    expect(positionForLine(refs, file, 10, 'new')).toMatchObject({ new_line: 10, old_line: 10 })
  })
  it('shifts an unchanged line between hunks by the net additions above it', () => {
    expect(positionForLine(refs, file, 30, 'new')).toMatchObject({ new_line: 30, old_line: 29 })
  })
  it('shifts a line after the last hunk by all hunks', () => {
    expect(positionForLine(refs, file, 60, 'new')).toMatchObject({ new_line: 60, old_line: 58 })
  })
  it('maps an old-side line outside hunks to the new side', () => {
    expect(positionForLine(refs, file, 58, 'old')).toMatchObject({ new_line: 60, old_line: 58 })
  })
  it('keeps both paths of a renamed file', () => {
    expect(positionForLine(refs, { oldPath: 'a.ts', newPath: 'b.ts', diff }, 11, 'new')).toMatchObject({ old_path: 'a.ts', new_path: 'b.ts' })
  })
  it('carries the diff refs', () => {
    expect(positionForLine(refs, file, 11, 'new')).toMatchObject({ position_type: 'text', base_sha: 'b', start_sha: 's', head_sha: 'h' })
  })
  it('does not shift lines above a deletion-only hunk', () => {
    const cut = { oldPath: 'f.ts', newPath: 'f.ts', diff: '@@ -50,2 +49,0 @@\n-x\n-y' }
    expect(positionForLine(refs, cut, 20, 'new')).toMatchObject({ new_line: 20, old_line: 20 })
    expect(positionForLine(refs, cut, 70, 'new')).toMatchObject({ new_line: 70, old_line: 72 })
  })
  it('returns null for line 0', () => {
    expect(positionForLine(refs, file, 0, 'new')).toBeNull()
  })
})

describe('parseDraftNotes', () => {
  it('reads the body, anchor and reply target', () => {
    const json = [{ id: 7, note: 'x', discussion_id: null, position: { new_path: 'f.ts', new_line: 3, head_sha: 'h', base_sha: 'b' } }]
    expect(parseDraftNotes(json)).toEqual([{ id: 7, body: 'x', replyTo: null, anchor: { path: 'f.ts', line: 3, sha: 'h', side: 'new' }, isResolving: false }])
  })
  it('reads a reply draft without a position', () => {
    expect(parseDraftNotes([{ id: 8, note: 'y', discussion_id: 'abc' }])).toEqual([{ id: 8, body: 'y', replyTo: 'abc', anchor: null, isResolving: false }])
  })
  it('returns nothing for a non-array', () => {
    expect(parseDraftNotes(null)).toEqual([])
  })
})

describe('withDraftTitle', () => {
  it('adds the Draft prefix once', () => {
    expect(withDraftTitle('Fix x', true)).toBe('Draft: Fix x')
    expect(withDraftTitle('Draft: Fix x', true)).toBe('Draft: Fix x')
  })
  it('strips every draft spelling for ready', () => {
    expect(withDraftTitle('WIP: Fix x', false)).toBe('Fix x')
    expect(withDraftTitle('[Draft] Fix x', false)).toBe('Fix x')
    expect(withDraftTitle('Draft: Fix x', false)).toBe('Fix x')
  })
})

describe('commentableState', () => {
  const ok = { headSha: 'h', shownSha: 'h', isFileDirty: false, isLatestVersion: true }
  it('allows comments on the clean MR head', () => {
    expect(commentableState(ok)).toEqual({ isAllowed: true, reason: null })
  })
  it('explains each reason it refuses', () => {
    expect(commentableState({ ...ok, headSha: null }).reason).toBe('Waiting for the merge request to load.')
    expect(commentableState({ ...ok, isLatestVersion: false }).reason).toBe('Comments can only be added on the latest version.')
    expect(commentableState({ ...ok, shownSha: 'old' })).toEqual({
      isAllowed: false,
      reason: 'The code shown is not the pushed MR head. Press Refresh, or push your local commits first.'
    })
    expect(commentableState({ ...ok, isFileDirty: true }).reason).toBe('This file has uncommitted changes, so line numbers may not match the MR.')
  })
})

describe('reviewConfirm', () => {
  const anchor = { path: 'f.ts', line: 3, side: 'new' as const }
  it('asks nothing for private draft edits', () => {
    expect(reviewConfirm({ kind: 'draft-add', body: 'x', anchor }, 12)).toBeNull()
    expect(reviewConfirm({ kind: 'draft-edit', id: 1, body: 'x' }, 12)).toBeNull()
  })
  it('names the action and the MR for everything that publishes', () => {
    expect(reviewConfirm({ kind: 'submit-review', count: 3 }, 12)).toEqual({ question: 'Submit your review with 3 draft notes on !12?', button: 'Submit review' })
    expect(reviewConfirm({ kind: 'resolve', discussionId: 'a', isResolved: true }, 12)).toEqual({ question: 'Resolve this thread on !12?', button: 'Resolve' })
    expect(reviewConfirm({ kind: 'resolve', discussionId: 'a', isResolved: false }, 12)).toEqual({ question: 'Reopen this thread on !12?', button: 'Unresolve' })
    expect(reviewConfirm({ kind: 'set-draft', isDraft: true, title: 't' }, 12)).toEqual({ question: 'Mark !12 as draft?', button: 'Mark as draft' })
    expect(reviewConfirm({ kind: 'set-draft', isDraft: false, title: 't' }, 12)).toEqual({ question: 'Mark !12 as ready?', button: 'Mark as ready' })
    expect(reviewConfirm({ kind: 'draft-delete', id: 1 }, 12)).toEqual({ question: 'Delete this pending draft note on !12?', button: 'Delete' })
    expect(reviewConfirm({ kind: 'line-comment', body: 'x', anchor }, 12)).toEqual({ question: 'Post this comment on !12 now?', button: 'Post comment' })
  })
})

describe('draft lists', () => {
  const at = (id: number, path: string | null, line = 1, replyTo: string | null = null): MrDraftNote => ({
    id,
    body: '',
    replyTo,
    isResolving: false,
    anchor: path ? { path, line, sha: 'h', side: 'new' } : null
  })
  it('orders drafts by file and line with general drafts last', () => {
    const list = [at(1, 'b.ts', 3), at(2, 'a.ts', 9), at(3, null), at(4, 'a.ts', 2)]
    expect(sortDrafts(list).map((d) => d.id)).toEqual([4, 2, 1, 3])
  })
  it('picks the drafts of one thread and the general ones', () => {
    const list = [at(1, null, 1, 'd1'), at(2, null), at(3, 'a.ts'), at(4, null, 1, 'd2')]
    expect(draftsForThread(list, 'd1').map((d) => d.id)).toEqual([1])
    expect(generalDrafts(list).map((d) => d.id)).toEqual([2])
  })
})

describe('withDraftTitle stacked prefixes', () => {
  it('strips every stacked draft prefix', () => {
    expect(withDraftTitle('Draft: [Draft] x', false)).toBe('x')
  })
})

describe('anchorPosition', () => {
  const anchor = { path: 'f.ts', line: 11, side: 'new' as const, sha: 'h' }
  it('builds the position when the MR head is the one shown', () => {
    expect(anchorPosition(refs, { ...file, isTruncated: false }, anchor)).toMatchObject({ position: { new_line: 11 } })
  })
  it('refuses when the MR moved on since the file was shown', () => {
    expect(anchorPosition({ ...refs, headSha: 'newer' }, { ...file, isTruncated: false }, anchor)).toEqual({
      error: 'The merge request changed since you opened this file. Press Refresh and comment again.'
    })
  })
  it('refuses when the diff could not be loaded or GitLab cut it', () => {
    expect(anchorPosition(refs, null, anchor)).toEqual({ error: 'Could not load the diff of f.ts from GitLab, so the line cannot be placed safely.' })
    expect(anchorPosition(refs, { ...file, diff: '', isTruncated: true }, anchor)).toEqual({ error: 'GitLab does not show the diff of f.ts (too large), so the line cannot be placed safely.' })
    expect(anchorPosition(null, { ...file, isTruncated: false }, anchor)).toEqual({ error: 'Could not read the merge request head from GitLab.' })
  })
})

describe('rowsAround', () => {
  const rows: DiffRow[] = [
    { kind: 'hunk', old: null, new: null, text: '@@' },
    ...Array.from({ length: 20 }, (_, i): DiffRow => ({ kind: ' ', old: i + 1, new: i + 1, text: `l${i + 1}` }))
  ]
  it('keeps a few rows around the thread line', () => {
    expect(rowsAround(rows, 10, 2)?.map((r) => r.new)).toEqual([8, 9, 10, 11, 12])
  })
  it('returns null when the line is not in this diff', () => {
    expect(rowsAround(rows, 99, 2)).toBeNull()
  })
})

describe('reviewConfirm reply', () => {
  it('asks before posting a reply right away', () => {
    expect(reviewConfirm({ kind: 'reply', discussionId: 'a', body: 'x' }, 12)).toEqual({ question: 'Post this reply on !12?', button: 'Post reply' })
  })
})

describe('explanationFiles', () => {
  it('maps discussion ids to explanation file names', () => {
    expect(
      explanationFiles([
        { discussionId: 'abc', reply: '1.md', explanation: '1.wyjasnienie.md' },
        { discussionId: 'def', explanation: '2.wyjasnienie.md' }
      ])
    ).toEqual({ abc: '1.wyjasnienie.md', def: '2.wyjasnienie.md' })
  })

  it('drops entries without ids, with paths that leave the folder, or that are not markdown', () => {
    expect(
      explanationFiles([
        { explanation: '1.wyjasnienie.md' },
        { discussionId: 'a', explanation: '../secret.md' },
        { discussionId: 'b', explanation: 'C:/x.md' },
        { discussionId: 'c', explanation: '3.txt' },
        'junk'
      ])
    ).toEqual({})
  })

  it('returns an empty map for anything that is not a list', () => {
    expect(explanationFiles({ discussionId: 'a' })).toEqual({})
  })
})
