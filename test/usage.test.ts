import { describe, it, expect } from 'vitest'
import { parseUsageResponse } from '../src/main/usage'
import { formatReset, severityColor } from '../src/renderer/src/usage'

const SESSION_RESET = '2026-06-30T12:10:00.249490+00:00'
const WEEK_RESET = '2026-07-02T00:00:00.249511+00:00'

const sample = {
  five_hour: { utilization: 6.0, resets_at: SESSION_RESET },
  seven_day: { utilization: 83.0, resets_at: WEEK_RESET },
  seven_day_opus: null,
  seven_day_sonnet: null,
  limits: [
    { kind: 'session', group: 'session', percent: 6, severity: 'normal', resets_at: SESSION_RESET, is_active: false },
    { kind: 'weekly_all', group: 'weekly', percent: 83, severity: 'warning', resets_at: WEEK_RESET, is_active: true }
  ]
}

describe('parseUsageResponse', () => {
  it('maps session and weekly_all from limits[]', () => {
    const g = parseUsageResponse(sample)
    expect(g.map((x) => x.key)).toEqual(['session', 'weekly_all'])
    expect(g[0]).toEqual({
      key: 'session',
      label: 'Session (5h)',
      percent: 6,
      severity: 'normal',
      resetsAt: Date.parse(SESSION_RESET)
    })
    expect(g[1].label).toBe('Weekly (all models)')
    expect(g[1].percent).toBe(83)
    expect(g[1].severity).toBe('warning')
  })

  it('adds per-model gauges with severity derived from percent', () => {
    const g = parseUsageResponse({ ...sample, seven_day_opus: { utilization: 90, resets_at: WEEK_RESET } })
    const opus = g.find((x) => x.key === 'weekly_opus')
    expect(opus).toEqual({
      key: 'weekly_opus',
      label: 'Weekly (Opus)',
      percent: 90,
      severity: 'warning',
      resetsAt: Date.parse(WEEK_RESET)
    })
  })

  it('falls back to five_hour / seven_day when limits[] is absent', () => {
    const g = parseUsageResponse({ five_hour: { utilization: 12, resets_at: SESSION_RESET }, seven_day: { utilization: 50, resets_at: WEEK_RESET } })
    expect(g.map((x) => x.key)).toEqual(['session', 'weekly_all'])
    expect(g[0].percent).toBe(12)
    expect(g[1].percent).toBe(50)
  })

  it('clamps/rounds percent and defaults unknown severity to normal', () => {
    const g = parseUsageResponse({ limits: [{ kind: 'session', percent: 6.7, severity: 'bogus', resets_at: SESSION_RESET }] })
    expect(g[0].percent).toBe(7)
    expect(g[0].severity).toBe('normal')
  })

  it('returns empty array for junk input', () => {
    expect(parseUsageResponse(null)).toEqual([])
    expect(parseUsageResponse({})).toEqual([])
  })
})

describe('formatReset', () => {
  const now = 1_000_000_000_000
  it('returns empty string for null', () => {
    expect(formatReset(null, now)).toBe('')
  })
  it('returns "now" for sub-minute', () => {
    expect(formatReset(now + 30_000, now)).toBe('now')
  })
  it('formats hours and minutes', () => {
    expect(formatReset(now + (2 * 60 + 10) * 60_000, now)).toBe('2h 10m')
  })
  it('formats days and hours', () => {
    expect(formatReset(now + (2 * 1440 + 2 * 60) * 60_000, now)).toBe('2d 2h')
  })
})

describe('severityColor', () => {
  it('maps each severity to its hex', () => {
    expect(severityColor('normal')).toBe('#8b949e')
    expect(severityColor('warning')).toBe('#e69f00')
    expect(severityColor('critical')).toBe('#d55e00')
  })
})
