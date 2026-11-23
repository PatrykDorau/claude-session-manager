import { describe, it, expect } from 'vitest'
import { followId, followIds, isSuperseded, visibleTabs } from '../src/renderer/src/dashboard/follow'
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

  it('follows a chain of continuations to the last session', () => {
    expect(followId([s('a', 'b'), s('b', 'c'), s('c')], 'a')).toBe('c')
  })

  it('stops at a session whose continuation is missing', () => {
    expect(followId([s('a', 'gone'), s('b')], 'a')).toBe('a')
    expect(followId([s('a', 'b'), s('b', 'gone')], 'a')).toBe('b')
  })

  it('ends on a cycle', () => {
    expect(['a', 'b']).toContain(followId([s('a', 'b'), s('b', 'a')], 'a'))
  })
})

const live = (id: string, continuedAs: string | null = null): Session => ({ id, continuedAs, isLive: true }) as Session

describe('visibleTabs', () => {
  const chain = [live('a', 'b'), live('b', 'c'), live('c')]

  it('hides sessions that were continued', () => {
    expect(visibleTabs(chain, []).map((x) => x.id)).toEqual(['c'])
  })

  it('keeps a superseded session the user opened', () => {
    expect(visibleTabs(chain, ['a']).map((x) => x.id)).toEqual(['a', 'c'])
  })

  it('does not treat a missing follow target as superseded', () => {
    expect(isSuperseded(sessions, sessions[3])).toBe(false)
    expect(isSuperseded(sessions, sessions[0])).toBe(true)
  })
})

describe('followIds', () => {
  it('maps a tab list without duplicates', () => {
    expect(followIds(sessions, ['a', 'b', 'c'])).toEqual(['b', 'c'])
    expect(followIds(sessions, ['c', 'a'])).toEqual(['c', 'b'])
  })
})
