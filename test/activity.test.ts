import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  FOCUS_PING_MS,
  surfaceTicket,
  startFocusPing
} from '../src/renderer/src/dashboard/activity'

type Surface = Parameters<typeof surfaceTicket>[0]

const ticketSurface = (): Surface => ({ kind: 'ticket', key: 'ABC-1' })
const sessionWithoutTicket = (): Surface => ({ kind: 'session', ticket: null })
const noSurface = (): Surface => null
const isFocused = (): boolean => true
const isUnfocused = (): boolean => false

describe('surfaceTicket', () => {
  it('uses the ticket of a session', () => {
    expect(surfaceTicket({ kind: 'session', ticket: 'ABC-1' })).toBe('ABC-1')
  })
  it('gives null for a session without a ticket', () => {
    expect(surfaceTicket({ kind: 'session', ticket: null })).toBeNull()
  })
  it('uses the key of a ticket view', () => {
    expect(surfaceTicket({ kind: 'ticket', key: 'ABC-2' })).toBe('ABC-2')
  })
  it('uses the ticket of an MR', () => {
    expect(surfaceTicket({ kind: 'mr', ticket: 'ABC-3' })).toBe('ABC-3')
    expect(surfaceTicket({ kind: 'mr', ticket: null })).toBeNull()
  })
  it('uses the ticket of the code view', () => {
    expect(surfaceTicket({ kind: 'code', ticket: 'ABC-4' })).toBe('ABC-4')
  })
  it('gives undefined without a surface', () => {
    expect(surfaceTicket(null)).toBeUndefined()
  })
})

describe('startFocusPing', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('pings every 60 s', () => {
    expect(FOCUS_PING_MS).toBe(60_000)
  })

  it('marks the surface ticket every interval while focused', () => {
    const mark = vi.fn()
    startFocusPing(ticketSurface, isFocused, mark, FOCUS_PING_MS)
    vi.advanceTimersByTime(FOCUS_PING_MS - 1)
    expect(mark).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(mark).toHaveBeenCalledWith('ABC-1')
    vi.advanceTimersByTime(FOCUS_PING_MS)
    expect(mark).toHaveBeenCalledTimes(2)
  })

  it('marks null for a session without a ticket', () => {
    const mark = vi.fn()
    startFocusPing(sessionWithoutTicket, isFocused, mark, FOCUS_PING_MS)
    vi.advanceTimersByTime(FOCUS_PING_MS)
    expect(mark).toHaveBeenCalledWith(null)
  })

  it('does nothing while unfocused', () => {
    const mark = vi.fn()
    startFocusPing(ticketSurface, isUnfocused, mark, FOCUS_PING_MS)
    vi.advanceTimersByTime(FOCUS_PING_MS * 3)
    expect(mark).not.toHaveBeenCalled()
  })

  it('does nothing without a surface', () => {
    const mark = vi.fn()
    startFocusPing(noSurface, isFocused, mark, FOCUS_PING_MS)
    vi.advanceTimersByTime(FOCUS_PING_MS * 3)
    expect(mark).not.toHaveBeenCalled()
  })

  it('reads the current surface on every ping', () => {
    const mark = vi.fn()
    let key = 'ABC-1'
    const current = (): Surface => ({ kind: 'ticket', key })
    startFocusPing(current, isFocused, mark, FOCUS_PING_MS)
    vi.advanceTimersByTime(FOCUS_PING_MS)
    key = 'ABC-2'
    vi.advanceTimersByTime(FOCUS_PING_MS)
    expect(mark.mock.calls).toEqual([['ABC-1'], ['ABC-2']])
  })

  it('stops after the stop function', () => {
    const mark = vi.fn()
    const stop = startFocusPing(ticketSurface, isFocused, mark, FOCUS_PING_MS)
    vi.advanceTimersByTime(FOCUS_PING_MS)
    stop()
    vi.advanceTimersByTime(FOCUS_PING_MS * 3)
    expect(mark).toHaveBeenCalledTimes(1)
  })
})
