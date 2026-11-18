import { describe, it, expect } from 'vitest'
import { followId, followIds } from '../src/renderer/src/dashboard/follow'
import type { Session } from '../src/renderer/src/types'

const s = (id: string, continuedAs: string | null = null): Session => ({ id, continuedAs }) as Session
const sessions = [s('a', 'b'), s('b'), s('c'), s('d', 'elsewhere')]

describe('followId', () => {
  it('replaces an id that continued as another session', () => {
    expect(followId(sessions, 'a')).toBe('b')
    expect(followId(sessions, 'c')).toBe('c')
    expect(followId(sessions, null)).toBeNull()
    expect(followId(sessions, 'zzz')).toBe('zzz')
    expect(followId(sessions, 'd')).toBe('d')
  })
})

describe('followIds', () => {
  it('maps a tab list without duplicates', () => {
    expect(followIds(sessions, ['a', 'b', 'c'])).toEqual(['b', 'c'])
    expect(followIds(sessions, ['c', 'a'])).toEqual(['c', 'b'])
  })
})
