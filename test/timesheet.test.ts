import { describe, it, expect } from 'vitest'
import {
  CAP_MS,
  dayBounds,
  isAttentionEntry,
  askToolIdsOf,
  transcriptEvents,
  attribute,
  roundHours,
  buildDay,
  isDayCacheFresh,
  slimEntry,
  type AttentionEvent
} from '../src/main/timesheet'

const MIN = 60_000
const NONE = new Set<string>()

const addNumbers = (a: number, b: number): number => a + b

const ticketOf = (row: { ticket: string | null }): string | null => row.ticket

const addHours = (total: number, row: { hours: number }): number => total + row.hours

const toShare = (_: unknown, i: number): { ticket: string; share: number } => ({
  ticket: `T${i}`,
  share: 0.1
})

const userEntry = (
  content: unknown,
  extra: Record<string, unknown> = {}
): Record<string, unknown> => ({
  type: 'user',
  message: { content },
  ...extra
})

describe('dayBounds', () => {
  it('spans local midnight to next local midnight', () => {
    const { start, end } = dayBounds('2026-11-24')
    expect(start).toBe(new Date(2026, 10, 24).getTime())
    expect(end).toBe(new Date(2026, 10, 25).getTime())
  })
})

describe('isAttentionEntry', () => {
  it('accepts plain user text', () => {
    expect(isAttentionEntry(userEntry('hi'), NONE)).toBe(true)
  })

  it('accepts user text blocks', () => {
    expect(isAttentionEntry(userEntry([{ type: 'text', text: 'hi' }]), NONE)).toBe(true)
  })

  it('rejects meta, compact summary and sidechain entries', () => {
    expect(isAttentionEntry(userEntry('hi', { isMeta: true }), NONE)).toBe(false)
    expect(isAttentionEntry(userEntry('hi', { isCompactSummary: true }), NONE)).toBe(false)
    expect(isAttentionEntry(userEntry('hi', { isSidechain: true }), NONE)).toBe(false)
  })

  it('accepts only AskUserQuestion tool results', () => {
    const result = (id: string): Record<string, unknown> =>
      userEntry([{ type: 'tool_result', tool_use_id: id }])
    expect(isAttentionEntry(result('ask1'), new Set(['ask1']))).toBe(true)
    expect(isAttentionEntry(result('other'), new Set(['ask1']))).toBe(false)
  })

  it('rejects command and caveat text', () => {
    expect(isAttentionEntry(userEntry('<command-name>/x</command-name>'), NONE)).toBe(false)
    expect(isAttentionEntry(userEntry('<local-command-stdout>x'), NONE)).toBe(false)
    expect(isAttentionEntry(userEntry('Caveat: ignore'), NONE)).toBe(false)
    expect(isAttentionEntry(userEntry([{ type: 'text', text: '<command-name>/x' }]), NONE)).toBe(
      false
    )
  })

  it('rejects interrupts, reminders, notifications and empty text', () => {
    expect(isAttentionEntry(userEntry('[Request interrupted by user]'), NONE)).toBe(false)
    expect(isAttentionEntry(userEntry('<system-reminder>x</system-reminder>'), NONE)).toBe(false)
    expect(isAttentionEntry(userEntry('<task-notification>x'), NONE)).toBe(false)
    expect(isAttentionEntry(userEntry('   '), NONE)).toBe(false)
    expect(isAttentionEntry(userEntry([{ type: 'text', text: '' }]), NONE)).toBe(false)
  })

  it('rejects assistant entries', () => {
    expect(isAttentionEntry({ type: 'assistant', message: { content: 'hi' } }, NONE)).toBe(false)
  })
})

describe('askToolIdsOf', () => {
  it('collects ids of AskUserQuestion tool_use blocks', () => {
    const entries = [
      {
        type: 'assistant',
        message: { content: [{ type: 'tool_use', id: 'a1', name: 'AskUserQuestion' }] }
      },
      { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'b1', name: 'Bash' }] } }
    ]
    expect([...askToolIdsOf(entries)]).toEqual(['a1'])
  })
})

