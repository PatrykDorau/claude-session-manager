import { describe, it, expect } from 'vitest'
import {
  AUTO_HANDOFF_LIMIT,
  LOG_LIMIT,
  addLog,
  adoptJob,
  withAdopted,
  withAutonomy,
  type Autonomy,
  isAdopted,
  handAddressToLiveTicket,
  handoffStopAction,
  defaultAutonomy,
  emptyOrchestrator,
  followSession,
  isClearConfirmed,
  isHandoffHeld,
  isHandoffClockReset,
  isHandoffStalled,
  isJobOver,
  nextHandoffTick,
  requeueFromRequest,
  isPromptSkipping,
  jobId,
  newJob,
  queueAddressJob,
  requeueJob,
  loadOrchestrator,
  isHandoffStop,
  jobsToStart,
  nextHandoffStep,
  nextJobState,
  resumePrompt,
  type Job,
  type SessionView
} from '../src/main/orchestrator'
import { handoffPath } from '../src/renderer/src/dashboard/context'

const validJob: Job = {
  id: 'ticket:SOFKRS-1',
  kind: 'ticket',
  key: 'SOFKRS-1',
  title: 'Fix it',
  repo: 'tigo-fo-web',
  autonomy: 'autonomous',
  state: 'working',
  sessionId: 'abc',
  handoffPhase: 'none',
  lastSeenNoteId: 5,
  isCommentsPending: false,
  autoHandoffs: 0,
  log: [{ at: 1, text: 'started' }],
  createdAt: 10
}

describe('orchestrator pure helpers', () => {
  it('defaultAutonomy is autonomous only for bugs', () => {
    expect(defaultAutonomy('Bug')).toBe('autonomous')
    expect(defaultAutonomy('Story')).toBe('manual')
    expect(defaultAutonomy(null)).toBe('manual')
  })
  it('jobId joins kind and key', () => {
    expect(jobId('ticket', 'SOFKRS-1')).toBe('ticket:SOFKRS-1')
  })
  it('addLog keeps the newest LOG_LIMIT entries', () => {
    let job = validJob
    for (let i = 1; i <= 25; i++) job = addLog(job, `entry ${i}`, i)
    expect(job.log.length).toBe(LOG_LIMIT)
    expect(job.log[job.log.length - 1].text).toBe('entry 25')
  })
})

describe('withAutonomy', () => {
  it('switches any job between the three levels and logs it', () => {
    const job = withAutonomy({ ...validJob, autonomy: 'manual' }, 'routine', 9)
    expect(job.autonomy).toBe('routine')
    expect(job.log.at(-1)).toEqual({ at: 9, text: 'autonomy: routine' })
    expect(withAutonomy({ ...validJob, kind: 'review', autonomy: 'routine' }, 'autonomous', 9).autonomy).toBe('autonomous')
  })

  it('returns the same job when nothing changes or the level is unknown', () => {
    expect(withAutonomy(validJob, validJob.autonomy, 9)).toBe(validJob)
    expect(withAutonomy(validJob, 'bogus' as Autonomy, 9)).toBe(validJob)
  })
})

describe('loadOrchestrator', () => {
  it('returns empty state for missing input', () => {
    expect(loadOrchestrator(undefined)).toEqual({ jobs: [], dispatcherSessionId: null })
    expect(emptyOrchestrator()).toEqual({ jobs: [], dispatcherSessionId: null })
  })
  it('keeps only valid jobs', () => {
    expect(loadOrchestrator({ jobs: [validJob, { kind: 'bogus' }, 7] })).toEqual({
      jobs: [validJob],
      dispatcherSessionId: null
    })
  })
  it('keeps a string dispatcher session id', () => {
    expect(loadOrchestrator({ jobs: [], dispatcherSessionId: 'abc' }).dispatcherSessionId).toBe('abc')
  })
  it('defaults the dispatcher session id to null', () => {
    expect(loadOrchestrator({ jobs: [] }).dispatcherSessionId).toBeNull()
    expect(emptyOrchestrator().dispatcherSessionId).toBeNull()
  })
  it('drops a non-string dispatcher session id', () => {
    expect(loadOrchestrator({ jobs: [], dispatcherSessionId: 7 }).dispatcherSessionId).toBeNull()
  })
  it('reloads a starting job without a session as queued', () => {
    const loaded = loadOrchestrator({ jobs: [{ ...validJob, state: 'starting', sessionId: null }] })
    expect(loaded.jobs[0].state).toBe('queued')
  })
  it('keeps a starting job that has a session', () => {
    const loaded = loadOrchestrator({ jobs: [{ ...validJob, state: 'starting' }] })
    expect(loaded.jobs[0].state).toBe('starting')
  })
  it('defaults a missing or invalid autoHandoffs count to 0', () => {
    const { autoHandoffs: _, ...old } = validJob
    expect(loadOrchestrator({ jobs: [old] }).jobs[0].autoHandoffs).toBe(0)
    expect(loadOrchestrator({ jobs: [{ ...validJob, autoHandoffs: 'x' }] }).jobs[0].autoHandoffs).toBe(0)
    expect(loadOrchestrator({ jobs: [{ ...validJob, autoHandoffs: 2 }] }).jobs[0].autoHandoffs).toBe(2)
  })
})

