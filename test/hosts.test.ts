import { describe, it, expect } from 'vitest'
import { idleHosts, countOpenHosts } from '../src/renderer/src/dashboard/hosts'
import type { LocalHost, Session, Status } from '../src/renderer/src/types'

const HOUR = 3_600_000
const NOW = 100 * HOUR

const host = (key: string | null, isServer: boolean, isChrome: boolean, lastOutputAt: number | null = null): LocalHost =>
  ({
    key,
    server: isServer ? { lastOutputAt } : null,
    chrome: { port: 9301, isUp: isChrome, pages: [] }
  }) as unknown as LocalHost

const session = (ticket: string, lastActive: number, status: Status = 'idle', isLive = false): Session =>
  ({ id: `${ticket}-${lastActive}`, ticket, lastActive, status, isLive }) as unknown as Session

describe('idleHosts', () => {
  it('includes a host whose newest session is older than the threshold', () => {
    const h = host('A-1', true, true)
    const result = idleHosts([h], [session('a-1', NOW - 5 * HOUR), session('A-1', NOW - 4 * HOUR)], NOW, 3)
    expect(result).toEqual([{ host: h, idleMs: 4 * HOUR, isServer: true, isChrome: true }])
  })

  it('excludes a host with a recent session', () => {
    const result = idleHosts([host('A-1', true, false)], [session('A-1', NOW - 5 * HOUR), session('A-1', NOW - HOUR)], NOW, 3)
    expect(result).toEqual([])
  })

  it('excludes a host whose ticket has a working, waiting or checkout session even if old', () => {
    for (const status of ['working', 'waiting', 'checkout'] as const) {
      expect(idleHosts([host('A-1', true, true)], [session('A-1', NOW - 10 * HOUR, status)], NOW, 3)).toEqual([])
    }
  })

  it('excludes a host without a ticket key', () => {
    expect(idleHosts([host(null, false, true)], [], NOW, 3)).toEqual([])
  })

  it('excludes a host with nothing open', () => {
    expect(idleHosts([host('A-1', false, false)], [session('A-1', NOW - 10 * HOUR)], NOW, 3)).toEqual([])
  })

  it('includes a host without sessions when its server output is old', () => {
    const h = host('A-1', true, false, NOW - 5 * HOUR)
    expect(idleHosts([h], [], NOW, 3)).toEqual([{ host: h, idleMs: 5 * HOUR, isServer: true, isChrome: false }])
  })

  it('excludes a host without sessions when its server output is recent', () => {
    expect(idleHosts([host('A-1', true, false, NOW - HOUR)], [], NOW, 3)).toEqual([])
  })
})

describe('countOpenHosts', () => {
  it('counts hosts with a running server or an open Chrome', () => {
    expect(countOpenHosts([host('A-1', true, false), host('A-2', false, true), host('A-3', false, false)])).toBe(2)
  })
})
