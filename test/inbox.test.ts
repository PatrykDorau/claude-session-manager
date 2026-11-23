import { describe, it, expect } from 'vitest'
import { buildInboxRows, buildLiveRows, nextInboxId, type InboxRow } from '../src/renderer/src/dashboard/inbox'
import type { MrRow, Session } from '../src/renderer/src/types'

const session = (over: Partial<Session>): Session =>
  ({ id: 's', projectPath: 'C:/p', projectName: 'proj', ticket: null, firstPrompt: 'do it', lastActive: 0, isLive: true, status: 'waiting', name: null, ...over }) as Session

describe('buildInboxRows', () => {
  it('keeps only live sessions that wait or finished their turn', () => {
    const rows = buildInboxRows(
      [session({ id: 'a' }), session({ id: 'b', status: 'working' }), session({ id: 'c', isLive: false }), session({ id: 'd', status: 'checkout' })],
      {},
      []
    )
    expect(rows.map((r) => r.sessionId)).toEqual(['a', 'd'])
  })
  it('puts waiting before finished, oldest first', () => {
    const rows = buildInboxRows(
      [session({ id: 'c1', status: 'checkout', lastActive: 1 }), session({ id: 'w2', lastActive: 5 }), session({ id: 'w1', lastActive: 2 })],
      {},
      []
    )
    expect(rows.map((r) => r.sessionId)).toEqual(['w1', 'w2', 'c1'])
  })
  it('labels ticket, MR and plain sessions', () => {
    const mr = { key: '7!42', iid: 42, title: 'Fix focus', sessionId: 'm' } as MrRow
    const rows = buildInboxRows(
      [session({ id: 't', ticket: 'SOFKRS-1', lastActive: 1 }), session({ id: 'm', lastActive: 2 }), session({ id: 'p', name: 'scratch', lastActive: 3 })],
      { 'SOFKRS-1': 'Player crash' },
      [mr]
    )
    expect(rows.map((r) => [r.label, r.title, r.ticket, r.mrKey])).toEqual([
      ['SOFKRS-1', 'Player crash', 'SOFKRS-1', null],
      ['!42', 'Fix focus', null, '7!42'],
      ['scratch', 'do it', null, null]
    ])
  })
})

describe('buildInboxRows for an own MR address session', () => {
  const mr = { key: '7!518', iid: 518, ticket: 'SOFNJJ-2350', title: 'Own MR', sessionId: null } as MrRow
  it('resolves the MR by the address session name when the session has no ticket', () => {
    const rows = buildInboxRows([session({ id: 'a', name: 'SOFNJJ-2350-cr' })], {}, [mr])
    expect(rows[0].mrKey).toBe('7!518')
    expect(rows[0].label).toBe('!518')
  })
  it('does not match a session with another name', () => {
    expect(buildInboxRows([session({ id: 'a', name: 'scratch' })], {}, [mr])[0].mrKey).toBeNull()
  })
})

describe('buildLiveRows', () => {
  const all = [
    session({ id: 'idle', status: 'idle', lastActive: 9 }),
    session({ id: 'work', status: 'working', lastActive: 8 }),
    session({ id: 'done', status: 'checkout', lastActive: 7 }),
    session({ id: 'w-old', status: 'waiting', lastActive: 1 }),
    session({ id: 'w-new', status: 'waiting', lastActive: 6 }),
    session({ id: 'gone', status: 'idle', isLive: false, lastActive: 10 })
  ]
  it('lists every live session by what needs me, newest first within a status', () => {
    expect(buildLiveRows(all, {}, [], 'attention').map((r) => r.sessionId)).toEqual(['w-new', 'w-old', 'done', 'work', 'idle'])
  })
  it('lists every live session by last activity', () => {
    expect(buildLiveRows(all, {}, [], 'newest').map((r) => r.sessionId)).toEqual(['idle', 'work', 'done', 'w-new', 'w-old'])
  })
})

describe('nextInboxId', () => {
  const rows = ['a', 'b', 'c'].map((sessionId) => ({ sessionId }) as InboxRow)
  it('starts at the first row and moves on, wrapping around', () => {
    expect(nextInboxId(rows, null)).toBe('a')
    expect(nextInboxId(rows, 'x')).toBe('a')
    expect(nextInboxId(rows, 'a')).toBe('b')
    expect(nextInboxId(rows, 'c')).toBe('a')
    expect(nextInboxId([], 'a')).toBeNull()
  })
})