const jobWith = (patch: Partial<Job>): Job => ({ ...validJob, ...patch })

const sessionWith = (status: SessionView['status']): SessionView => ({
  id: 'abc',
  status,
  ticket: 'SOFKRS-1',
  isLive: true
})

describe('jobsToStart', () => {
  const starting = jobWith({ id: 'ticket:S', key: 'S', state: 'starting', createdAt: 1 })
  const a = jobWith({ id: 'ticket:A', key: 'A', state: 'queued', createdAt: 2 })
  const b = jobWith({ id: 'ticket:B', key: 'B', state: 'queued', createdAt: 3 })
  const c = jobWith({ id: 'ticket:C', key: 'C', state: 'queued', createdAt: 4 })

  it('counts starting jobs against the limit', () => {
    expect(jobsToStart({ jobs: [starting, c, b, a] }, 2, new Set())).toEqual([a])
  })

  it('fills free slots in createdAt order', () => {
    expect(jobsToStart({ jobs: [c, b, a] }, 2, new Set())).toEqual([a, b])
  })

  it('skips queued jobs whose key is live', () => {
    expect(jobsToStart({ jobs: [a, b] }, 2, new Set(['A']))).toEqual([b])
  })

  it('never returns two jobs with the same key', () => {
    const x1 = jobWith({ id: 'ticket:X', key: 'X', state: 'queued', createdAt: 5 })
    const x2 = jobWith({ id: 'address:X', kind: 'address', key: 'X', state: 'queued', createdAt: 6 })
    expect(jobsToStart({ jobs: [x2, x1] }, 3, new Set())).toEqual([x1])
  })

  it('skips a queued job whose key matches a starting job', () => {
    const x = jobWith({ id: 'address:S', kind: 'address', key: 'S', state: 'queued', createdAt: 7 })
    expect(jobsToStart({ jobs: [starting, x] }, 3, new Set())).toEqual([])
  })

  it('never starts watch jobs', () => {
    const watch = jobWith({ id: 'watch:W', kind: 'watch', key: 'W', state: 'queued', createdAt: 0 })
    expect(jobsToStart({ jobs: [watch, a] }, 2, new Set())).toEqual([a])
  })

  const address = jobWith({ id: 'address:42!534', kind: 'address', key: '42!534', state: 'queued', createdAt: 8 })
  const mrTickets = new Map([['42!534', 'SOFKRS-1']])

  it('blocks an address job whose MR ticket has a live session', () => {
    expect(jobsToStart({ jobs: [address] }, 3, new Set(['SOFKRS-1']), mrTickets)).toEqual([])
    expect(jobsToStart({ jobs: [address] }, 3, new Set(), mrTickets)).toEqual([address])
  })

  it('never starts an address job next to a ticket job of the same ticket', () => {
    const ticket = jobWith({ id: 'ticket:SOFKRS-1', key: 'SOFKRS-1', state: 'queued', createdAt: 9 })
    expect(jobsToStart({ jobs: [ticket, address] }, 3, new Set(), mrTickets)).toEqual([address])
    expect(jobsToStart({ jobs: [{ ...address, state: 'starting' }, ticket] }, 3, new Set(), mrTickets)).toEqual([])
  })
})

