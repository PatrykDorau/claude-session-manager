import { describe, it, expect } from 'vitest'
import { matchesFilter, matchesQuery, colorForProject } from '../src/renderer/src/filter'
import type { Session } from '../src/renderer/src/types'

function s(over: Partial<Session>): Session {
  return {
    id: 'x',
    projectPath: '',
    projectName: 'krs-fo-smarttv',
    gitBranch: null,
    ticket: 'SOFKRS-8010',
    firstPrompt: 'fix the next episode bug',
    lastActive: 0,
    isLive: false,
    status: 'idle',
    watched: false,
    name: null,
    model: null,
    contextTokens: null,
    dirty: false,
    ...over
  }
}

describe('matchesFilter', () => {
  it('all matches everything', () => {
    expect(matchesFilter(s({ status: 'closed' }), 'all')).toBe(true)
  })
  it('needs matches only waiting', () => {
    expect(matchesFilter(s({ status: 'waiting' }), 'needs')).toBe(true)
    expect(matchesFilter(s({ status: 'working' }), 'needs')).toBe(false)
  })
  it('working matches only working', () => {
    expect(matchesFilter(s({ status: 'working' }), 'working')).toBe(true)
    expect(matchesFilter(s({ status: 'idle' }), 'working')).toBe(false)
  })
  it('live matches isLive', () => {
    expect(matchesFilter(s({ isLive: true }), 'live')).toBe(true)
    expect(matchesFilter(s({ isLive: false }), 'live')).toBe(false)
  })
})

describe('matchesQuery', () => {
  it('empty query matches all', () => {
    expect(matchesQuery(s({}), '  ')).toBe(true)
  })
  it('matches ticket, project, name, and first prompt (case-insensitive)', () => {
    expect(matchesQuery(s({}), 'sofkrs')).toBe(true)
    expect(matchesQuery(s({}), 'smarttv')).toBe(true)
    expect(matchesQuery(s({}), 'episode')).toBe(true)
    expect(matchesQuery(s({ name: 'My catchup work' }), 'catchup')).toBe(true)
    expect(matchesQuery(s({}), 'nope')).toBe(false)
  })
})

describe('colorForProject', () => {
  it('is deterministic and an hsl string', () => {
    expect(colorForProject('krs')).toBe(colorForProject('krs'))
    expect(colorForProject('krs')).toMatch(/^hsl\(\d+, 45%, 55%\)$/)
  })
})
