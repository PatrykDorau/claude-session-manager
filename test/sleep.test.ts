import { describe, it, expect, vi } from 'vitest'
import { pruneSlept, sessionsToSleep, sleepSession, sleptAtOf, SLEEP_HOUR_MS, type SleepCandidate } from '../src/main/sleep'
import { nextJobState, type Job } from '../src/main/orchestrator'

const NOW = 1_000_000_000_000

const candidate = (overrides: Partial<SleepCandidate> = {}): SleepCandidate => ({
  id: 'S-1',
  status: 'idle',
  isBackground: true,
  transcriptMtimeMs: NOW - 8 * SLEEP_HOUR_MS - 1,
  markerMtimesMs: [],
  lastInputAt: null,
  ...overrides
})

describe('sessionsToSleep', () => {
  it('sleeps an idle background session after 8 h', () => {
    expect(sessionsToSleep([candidate()], NOW, 8)).toEqual(['S-1'])
  })

  it('sleeps a checkout session after 8 h', () => {
    expect(sessionsToSleep([candidate({ status: 'checkout' })], NOW, 8)).toEqual(['S-1'])
  })

  it('never sleeps waiting or working sessions', () => {
    const old = NOW - 20 * SLEEP_HOUR_MS
    const result = sessionsToSleep(
      [
        candidate({ id: 'W', status: 'waiting', transcriptMtimeMs: old }),
        candidate({ id: 'K', status: 'working', transcriptMtimeMs: old })
      ],
      NOW,
      8
    )
    expect(result).toEqual([])
  })

  it('never sleeps a non-background session', () => {
    expect(sessionsToSleep([candidate({ isBackground: false })], NOW, 8)).toEqual([])
  })

  it('keeps a session at exactly 8 h', () => {
    expect(sessionsToSleep([candidate({ transcriptMtimeMs: NOW - 8 * SLEEP_HOUR_MS })], NOW, 8)).toEqual([])
  })

  it('a fresh marker postpones sleep', () => {
    const result = sessionsToSleep(
      [candidate({ transcriptMtimeMs: NOW - 20 * SLEEP_HOUR_MS, markerMtimesMs: [NOW - SLEEP_HOUR_MS] })],
      NOW,
      8
    )
    expect(result).toEqual([])
  })

  it('recent input postpones sleep', () => {
    const result = sessionsToSleep(
      [candidate({ transcriptMtimeMs: NOW - 20 * SLEEP_HOUR_MS, lastInputAt: NOW - SLEEP_HOUR_MS })],
      NOW,
      8
    )
    expect(result).toEqual([])
  })

  it('honours the configured hours', () => {
    expect(sessionsToSleep([candidate({ transcriptMtimeMs: NOW - 3 * SLEEP_HOUR_MS })], NOW, 2)).toEqual(['S-1'])
  })

  it('does not sleep a session that became waiting since the tick', () => {
    expect(sessionsToSleep([candidate()], NOW, 8)).toEqual(['S-1'])
    expect(sessionsToSleep([candidate({ status: 'waiting' })], NOW, 8)).toEqual([])
  })
})

describe('pruneSlept', () => {
  it('drops live ids', () => {
    expect(pruneSlept({ a: 1, b: 2 }, new Set(['a']))).toEqual({ b: 2 })
  })
})

describe('sleptAtOf', () => {
  it('prefers the persisted time, then the in-flight one', () => {
    const sleeping = new Map([['b', 5]])
    expect(sleptAtOf({ a: 1 }, sleeping, 'a')).toBe(1)
    expect(sleptAtOf({ a: 1 }, sleeping, 'b')).toBe(5)
    expect(sleptAtOf({ a: 1 }, sleeping, 'c')).toBeNull()
  })
})

describe('sleepSession', () => {
  const job = { state: 'waiting', handoffPhase: 'none', kind: 'ticket' } as unknown as Job

  it('keeps the job while the stop pushes a closed session, then marks it asleep', async () => {
    const sleeping = new Map<string, number>()
    const slept: Record<string, number> = {}
    const seen: string[] = []
    const pushDuringStop = (): void => {
      const view = { id: 'S-1', status: 'closed' as const, ticket: null, isLive: false, isAsleep: !!sleptAtOf(slept, sleeping, 'S-1') }
      seen.push(nextJobState(job, view))
    }
    const stop = async (): Promise<{ error: string | null }> => {
      pushDuringStop()
      return { error: null }
    }
    const mark = (id: string, at: number): void => {
      slept[id] = at
    }
    expect(await sleepSession('S-1', NOW, sleeping, stop, mark)).toBe(true)
    expect(seen).toEqual(['waiting'])
    expect(slept).toEqual({ 'S-1': NOW })
    expect(sleeping.size).toBe(0)
  })

  it('does not mark a session whose stop failed', async () => {
    const sleeping = new Map<string, number>()
    const mark = vi.fn()
    const stop = async (): Promise<{ error: string | null }> => ({ error: 'still running' })
    expect(await sleepSession('S-1', NOW, sleeping, stop, mark)).toBe(false)
    expect(mark).not.toHaveBeenCalled()
    expect(sleeping.size).toBe(0)
  })

  it('clears the in-flight entry when the stop throws', async () => {
    const sleeping = new Map<string, number>()
    const stop = async (): Promise<{ error: string | null }> => {
      throw new Error('boom')
    }
    await expect(sleepSession('S-1', NOW, sleeping, stop, vi.fn())).rejects.toThrow('boom')
    expect(sleeping.size).toBe(0)
  })
})