describe('handAddressToLiveTicket', () => {
  const address = jobWith({ id: 'address:42!534', kind: 'address', key: '42!534', state: 'queued' })
  const watch = jobWith({ id: 'watch:42!534', kind: 'watch', key: '42!534', state: 'working' })
  const mrTickets = new Map([['42!534', 'SOFKRS-1']])

  it('hands a queued address job to the live ticket session through the watch', () => {
    const jobs = handAddressToLiveTicket([address, watch], new Set(['SOFKRS-1']), mrTickets, 50)
    expect(jobs[0].state).toBe('finished')
    expect(jobs[1].isCommentsPending).toBe(true)
  })

  it('leaves the jobs alone without a live ticket session', () => {
    const jobs = [address, watch]
    expect(handAddressToLiveTicket(jobs, new Set(), mrTickets, 50)).toBe(jobs)
  })
})

describe('nextJobState', () => {
  it('keeps starting without a session', () => {
    expect(nextJobState(jobWith({ state: 'starting' }), null)).toBe('starting')
  })

  it('follows the session status', () => {
    expect(nextJobState(jobWith({ state: 'starting' }), sessionWith('working'))).toBe('working')
    expect(nextJobState(jobWith({ state: 'working' }), sessionWith('waiting'))).toBe('waiting')
    expect(nextJobState(jobWith({ state: 'working' }), sessionWith('closed'))).toBe('finished')
  })

  it('a closed session that is not asleep still finishes the job', () => {
    expect(nextJobState(jobWith({ state: 'waiting' }), { ...sessionWith('closed'), isAsleep: false })).toBe('finished')
  })

  it('a slept session keeps its job state', () => {
    expect(nextJobState(jobWith({ state: 'waiting' }), { ...sessionWith('closed'), isAsleep: true })).toBe('waiting')
  })

  it('treats checkout as a turn end for tickets and as the end for MR jobs', () => {
    expect(nextJobState(jobWith({ state: 'working' }), sessionWith('checkout'))).toBe('waiting')
    expect(nextJobState(jobWith({ state: 'working', kind: 'review' }), sessionWith('checkout'))).toBe('finished')
    expect(nextJobState(jobWith({ state: 'working', kind: 'address' }), sessionWith('checkout'))).toBe('finished')
  })

  it('sends a ticket turn that ends in checkout with a fresh handoff.md to handoff, not finished', () => {
    const job = jobWith({ state: 'working' })
    expect(nextJobState(job, sessionWith('checkout'))).not.toBe('finished')
    expect(handoffStopAction(job, 'working', 'checkout', 1000, 900)).toBe('auto')
    expect(handoffStopAction({ ...job, autonomy: 'manual' }, 'working', 'checkout', 1000, 900)).toBe('hold')
  })

  it('keeps handoff on checkout while a handoff phase is active', () => {
    expect(nextJobState(jobWith({ state: 'handoff', handoffPhase: 'handoff' }), sessionWith('checkout'))).toBe('handoff')
  })

  it('keeps handoff until the phase returns to none', () => {
    expect(nextJobState(jobWith({ state: 'handoff', handoffPhase: 'clearing' }), sessionWith('idle'))).toBe('handoff')
    expect(nextJobState(jobWith({ state: 'handoff', handoffPhase: 'none' }), sessionWith('working'))).toBe('working')
  })
})

describe('isHandoffStop', () => {
  it('is true when the turn ended after the handoff was written', () => {
    expect(isHandoffStop('working', 'idle', 1000, 900)).toBe(true)
  })

  it('is false without a fresh handoff file', () => {
    expect(isHandoffStop('working', 'idle', null, 900)).toBe(false)
    expect(isHandoffStop('working', 'idle', 800, 900)).toBe(false)
  })

  it('is false when the session is waiting', () => {
    expect(isHandoffStop('working', 'waiting', 1000, 900)).toBe(false)
  })
})

describe('nextHandoffStep', () => {
  it('walks handoff, clearing, resuming, none', () => {
    expect(nextHandoffStep('handoff', 'working', 'idle')).toEqual({ phase: 'clearing', action: 'clear' })
    expect(nextHandoffStep('clearing', 'idle', 'idle')).toEqual({ phase: 'resuming', action: 'resume' })
    expect(nextHandoffStep('resuming', 'idle', 'working')).toEqual({ phase: 'none', action: 'none' })
  })

  it('stays in handoff while waiting', () => {
    expect(nextHandoffStep('handoff', 'working', 'waiting')).toEqual({ phase: 'handoff', action: 'none' })
  })

  it('resumes after a clear that ends in checkout', () => {
    expect(nextHandoffStep('clearing', 'working', 'checkout')).toEqual({ phase: 'resuming', action: 'resume' })
  })
})

