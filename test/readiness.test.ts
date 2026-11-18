import { describe, it, expect } from 'vitest'
import { readiness } from '../src/renderer/src/dashboard/readiness'
import type { Stage } from '../src/renderer/src/types'

const all: Stage[] = ['repro', 'plan', 'impl', 'verify', 'qa', 'review']

describe('readiness', () => {
  it('ticks every stage and a handoff newer than the last commit', () => {
    const r = readiness(all, { handoffAt: 20, lastCommitAt: 10 })
    expect([r.done, r.total]).toEqual([7, 7])
    expect(r.items.map((i) => i.id)).toEqual(['repro', 'plan', 'impl', 'verify', 'qa', 'review', 'handoff'])
  })
  it('ticks nothing for a fresh ticket', () => {
    expect(readiness([], { handoffAt: null, lastCommitAt: null }).done).toBe(0)
  })
  it('judges the handoff against the last commit', () => {
    const handoff = (times: { handoffAt: number | null; lastCommitAt: number | null }): boolean | undefined =>
      readiness([], times).items.find((i) => i.id === 'handoff')?.isDone
    expect(handoff({ handoffAt: 5, lastCommitAt: 10 })).toBe(false)
    expect(handoff({ handoffAt: 5, lastCommitAt: null })).toBe(true)
  })
})
