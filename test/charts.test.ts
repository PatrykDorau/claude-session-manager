import { describe, it, expect } from 'vitest'
import {
  bucketShares,
  formatCompact,
  formatMinutes,
  markerIndexes,
  tileDelta
} from '../src/renderer/src/dashboard/charts'

describe('charts', () => {
  it('formats numbers compactly', () => {
    expect(formatCompact(950)).toBe('950')
    expect(formatCompact(12_400)).toBe('12.4k')
    expect(formatCompact(12_000)).toBe('12k')
    expect(formatCompact(50_622_000)).toBe('50.6M')
    expect(formatCompact(999_960)).toBe('1M')
    expect(formatCompact(3.46)).toBe('3.5')
    expect(formatCompact(-1500)).toBe('-1.5k')
    expect(formatCompact(Number.NaN)).toBe('0')
  })
  it('formats minutes as hours and minutes', () => {
    expect(formatMinutes(49)).toBe('49m')
    expect(formatMinutes(109)).toBe('1h 49m')
    expect(formatMinutes(120)).toBe('2h')
  })
  it('compares today with the average of earlier days, or not at all', () => {
    expect(tileDelta(150, [100, 100])).toEqual({ value: 150, deltaPct: 50 })
    expect(tileDelta(10, [])).toEqual({ value: 10, deltaPct: null })
    expect(tileDelta(10, [0])).toEqual({ value: 10, deltaPct: null })
  })
  it('maps applied days to chart column indexes', () => {
    expect(
      markerIndexes(['2026-11-14', '2026-11-15'], [{ day: '2026-11-15' }, { day: '2026-10-01' }])
    ).toEqual([1])
  })
  it('returns cost shares per bucket summing to 1, or zeros', () => {
    expect(bucketShares({ x: { cost: 1 }, y: { cost: 3 } })).toEqual([
      { key: 'x', share: 0.25 },
      { key: 'y', share: 0.75 }
    ])
    expect(bucketShares({ x: { cost: 0 }, y: { cost: 0 } })).toEqual([
      { key: 'x', share: 0 },
      { key: 'y', share: 0 }
    ])
  })
})
