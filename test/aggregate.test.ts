import { describe, it, expect } from 'vitest'
import { buildSessions, computeOpen } from '../src/main/aggregate'

const now = 1_000_000

describe('computeOpen', () => {
  const raw = [
    { id: 'old', cwd: 'C:\\x\\krs', mtimeMs: 100 },
    { id: 'new', cwd: 'C:\\x\\krs', mtimeMs: 200 },
    { id: 'web', cwd: 'C:\\x\\web', mtimeMs: 50 }
  ]

  it('marks the newest session of each locked folder as open', () => {
    const out = computeOpen({}, raw, [], ['C:\\x\\krs'])
    expect(out).toEqual({ new: 'c:/x/krs' })
  })
  it('also adds a running --resume id in a locked folder (multiple sessions per window)', () => {
    const out = computeOpen({}, raw, ['old'], ['C:\\x\\krs'])
    expect(out).toEqual({ old: 'c:/x/krs', new: 'c:/x/krs' })
  })
  it('ignores sessions whose folder is not locked', () => {
    expect(computeOpen({}, raw, ['web'], ['C:\\x\\krs'])).toEqual({ new: 'c:/x/krs' })
  })
  it('keeps a previously open id while its folder stays locked', () => {
    const out = computeOpen({ old: 'c:/x/krs' }, raw, [], ['c:/x/krs'])
    expect(out.old).toBe('c:/x/krs')
  })
  it('drops everything once the folder is no longer locked', () => {
    const out = computeOpen({ old: 'c:/x/krs' }, raw, ['new'], ['c:/x/web'])
    expect(out).toEqual({ web: 'c:/x/web' })
  })
})

describe('buildSessions', () => {
  it('marks a session live (open) and working when its id is open and recent', () => {
    const out = buildSessions(
      [{ id: 'a', cwd: 'C:\\X\\krs', gitBranch: null, firstPrompt: null, mtimeMs: now - 1000, needsInput: false, active: false, done: false, pendingToolUse: false, model: null, contextTokens: null }],
      ['a'],
      now
    )
    expect(out[0].isLive).toBe(true)
    expect(out[0].status).toBe('working')
  })

  it('is closed when not open', () => {
    const out = buildSessions(
      [{ id: 'a', cwd: 'C:\\X\\krs', gitBranch: null, firstPrompt: null, mtimeMs: now, needsInput: true, active: false, done: false, pendingToolUse: false, model: null, contextTokens: null }],
      [],
      now
    )
    expect(out[0].isLive).toBe(false)
    expect(out[0].status).toBe('closed')
  })

  it('is idle when open and quiet, nothing pending', () => {
    const out = buildSessions(
      [{ id: 'a', cwd: 'C:\\X\\krs', gitBranch: null, firstPrompt: null, mtimeMs: now - 600_000, needsInput: false, active: false, done: false, pendingToolUse: false, model: null, contextTokens: null }],
      ['a'],
      now
    )
    expect(out[0].status).toBe('idle')
  })

  it('is waiting when open, stalled, and a tool use is pending', () => {
    const out = buildSessions(
      [{ id: 'a', cwd: 'C:\\X\\krs', gitBranch: null, firstPrompt: null, mtimeMs: now - 60_000, needsInput: true, active: false, done: false, pendingToolUse: false, model: null, contextTokens: null }],
      ['a'],
      now
    )
    expect(out[0].status).toBe('waiting')
  })

  it('derives ticket, projectName, lastActive, and defaults watched/name', () => {
    const [s] = buildSessions(
      [{ id: 'a', cwd: 'C:\\X\\krs-fo-web', gitBranch: 'feat/SOFKAN-9-z', firstPrompt: 'hi', mtimeMs: now, needsInput: false, active: false, done: false, pendingToolUse: false, model: null, contextTokens: null }],
      [],
      now
    )
    expect(s.ticket).toBe('SOFKAN-9')
    expect(s.projectName).toBe('krs-fo-web')
    expect(s.lastActive).toBe(now)
    expect(s.watched).toBe(false)
    expect(s.name).toBe(null)
  })

  it('sorts working before waiting before idle, then by recency', () => {
    const out = buildSessions(
      [
        { id: 'idleNew', cwd: 'C:\\X\\a', gitBranch: null, firstPrompt: null, mtimeMs: now, needsInput: false, active: false, done: false, pendingToolUse: false, model: null, contextTokens: null },
        { id: 'openWaiting', cwd: 'C:\\X\\krs', gitBranch: null, firstPrompt: null, mtimeMs: now - 60_000, needsInput: true, active: false, done: false, pendingToolUse: false, model: null, contextTokens: null }
      ],
      ['openWaiting'],
      now
    )
    expect(out[0].id).toBe('openWaiting')
    expect(out[1].id).toBe('idleNew')
  })
})
