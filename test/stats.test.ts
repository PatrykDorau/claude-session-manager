import { describe, it, expect } from 'vitest'
import { computeStats } from '../src/renderer/src/stats'
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

const now = new Date('2026-06-29T12:00:00').getTime()

describe('computeStats', () => {
  const list = [
    s({ projectName: 'krs', status: 'working', isLive: true, model: 'claude-opus-4-8', contextTokens: 50000, lastActive: now }),
    s({ projectName: 'krs', status: 'waiting', isLive: true, model: 'claude-opus-4-8', contextTokens: 30000, lastActive: now }),
    s({ projectName: 'kan', status: 'idle', model: 'claude-sonnet-4-6', contextTokens: 10000, lastActive: now - 86400000 }),
    s({ projectName: 'web', status: 'closed' })
  ]

  it('counts totals, open, needsYou', () => {
    const st = computeStats(list, now)
    expect(st.total).toBe(4)
    expect(st.open).toBe(2)
    expect(st.needsYou).toBe(1)
  })

  it('sums context tokens', () => {
    expect(computeStats(list, now).totalContextTokens).toBe(90000)
  })

  it('lists sessions by context descending, with average', () => {
    const st = computeStats(list, now)
    expect(st.bySession.map((x) => x.tokens)).toEqual([50000, 30000, 10000])
    expect(st.bySession[0].model).toBe('opus')
    expect(st.avgContextTokens).toBe(30000)
  })

  it('ranks top projects by count', () => {
    const st = computeStats(list, now)
    expect(st.topProjects[0]).toEqual({ project: 'krs', count: 2 })
  })

  it('counts models by family', () => {
    const st = computeStats(list, now)
    const opus = st.byModel.find((m) => m.model === 'opus')
    expect(opus?.count).toBe(2)
    expect(st.byModel.find((m) => m.model === 'sonnet')?.count).toBe(1)
  })

  it('buckets activity into the last 7 days (today + yesterday)', () => {
    const st = computeStats(list, now)
    expect(st.perDay).toHaveLength(7)
    expect(st.perDay[6]).toEqual({ label: 'today', count: 2 })
    expect(st.perDay[5].count).toBe(1)
  })
})
