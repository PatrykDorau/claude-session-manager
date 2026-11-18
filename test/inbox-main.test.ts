import { describe, it, expect } from 'vitest'
import { inboxReason, isAnswerCurrent, isFinishedNotifiable, finishedTransitions } from '../src/main/inbox'
import { optionKey, PERMISSION_KEYS } from '../src/renderer/src/dashboard/inbox'

const tool = { name: 'Bash', input: 'ls', toolUseId: 't1' }

describe('inboxReason', () => {
  it('names why a session needs the user', () => {
    expect(inboxReason('checkout', { pendingTool: null, isOpaqueRequest: false, isQuestion: false })).toBe('finished')
    expect(inboxReason('waiting', { pendingTool: null, isOpaqueRequest: false, isQuestion: true })).toBe('question')
    expect(inboxReason('waiting', { pendingTool: tool, isOpaqueRequest: false, isQuestion: false })).toBe('permission')
    expect(inboxReason('waiting', { pendingTool: null, isOpaqueRequest: true, isQuestion: false })).toBe('permission')
  })
  it('is null for sessions that do not need the user', () => {
    expect(inboxReason('idle', { pendingTool: null, isOpaqueRequest: false, isQuestion: false })).toBeNull()
  })
})

describe('answer keys', () => {
  it('maps permission answers and option indexes to terminal keys', () => {
    expect(PERMISSION_KEYS).toEqual({ yes: '1', always: '2', no: '3' })
    expect(optionKey(0)).toBe('1')
    expect(optionKey(2)).toBe('3')
  })
})

describe('isAnswerCurrent', () => {
  it('accepts only the same pending request of a waiting session', () => {
    expect(isAnswerCurrent({ status: 'waiting', toolUseId: 't1' }, 't1')).toBe(true)
    expect(isAnswerCurrent({ status: 'waiting', toolUseId: 't2' }, 't1')).toBe(false)
    expect(isAnswerCurrent({ status: 'working', toolUseId: 't1' }, 't1')).toBe(false)
    expect(isAnswerCurrent({ status: 'waiting', toolUseId: null }, 't1')).toBe(false)
  })
})

describe('isFinishedNotifiable', () => {
  it('skips only the session the user is looking at in a focused dashboard', () => {
    expect(isFinishedNotifiable('a', { isFocused: true, viewingId: 'a' })).toBe(false)
    expect(isFinishedNotifiable('a', { isFocused: false, viewingId: 'a' })).toBe(true)
    expect(isFinishedNotifiable('a', { isFocused: true, viewingId: 'b' })).toBe(true)
  })
})

describe('finishedTransitions', () => {
  const s = (id: string, status: 'working' | 'waiting' | 'checkout' | 'idle' | 'closed', isLive = true) => ({ id, status, isLive })
  it('reports a live session that just finished its turn', () => {
    const first = finishedTransitions(new Map(), [s('a', 'working'), s('b', 'idle')])
    expect(first.finished).toEqual([])
    expect(finishedTransitions(first.next, [s('a', 'checkout'), s('b', 'checkout')]).finished).toEqual(['a', 'b'])
  })
  it('stays quiet for sessions already finished when first seen', () => {
    expect(finishedTransitions(new Map(), [s('a', 'checkout')]).finished).toEqual([])
  })
  it('stays quiet when a finished session drops out of the live list and comes back', () => {
    const seen = finishedTransitions(new Map(), [s('a', 'checkout')]).next
    const blip = finishedTransitions(seen, [s('a', 'closed', false)]).next
    expect(finishedTransitions(blip, [s('a', 'checkout')]).finished).toEqual([])
  })
  it('stays quiet when an old session is resumed straight into finished', () => {
    const closed = finishedTransitions(new Map(), [s('a', 'closed', false)]).next
    expect(finishedTransitions(closed, [s('a', 'checkout')]).finished).toEqual([])
  })
})
