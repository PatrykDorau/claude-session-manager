import { describe, it, expect } from 'vitest'
import { attentionCount, ticketPickRows, mrPickRows, stateLabel } from '../src/renderer/src/dashboard/orchestrator'
import type { MrRow } from '../src/renderer/src/types'
import type { Job } from '../src/main/orchestrator'

const mr = (key: string, author: string): MrRow => ({ key, title: `title ${key}`, author, projectName: 'repo' }) as MrRow

describe('ticketPickRows', () => {
  it('makes Bug autonomous and other types manual', () => {
    const rows = ticketPickRows(
      [
        { key: 'A-1', summary: 'one', type: 'Bug' },
        { key: 'A-2', summary: 'two', type: 'Story' },
        { key: 'A-3', summary: 'three', type: null }
      ],
      () => null,
      new Set()
    )
    expect(rows.map((r) => r.autonomy)).toEqual(['autonomous', 'manual', 'manual'])
    expect(rows.every((r) => r.kind === 'ticket')).toBe(true)
  })

  it('marks rows with a live session and fills the repo', () => {
    const rows = ticketPickRows(
      [
        { key: 'A-1', summary: 'one', type: null },
        { key: 'A-2', summary: 'two', type: null }
      ],
      (key) => (key === 'A-1' ? 'C:/repo' : null),
      new Set(['A-2'])
    )
    expect(rows.map((r) => r.isLive)).toEqual([false, true])
    expect(rows.map((r) => r.repo)).toEqual(['C:/repo', null])
  })
})

describe('mrPickRows', () => {
  it('watches own MRs and reviews the others, all routine', () => {
    const rows = mrPickRows([mr('r!1', 'me'), mr('r!2', 'other')], 'me', new Set(['r!2']))
    expect(rows.map((r) => r.kind)).toEqual(['watch', 'review'])
    expect(rows.every((r) => r.autonomy === 'routine')).toBe(true)
    expect(rows.map((r) => r.isLive)).toEqual([false, true])
  })
})

describe('stateLabel', () => {
  it('words the states', () => {
    expect(stateLabel('handoff', 'ticket')).toBe('waiting for handoff')
    expect(stateLabel('waiting', 'ticket')).toBe('waiting for you')
    expect(stateLabel('working', 'watch')).toBe('watching')
    expect(stateLabel('working', 'ticket')).toBe('working')
  })
})

describe('attentionCount', () => {
  it('counts jobs waiting for you or for a handoff', () => {
    const jobs = (['waiting', 'handoff', 'working', 'finished', 'queued', 'waiting'] as const).map((state) => ({ state }) as Job)
    expect(attentionCount(jobs)).toBe(3)
  })
})
