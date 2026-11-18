import { describe, it, expect } from 'vitest'
import { dayKey, isActiveToday, readFinished, finishedJson, toggleFinished, msToMidnight } from '../src/renderer/src/dashboard/workday'
import type { Session } from '../src/renderer/src/types'

const now = new Date(2026, 10, 17, 14, 30).getTime()
const midnight = new Date(2026, 10, 17, 0, 0).getTime()
const session = (lastActive: number): Session => ({ lastActive }) as Session

describe('dayKey', () => {
  it('formats the local date', () => {
    expect(dayKey(now)).toBe('2026-11-17')
    expect(dayKey(new Date(2026, 0, 5).getTime())).toBe('2026-01-05')
  })
})

describe('isActiveToday', () => {
  it('counts a session active at or after local midnight', () => {
    expect(isActiveToday([session(midnight)], now)).toBe(true)
    expect(isActiveToday([session(midnight - 60000), session(now - 1000)], now)).toBe(true)
  })

  it('ignores sessions from yesterday and missing sessions', () => {
    expect(isActiveToday([session(midnight - 1), undefined], now)).toBe(false)
    expect(isActiveToday([], now)).toBe(false)
  })
})

describe('msToMidnight', () => {
  it('counts the time left until the next local midnight', () => {
    expect(msToMidnight(now)).toBe(new Date(2026, 10, 18).getTime() - now)
    expect(msToMidnight(midnight)).toBe(24 * 3600000)
  })
})

describe('finished marks', () => {
  it('reads back what was written today', () => {
    expect(readFinished(finishedJson(['A-1', 'g/p!3'], now), now)).toEqual(['A-1', 'g/p!3'])
  })

  it('drops marks from another day and bad input', () => {
    expect(readFinished(finishedJson(['A-1'], midnight - 1), now)).toEqual([])
    expect(readFinished('not json', now)).toEqual([])
    expect(readFinished('{"date":"2026-11-17","keys":"A-1"}', now)).toEqual([])
    expect(readFinished(null, now)).toEqual([])
  })

  it('toggles a key on and off', () => {
    expect(toggleFinished(['A-1'], 'A-2')).toEqual(['A-1', 'A-2'])
    expect(toggleFinished(['A-1', 'A-2'], 'A-1')).toEqual(['A-2'])
  })
})
