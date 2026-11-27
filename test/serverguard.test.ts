import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { serverAction, userStoppedMessage, keptStoppedMessage, createStartRequests, START_REQUEST_MS, userStartAnswer, waitingAgentReply } from '../src/main/serverguard'

describe('serverAction', () => {
  it('blocks an automatic start after the user stopped it', () => {
    expect(serverAction({ isRunning: false, isMismatch: false, isUserStopped: true, isUserAction: false })).toBe('blocked')
  })

  it('user start clears the block', () => {
    expect(serverAction({ isRunning: false, isMismatch: false, isUserStopped: true, isUserAction: true })).toBe('start')
  })

  it('blocked call does not restart on a tenant mismatch', () => {
    expect(serverAction({ isRunning: true, isMismatch: true, isUserStopped: true, isUserAction: false })).toBe('reuse')
  })

  it('keeps today behaviour when not stopped by the user', () => {
    expect(serverAction({ isRunning: true, isMismatch: true, isUserStopped: false, isUserAction: false })).toBe('restart')
    expect(serverAction({ isRunning: true, isMismatch: false, isUserStopped: false, isUserAction: false })).toBe('reuse')
    expect(serverAction({ isRunning: false, isMismatch: false, isUserStopped: false, isUserAction: false })).toBe('start')
  })

  it('user action restarts on mismatch and reuses a running server', () => {
    expect(serverAction({ isRunning: true, isMismatch: true, isUserStopped: true, isUserAction: true })).toBe('restart')
    expect(serverAction({ isRunning: true, isMismatch: false, isUserStopped: true, isUserAction: true })).toBe('reuse')
  })
})

describe('userStoppedMessage', () => {
  it('has the exact text', () => {
    expect(userStoppedMessage('SOFKRS-1')).toBe('The dev server for SOFKRS-1 was stopped by the user. Ask the user to start it in Cockpit.')
  })
})

describe('userStartAnswer', () => {
  it('answers started when the user start succeeded', () => {
    expect(userStartAnswer({ error: null, port: 5173 })).toBe('started')
  })

  it('leaves the request waiting when the user start failed', () => {
    expect(userStartAnswer({ error: 'Folder not found: x' })).toBeNull()
  })
})

describe('waitingAgentReply', () => {
  const running = { url: 'http://localhost:5173', port: 5173, cwd: 'C:/w', label: 'krs · dev' }

  it('reuses the server the user started, whatever tenant the agent asked for', () => {
    expect(waitingAgentReply('SOFKRS-1', 'started', running)).toEqual({ key: 'SOFKRS-1', ...running, isNew: false })
  })

  it('starts with the agent choice when the user answered start', () => {
    expect(waitingAgentReply('SOFKRS-1', 'start', running)).toBe('route')
  })

  it('routes again when the started server is gone', () => {
    expect(waitingAgentReply('SOFKRS-1', 'started', null)).toBe('route')
  })

  it('tells the agent why there is no server', () => {
    expect(waitingAgentReply('SOFKRS-1', 'keep', null)).toEqual({ error: keptStoppedMessage('SOFKRS-1') })
    expect(waitingAgentReply('SOFKRS-1', 'timeout', running)).toEqual({ error: userStoppedMessage('SOFKRS-1') })
  })
})

describe('keptStoppedMessage', () => {
  it('tells the agent the user declined', () => {
    expect(keptStoppedMessage('SOFKRS-1')).toBe(
      'The user chose to keep the dev server for SOFKRS-1 stopped. Continue without it and do not start it another way.'
    )
  })
})

describe('createStartRequests', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('waits for the user and resolves with start', async () => {
    const changes: string[][] = []
    const requests = createStartRequests((keys) => changes.push(keys))
    const decision = requests.ask('SOFKRS-1')
    expect(requests.keys()).toEqual(['SOFKRS-1'])
    requests.answer('SOFKRS-1', 'start')
    await expect(decision).resolves.toBe('start')
    expect(requests.keys()).toEqual([])
    expect(changes).toEqual([['SOFKRS-1'], []])
  })

  it('resolves with keep when the user keeps it stopped', async () => {
    const requests = createStartRequests(() => undefined)
    const decision = requests.ask('SOFKRS-1')
    requests.answer('SOFKRS-1', 'keep')
    await expect(decision).resolves.toBe('keep')
  })

  it('times out when nobody answers', async () => {
    const requests = createStartRequests(() => undefined)
    const decision = requests.ask('SOFKRS-1')
    vi.advanceTimersByTime(START_REQUEST_MS - 1)
    expect(requests.keys()).toEqual(['SOFKRS-1'])
    vi.advanceTimersByTime(1)
    await expect(decision).resolves.toBe('timeout')
    expect(requests.keys()).toEqual([])
  })

  it('shares one prompt between agents asking for the same key', async () => {
    const changes: string[][] = []
    const requests = createStartRequests((keys) => changes.push(keys))
    const first = requests.ask('SOFKRS-1')
    const second = requests.ask('SOFKRS-1')
    requests.answer('SOFKRS-1', 'start')
    await expect(Promise.all([first, second])).resolves.toEqual(['start', 'start'])
    expect(changes).toEqual([['SOFKRS-1'], []])
  })

  it('ignores an answer for a key nobody asked about', () => {
    const changes: string[][] = []
    const requests = createStartRequests((keys) => changes.push(keys))
    requests.answer('SOFKRS-1', 'start')
    expect(changes).toEqual([])
  })

  it('keeps other keys waiting', async () => {
    const requests = createStartRequests(() => undefined)
    const first = requests.ask('SOFKRS-1')
    void requests.ask('SOFKRS-2')
    requests.answer('SOFKRS-1', 'keep')
    await expect(first).resolves.toBe('keep')
    expect(requests.keys()).toEqual(['SOFKRS-2'])
  })

  it('tells a waiting agent the user already started the server', async () => {
    const requests = createStartRequests(() => undefined)
    const decision = requests.ask('SOFKRS-1')
    requests.answer('SOFKRS-1', 'started')
    await expect(decision).resolves.toBe('started')
  })

  it('waits at most 90 seconds so the agent call returns before a two-minute shell timeout', () => {
    expect(START_REQUEST_MS).toBe(90_000)
  })
})
