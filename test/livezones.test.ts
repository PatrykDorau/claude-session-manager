import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  groupByTicket,
  holdZones,
  isTurnUnseen,
  markSeen,
  pickTab,
  pruneSeen,
  readSeenAt,
  trackTurnEndedAt,
  writeSeenAt,
  zoneOf,
  zoneOfGroup,
  ZONE_KEYS,
  type ZoneKey
} from '../src/renderer/src/dashboard/livezones'
import type { Session } from '../src/renderer/src/types'

const idOf = (x: { id: string }): string => x.id

const s = (id: string, over: Partial<Session> = {}): Session =>
  ({ id, isLive: true, status: 'idle', lastActive: 0, ticket: null, continuedAs: null, ...over }) as Session

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('trackTurnEndedAt', () => {
  it('drops a session that is not in checkout', () => {
    const result = trackTurnEndedAt({ a: 1 }, [s('a', { status: 'working' })])
    expect(result).toEqual({})
  })

  it('keeps the previous value', () => {
    const result = trackTurnEndedAt({ a: 1 }, [s('a', { status: 'checkout', lastActive: 9 })])
    expect(result).toEqual({ a: 1 })
  })

  it('returns the previous object when nothing changed', () => {
    const previous = { a: 1 }
    const result = trackTurnEndedAt(previous, [s('a', { status: 'checkout', lastActive: 9 }), s('b')])
    expect(result).toBe(previous)
  })

  it('uses lastActive for a new checkout session', () => {
    const result = trackTurnEndedAt({}, [s('a', { status: 'checkout', lastActive: 9 })])
    expect(result).toEqual({ a: 9 })
  })
})

describe('isTurnUnseen', () => {
  const done = s('a', { status: 'checkout', lastActive: 5 })

  it('is false when the seen time equals the end time', () => {
    expect(isTurnUnseen(done, { a: 5 }, { a: 5 })).toBe(false)
  })

  it('is true when the seen time is earlier', () => {
    expect(isTurnUnseen(done, { a: 5 }, { a: 4 })).toBe(true)
  })

  it('is true when there is no seen time', () => {
    expect(isTurnUnseen(done, { a: 5 }, {})).toBe(true)
  })

  it('is false for any status other than checkout', () => {
    expect(isTurnUnseen(s('a', { status: 'waiting' }), {}, {})).toBe(false)
    expect(isTurnUnseen(s('a', { status: 'idle' }), {}, {})).toBe(false)
  })
})

describe('markSeen and pruneSeen', () => {
  it('markSeen returns a new object', () => {
    const before = { a: 1 }
    const after = markSeen(before, 'b', 7)
    expect(after).toEqual({ a: 1, b: 7 })
    expect(before).toEqual({ a: 1 })
  })

  it('pruneSeen keeps only ids present in sessions', () => {
    expect(pruneSeen({ a: 1, b: 2 }, [s('b')])).toEqual({ b: 2 })
  })
})

describe('zoneOf', () => {
  it('puts waiting into needs-me even with isNewCr', () => {
    expect(zoneOf(s('a', { status: 'waiting' }), false, true)).toBe('needs-me')
  })

  it('puts working into working even with isNewCr', () => {
    expect(zoneOf(s('a', { status: 'working' }), false, true)).toBe('working')
  })

  it('puts a seen checkout into seen', () => {
    expect(zoneOf(s('a', { status: 'checkout' }), false, false)).toBe('seen')
  })

  it('puts an unseen checkout into needs-me even with isNewCr', () => {
    expect(zoneOf(s('a', { status: 'checkout' }), true, true)).toBe('needs-me')
  })

  it('puts idle with isNewCr into seen', () => {
    expect(zoneOf(s('a', { status: 'idle' }), false, true)).toBe('seen')
  })

  it('puts idle without isNewCr into idle', () => {
    expect(zoneOf(s('a', { status: 'idle' }), false, false)).toBe('idle')
  })
})

