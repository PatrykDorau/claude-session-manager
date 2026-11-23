import { describe, it, expect } from 'vitest'
import { parseReviewDoc, reviewArgs } from '../src/main/reviewdoc'

const sample = {
  key: 'SOFRMPT-3868',
  source: 'mr',
  mr: { iid: 534, source: 'feat/x', target: 'develop' },
  branch: 'feat/x',
  base: 'develop',
  head: 'a1b2c3d',
  parts: [
    {
      title: 'Preload cache for stripe tiles',
      why: 'Tiles were fetched twice.',
      check: 'Cache key when the stripe is reordered.',
      hunks: [
        { file: 'src/a.vue', start: 34, end: 52 },
        { file: 'src\\b.ts', start: 3, end: 9 }
      ]
    },
    {
      title: 'Tests for the cache',
      why: 'Covers the new key.',
      check: 'Missing eviction case.',
      hunks: [{ file: 'test/a.test.ts', start: 1, end: 20 }]
    }
  ]
}

describe('parseReviewDoc', () => {
  it('reads the parts the skill writes', () => {
    const doc = parseReviewDoc(sample)
    expect(doc?.parts).toHaveLength(2)
    expect(doc).toMatchObject({ key: 'SOFRMPT-3868', source: 'mr', mrIid: 534, branch: 'feat/x', base: 'develop', head: 'a1b2c3d' })
    expect(doc?.parts[0].hunks).toEqual([
      { file: 'src/a.vue', start: 34, end: 52 },
      { file: 'src/b.ts', start: 3, end: 9 }
    ])
  })
  it('reads a branch review without an MR', () => {
    expect(parseReviewDoc({ ...sample, source: 'branch', mr: null })).toMatchObject({ source: 'branch', mrIid: null })
  })
  it('drops invalid hunks and the parts left without hunks', () => {
    const doc = parseReviewDoc({
      ...sample,
      parts: [
        { title: 'Bad', why: '', check: '', hunks: [{ file: 'a.ts', start: 9, end: 2 }, { file: '', start: 1, end: 2 }] },
        { title: 'Mixed', why: '', check: '', hunks: [{ file: 'a.ts', start: 9, end: 2 }, { file: 'b.ts', start: 1, end: 2 }] }
      ]
    })
    expect(doc?.parts).toEqual([{ title: 'Mixed', why: '', check: '', hunks: [{ file: 'b.ts', start: 1, end: 2 }], notes: [] }])
  })
  it('reads the line notes and drops invalid ones', () => {
    const notes = [
      { file: 'src\\a.vue', line: 36, text: 'Klucz cache zależy od kolejności.' },
      { file: 'src/a.vue', line: 0, text: 'Zła linia' },
      { file: 'src/a.vue', line: 40, text: '' }
    ]
    const doc = parseReviewDoc({ ...sample, parts: [{ ...sample.parts[0], notes }] })
    expect(doc?.parts[0].notes).toEqual([{ file: 'src/a.vue', line: 36, text: 'Klucz cache zależy od kolejności.' }])
  })
  it('returns null when the file is not a review', () => {
    expect(parseReviewDoc(null)).toBeNull()
    expect(parseReviewDoc({ key: 'X' })).toBeNull()
  })
})

describe('reviewArgs', () => {
  it('starts a named background session that runs the skill', () => {
    expect(reviewArgs('K-1', null)).toEqual(['--bg', '--name', 'K-1 review', '/review-in-parts K-1 --dashboard'])
  })
  it('passes the MR number', () => {
    expect(reviewArgs('MR-534', { iid: 534, source: 'feat/x', target: 'develop' })).toEqual([
      '--bg',
      '--name',
      'MR-534 review',
      '/review-in-parts MR-534 --dashboard --mr 534'
    ])
  })
})
