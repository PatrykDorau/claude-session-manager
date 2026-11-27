import { describe, it, expect, vi, afterEach } from 'vitest'
import { layoutKey, columnsKey, parseLayout, followLayout, readColumns, writeColumns, DEFAULT_TILE, panelSessions, lastClosedSession, followPin, resolveSession, pinnedSessions, togglePin, gridColumns, resolvePins, needsYou, parsePins, mrOfSession, startableRows, pinStarted, isDoneStatus, matchesQuery, groupByStatus, movePin, cellKey, parseCellLooks, crCandidates, sectionOf, isNewActivity, newNotesCount, readSeen, baselineSeen, markSeen, groupSections, trackWorkingSince, orderBySince, trackWaitingSince, pruneAcknowledged, formatWait, panelShortcut, assignIdentities, identityOf, IDENTITY_COLORS, IDENTITY_ICONS, IDENTITY_LETTERS, readIdentities, stageOf, matchSessions, isRecentSession } from '../src/renderer/src/dashboard/commandpanel'
import type { MrRow, Session } from '../src/renderer/src/types'
import type { SeenMr } from '../src/renderer/src/dashboard/commandpanel'
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

describe('lastClosedSession', () => {
  it('picks the newest closed session of the ticket and skips live ones and other tickets', () => {
    const sessions = [
      s('old', { isLive: false, ticket: 'sofrmpt-4033', lastActive: 1 }),
      s('new', { isLive: false, ticket: 'SOFRMPT-4033', lastActive: 5 }),
      s('live', { ticket: 'SOFRMPT-4033', lastActive: 9 }),
      s('other', { isLive: false, ticket: 'SOFRMPT-1', lastActive: 9 })
    ]
    expect(lastClosedSession('SOFRMPT-4033', sessions)?.id).toBe('new')
    expect(lastClosedSession('SOFRMPT-2', sessions)).toBeNull()
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

  it('resolveSession follows a cleared session to the end of its chain, live or not', () => {
    const sessions = [
      s('a', { continuedAs: 'b' }),
      s('b', { continuedAs: 'c' }),
      s('c', { isLive: false })
    ]
    expect(resolveSession('a', sessions)?.id).toBe('c')
    expect(resolveSession('b', sessions)?.id).toBe('c')
    expect(resolveSession('x', sessions)).toBeNull()
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

const mine = (iid: number, over: Partial<MrRow> = {}): MrRow =>
  ({
    key: `7!${iid}`,
    iid,
    ticket: `T-${iid}`,
    author: 'Me',
    state: 'opened',
    openThreads: 2,
    waitingThreads: 1,
    updatedAt: '2026-01-01',
    ...over
  }) as MrRow

describe('crCandidates', () => {
  it('lists only my open merge requests with unresolved threads, most waiting first then newest', () => {
    const mrs = [
      mine(1, { waitingThreads: 1, updatedAt: '2026-01-01' }),
      mine(2, { author: 'Bob' }),
      mine(3, { state: 'merged' }),
      mine(4, { openThreads: 0 }),
      mine(5, { waitingThreads: 3 }),
      mine(6, { waitingThreads: 1, updatedAt: '2026-02-01' })
    ]
    expect(crCandidates(mrs, 'Me', []).map((c) => c.mr.iid)).toEqual([5, 6, 1])
  })

  it('ticks rows that wait for me or are unknown, and leaves rows where my reply is last', () => {
    const [waiting, mineLast, unknown] = crCandidates(
      [mine(1), mine(2, { waitingThreads: 0 }), mine(3, { waitingThreads: null })],
      'Me',
      []
    )
    expect([waiting.isChecked, waiting.isMineLast]).toEqual([true, false])
    expect([mineLast.isChecked, mineLast.isMineLast]).toEqual([false, true])
    expect([unknown.isChecked, unknown.isMineLast]).toEqual([true, false])
  })

  it('marks a live address session as running and unchecked, but not a live work session', () => {
    const sessions = [
      s('a', { name: 'T-1-cr', ticket: 'T-1' }),
      s('w', { name: 'T-2', ticket: 'T-2' })
    ]
    const [running, working] = crCandidates(
      [mine(1, { waitingThreads: 5 }), mine(2)],
      'Me',
      sessions
    )
    expect([running.isRunning, running.isChecked]).toEqual([true, false])
    expect(working.isRunning).toBe(false)
  })

  it('returns nothing without my name', () => {
    expect(crCandidates([mine(1)], null, [])).toEqual([])
  })
})

describe('sections', () => {
  const mr = (over: Partial<MrRow> = {}): MrRow =>
    mine(1, { sha: 'a', notes: 5, othersNotes: 3, ...over })
  const seenOf = (othersNotes: number | null, sha = 'a'): Record<string, SeenMr> => ({
    'mr-key': { othersNotes, sha }
  })
  const keyed = (over: Partial<MrRow> = {}): MrRow => mr({ key: 'mr-key', ...over })

  it('sectionOf puts working first even with new activity, waiting as needs-input and checkout as turn-done', () => {
    const fresh = keyed({ othersNotes: 9 })
    const seen = seenOf(3)
    expect(sectionOf(s('a', { status: 'working' }), fresh, seen, 'Me')).toBe('working')
    expect(sectionOf(s('a', { status: 'waiting' }), fresh, seen, 'Me')).toBe('needs-input')
    expect(sectionOf(s('a', { status: 'checkout' }), null, seen, 'Me')).toBe('turn-done')
    expect(sectionOf(s('a', { status: 'idle' }), fresh, seen, 'Me')).toBe('new-cr')
    expect(sectionOf(s('a', { status: 'idle' }), keyed(), seen, 'Me')).toBe('idle')
    expect(sectionOf(s('a', { status: 'idle' }), null, seen, 'Me')).toBe('idle')
  })

  it('isNewActivity flags more notes from others, not equal ones', () => {
    expect(isNewActivity(keyed({ othersNotes: 4 }), seenOf(3), 'Me')).toBe(true)
    expect(isNewActivity(keyed({ othersNotes: 3 }), seenOf(3), 'Me')).toBe(false)
  })

  it('isNewActivity flags a changed sha only on MRs of other authors', () => {
    expect(isNewActivity(keyed({ author: 'Bob', sha: 'b' }), seenOf(3), 'Me')).toBe(true)
    expect(isNewActivity(keyed({ author: 'Me', sha: 'b' }), seenOf(3), 'Me')).toBe(false)
  })

  it('isNewActivity is false for an MR that was never seen', () => {
    expect(isNewActivity(keyed({ othersNotes: 99 }), {}, 'Me')).toBe(false)
  })

  it('isNewActivity treats unknown othersNotes as no new notes, never falling back to notes', () => {
    expect(isNewActivity(keyed({ othersNotes: null, notes: 60 }), seenOf(5), 'Me')).toBe(false)
    expect(isNewActivity(keyed({ othersNotes: 9 }), seenOf(null), 'Me')).toBe(false)
    expect(newNotesCount(keyed({ othersNotes: null, notes: 60 }), seenOf(5))).toBe(0)
    expect(newNotesCount(keyed({ othersNotes: 9 }), seenOf(null))).toBe(0)
  })

  it('isNewActivity keeps the sha rule when othersNotes is unknown', () => {
    expect(
      isNewActivity(keyed({ othersNotes: null, author: 'Bob', sha: 'b' }), seenOf(null), 'Me')
    ).toBe(true)
  })

  it('newNotesCount counts notes from others since the seen value', () => {
    expect(newNotesCount(keyed({ othersNotes: 7 }), seenOf(3))).toBe(4)
    expect(newNotesCount(keyed({ othersNotes: 7 }), {})).toBe(0)
  })

  it('baselineSeen records unseen MRs, keeps existing entries, and starts with nothing new', () => {
    const mrs = [keyed({ othersNotes: 7 }), keyed({ key: 'other', othersNotes: null, notes: 4 })]
    const seen = baselineSeen(mrs, {})
    expect(mrs.some((m) => isNewActivity(m, seen, 'Me'))).toBe(false)
    expect(seen.other).toEqual({ othersNotes: null, sha: 'a' })
    expect(baselineSeen(mrs, seenOf(1))['mr-key']).toEqual({ othersNotes: 1, sha: 'a' })
  })

  it('baselineSeen fills an unknown seen value once it arrives, then counts growth as new', () => {
    const unknown = seenOf(null, 'old')
    const filled = baselineSeen([keyed({ othersNotes: 4 })], unknown)
    expect(filled['mr-key']).toEqual({ othersNotes: 4, sha: 'old' })
    expect(isNewActivity(keyed({ othersNotes: 4, sha: 'old' }), filled, 'Me')).toBe(false)
    expect(isNewActivity(keyed({ othersNotes: 5, sha: 'old' }), filled, 'Me')).toBe(true)
    expect(baselineSeen([keyed({ othersNotes: 5 })], filled)).toBe(filled)
    expect(baselineSeen([keyed({ othersNotes: null })], unknown)).toBe(unknown)
  })

  it('readSeen accepts an unknown othersNotes value', () => {
    const getItem = (): string =>
      JSON.stringify({ a: { othersNotes: null, sha: 'x' }, b: { othersNotes: 'no', sha: 'y' } })
    vi.stubGlobal('localStorage', { getItem })
    expect(readSeen()).toEqual({ a: { othersNotes: null, sha: 'x' } })
    vi.unstubAllGlobals()
  })

  it('markSeen clears new activity', () => {
    const fresh = keyed({ othersNotes: 9, sha: 'z', author: 'Bob' })
    expect(isNewActivity(fresh, seenOf(3), 'Me')).toBe(true)
    expect(isNewActivity(fresh, markSeen(fresh, seenOf(3)), 'Me')).toBe(false)
  })

  it('groupSections returns the five keys in order and places each session once', () => {
    const sessions = [
      s('i1'),
      s('w1', { status: 'working' }),
      s('q1', { status: 'waiting' }),
      s('t1', { status: 'checkout' }),
      s('n1'),
      s('i2')
    ]
    const mrOf = (x: Session): MrRow | null => (x.id === 'n1' ? keyed({ othersNotes: 9 }) : null)
    const groups = groupSections(sessions, mrOf, seenOf(3), 'Me')
    expect(groups.map((g) => g.key)).toEqual(['working', 'needs-input', 'turn-done', 'new-cr', 'idle'])
    expect(groups.map((g) => g.sessions.map((x) => x.id))).toEqual([
      ['w1'],
      ['q1'],
      ['t1'],
      ['n1'],
      ['i1', 'i2']
    ])
  })

  it('trackWorkingSince keeps the start while working and resets after leaving', () => {
    const working = [s('a', { status: 'working' }), s('b')]
    const first = trackWorkingSince({}, working, 100)
    expect(first).toEqual({ a: 100 })
    expect(trackWorkingSince(first, working, 200)).toEqual({ a: 100 })
    const left = trackWorkingSince(first, [s('a')], 300)
    expect(left).toEqual({})
    expect(trackWorkingSince(left, working, 400)).toEqual({ a: 400 })
  })

  it('orderBySince keeps the oldest entry first whatever lastActive says, unknown ones last by id', () => {
    const sessions = [s('c', { lastActive: 900 }), s('b', { lastActive: 50 }), s('a', { lastActive: 500 }), s('d', { lastActive: 999 })]
    const since = { a: 300, b: 100, c: 200 }
    expect(orderBySince(sessions, since).map((x) => x.id)).toEqual(['b', 'c', 'a', 'd'])
    const touched = sessions.map((x) => ({ ...x, lastActive: x.lastActive + 10_000 }))
    expect(orderBySince(touched, since).map((x) => x.id)).toEqual(['b', 'c', 'a', 'd'])
  })
})

describe('waiting attention', () => {
  it('trackWaitingSince keeps the start while waiting and resets after leaving', () => {
    const waiting = [s('a', { status: 'waiting' }), s('b', { status: 'working' })]
    const first = trackWaitingSince({}, waiting, 100)
    expect(first).toEqual({ a: 100 })
    expect(trackWaitingSince(first, waiting, 200)).toEqual({ a: 100 })
    const left = trackWaitingSince(first, [s('a', { status: 'working' })], 300)
    expect(left).toEqual({})
    expect(trackWaitingSince(left, waiting, 400)).toEqual({ a: 400 })
  })

  it('pruneAcknowledged keeps only ids that are still waiting', () => {
    const pruned = pruneAcknowledged(new Set(['a', 'b']), { b: 5 })
    expect([...pruned]).toEqual(['b'])
  })

  it('formatWait formats minutes and hours', () => {
    expect(formatWait(30_000)).toBe('<1 min')
    expect(formatWait(5 * 60_000)).toBe('5 min')
    expect(formatWait(75 * 60_000)).toBe('1 h 15 min')
  })
})

describe('layout', () => {
  const tile = { x: 0, y: 0, w: 1, h: 4 }
  const other = { x: 1, y: 2, w: 2, h: 3 }

  afterEach(() => vi.unstubAllGlobals())

  it('builds storage keys per view', () => {
    expect(layoutKey('pinned')).toBe('orch.layout.pinned')
    expect(layoutKey('live')).toBe('orch.layout.live')
    expect(layoutKey('live-recent')).toBe('orch.layout.live-recent')
    expect(columnsKey('pinned')).toBe('orch.columns.pinned')
    expect(columnsKey('live')).toBe('orch.columns.live')
    expect(DEFAULT_TILE).toEqual({ w: 1, h: 6 })
  })

  it('parseLayout keeps only entries with four finite numbers', () => {
    expect(parseLayout('{"a":{"x":0,"y":0,"w":1,"h":4},"b":{"x":"1"}}')).toEqual({ a: tile })
    expect(parseLayout('nope')).toEqual({})
  })

  it('followLayout moves an entry to the live continuation', () => {
    const sessions = [s('old', { isLive: false, continuedAs: 'new' }), s('new')]
    expect(followLayout({ old: tile }, sessions)).toEqual({ new: tile })
  })

  it('followLayout keeps an entry whose session is closed but still present', () => {
    expect(followLayout({ a: tile }, [s('a', { isLive: false })])).toEqual({ a: tile })
  })

  it('followLayout drops an entry that matches no session', () => {
    expect(followLayout({ gone: tile }, [s('a')])).toEqual({})
  })

  it('followLayout keeps ticket keys and drops unknown session ids', () => {
    expect(followLayout({ 'ticket:KRS-1': tile, gone: tile }, [])).toEqual({ 'ticket:KRS-1': tile })
  })

  it('followLayout keeps the entry already under the final id', () => {
    const sessions = [s('old', { isLive: false, continuedAs: 'new' }), s('new')]
    expect(followLayout({ old: tile, new: other }, sessions)).toEqual({ new: other })
    expect(followLayout({ new: other, old: tile }, sessions)).toEqual({ new: other })
  })

  it('readColumns defaults to 3 for empty storage or an out-of-range value', () => {
    const store: Record<string, string> = {}
    const getItem = (k: string): string | null => store[k] ?? null
    const setItem = (k: string, v: string): void => {
      store[k] = v
    }
    vi.stubGlobal('localStorage', { getItem, setItem })
    expect(readColumns('pinned')).toBe(3)
    store['orch.columns.pinned'] = '7'
    expect(readColumns('pinned')).toBe(3)
    writeColumns('pinned', 2)
    expect(store['orch.columns.pinned']).toBe('2')
    expect(readColumns('pinned')).toBe(2)
  })
})

describe('identity', () => {
  it('gives three new live sessions three different colours and icons', () => {
    const result = assignIdentities({}, [s('a'), s('b'), s('c')])
    const entries = Object.values(result)
    expect(entries).toHaveLength(3)
    expect(new Set(entries.map((e) => e.color)).size).toBe(3)
    expect(new Set(entries.map((e) => e.icon)).size).toBe(3)
  })

  it('has 8 colours and 12 icons', () => {
    expect(IDENTITY_COLORS).toHaveLength(8)
    expect(IDENTITY_ICONS).toHaveLength(12)
  })

  it('never changes an existing entry when sessions arrive or leave', () => {
    const first = assignIdentities({}, [s('a'), s('b')])
    const second = assignIdentities(first, [s('b'), s('c')])
    expect(second.b).toEqual(first.b)
    const third = assignIdentities(second, [s('a'), s('b'), s('c')])
    expect(third.b).toEqual(first.b)
    expect(third.c).toEqual(second.c)
  })

  it('gives the least-used colour when every colour is taken', () => {
    const map = Object.fromEntries(
      [...IDENTITY_COLORS, IDENTITY_COLORS[0]].map((color, i) => [
        `s${i}`,
        { icon: IDENTITY_ICONS[i % IDENTITY_ICONS.length], color, letter: IDENTITY_LETTERS[i] }
      ])
    )
    const sessions = [...Object.keys(map).map((id) => s(id)), s('new')]
    expect(assignIdentities(map, sessions).new.color).toBe(IDENTITY_COLORS[1])
  })

  it('gives three new live sessions three different letters', () => {
    const letters = Object.values(assignIdentities({}, [s('a'), s('b'), s('c')])).map((e) => e.letter)
    expect(new Set(letters).size).toBe(3)
    expect(letters.every((l) => IDENTITY_LETTERS.includes(l))).toBe(true)
    expect(IDENTITY_LETTERS).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'])
  })

  it('gives an entry without a letter a letter and keeps its colour and icon', () => {
    const old = { icon: 'heart', color: '#3dd68c' } as unknown as Parameters<typeof assignIdentities>[0][string]
    const result = assignIdentities({ a: old }, [s('a'), s('b')])
    expect(result.a.icon).toBe('heart')
    expect(result.a.color).toBe('#3dd68c')
    expect(IDENTITY_LETTERS).toContain(result.a.letter)
    expect(result.b.letter).not.toBe(result.a.letter)
  })

  it('readIdentities keeps an entry that has no letter', () => {
    const getItem = (): string => JSON.stringify({ a: { icon: 'heart', color: '#3dd68c' } })
    vi.stubGlobal('localStorage', { getItem })
    expect(readIdentities()).toEqual({ a: { icon: 'heart', color: '#3dd68c', letter: '' } })
    vi.unstubAllGlobals()
  })

  it('identityOf passes the letter through', () => {
    const auto = { icon: IDENTITY_ICONS[0], color: IDENTITY_COLORS[0], letter: 'C' }
    expect(identityOf(auto, { color: '#123456' }).letter).toBe('C')
  })

  it('moves an entry along continuedAs', () => {
    const entry = { icon: IDENTITY_ICONS[2], color: IDENTITY_COLORS[3], letter: 'A' }
    const sessions = [s('old', { isLive: false, continuedAs: 'new' }), s('new')]
    expect(assignIdentities({ old: entry }, sessions)).toEqual({ new: entry })
  })

  it('keeps the entry of a closed session that is still present', () => {
    const entry = { icon: IDENTITY_ICONS[2], color: IDENTITY_COLORS[3], letter: 'A' }
    expect(assignIdentities({ a: entry }, [s('a', { isLive: false })])).toEqual({ a: entry })
  })

  it('drops an entry that matches no session', () => {
    const entry = { icon: IDENTITY_ICONS[2], color: IDENTITY_COLORS[3], letter: 'A' }
    expect(assignIdentities({ gone: entry }, [s('a')])).not.toHaveProperty('gone')
  })

  it('ignores entries of closed sessions when choosing a free pair', () => {
    const entry = { icon: IDENTITY_ICONS[0], color: IDENTITY_COLORS[0], letter: 'A' }
    const result = assignIdentities({ a: entry }, [s('a', { isLive: false }), s('b')])
    expect(result.b).toEqual(entry)
  })

  it('keeps letters unique among live sessions after a closed session is resumed', () => {
    const closed = { icon: IDENTITY_ICONS[0], color: IDENTITY_COLORS[0], letter: 'A' }
    const live = { icon: IDENTITY_ICONS[1], color: IDENTITY_COLORS[1], letter: 'A' }
    const sessions = [s('old', { isLive: false, continuedAs: 'resumed' }), s('x'), s('resumed')]
    const result = assignIdentities({ old: closed, x: live }, sessions)
    const letters = [result.x.letter, result.resumed.letter]
    expect(new Set(letters).size).toBe(2)
    expect(result.resumed.icon).toBe(closed.icon)
    expect(result.resumed.color).toBe(closed.color)
  })

  it('identityOf prefers the manual colour and icon', () => {
    const auto = { icon: IDENTITY_ICONS[0], color: IDENTITY_COLORS[0], letter: 'A' }
    expect(identityOf(auto, { color: '#123456', icon: IDENTITY_ICONS[5] })).toEqual({
      icon: IDENTITY_ICONS[5],
      color: '#123456',
      letter: 'A'
    })
    expect(identityOf(auto, { title: 'x' })).toEqual(auto)
  })
})

describe('stageOf', () => {
  it('labels each status and treats closed, not live and null as Closed', () => {
    expect(stageOf(s('a', { status: 'working' })).label).toBe('Working')
    expect(stageOf(s('a', { status: 'waiting' })).label).toBe('Needs input')
    expect(stageOf(s('a', { status: 'checkout' })).label).toBe('Check output')
    expect(stageOf(s('a', { status: 'idle' })).label).toBe('Idle')
    expect(stageOf(s('a', { status: 'closed' })).label).toBe('Closed')
    expect(stageOf(s('a', { isLive: false, status: 'idle' })).label).toBe('Closed')
    expect(stageOf(null).label).toBe('Closed')
  })

  it('uses five distinct icons', () => {
    const stages = [
      s('a', { status: 'working' }),
      s('a', { status: 'waiting' }),
      s('a', { status: 'checkout' }),
      s('a', { status: 'idle' }),
      null
    ].map(stageOf)
    expect(new Set(stages.map((x) => x.icon)).size).toBe(5)
  })
})

describe('matchSessions', () => {
  const sessions = [
    s('1', { ticket: 'SOFKRS-1234' }),
    s('2', { ticket: 'SOFKAN-1' }),
    s('3', { ticket: 'SOFKAN-2' })
  ]
  const letters: Record<string, string> = { '1': 'A', '2': 'B', '3': 'C' }

  it('finds a session by a lowercase fragment of its ticket', () => {
    const textOf = (x: Session): string[] => [x.ticket ?? '']
    expect(matchSessions('sofkrs-12', sessions, textOf).map((x) => x.id)).toEqual(['1'])
  })

  it('puts an exact letter match first', () => {
    const textOf = (x: Session): string[] => [letters[x.id], x.ticket ?? '']
    expect(matchSessions('b', sessions, textOf).map((x) => x.id)).toEqual(['2'])
    const wide = [s('x', { ticket: 'B-1' }), s('y', { ticket: 'Z' })]
    const wideText = (x: Session): string[] => (x.id === 'y' ? ['B'] : [x.ticket ?? ''])
    expect(matchSessions('b', wide, wideText).map((x) => x.id)).toEqual(['y', 'x'])
  })

  it('returns nothing for a blank query', () => {
    expect(matchSessions('  ', sessions, () => ['x'])).toEqual([])
  })
})

describe('panelShortcut', () => {
  const key = (
    value: string,
    mods: Partial<{ ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }> = {}
  ): { key: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean } => ({
    key: value,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ...mods
  })

  it('maps Ctrl+Shift+E to focus, in either case', () => {
    expect(panelShortcut(key('E', { ctrlKey: true, shiftKey: true }))).toBe('focus')
    expect(panelShortcut(key('e', { ctrlKey: true, shiftKey: true }))).toBe('focus')
  })

  it('maps Ctrl+Shift+F to full-screen', () => {
    expect(panelShortcut(key('F', { ctrlKey: true, shiftKey: true }))).toBe('full-screen')
  })

  it('never catches Escape, whatever the modifiers', () => {
    expect(panelShortcut(key('Escape'))).toBeNull()
    expect(panelShortcut(key('Escape', { ctrlKey: true, shiftKey: true }))).toBeNull()
    expect(
      panelShortcut(key('Escape', { ctrlKey: true, shiftKey: true, altKey: true, metaKey: true }))
    ).toBeNull()
  })

  it('ignores Ctrl+E without Shift', () => {
    expect(panelShortcut(key('e', { ctrlKey: true }))).toBeNull()
  })

  it('ignores Ctrl+Shift+Alt+E', () => {
    expect(panelShortcut(key('E', { ctrlKey: true, shiftKey: true, altKey: true }))).toBeNull()
  })

  it('maps Ctrl+F to search, in either case', () => {
    expect(panelShortcut(key('f', { ctrlKey: true }))).toBe('search')
    expect(panelShortcut(key('F', { ctrlKey: true }))).toBe('search')
  })

  it('does not map Ctrl+F with Shift, Alt or Meta to search', () => {
    expect(panelShortcut(key('f', { ctrlKey: true, shiftKey: true }))).not.toBe('search')
    expect(panelShortcut(key('f', { ctrlKey: true, altKey: true }))).toBeNull()
    expect(panelShortcut(key('f', { ctrlKey: true, metaKey: true }))).toBeNull()
    expect(panelShortcut(key('f'))).toBeNull()
  })
})

describe('isRecentSession', () => {
  const DAY_MS = 24 * 60 * 60 * 1000
  const now = 10 * DAY_MS

  it('keeps a session active within the last 24 hours', () => {
    expect(isRecentSession(s('a', { lastActive: now - 60_000 }), now)).toBe(true)
  })

  it('drops an idle session older than 24 hours', () => {
    expect(isRecentSession(s('a', { lastActive: now - DAY_MS - 1 }), now)).toBe(false)
  })

  it('keeps an older session that is working, waiting or in checkout', () => {
    expect(isRecentSession(s('a', { status: 'waiting', lastActive: 0 }), now)).toBe(true)
    expect(isRecentSession(s('a', { status: 'working', lastActive: 0 }), now)).toBe(true)
    expect(isRecentSession(s('a', { status: 'checkout', lastActive: 0 }), now)).toBe(true)
  })

  it('keeps a session active exactly 24 hours ago', () => {
    expect(isRecentSession(s('a', { lastActive: now - DAY_MS }), now)).toBe(true)
  })
})
