import { describe, it, expect } from 'vitest'
import { staleTerminals, TERMINAL_IDLE_MS } from '../src/main/terminalsweep'

const NOW = 1_000_000_000
const MINUTE = 60_000

describe('staleTerminals', () => {
  it('keeps a terminal whose last heartbeat is 9 minutes old', () => {
    const lastUseAt = (): number => NOW - 9 * MINUTE
    expect(staleTerminals(['a'], lastUseAt, NOW)).toEqual([])
  })

  it('returns a terminal unused for 11 minutes', () => {
    const lastUseAt = (id: string): number => (id === 'old' ? NOW - 11 * MINUTE : NOW)
    expect(staleTerminals(['old', 'fresh'], lastUseAt, NOW)).toEqual(['old'])
  })

  it('ignores a terminal with no use time', () => {
    const lastUseAt = (): null => null
    expect(staleTerminals(['a'], lastUseAt, NOW)).toEqual([])
  })

  it('uses a 10 minute threshold', () => {
    expect(TERMINAL_IDLE_MS).toBe(600_000)
  })
})
