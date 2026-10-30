import { describe, it, expect } from 'vitest'
import { choosePane } from '../src/main/pane'

const F = 'C:\\P\\app'

describe('choosePane', () => {
  it('goes to the top when the folder has no sessions', () => {
    expect(choosePane(F, [], {}, [])).toBe('top')
  })
  it('goes to the bottom when one live session is on top', () => {
    expect(choosePane(F, ['a'], { a: { pane: 'top', folder: F } }, [])).toBe('bottom')
  })
  it('goes to the top on a tie', () => {
    const panes = { a: { pane: 'top' as const, folder: F }, b: { pane: 'bottom' as const, folder: 'c:/p/app/' } }
    expect(choosePane(F, ['a', 'b'], panes, [])).toBe('top')
  })
  it('ignores sessions that are not live and other folders', () => {
    const panes = { a: { pane: 'top' as const, folder: F }, b: { pane: 'top' as const, folder: 'C:\\P\\other' } }
    expect(choosePane(F, ['b'], panes, [])).toBe('top')
  })
  it('counts pending placements of the same folder', () => {
    expect(choosePane(F, [], {}, [{ pane: 'top', folder: F }])).toBe('bottom')
    expect(choosePane(F, [], {}, [{ pane: 'top', folder: 'C:\\P\\other' }])).toBe('top')
  })
})
