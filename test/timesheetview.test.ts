import { describe, it, expect } from 'vitest'
import {
  applyEdits,
  copyText,
  editsKey,
  formatActivity,
  hashColor,
  shiftDay,
  ticketColor,
  type DayEdits
} from '../src/renderer/src/dashboard/timesheet'
import type { TicketTime } from '../src/main/timesheet'
import type { Session } from '../src/renderer/src/types'

const row = (ticket: string | null, hours: number): TicketTime => ({
  ticket,
  minutes: hours * 60,
  share: hours / 8,
  hours
})

const edits = (over: Partial<DayEdits>): DayEdits => ({ hours: {}, moves: {}, added: [], ...over })

const session = (over: Partial<Session>): Session => ({
  id: 's1',
  projectPath: 'C:/P',
  projectName: 'P',
  gitBranch: null,
  ticket: 'A-1',
  firstPrompt: null,
  lastActive: 0,
  isLive: true,
  status: 'idle',
  watched: false,
  name: null,
  model: null,
  contextTokens: null,
  dirty: false,
  stages: [],
  ...over
})

describe('editsKey', () => {
  it('names the per-day storage key', () => {
    expect(editsKey('2026-11-24')).toBe('timesheet.edits.2026-11-24')
  })
})

describe('applyEdits', () => {
  it('keeps the rows unchanged without edits', () => {
    expect(applyEdits([row('A-1', 5), row(null, 3)], edits({}))).toEqual([
      { ticket: 'A-1', hours: 5, isEdited: false },
      { ticket: null, hours: 3, isEdited: false }
    ])
  })

  it('lets edited hours override the computed ones', () => {
    expect(applyEdits([row('A-1', 5), row('B-2', 3)], edits({ hours: { 'B-2': 2.5 } }))).toEqual([
      { ticket: 'A-1', hours: 5, isEdited: false },
      { ticket: 'B-2', hours: 2.5, isEdited: true }
    ])
  })

  it('adds moved No-ticket hours to an existing row', () => {
    expect(
      applyEdits([row('A-1', 5), row(null, 2), row('B-2', 1)], edits({ moves: { '': 'B-2' } }))
    ).toEqual([
      { ticket: 'A-1', hours: 5, isEdited: false },
      { ticket: 'B-2', hours: 3, isEdited: true }
    ])
  })

  it('moves edited No-ticket hours', () => {
    expect(
      applyEdits([row('A-1', 5), row(null, 3)], edits({ hours: { '': 1 }, moves: { '': 'A-1' } }))
    ).toEqual([{ ticket: 'A-1', hours: 6, isEdited: true }])
  })

  it('creates the target row when No-ticket hours move to a new key', () => {
    expect(applyEdits([row('A-1', 6), row(null, 2)], edits({ moves: { '': 'C-3' } }))).toEqual([
      { ticket: 'A-1', hours: 6, isEdited: false },
      { ticket: 'C-3', hours: 2, isEdited: true }
    ])
  })

  it('shows an added key with 0 h unless edited', () => {
    expect(
      applyEdits([row('A-1', 8)], edits({ added: ['D-4', 'E-5', 'A-1'], hours: { 'E-5': 1 } }))
    ).toEqual([
      { ticket: 'A-1', hours: 8, isEdited: false },
      { ticket: 'D-4', hours: 0, isEdited: false },
      { ticket: 'E-5', hours: 1, isEdited: true }
    ])
  })
})

describe('copyText', () => {
  const titleOf = (key: string): string => `Title of ${key}`

  it('writes tab-separated lines with up to 2 decimals', () => {
    expect(
      copyText(
        [
          { ticket: 'A-1', hours: 4.5 },
          { ticket: 'B-2', hours: 1 / 3 },
          { ticket: 'C-3', hours: 2 }
        ],
        titleOf
      )
    ).toBe('A-1\t4.5\tTitle of A-1\nB-2\t0.33\tTitle of B-2\nC-3\t2\tTitle of C-3')
  })

  it('omits rows with 0 h', () => {
    expect(
      copyText(
        [
          { ticket: 'A-1', hours: 8 },
          { ticket: 'B-2', hours: 0 }
        ],
        titleOf
      )
    ).toBe('A-1\t8\tTitle of A-1')
  })

  it('formats the No-ticket row', () => {
    expect(copyText([{ ticket: null, hours: 0.25 }], titleOf)).toBe('-\t0.25\tNo ticket')
  })

  it('returns an empty string for no rows', () => {
    expect(copyText([], titleOf)).toBe('')
  })
})

describe('shiftDay', () => {
  it('moves within a month', () => {
    expect(shiftDay('2026-11-24', -1)).toBe('2026-11-23')
  })

  it('crosses month ends', () => {
    expect(shiftDay('2026-11-30', 1)).toBe('2026-12-01')
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('crosses year ends', () => {
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftDay('2027-01-01', -1)).toBe('2026-12-31')
  })
})

describe('formatActivity', () => {
  it('shows hours and minutes', () => {
    expect(formatActivity(400)).toBe('6 h 40 min')
    expect(formatActivity(45)).toBe('0 h 45 min')
  })
})

describe('ticketColor', () => {
  it('uses the identity colour of a session of the ticket', () => {
    const sessions = [session({ id: 's1', ticket: 'a-1' })]
    const identities = { s1: { icon: 'circle' as const, color: '#3dd68c' } }
    expect(ticketColor('A-1', sessions, identities, {})).toBe('#3dd68c')
  })

  it('prefers the cell look colour over the identity colour', () => {
    const sessions = [session({ id: 's1', ticket: 'A-1' })]
    const identities = { s1: { icon: 'circle' as const, color: '#3dd68c' } }
    expect(ticketColor('A-1', sessions, identities, { 'A-1': { color: '#ff7b72' } })).toBe(
      '#ff7b72'
    )
  })

  it('falls back to a stable hash colour', () => {
    expect(ticketColor('Z-9', [], {}, {})).toBe(hashColor('Z-9'))
    expect(hashColor('Z-9')).toBe(hashColor('Z-9'))
  })
})
