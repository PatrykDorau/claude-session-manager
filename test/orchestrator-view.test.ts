import { describe, it, expect } from 'vitest'
import { attentionCount, ticketPickRows, mrPickRows, stateLabel, liveLast, activityFeed, activityTone, choiceOf, autonomyOfChoice } from '../src/renderer/src/dashboard/orchestrator'
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

describe('liveLast', () => {
  it('moves rows that already have a live session to the end and keeps the order otherwise', () => {
    const row = (key: string, isLive: boolean) => ({ kind: 'ticket' as const, key, title: '', repo: null, autonomy: 'manual' as const, isLive })
    expect(liveLast([row('a', true), row('b', false), row('c', true), row('d', false)]).map((r) => r.key)).toEqual(['b', 'd', 'a', 'c'])
  })
})

describe('activityFeed', () => {
  const j = (id: string, key: string, log: { at: number; text: string }[]): Job => ({ id, key, kind: 'ticket', log }) as Job
  const jobs = [j('ticket:A-1', 'A-1', [{ at: 1, text: 'queued' }, { at: 5, text: 'auto: 1 — safe' }]), j('ticket:A-2', 'A-2', [{ at: 3, text: 'adopted' }])]

  it('merges every job log, newest first', () => {
    expect(activityFeed(jobs, null).map((e) => `${e.key}@${e.at}:${e.text}`)).toEqual(['A-1@5:auto: 1 — safe', 'A-2@3:adopted', 'A-1@1:queued'])
  })

  it('keeps only the chosen job', () => {
    expect(activityFeed(jobs, 'ticket:A-2').map((e) => e.text)).toEqual(['adopted'])
  })
})

describe('activityTone', () => {
  it('tells auto answers, escalations and failures apart', () => {
    expect(activityTone('auto: 1 — safe')).toBe('auto')
    expect(activityTone('escalated: needs your answer')).toBe('ask')
    expect(activityTone('start failed: x')).toBe('fail')
    expect(activityTone('queued')).toBe('info')
  })
})

describe('autonomy choices', () => {
  it('shows a missing or manual job as off', () => {
    expect(choiceOf(null)).toBe('off')
    expect(choiceOf({ autonomy: 'manual' } as Job)).toBe('off')
    expect(choiceOf({ autonomy: 'routine' } as Job)).toBe('routine')
  })

  it('starts an off job as manual', () => {
    expect(autonomyOfChoice('off')).toBe('manual')
    expect(autonomyOfChoice('autonomous')).toBe('autonomous')
  })
})
