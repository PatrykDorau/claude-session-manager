import { describe, it, expect } from 'vitest'
import { changeSignature, isFileViewed, toggleViewed } from '../src/renderer/src/dashboard/viewed'
import { barCells } from '../src/renderer/src/dashboard/diffstat'

describe('viewed files', () => {
  it('stays viewed only while the change is the same', () => {
    const signature = changeSignature({ added: 12, removed: 3 })
    const viewed = toggleViewed({}, 'src/a.ts', signature)
    expect(isFileViewed(viewed, 'src/a.ts', signature)).toBe(true)
    expect(isFileViewed(viewed, 'src/a.ts', changeSignature({ added: 13, removed: 3 }))).toBe(false)
  })

  it('comes back unviewed when the content changes but the counts stay the same', () => {
    const signature = changeSignature({ added: 1, removed: 1, contentId: 'aaa' })
    const viewed = toggleViewed({}, 'src/a.ts', signature)
    expect(isFileViewed(viewed, 'src/a.ts', changeSignature({ added: 1, removed: 1, contentId: 'bbb' }))).toBe(false)
    expect(isFileViewed(viewed, 'src/a.ts', changeSignature({ added: 1, removed: 1, contentId: 'aaa' }))).toBe(true)
  })

  it('toggles off again', () => {
    const signature = changeSignature({ added: 1, removed: 0 })
    expect(toggleViewed(toggleViewed({}, 'a', signature), 'a', signature)).toEqual({})
  })
})

describe('barCells', () => {
  it('fills cells by the size of the change and splits them by added and removed', () => {
    expect(barCells(10, 10, 20)).toEqual(['a', 'a', 'a', 'r', 'r'])
    expect(barCells(2, 0, 100)).toEqual(['a', 'e', 'e', 'e', 'e'])
    expect(barCells(0, 0, 100)).toEqual(['e', 'e', 'e', 'e', 'e'])
    expect(barCells(null, null, 100)).toEqual(['e', 'e', 'e', 'e', 'e'])
  })
})
