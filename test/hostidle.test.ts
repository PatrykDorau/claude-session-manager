import { describe, it, expect } from 'vitest'
import { idleHosts, HOST_IDLE_MS } from '../src/main/hostidle'

describe('idleHosts', () => {
  it('starts the idle clock for a host without a live session and keeps it open', () => {
    expect(idleHosts(['A-1'], new Set(), {}, 1000)).toEqual({ toClose: [], idleSince: { 'A-1': 1000 } })
  })

  it('closes a host whose ticket had no live session for the whole idle time', () => {
    const result = idleHosts(['A-1'], new Set(), { 'A-1': 1000 }, 1000 + HOST_IDLE_MS)
    expect(result).toEqual({ toClose: ['A-1'], idleSince: {} })
  })

  it('resets the clock when the ticket has a live session again', () => {
    expect(idleHosts(['A-1'], new Set(['A-1']), { 'A-1': 1000 }, 1000 + HOST_IDLE_MS)).toEqual({ toClose: [], idleSince: {} })
  })

  it('forgets hosts that are no longer open', () => {
    expect(idleHosts([], new Set(), { 'A-1': 1000 }, 2000)).toEqual({ toClose: [], idleSince: {} })
  })
})
