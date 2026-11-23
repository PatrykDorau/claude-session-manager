import { describe, it, expect } from 'vitest'
import {
  progressKey,
  toggleReviewed,
  setRemark,
  isStale,
  staleReason,
  remarksPrompt,
  remarkDrafts,
  restoreProgress,
  type PartProgress
} from '../src/renderer/src/dashboard/reviewparts'
import type { ReviewDoc } from '../src/renderer/src/types'

const doc: ReviewDoc = {
  key: 'SOFKRS-1',
  source: 'branch',
  mrIid: null,
  branch: 'feat/SOFKRS-1-x',
  base: 'a1',
  head: 'b2',
  parts: [
    { title: 'Store', why: 'w1', check: 'c1', hunks: [{ file: 'src/store.ts', start: 10, end: 20 }] },
    {
      title: 'View',
      why: 'w2',
      check: 'c2',
      hunks: [
        { file: 'src/View.vue', start: 5, end: 9 },
        { file: 'src/other.ts', start: 1, end: 3 }
      ]
    }
  ]
}

const empty: PartProgress = { head: 'b2', updatedAt: 100, reviewed: [], remarks: {} }
const file = { ...doc, updatedAt: 100 }
const allFiles = [{ path: 'src/store.ts' }, { path: 'src/View.vue' }, { path: 'src/other.ts' }]

describe('progressKey', () => {
  it('keys progress by ticket and branch', () => {
    expect(progressKey(doc)).toBe('dash.parts.SOFKRS-1.feat/SOFKRS-1-x')
  })
})

describe('toggleReviewed', () => {
  it('adds a part, then removes it', () => {
    const marked = toggleReviewed(empty, 1)
    expect(marked.reviewed).toEqual([1])
    expect(toggleReviewed(marked, 1).reviewed).toEqual([])
  })
})

describe('setRemark', () => {
  it('stores a remark and removes it when the text is blank', () => {
    const noted = setRemark(empty, 0, 'Rename this')
    expect(noted.remarks).toEqual({ 0: 'Rename this' })
    expect(setRemark(noted, 0, '  ').remarks).toEqual({})
  })
})

describe('isStale', () => {
  it('is true when a hunk file is not in the change list', () => {
    expect(isStale(doc, [{ path: 'src/store.ts' }, { path: 'src/View.vue' }], null)).toBe(true)
  })
  it('is false when every hunk file is in the change list and the head is unknown', () => {
    expect(isStale(doc, allFiles, null)).toBe(false)
  })
  it('is true when a new commit moved the head', () => {
    expect(isStale(doc, allFiles, 'c3')).toBe(true)
  })
  it('is false when the current head matches, also as a short or full sha', () => {
    expect(isStale({ ...doc, head: 'b2c4d5' }, allFiles, 'b2c4d5e6f7')).toBe(false)
    expect(isStale({ ...doc, head: 'b2c4d5e6f7' }, allFiles, 'b2c4d5')).toBe(false)
  })
})

describe('staleReason', () => {
  it('is moved when a new commit moved the head', () => {
    expect(staleReason(doc, allFiles, 'c3')).toBe('moved')
  })
  it('is moved before files when both apply', () => {
    expect(staleReason(doc, [{ path: 'src/store.ts' }], 'c3')).toBe('moved')
  })
  it('is files when a hunk file left the diff but the head is the same', () => {
    expect(staleReason(doc, [{ path: 'src/store.ts' }], null)).toBe('files')
  })
  it('is null when nothing changed', () => {
    expect(staleReason(doc, allFiles, null)).toBeNull()
  })
})

describe('remarksPrompt', () => {
  it('lists each remark with its part, title and lines', () => {
    expect(remarksPrompt(doc, setRemark(empty, 1, 'Split this component'))).toBe(
      'Review remarks to address:\nPart 2 "View" (src/View.vue:5-9): Split this component'
    )
  })
})

describe('remarkDrafts', () => {
  it('anchors each remark at the first hunk start of its part', () => {
    expect(remarkDrafts(doc, setRemark(empty, 1, 'Split this component'))).toEqual([
      { body: 'Split this component', path: 'src/View.vue', line: 5 }
    ])
  })
})

describe('restoreProgress', () => {
  it('keeps the remarks after a JSON round-trip through storage', () => {
    const saved = toggleReviewed(setRemark(empty, 0, 'Rename this'), 1)
    expect(restoreProgress(file, JSON.stringify(saved))).toEqual({ head: 'b2', updatedAt: 100, reviewed: [1], remarks: { 0: 'Rename this' } })
  })
  it('starts over when the saved head differs from the doc head', () => {
    const saved = { head: 'old', updatedAt: 100, reviewed: [0], remarks: { 0: 'x' } }
    expect(restoreProgress(file, JSON.stringify(saved))).toEqual(empty)
  })
  it('starts over when the parts were regenerated on the same head', () => {
    const saved = { head: 'b2', updatedAt: 50, reviewed: [0], remarks: { 0: 'x' } }
    expect(restoreProgress(file, JSON.stringify(saved))).toEqual(empty)
  })
  it('starts over when nothing or garbage is stored', () => {
    expect(restoreProgress(file, null)).toEqual(empty)
    expect(restoreProgress(file, '{oops')).toEqual(empty)
  })
})