describe('handoffStopAction', () => {
  it('ignores turns without a fresh handoff', () => {
    expect(handoffStopAction(validJob, 'working', 'idle', null, 900)).toBe('none')
    expect(handoffStopAction(validJob, undefined, 'idle', 1000, 900)).toBe('none')
  })

  it('falls back to the manual stop after the automatic handoff limit', () => {
    expect(handoffStopAction({ ...validJob, autoHandoffs: AUTO_HANDOFF_LIMIT - 1 }, 'working', 'idle', 1000, 900)).toBe('auto')
    expect(handoffStopAction({ ...validJob, autoHandoffs: AUTO_HANDOFF_LIMIT }, 'working', 'idle', 1000, 900)).toBe('limit')
    expect(AUTO_HANDOFF_LIMIT).toBe(2)
  })

  it('resets the count when a job is queued again', () => {
    expect(requeueJob({ ...validJob, state: 'finished', autoHandoffs: 2 }, 5).autoHandoffs).toBe(0)
  })
})

describe('resumePrompt', () => {
  it('points at the handoff file and continues', () => {
    const now = new Date(2026, 10, 23)
    const prompt = resumePrompt('SOFKRS-1', now)
    expect(prompt).toContain(handoffPath('SOFKRS-1', now))
    expect(prompt).toContain('kontynuuj')
    expect(prompt).not.toContain('czekaj')
  })
})

describe('newJob', () => {
  it('queues a ticket with its autonomy', () => {
    const job = newJob({ kind: 'ticket', key: 'SOFKRS-1', title: 'Fix', repo: 'r', autonomy: 'autonomous' }, 5, false)
    expect(job).toMatchObject({ id: 'ticket:SOFKRS-1', state: 'queued', autonomy: 'autonomous', lastSeenNoteId: null, createdAt: 5 })
  })

  it('gives a ticket the permissions-only routine level when asked', () => {
    expect(newJob({ kind: 'ticket', key: 'K', title: '', repo: null, autonomy: 'routine' }, 1, false).autonomy).toBe('routine')
  })

  it('sets MR jobs to routine', () => {
    expect(newJob({ kind: 'review', key: '1!2', title: '', repo: null, autonomy: 'autonomous' }, 1, false).autonomy).toBe('routine')
    expect(newJob({ kind: 'watch', key: '1!2', title: '', repo: null, autonomy: 'manual' }, 1, false).autonomy).toBe('routine')
  })

  it('starts a watch as working, acting on existing notes only with open threads', () => {
    expect(newJob({ kind: 'watch', key: '1!2', title: '', repo: null, autonomy: 'routine' }, 1, false)).toMatchObject({ state: 'working', lastSeenNoteId: null })
    expect(newJob({ kind: 'watch', key: '1!2', title: '', repo: null, autonomy: 'routine' }, 1, true).lastSeenNoteId).toBe(0)
  })
})

describe('queueAddressJob', () => {
  it('adds a queued routine address job', () => {
    const jobs = queueAddressJob([], '1!2', 'MR', 7)
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({ id: 'address:1!2', kind: 'address', state: 'queued', autonomy: 'routine', createdAt: 7 })
  })

  it('leaves a running address job alone', () => {
    const jobs = queueAddressJob([], '1!2', 'MR', 7).map((j) => ({ ...j, state: 'working' as const }))
    expect(queueAddressJob(jobs, '1!2', 'MR', 9)).toBe(jobs)
  })

  it('requeues a finished address job', () => {
    const jobs = queueAddressJob([], '1!2', 'MR', 7).map((j) => ({ ...j, state: 'finished' as const, sessionId: 'old' }))
    expect(queueAddressJob(jobs, '1!2', 'MR', 9)[0]).toMatchObject({ state: 'queued', sessionId: null, createdAt: 9 })
  })
})

