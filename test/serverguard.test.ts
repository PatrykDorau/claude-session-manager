import { describe, expect, it } from 'vitest'
import { serverAction, userStoppedMessage } from '../src/main/serverguard'

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
