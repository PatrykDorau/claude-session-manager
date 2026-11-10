import { describe, it, expect } from 'vitest'
import { terminalMode, attachArgs, resumeBackgroundArgs, pasteInput, STOP_TURN, createOpenGuard, isHandedOff } from '../src/main/terminal'

describe('terminalMode', () => {
  it('attaches a background session that nobody else is attached to', () => {
    expect(terminalMode({ isBackground: true, isLive: true, isAttachedElsewhere: false })).toBe('attach')
  })
  it('does not attach twice when the session is attached elsewhere', () => {
    expect(terminalMode({ isBackground: true, isLive: true, isAttachedElsewhere: true })).toBe('elsewhere')
  })
  it('leaves a live interactive session to VS Code', () => {
    expect(terminalMode({ isBackground: false, isLive: true, isAttachedElsewhere: false })).toBe('vscode')
  })
  it('offers to resume a closed session', () => {
    expect(terminalMode({ isBackground: false, isLive: false, isAttachedElsewhere: false })).toBe('resume')
  })
})

describe('terminal args', () => {
  it('attaches by the 8-character agent id', () => {
    expect(attachArgs('01edb0c6-135e-4504-9c5b-833736cd2587')).toEqual(['attach', '01edb0c6'])
  })
  it('resumes in the background with the ticket as name', () => {
    expect(resumeBackgroundArgs('abc', 'SOFRMPT-1')).toEqual(['--bg', '--resume', 'abc', '--name', 'SOFRMPT-1'])
    expect(resumeBackgroundArgs('abc', null)).toEqual(['--bg', '--resume', 'abc'])
  })
})

describe('pasteInput', () => {
  it('wraps a multi-line prompt in a bracketed paste and submits it', () => {
    expect(pasteInput('line 1\n"quoted" line 2')).toBe('\x1b[200~line 1\n"quoted" line 2\x1b[201~\r')
  })
  it('stops a turn with Escape', () => {
    expect(STOP_TURN).toBe('\x1b')
  })
})

describe('createOpenGuard', () => {
  it('shares one in-flight open per session instead of starting a second one', async () => {
    const guard = createOpenGuard()
    let runs = 0
    const open = (): Promise<string> => guard.run('a', async () => {
      runs += 1
      await new Promise((r) => setTimeout(r, 10))
      return 'opened'
    })
    expect(await Promise.all([open(), open()])).toEqual(['opened', 'opened'])
    expect(runs).toBe(1)
  })
  it('marks an open as cancelled when the terminal is closed while it is starting', async () => {
    const guard = createOpenGuard()
    let isStillWanted: boolean | null = null
    const pending = guard.run('a', async (isCurrent) => {
      await new Promise((r) => setTimeout(r, 10))
      isStillWanted = isCurrent()
    })
    guard.cancel('a')
    await pending
    expect(isStillWanted).toBe(false)
  })
  it('keeps a later open current after an earlier cancel', async () => {
    const guard = createOpenGuard()
    guard.cancel('a')
    expect(await guard.run('a', async (isCurrent) => isCurrent())).toBe(true)
  })
})

describe('isHandedOff', () => {
  it('treats a session handed to VS Code in the last minute as attached elsewhere', () => {
    expect(isHandedOff(1000, 50000)).toBe(true)
    expect(isHandedOff(1000, 62000)).toBe(false)
    expect(isHandedOff(undefined, 5000)).toBe(false)
  })
})