describe('requeueJob', () => {
  it('queues a finished job again, keeping its log', () => {
    const job = requeueJob({ ...validJob, state: 'failed', handoffPhase: 'clearing' }, 99)
    expect(job).toMatchObject({ state: 'queued', sessionId: null, handoffPhase: 'none', createdAt: 99 })
    expect(job.log.map((l) => l.text)).toEqual(['started', 'queued again'])
  })

  it('puts a watch back to watching', () => {
    expect(requeueJob({ ...validJob, kind: 'watch', state: 'finished' }, 1).state).toBe('working')
  })

  it('isJobOver is true only for finished and failed', () => {
    expect(isJobOver({ ...validJob, state: 'finished' })).toBe(true)
    expect(isJobOver({ ...validJob, state: 'failed' })).toBe(true)
    expect(isJobOver({ ...validJob, state: 'waiting' })).toBe(false)
  })
})

describe('isClearConfirmed', () => {
  const before = { sessionId: 'a', contextTokens: 120_000, clearLinks: ['x>a'] }

  it('is false while nothing changed', () => {
    expect(isClearConfirmed(before, { ...before, contextTokens: 118_000 })).toBe(false)
  })

  it('is true on a new session id', () => {
    expect(isClearConfirmed(before, { ...before, sessionId: 'b' })).toBe(true)
  })

  it('is true on a new clear link', () => {
    expect(isClearConfirmed(before, { ...before, clearLinks: ['x>a', 'y>a'] })).toBe(true)
  })

  it('is true when the context dropped sharply', () => {
    expect(isClearConfirmed(before, { ...before, contextTokens: 20_000 })).toBe(true)
  })

  it('ignores unknown token counts', () => {
    expect(isClearConfirmed({ ...before, contextTokens: null }, { ...before, contextTokens: 0 })).toBe(false)
    expect(isClearConfirmed(before, { ...before, contextTokens: null })).toBe(false)
  })
})

describe('isHandoffStalled', () => {
  it('stalls clearing and resuming after the limit', () => {
    expect(isHandoffStalled('clearing', 'idle', 301, 300)).toBe(true)
    expect(isHandoffStalled('resuming', 'working', 301, 300)).toBe(true)
    expect(isHandoffStalled('clearing', 'idle', 300, 300)).toBe(false)
  })

  it('stalls handoff only when the session rests', () => {
    expect(isHandoffStalled('handoff', 'idle', 301, 300)).toBe(true)
    expect(isHandoffStalled('handoff', 'working', 301, 300)).toBe(false)
    expect(isHandoffStalled('handoff', 'waiting', 301, 300)).toBe(false)
  })

  it('never stalls without a phase', () => {
    expect(isHandoffStalled('none', 'idle', 10_000, 300)).toBe(false)
  })
})

describe('nextHandoffTick', () => {
  it('clears after a long working handoff turn instead of stalling', () => {
    expect(isHandoffClockReset('handoff', 'working')).toBe(true)
    expect(nextHandoffTick('handoff', 'working', 'idle', false, 10 * 60_000, 5 * 60_000)).toEqual({ phase: 'clearing', action: 'clear' })
  })

  it('stalls a handoff that rests idle past the limit', () => {
    expect(isHandoffClockReset('handoff', 'idle')).toBe(false)
    expect(nextHandoffTick('handoff', 'idle', 'idle', false, 5 * 60_000 + 1, 5 * 60_000)).toEqual({ phase: 'none', action: 'stall' })
  })

  it('waits in clearing until the clear is confirmed, then resumes', () => {
    expect(nextHandoffTick('clearing', 'idle', 'idle', false, 1000, 5 * 60_000)).toEqual({ phase: 'clearing', action: 'none' })
    expect(nextHandoffTick('clearing', 'idle', 'idle', true, 1000, 5 * 60_000)).toEqual({ phase: 'resuming', action: 'resume' })
  })

  it('stalls an unconfirmed clear after the limit', () => {
    expect(nextHandoffTick('clearing', 'idle', 'idle', false, 5 * 60_000 + 1, 5 * 60_000)).toEqual({ phase: 'none', action: 'stall' })
  })

  it('never resets the clock outside the handoff phase', () => {
    expect(isHandoffClockReset('resuming', 'working')).toBe(false)
  })
})

