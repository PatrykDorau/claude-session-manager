import { describe, expect, it } from 'vitest'
import type { Job } from '../src/main/orchestrator'
import type { Session } from '../src/renderer/src/types'
import {
  coordinatorBars,
  jobSteps,
  stageInfo,
  stageState,
  STAGE_INFO_FALLBACK,
  ticketStages,
  type BarStep,
  type CoordinatorBar
} from '../src/renderer/src/dashboard/coordinator'

const session = (patch: Partial<Session> = {}): Session => ({
  id: 's1',
  projectPath: '/p',
  projectName: 'p',
  gitBranch: null,
  ticket: null,
  firstPrompt: null,
  lastActive: 1,
  isLive: true,
  status: 'idle',
  watched: false,
  name: null,
  model: null,
  contextTokens: null,
  dirty: false,
  stages: [],
  ...patch
})

const job = (patch: Partial<Job> = {}): Job => ({
  id: 'ticket:T-1',
  kind: 'ticket',
  key: 'T-1',
  title: 'T',
  repo: null,
  autonomy: 'manual',
  state: 'working',
  sessionId: 's1',
  handoffPhase: 'none',
  lastSeenNoteId: null,
  isCommentsPending: false,
  autoHandoffs: 0,
  log: [],
  createdAt: 1,
  ...patch
})

const titleOf = (key: string): string => `title ${key}`
const stepTriple = (s: BarStep): [string, boolean, boolean] => [s.label, s.isDone, s.isCurrent]
const stepPair = (s: BarStep): [string, boolean] => [s.label, s.isDone]
const barSessionId = (b: CoordinatorBar): string | null => b.sessionId
const barId = (b: CoordinatorBar): string => b.id

describe('coordinator bars', () => {
  it('marks repro and plan done and impl current', () => {
    const sessions = [session({ ticket: 'T-1', stages: ['repro', 'plan'] })]
    expect(ticketStages('T-1', sessions)).toEqual(['repro', 'plan'])
    const [bar] = coordinatorBars([job()], sessions, titleOf, null)
    expect(bar.steps.map(stepTriple).slice(0, 4)).toEqual([
      ['repro', true, false],
      ['plan', true, false],
      ['impl', false, true],
      ['verify', false, false]
    ])
  })

  it('adds a bar for a plain live session and none for the dispatcher', () => {
    const sessions = [session({ id: 'a' }), session({ id: 'disp' }), session({ id: 'dead', isLive: false })]
    const bars = coordinatorBars([], sessions, titleOf, 'disp')
    expect(bars).toHaveLength(1)
    expect(bars[0]).toMatchObject({ sessionId: 'a', autonomy: null, jobId: null, track: 'session', steps: [] })
  })

  it('skips the session of a job', () => {
    const bars = coordinatorBars([job()], [session({ ticket: 'T-1' })], titleOf, null)
    expect(bars).toHaveLength(1)
    expect(bars[0].jobId).toBe('ticket:T-1')
  })

  it('puts waiting bars first', () => {
    const sessions = [
      session({ id: 'a', status: 'idle', lastActive: 5 }),
      session({ id: 'b', status: 'working', lastActive: 4 }),
      session({ id: 'c', status: 'waiting', lastActive: 1 })
    ]
    const bars = coordinatorBars([], sessions, titleOf, null)
    expect(bars.map(barSessionId)).toEqual(['c', 'b', 'a'])
    expect(bars[0].isWaiting).toBe(true)
  })

  it('maps checkout to turn-done', () => {
    const bars = coordinatorBars([], [session({ status: 'checkout' })], titleOf, null)
    expect(bars[0].status).toBe('turn-done')
  })

  it('keeps a finished review bar with posted done, sorted last', () => {
    const review = job({ id: 'review:R-1', kind: 'review', key: 'R-1', state: 'finished', sessionId: null })
    const bars = coordinatorBars([review], [session({ id: 'a' })], titleOf, null)
    expect(bars.map(barId)).toEqual(['a', 'review:R-1'])
    expect(bars[1].status).toBe('finished')
    expect(bars[1].steps.map(stepPair)).toEqual([
      ['review', false],
      ['posted', true]
    ])
  })

  it('takes job status from its live session', () => {
    const sessions = [session({ ticket: 'T-1', status: 'checkout' })]
    const [bar] = coordinatorBars([job({ state: 'waiting' })], sessions, titleOf, null)
    expect(bar.status).toBe('turn-done')
    expect(bar.isWaiting).toBe(false)
  })

  it('keeps handoff over the session status', () => {
    const [bar] = coordinatorBars([job({ state: 'handoff' })], [session({ status: 'working' })], titleOf, null)
    expect(bar.status).toBe('handoff')
  })

  it('shows posted done for a finished review steps', () => {
    const review = job({ kind: 'review', state: 'finished' })
    expect(jobSteps(review, []).map(stepPair)).toEqual([
      ['review', false],
      ['posted', true]
    ])
  })

  it('maps an address job to the review track', () => {
    const address = job({ id: 'address:R-2', kind: 'address', key: 'R-2', sessionId: null })
    const [bar] = coordinatorBars([address], [], titleOf, null)
    expect(bar.track).toBe('review')
  })

  it('shows a starting job without a session as queued', () => {
    const [bar] = coordinatorBars([job({ state: 'starting', sessionId: null })], [], titleOf, null)
    expect(bar.status).toBe('queued')
  })

  it('sorts a failed job after an active one', () => {
    const failed = job({ id: 'ticket:F-1', key: 'F-1', state: 'failed', sessionId: null, createdAt: 9 })
    const bars = coordinatorBars([failed], [session({ id: 'a' })], titleOf, null)
    expect(bars.map(barId)).toEqual(['a', 'ticket:F-1'])
  })
})

describe('stageInfo', () => {
  const steps = [
    { name: 'Repro', summary: 'reproduce it' },
    { name: 'Implementation', summary: 'write code' },
    { name: 'Review SELF', summary: 'self review' }
  ]
  it('matches labels to steps by name prefix', () => {
    expect(stageInfo('repro', steps)).toBe('reproduce it')
    expect(stageInfo('impl', steps)).toBe('write code')
    expect(stageInfo('review', steps)).toBe('self review')
  })
  it('uses static text for posted and watching', () => {
    expect(stageInfo('watching', [])).toContain('watching')
    expect(stageInfo('posted', [])).toContain('posted')
  })
  it('falls back when nothing matches', () => {
    expect(stageInfo('qa', steps)).toBe(STAGE_INFO_FALLBACK)
    expect(stageInfo('zzz', steps)).toBe(STAGE_INFO_FALLBACK)
  })
  it('names the step state', () => {
    expect(stageState({ label: 'a', isDone: true, isCurrent: false })).toBe('done')
    expect(stageState({ label: 'a', isDone: false, isCurrent: true })).toBe('current')
    expect(stageState({ label: 'a', isDone: false, isCurrent: false })).toBe('not yet')
  })
})