describe('transcriptEvents', () => {
  it('keeps attention entries inside bounds with ticket and source', () => {
    const bounds = {
      start: Date.parse('2026-11-24T00:00:00Z'),
      end: Date.parse('2026-11-25T00:00:00Z')
    }
    const entries = [
      userEntry('in', { timestamp: '2026-11-24T10:00:00Z', gitBranch: 'feat/SOFKRS-1234-x' }),
      userEntry('before', { timestamp: '2026-11-23T10:00:00Z' }),
      userEntry('after', { timestamp: '2026-11-25T10:00:00Z' }),
      { type: 'assistant', timestamp: '2026-11-24T11:00:00Z', message: { content: 'x' } }
    ]
    expect(transcriptEvents(entries, 'C:/Users/x', bounds)).toEqual([
      { at: Date.parse('2026-11-24T10:00:00Z'), ticket: 'SOFKRS-1234', source: 'transcript' }
    ])
  })
})

const ev = (at: number, ticket: string | null): AttentionEvent => ({
  at,
  ticket,
  source: 'cockpit'
})

describe('attribute', () => {
  const bounds = { start: 0, end: 24 * 60 * MIN }

  it('caps intervals and credits the last event with the cap', () => {
    const { minutes } = attribute(
      [ev(0, 'A'), ev(5 * MIN, 'A'), ev(10 * MIN, 'B'), ev(40 * MIN, 'B')],
      bounds,
      CAP_MS
    )
    expect(minutes.get('A')).toBe(10)
    expect(minutes.get('B')).toBe(30)
  })

  it('clips at bounds end and ignores events before start', () => {
    const small = { start: 10 * MIN, end: 20 * MIN }
    const { minutes } = attribute([ev(0, 'X'), ev(18 * MIN, 'A')], small, CAP_MS)
    expect(minutes.has('X')).toBe(false)
    expect(minutes.get('A')).toBe(2)
  })

  it('skips zero-length intervals from same-timestamp events', () => {
    const { minutes, strip } = attribute([ev(5 * MIN, 'A'), ev(5 * MIN, 'B')], bounds, CAP_MS)
    expect(minutes.has('A')).toBe(false)
    expect(minutes.get('B')).toBe(15)
    expect(strip).toEqual([{ ticket: 'B', from: 5 * MIN, to: 20 * MIN }])
  })

  it('sorts unsorted input', () => {
    const { minutes } = attribute([ev(10 * MIN, 'B'), ev(0, 'A'), ev(5 * MIN, 'A')], bounds, CAP_MS)
    expect(minutes.get('A')).toBe(10)
    expect(minutes.get('B')).toBe(15)
  })

  it('returns empty result for no events', () => {
    const { minutes, strip } = attribute([], bounds, CAP_MS)
    expect(minutes.size).toBe(0)
    expect(strip).toEqual([])
  })
})

describe('roundHours', () => {
  const sum = (m: Map<string | null, number>): number => [...m.values()].reduce(addNumbers, 0)

  it('rounds 0.5/0.3/0.2 of 8h', () => {
    const r = roundHours(
      [
        { ticket: 'A', share: 0.5 },
        { ticket: 'B', share: 0.3 },
        { ticket: 'C', share: 0.2 }
      ],
      8,
      0.25
    )
    expect([r.get('A'), r.get('B'), r.get('C')]).toEqual([4, 2.5, 1.5])
  })

  it('keeps sum exact with multiples of the step', () => {
    const r = roundHours(
      [
        { ticket: 'A', share: 0.34 },
        { ticket: 'B', share: 0.33 },
        { ticket: 'C', share: 0.33 }
      ],
      8,
      0.25
    )
    expect(sum(r)).toBe(8)
    for (const v of r.values()) expect(v % 0.25).toBe(0)
  })

  it('sums ten equal shares to 8h', () => {
    const shares = Array.from({ length: 10 }, toShare)
    expect(sum(roundHours(shares, 8, 0.25))).toBe(8)
  })
})