describe('requeueFromRequest', () => {
  it('takes title, repo and autonomy from the new request', () => {
    const old: Job = { ...validJob, state: 'failed', autonomy: 'autonomous', repo: null, title: 'old' }
    const job = requeueFromRequest(old, { kind: 'ticket', key: 'SOFKRS-1', title: 'new', repo: 'r2', autonomy: 'manual' }, 5)
    expect(job).toMatchObject({ state: 'queued', autonomy: 'manual', repo: 'r2', title: 'new', createdAt: 5 })
    expect(job.log.map((l) => l.text)).toEqual(['started', 'queued again'])
  })

  it('keeps MR jobs on routine', () => {
    const old: Job = { ...validJob, id: 'review:1!2', kind: 'review', key: '1!2', state: 'finished', autonomy: 'routine' }
    expect(requeueFromRequest(old, { kind: 'review', key: '1!2', title: 'MR', repo: null, autonomy: 'autonomous' }, 5).autonomy).toBe('routine')
  })
})

describe('followSession', () => {
  it('follows continuation links to the newest session', () => {
    expect(followSession('a', new Map([['a', 'b'], ['b', 'c']]), ['a', 'b', 'c'])).toBe('c')
  })

  it('resolves a short id by prefix', () => {
    expect(followSession('abcd1234', new Map(), ['abcd1234-full'])).toBe('abcd1234-full')
  })

  it('stops on a cycle', () => {
    expect(['a', 'b']).toContain(followSession('a', new Map([['a', 'b'], ['b', 'a']]), ['a', 'b']))
  })
})

describe('isHandoffHeld', () => {
  const view = (status: SessionView['status']): SessionView => ({ id: 'abc', status, ticket: 'SOFKRS-1', isLive: true })
  const held: Job = { ...validJob, state: 'handoff' }

  it('keeps a manual handoff stop while the session rests', () => {
    expect(isHandoffHeld(held, view('idle'))).toBe(true)
    expect(isHandoffHeld(held, view('waiting'))).toBe(true)
  })

  it('releases it once the session works or closes', () => {
    expect(isHandoffHeld(held, view('working'))).toBe(false)
    expect(isHandoffHeld(held, view('closed'))).toBe(false)
    expect(isHandoffHeld(held, null)).toBe(false)
    expect(isHandoffHeld({ ...held, handoffPhase: 'clearing' }, view('idle'))).toBe(false)
  })
})

describe('isPromptSkipping', () => {
  it('detects the skip flags', () => {
    expect(isPromptSkipping('claude.exe --dangerously-skip-permissions')).toBe(true)
    expect(isPromptSkipping('claude.exe --permission-mode bypassPermissions')).toBe(true)
    expect(isPromptSkipping('claude.exe --permission-mode=bypassPermissions')).toBe(true)
  })

  it('ignores other modes', () => {
    expect(isPromptSkipping('claude.exe --permission-mode acceptEdits')).toBe(false)
  })
})

describe('adoptJob', () => {
  const session = { id: 'abcdef1234567890', ticket: 'SOFRMPT-1', repo: 'C:/repo', title: 'Fix focus' }

  it('makes a working manual ticket job that owns the session', () => {
    const job = adoptJob(session, 5)
    expect(job).toMatchObject({ id: 'ticket:SOFRMPT-1', kind: 'ticket', key: 'SOFRMPT-1', title: 'Fix focus', repo: 'C:/repo', autonomy: 'manual', state: 'working', sessionId: 'abcdef1234567890' })
    expect(job.log).toEqual([{ at: 5, text: 'adopted' }])
  })
})

describe('isAdopted', () => {
  it('is true when a job already owns the session', () => {
    const job = adoptJob({ id: 's1', ticket: 'A-1', repo: null, title: '' }, 1)
    expect(isAdopted([job], 's1')).toBe(true)
    expect(isAdopted([job], 's2')).toBe(false)
  })
})

describe('withAdopted', () => {
  const adopted = adoptJob({ id: 's2', ticket: 'A-1', repo: null, title: '' }, 9)

  it('replaces a finished job of the same ticket', () => {
    const finished = { ...adoptJob({ id: 's1', ticket: 'A-1', repo: null, title: '' }, 1), state: 'finished' as const }
    expect(withAdopted([finished], adopted)).toEqual([adopted])
  })

  it('refuses when a running job owns the same ticket', () => {
    const queued = { ...adopted, sessionId: null, state: 'queued' as const }
    expect(withAdopted([queued], adopted)).toBeNull()
  })

  it('adds the job when nothing owns the ticket', () => {
    expect(withAdopted([], adopted)).toEqual([adopted])
  })
})