describe('groupByTicket', () => {
  it('shares one id between tickets that differ in case', () => {
    const groups = groupByTicket([s('a', { ticket: 'krs-1' }), s('b', { ticket: 'KRS-1' })])
    expect(groups).toHaveLength(1)
    expect(groups[0].id).toBe('ticket:KRS-1')
    expect(groups[0].sessions.map(idOf)).toEqual(['a', 'b'])
  })

  it('makes one group per session without a ticket, with the session id', () => {
    const groups = groupByTicket([s('a'), s('b')])
    expect(groups.map(idOf)).toEqual(['a', 'b'])
    expect(groups[0].ticket).toBeNull()
  })

  it('keeps first-appearance order', () => {
    const groups = groupByTicket([
      s('a', { ticket: 'KRS-2' }),
      s('b', { ticket: 'KRS-1' }),
      s('c', { ticket: 'KRS-2' })
    ])
    expect(groups.map(idOf)).toEqual(['ticket:KRS-2', 'ticket:KRS-1'])
    expect(groups[0].sessions.map(idOf)).toEqual(['a', 'c'])
  })
})

describe('zoneOfGroup', () => {
  it('picks the most urgent zone', () => {
    expect(zoneOfGroup(['idle', 'working', 'seen'])).toBe('working')
  })

  it('gives idle for an empty list', () => {
    expect(zoneOfGroup([])).toBe('idle')
  })

  it('exposes the zone order', () => {
    expect(ZONE_KEYS).toEqual(['needs-me', 'working', 'seen', 'idle'])
  })
})

describe('holdZones', () => {
  it('keeps needs-me for the held id when next says seen', () => {
    expect(holdZones({ a: 'needs-me' }, { a: 'seen' }, 'a')).toEqual({ a: 'needs-me' })
  })

  it('keeps the previous zone for the held id even when next says needs-me', () => {
    expect(holdZones({ a: 'seen' }, { a: 'needs-me' }, 'a')).toEqual({ a: 'seen' })
  })

  it('lets other ids follow next', () => {
    const result = holdZones({ a: 'needs-me', b: 'working' }, { a: 'seen', b: 'idle' }, 'a')
    expect(result).toEqual({ a: 'needs-me', b: 'idle' })
  })

  it('lets a held id without a previous zone follow next', () => {
    expect(holdZones({}, { a: 'seen' }, 'a')).toEqual({ a: 'seen' })
  })

  it('does not re-add a held id that is missing from next', () => {
    const result = holdZones({ a: 'needs-me', b: 'idle' }, { b: 'idle' }, 'a')
    expect(result).toEqual({ b: 'idle' })
    expect('a' in result).toBe(false)
  })
})

describe('pickTab', () => {
  const group = groupByTicket([
    s('a', { ticket: 'K-1' }),
    s('b', { ticket: 'K-1' }),
    s('c', { ticket: 'K-1' })
  ])[0]
  const zones: Record<string, ZoneKey> = { a: 'idle', b: 'working', c: 'working' }
  const zoneOfSession = (x: Session): ZoneKey => zones[x.id]

  it('returns the stored id when present', () => {
    expect(pickTab(group, 'a', zoneOfSession).id).toBe('a')
  })

  it('falls back to the most urgent session when the stored id is missing or gone', () => {
    expect(pickTab(group, undefined, zoneOfSession).id).toBe('b')
    expect(pickTab(group, 'gone', zoneOfSession).id).toBe('b')
  })
})

describe('readSeenAt and writeSeenAt', () => {
  it('round-trips through localStorage', () => {
    const store: Record<string, string> = {}
    const getItem = (k: string): string | null => store[k] ?? null
    const setItem = (k: string, v: string): void => {
      store[k] = v
    }
    vi.stubGlobal('localStorage', { getItem, setItem })
    writeSeenAt({ a: 5 })
    expect(readSeenAt()).toEqual({ a: 5 })
  })

  it('reads garbage as empty and drops non-number values', () => {
    const store: Record<string, string> = { 'orch.turnSeen': 'not json' }
    const getItem = (k: string): string | null => store[k] ?? null
    vi.stubGlobal('localStorage', { getItem })
    expect(readSeenAt()).toEqual({})
    store['orch.turnSeen'] = '{"a":1,"b":"x"}'
    expect(readSeenAt()).toEqual({ a: 1 })
  })
})
