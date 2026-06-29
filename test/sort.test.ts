import { describe, it, expect } from 'vitest'
import { sortSessions, groupByProject } from '../src/renderer/src/sort'
import type { Session } from '../src/renderer/src/types'

function s(over: Partial<Session>): Session {
  return {
    id: 'x',
    projectPath: '',
    projectName: 'p',
    gitBranch: null,
    ticket: null,
    firstPrompt: null,
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

describe('sortSessions', () => {
  it('recency: newest first', () => {
    const out = sortSessions([s({ id: 'a', lastActive: 10 }), s({ id: 'b', lastActive: 20 })], 'recency')
    expect(out.map((x) => x.id)).toEqual(['b', 'a'])
  })
  it('status: working before idle before closed, then recency', () => {
    const out = sortSessions(
      [
        s({ id: 'idle', status: 'idle', lastActive: 99 }),
        s({ id: 'work', status: 'working', lastActive: 1 }),
        s({ id: 'closed', status: 'closed', lastActive: 99 })
      ],
      'status'
    )
    expect(out.map((x) => x.id)).toEqual(['work', 'idle', 'closed'])
  })
  it('project: alphabetical by project then recency', () => {
    const out = sortSessions(
      [
        s({ id: 'z1', projectName: 'zeta', lastActive: 5 }),
        s({ id: 'a1', projectName: 'alpha', lastActive: 1 }),
        s({ id: 'a2', projectName: 'alpha', lastActive: 9 })
      ],
      'project'
    )
    expect(out.map((x) => x.id)).toEqual(['a2', 'a1', 'z1'])
  })
  it('does not mutate the input', () => {
    const input = [s({ id: 'a', lastActive: 1 }), s({ id: 'b', lastActive: 2 })]
    sortSessions(input, 'recency')
    expect(input.map((x) => x.id)).toEqual(['a', 'b'])
  })
})

describe('groupByProject', () => {
  it('groups by project, sorted alphabetically', () => {
    const groups = groupByProject([
      s({ id: 'z', projectName: 'zeta' }),
      s({ id: 'a1', projectName: 'alpha' }),
      s({ id: 'a2', projectName: 'alpha' })
    ])
    expect(groups.map((g) => g.project)).toEqual(['alpha', 'zeta'])
    expect(groups[0].sessions.map((x) => x.id)).toEqual(['a1', 'a2'])
  })
})
