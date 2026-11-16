import { describe, it, expect } from 'vitest'
import { contextAlerts, idleAlerts } from '../src/main/contextalert'

describe('contextAlerts', () => {
  it('notifies a session crossing the danger threshold once', () => {
    const result = contextAlerts([{ id: 'a', contextTokens: 260_000 }], new Set())
    expect(result.toNotify).toEqual(['a'])
    expect([...result.alerted]).toEqual(['a'])
  })

  it('does not notify a session that is already alerted', () => {
    const result = contextAlerts([{ id: 'a', contextTokens: 260_000 }], new Set(['a']))
    expect(result.toNotify).toEqual([])
    expect(result.alerted.has('a')).toBe(true)
  })

  it('keeps an alerted session alerted between the thresholds', () => {
    const result = contextAlerts([{ id: 'a', contextTokens: 200_000 }], new Set(['a']))
    expect(result.toNotify).toEqual([])
    expect(result.alerted.has('a')).toBe(true)
  })

  it('clears the alert below the warn threshold', () => {
    const result = contextAlerts([{ id: 'a', contextTokens: 140_000 }], new Set(['a']))
    expect(result.alerted.has('a')).toBe(false)
  })

  it('clears the alert of a session that is gone', () => {
    const result = contextAlerts([], new Set(['a']))
    expect(result.alerted.has('a')).toBe(false)
  })

  it('never notifies a session without tokens', () => {
    const result = contextAlerts([{ id: 'a', contextTokens: null }], new Set())
    expect(result.toNotify).toEqual([])
    expect(result.alerted.has('a')).toBe(false)
  })
})

describe('idleAlerts', () => {
  const now = 10_000_000_000
  const idle = (over: Partial<{ id: string; contextTokens: number | null; lastActive: number; status: string }> = {}) => ({
    id: 'a',
    contextTokens: 120_000,
    lastActive: now - 31 * 60_000,
    status: 'idle',
    ...over
  })
  it('notifies once for a large session idle over 30 minutes', () => {
    const first = idleAlerts([idle()], new Set(), now)
    expect(first.toNotify).toEqual(['a'])
    expect(idleAlerts([idle()], first.alerted, now).toNotify).toEqual([])
  })
  it('alerts again after the session was active and went idle again', () => {
    const first = idleAlerts([idle()], new Set(), now)
    const active = idleAlerts([idle({ lastActive: now })], first.alerted, now)
    expect(active.alerted.has('a')).toBe(false)
    expect(idleAlerts([idle()], active.alerted, now).toNotify).toEqual(['a'])
  })
  it('skips working, waiting and small sessions', () => {
    expect(idleAlerts([idle({ status: 'working' }), idle({ id: 'c', status: 'waiting' }), idle({ id: 'b', contextTokens: 90_000 })], new Set(), now).toNotify).toEqual([])
  })
})
