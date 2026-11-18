import { describe, it, expect } from 'vitest'
import { isHandoffDue, autoHandoffArgs } from '../src/main/autohandoff'

const now = 10_000_000_000
const MIN = 60_000
const due = { ticket: 'A-1', isLive: true, status: 'idle', contextTokens: 150_000, lastActive: now - 45 * MIN, liveSince: now - 45 * MIN }

describe('isHandoffDue', () => {
  it('fires for a big ticket session idle for 45 minutes with no fresh handoff', () => {
    expect(isHandoffDue(due, null, now)).toBe(true)
    expect(isHandoffDue(due, due.lastActive - 1, now)).toBe(true)
    expect(isHandoffDue({ ...due, status: 'checkout' }, null, now)).toBe(true)
  })

  it('skips everything else', () => {
    expect(isHandoffDue({ ...due, ticket: null }, null, now)).toBe(false)
    expect(isHandoffDue({ ...due, isLive: false }, null, now)).toBe(false)
    expect(isHandoffDue({ ...due, status: 'working' }, null, now)).toBe(false)
    expect(isHandoffDue({ ...due, status: 'waiting' }, null, now)).toBe(false)
    expect(isHandoffDue({ ...due, contextTokens: 149_999 }, null, now)).toBe(false)
    expect(isHandoffDue({ ...due, contextTokens: null }, null, now)).toBe(false)
    expect(isHandoffDue({ ...due, lastActive: now - 44 * MIN }, null, now)).toBe(false)
    expect(isHandoffDue(due, due.lastActive, now)).toBe(false)
  })

  it('waits 45 minutes after Cockpit first saw the session live, so a resume never fires it', () => {
    expect(isHandoffDue({ ...due, lastActive: now - 5 * 3600000, liveSince: now - 44 * MIN }, null, now)).toBe(false)
  })
})

describe('autoHandoffArgs', () => {
  it('forks the session headless without saving it', () => {
    expect(autoHandoffArgs('abc', 'P', 'C:/Opis')).toEqual([
      '-p',
      'P',
      '--resume',
      'abc',
      '--fork-session',
      '--no-session-persistence',
      '--model',
      'sonnet',
      '--permission-mode',
      'acceptEdits',
      '--add-dir',
      'C:/Opis'
    ])
  })
})
