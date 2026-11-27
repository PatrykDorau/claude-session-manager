import { describe, it, expect } from 'vitest'
import { parseBlobLinks, blobWindow } from '../src/renderer/src/dashboard/mrblobs'

const origin = 'https://drm-gitlab.redlabs.pl'

describe('parseBlobLinks', () => {
  it('finds a permalink with a single line after text and a literal newline', () => {
    const body =
      '* taki jest pattern: \\n\\n  https://drm-gitlab.redlabs.pl/millicom/tigo-fo-smarttv/-/blob/326b42550ac3e0246eca70c42aa39256566ffe35/src/javascript/typings/service.d.ts#L106'
    expect(parseBlobLinks(body, origin)).toEqual([
      {
        projectPath: 'millicom/tigo-fo-smarttv',
        ref: '326b42550ac3e0246eca70c42aa39256566ffe35',
        path: 'src/javascript/typings/service.d.ts',
        start: 106,
        end: 106
      }
    ])
  })

  it('finds a permalink on its own line', () => {
    const body =
      'tu jest taki przypadek:\n\nhttps://drm-gitlab.redlabs.pl/millicom/tigo-fo-smarttv/-/blob/db4d1aaa6bdd29512b64498658f024a688a59d38/src/javascript/libs/sdk/bookmarks/favourite-channels.ts#L30'
    expect(parseBlobLinks(body, origin)).toEqual([
      {
        projectPath: 'millicom/tigo-fo-smarttv',
        ref: 'db4d1aaa6bdd29512b64498658f024a688a59d38',
        path: 'src/javascript/libs/sdk/bookmarks/favourite-channels.ts',
        start: 30,
        end: 30
      }
    ])
  })

  it('reads ranges written as L10-20 and L10-L20', () => {
    const base = 'https://drm-gitlab.redlabs.pl/g/p/-/blob/main/a/b.ts'
    expect(parseBlobLinks(`${base}#L10-20`, origin)[0]).toMatchObject({ ref: 'main', start: 10, end: 20 })
    expect(parseBlobLinks(`${base}#L10-L20`, origin)[0]).toMatchObject({ start: 10, end: 20 })
  })

  it('finds a link inside a markdown link and stops at the closing bracket', () => {
    const body = '[here](https://drm-gitlab.redlabs.pl/g/p/-/blob/abc/x.ts#L5)'
    expect(parseBlobLinks(body, origin)).toEqual([{ projectPath: 'g/p', ref: 'abc', path: 'x.ts', start: 5, end: 5 }])
  })

  it('lists the same permalink once', () => {
    const url = 'https://drm-gitlab.redlabs.pl/g/p/-/blob/abc/x.ts#L5'
    expect(parseBlobLinks(`${url} and ${url}`, origin)).toHaveLength(1)
  })

  it('ignores links without a line anchor, other hosts and tree links', () => {
    expect(parseBlobLinks('https://drm-gitlab.redlabs.pl/g/p/-/blob/abc/x.ts', origin)).toEqual([])
    expect(parseBlobLinks('https://github.com/g/p/-/blob/abc/x.ts#L5', origin)).toEqual([])
    expect(parseBlobLinks('https://drm-gitlab.redlabs.pl/g/p/-/tree/abc/src#L5', origin)).toEqual([])
    expect(parseBlobLinks('https://example.com', origin)).toEqual([])
  })
})

describe('blobWindow', () => {
  const text = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n')

  it('returns the line with three lines of context each side and marks the hit', () => {
    const rows = blobWindow(text, 10, 10)
    expect(rows.map((r) => r.no)).toEqual([7, 8, 9, 10, 11, 12, 13])
    expect(rows.filter((r) => r.isHit).map((r) => r.no)).toEqual([10])
    expect(rows[3].text).toBe('line 10')
  })

  it('surrounds a range with three lines and marks the whole range', () => {
    const rows = blobWindow(text, 8, 10)
    expect(rows.map((r) => r.no)).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13])
    expect(rows.filter((r) => r.isHit).map((r) => r.no)).toEqual([8, 9, 10])
  })

  it('clamps at the file edges', () => {
    expect(blobWindow(text, 1, 1).map((r) => r.no)).toEqual([1, 2, 3, 4])
    expect(blobWindow(text, 20, 20).map((r) => r.no)).toEqual([17, 18, 19, 20])
  })

  it('returns nothing when the line is past the end', () => {
    expect(blobWindow(text, 40, 40)).toEqual([])
  })

  it('handles windows line endings', () => {
    expect(blobWindow('a\r\nb\r\nc', 2, 2).map((r) => r.text)).toEqual(['a', 'b', 'c'])
  })
})
