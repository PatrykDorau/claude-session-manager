import { describe, it, expect } from 'vitest'
import { panelSessions, followPin, pinnedSessions, togglePin, gridColumns, resolvePins } from '../src/renderer/src/dashboard/commandpanel'
import type { Session } from '../src/renderer/src/types'

const s = (id: string, over: Partial<Session> = {}): Session => ({ id, isLive: true, status: 'idle', lastActive: 0, continuedAs: null, ...over }) as Session

describe('panelSessions', () => {
  it('keeps live sessions, waiting and checkout first, then working, then idle, newest first', () => {
    const rows = panelSessions([
      s('idle', { lastActive: 9 }),
      s('dead', { isLive: false, status: 'waiting' }),
      s('work', { status: 'working' }),
      s('wait', { status: 'waiting', lastActive: 1 }),
      s('check', { status: 'checkout', lastActive: 2 })
    ])
    expect(rows.map((r) => r.id)).toEqual(['check', 'wait', 'work', 'idle'])
  })
})

describe('followPin', () => {
  it('follows a cleared session to its live continuation', () => {
    const sessions = [s('a', { isLive: false, continuedAs: 'b' }), s('b')]
    expect(followPin('a', sessions)?.id).toBe('b')
  })

  it('returns null for a pin whose session is no longer live', () => {
    expect(followPin('a', [s('a', { isLive: false })])).toBeNull()
    expect(followPin('x', [])).toBeNull()
  })

  it('stops on a continuation loop', () => {
    expect(followPin('a', [s('a', { isLive: false, continuedAs: 'b' }), s('b', { isLive: false, continuedAs: 'a' })])).toBeNull()
  })
})

describe('pinnedSessions', () => {
  it('maps pins to live sessions once each', () => {
    const sessions = [s('a', { isLive: false, continuedAs: 'b' }), s('b'), s('c')]
    expect(pinnedSessions(['a', 'b', 'gone', 'c'], sessions).map((r) => r.id)).toEqual(['b', 'c'])
  })
})

describe('togglePin', () => {
  it('adds a missing pin and removes an existing one', () => {
    expect(togglePin(['a'], 'b')).toEqual(['a', 'b'])
    expect(togglePin(['a', 'b'], 'a')).toEqual(['b'])
  })
})

describe('gridColumns', () => {
  it('uses 1 column for one window, 2 for up to four and 3 above', () => {
    expect([0, 1, 2, 4, 5, 9].map(gridColumns)).toEqual([1, 1, 2, 2, 3, 3])
  })
})

describe('resolvePins', () => {
  it('moves a pin to the live continuation and keeps pins it cannot resolve', () => {
    const sessions = [s('a', { isLive: false, continuedAs: 'b' }), s('b')]
    expect(resolvePins(['a', 'gone', 'b'], sessions)).toEqual(['b', 'gone'])
  })
})