describe('buildDay', () => {
  it('is empty without events', () => {
    const day = buildDay('2026-11-24', [], 8)
    expect(day.totalMinutes).toBe(0)
    expect(day.rows).toEqual([])
  })

  it('sorts rows by minutes and distributes base hours', () => {
    const start = dayBounds('2026-11-24').start
    const day = buildDay(
      '2026-11-24',
      [ev(start, 'A'), ev(start + 10 * MIN, 'B'), ev(start + 40 * MIN, 'B')],
      8
    )
    expect(day.rows.map(ticketOf)).toEqual(['B', 'A'])
    expect(day.rows.reduce(addHours, 0)).toBe(8)
    expect(day.totalMinutes).toBe(40)
  })

  it('has no zero rows for same-timestamp events', () => {
    const start = dayBounds('2026-11-24').start
    const day = buildDay('2026-11-24', [ev(start, 'A'), ev(start, 'B')], 8)
    expect(day.rows.map(ticketOf)).toEqual(['B'])
    expect(day.rows[0].hours).toBe(8)
  })
})

describe('slimEntry', () => {
  const bounds = dayBounds('2026-11-24')
  const inDay = '2026-11-24T10:00:00'
  const long = 'x'.repeat(500)

  it('drops entries outside the day', () => {
    const entry = { type: 'user', timestamp: '2026-11-23T10:00:00', message: { content: 'hi' } }
    expect(slimEntry(entry, bounds)).toBeNull()
  })

  it('drops entries without a timestamp', () => {
    expect(slimEntry({ type: 'user', message: { content: 'hi' } }, bounds)).toBeNull()
  })

  it('truncates string content and keeps the meta fields', () => {
    const entry = { type: 'user', timestamp: inDay, gitBranch: 'feat/AB-1', cwd: '/c', extra: 1, message: { content: long } }
    const slim = slimEntry(entry, bounds)
    expect(slim).toMatchObject({ type: 'user', gitBranch: 'feat/AB-1', cwd: '/c' })
    expect(slim).not.toHaveProperty('extra')
    expect((slim?.message as { content: string }).content).toHaveLength(64)
  })

  it('reduces blocks to what the attention logic needs', () => {
    const entry = {
      type: 'assistant',
      timestamp: inDay,
      message: {
        content: [
          { type: 'text', text: long },
          { type: 'tool_use', id: 't1', name: 'AskUserQuestion', input: { big: long } },
          { type: 'tool_result', tool_use_id: 't1', content: long }
        ]
      }
    }
    const slim = slimEntry(entry, bounds)
    expect(slim?.message).toEqual({
      content: [
        { type: 'text', text: 'x'.repeat(64) },
        { type: 'tool_use', id: 't1', name: 'AskUserQuestion' },
        { type: 'tool_result', tool_use_id: 't1' }
      ]
    })
  })

  it('keeps attention classification and ask ids intact', () => {
    const ask = { type: 'assistant', timestamp: inDay, message: { content: [{ type: 'tool_use', id: 'a', name: 'AskUserQuestion', input: {} }] } }
    const answer = { type: 'user', timestamp: '2026-11-24T10:01:00', message: { content: [{ type: 'tool_result', tool_use_id: 'a', content: long }] } }
    const toSlim = (e: Record<string, unknown>): Record<string, unknown> =>
      slimEntry(e, bounds) as Record<string, unknown>
    const entries = [ask, answer].map(toSlim)
    expect(transcriptEvents(entries, '/h', bounds)).toHaveLength(1)
  })
})

describe('isDayCacheFresh', () => {
  const now = Date.parse('2026-11-24T12:00:00')

  it('treats a past day cached after it ended as fresh', () => {
    expect(isDayCacheFresh(now - 1, '2026-11-23', '2026-11-24', now, false)).toBe(true)
  })

  it('treats a past day cached before it ended as not fresh', () => {
    const cachedAt = Date.parse('2026-11-23T20:00:00')
    expect(isDayCacheFresh(cachedAt, '2026-11-23', '2026-11-24', now, false)).toBe(false)
  })

  it('treats a forced past day as not fresh', () => {
    expect(isDayCacheFresh(now - 1, '2026-11-23', '2026-11-24', now, true)).toBe(false)
  })

  it('treats today cached 30 s ago as fresh', () => {
    expect(isDayCacheFresh(now - 30_000, '2026-11-24', '2026-11-24', now, false)).toBe(true)
  })

  it('treats today cached 90 s ago as not fresh', () => {
    expect(isDayCacheFresh(now - 90_000, '2026-11-24', '2026-11-24', now, false)).toBe(false)
  })

  it('treats a never cached day as not fresh', () => {
    expect(isDayCacheFresh(null, '2026-11-23', '2026-11-24', now, false)).toBe(false)
  })
})
