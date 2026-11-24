import { describe, it, expect } from 'vitest'
import { panelSessions, followPin, pinnedSessions, togglePin, gridColumns, resolvePins, needsYou, parsePins, mrOfSession, startableRows, pinStarted, isDoneStatus, matchesQuery, groupByStatus, movePin, cellKey, parseCellLooks } from '../src/renderer/src/dashboard/commandpanel'
import type { MrRow, Session } from '../src/renderer/src/types'
import type { PickRow } from '../src/renderer/src/dashboard/orchestrator'
import type { Job } from '../src/main/orchestrator'

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

  it('keeps a pinned session whose live flag drops for a moment, so its window does not remount', () => {
    expect(pinnedSessions(['a'], [s('a', { isLive: false })]).map((r) => r.id)).toEqual(['a'])
  })
})

describe('needsYou', () => {
  it('counts only sessions waiting on a question, not finished turns', () => {
    expect([s('w', { status: 'waiting' }), s('c', { status: 'checkout' }), s('i')].filter(needsYou).map((r) => r.id)).toEqual(['w'])
  })
})

describe('pin storage', () => {
  it('reads an empty list when storage holds garbage', () => {
    expect(parsePins('{"x":1}')).toEqual([])
    expect(parsePins('nope')).toEqual([])
    expect(parsePins('["a",3,"b"]')).toEqual(['a', 'b'])
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

describe('mrOfSession', () => {
  it('finds the merge request whose review session this is, also by a short stored id', () => {
    const mrs = [{ key: '7!1', sessionId: 'abc' }, { key: '7!2', sessionId: null }] as MrRow[]
    expect(mrOfSession(s('abcdef'), mrs)?.key).toBe('7!1')
    expect(mrOfSession(s('zzz'), mrs)).toBeNull()
  })
})

const row = (kind: PickRow['kind'], key: string, isLive = false): PickRow => ({ kind, key, title: key, repo: 'r', autonomy: 'manual', isLive })
const job = (id: string, over: Partial<Job> = {}): Job => ({ id, state: 'queued', sessionId: null, ...over }) as Job

describe('startableRows', () => {
  it('drops rows with a live session or a job still running, keeps ones whose job is over', () => {
    const rows = [row('ticket', 'A-1'), row('ticket', 'A-2', true), row('ticket', 'A-3'), row('review', 'p!4'), row('ticket', 'A-5')]
    const jobs = [job('ticket:A-3', { state: 'working' }), job('review:p!4', { state: 'starting' }), job('ticket:A-5', { state: 'finished' })]
    expect(startableRows(rows, jobs).map((r) => r.key)).toEqual(['A-1', 'A-5'])
  })
})

describe('isDoneStatus', () => {
  it('matches the done statuses from settings, ignoring case and spaces', () => {
    expect(isDoneStatus('done', 'Accepted, Done, Closed')).toBe(true)
    expect(isDoneStatus('In Progress', 'Accepted, Done, Closed')).toBe(false)
    expect(isDoneStatus(null, 'Done')).toBe(false)
  })
})

describe('matchesQuery', () => {
  it('matches every word of the query against the given texts', () => {
    expect(matchesQuery('fav 4024', ['SOFRMPT-4024', 'Favorite channels'])).toBe(true)
    expect(matchesQuery('fav 9999', ['SOFRMPT-4024', 'Favorite channels'])).toBe(false)
    expect(matchesQuery('  ', ['x'])).toBe(true)
  })
})

describe('groupByStatus', () => {
  it('groups rows by status in first-seen order, missing status last as Other', () => {
    const rows = [{ k: 1, s: 'B' }, { k: 2, s: null }, { k: 3, s: 'A' }, { k: 4, s: 'B' }]
    expect(groupByStatus(rows, (r) => r.s)).toEqual([
      { status: 'B', rows: [rows[0], rows[3]] },
      { status: 'A', rows: [rows[2]] },
      { status: 'Other', rows: [rows[1]] }
    ])
  })
})

describe('pinStarted', () => {
  it('pins a started job once it has a session and forgets jobs that ended without one', () => {
    const jobs = [job('ticket:A-1', { state: 'working', sessionId: 's1' }), job('ticket:A-2'), job('ticket:A-3', { state: 'failed' })]
    expect(pinStarted(['x'], ['ticket:A-1', 'ticket:A-2', 'ticket:A-3', 'ticket:gone'], jobs)).toEqual({ pins: ['x', 's1'], awaiting: ['ticket:A-2'] })
  })

  it('does not pin a session twice', () => {
    const jobs = [job('ticket:A-1', { state: 'working', sessionId: 's1' })]
    expect(pinStarted(['s1'], ['ticket:A-1'], jobs)).toEqual({ pins: ['s1'], awaiting: [] })
  })
})

describe('movePin', () => {
  it('moves a pin onto the place of another one', () => {
    expect(movePin(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'c', 'a', 'd'])
    expect(movePin(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c'])
  })

  it('leaves the order alone for unknown or equal ids', () => {
    const pins = ['a', 'b']
    expect(movePin(pins, 'a', 'a')).toBe(pins)
    expect(movePin(pins, 'x', 'a')).toBe(pins)
  })
})

describe('cellKey', () => {
  it('uses the ticket so the look survives /clear, else the session id', () => {
    expect(cellKey(s('abc', { ticket: 'sofkrs-1' }))).toBe('SOFKRS-1')
    expect(cellKey(s('abc'))).toBe('abc')
  })
})

describe('parseCellLooks', () => {
  it('keeps only string colors and titles', () => {
    expect(parseCellLooks('{"A":{"color":"#f00","title":"x"},"B":{"color":5},"C":7}')).toEqual({ A: { color: '#f00', title: 'x' }, B: {} })
    expect(parseCellLooks('nope')).toEqual({})
  })
})
