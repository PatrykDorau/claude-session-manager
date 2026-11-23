import { describe, it, expect } from 'vitest'
import { isSideSessionName, sessionRole, roleLabel } from '../src/renderer/src/dashboard/tabs'
import type { Session } from '../src/renderer/src/types'

const s = (id: string, name: string | null): Session => ({ id, name }) as Session
const KEY = 'SOFRMPT-1'

describe('sessionRole and roleLabel', () => {
  it('marks a session named ... explain as the Explain tab', () => {
    const explain = s('a', 'SOFRMPT-1 explain')
    expect(sessionRole(explain, KEY, null)).toBe('explain')
    expect(roleLabel('explain', explain, KEY)).toBe('Explain')
  })

  it("marks the MR's session as the MR tab", () => {
    const mr = s('mr-1', 'MR-12')
    expect(sessionRole(mr, KEY, 'mr-1')).toBe('mr')
    expect(roleLabel('mr', mr, KEY)).toBe('Comments')
  })

  it('marks a session named ... review as the Review tab', () => {
    const review = s('r', 'SOFRMPT-1 review')
    expect(sessionRole(review, KEY, null)).toBe('review')
    expect(roleLabel('review', review, KEY)).toBe('Review')
  })

  it('keeps a session whose name only contains review as main', () => {
    expect(sessionRole(s('d', 'SOFRMPT-1 reviewer fix'), KEY, null)).toBe('main')
  })

  it('treats explain and review sessions as side sessions', () => {
    expect(isSideSessionName('SOFRMPT-1 explain')).toBe(true)
    expect(isSideSessionName('SOFRMPT-1 review')).toBe(true)
    expect(isSideSessionName('SOFRMPT-1 fix')).toBe(false)
    expect(isSideSessionName(null)).toBe(false)
  })

  it('labels the main session by its name without the ticket key', () => {
    const main = s('b', 'SOFRMPT-1 fix')
    expect(sessionRole(main, KEY, 'mr-1')).toBe('main')
    expect(roleLabel('main', main, KEY)).toBe('fix')
  })

  it('falls back to the ticket key when the session has no name', () => {
    const unnamed = s('c', null)
    expect(sessionRole(unnamed, KEY, null)).toBe('main')
    expect(roleLabel('main', unnamed, KEY)).toBe(KEY)
  })
})
