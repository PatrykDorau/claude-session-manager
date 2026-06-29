import { describe, it, expect } from 'vitest'
import { deriveStatus } from '../src/main/status'

const now = 1_000_000
const base = {
  isLive: true,
  needsInput: false,
  active: false,
  done: false,
  pendingToolUse: false,
  mtimeMs: now,
  nowMs: now
}

describe('deriveStatus', () => {
  it('closed when not open', () => {
    expect(deriveStatus({ ...base, isLive: false, needsInput: true, active: true })).toBe('closed')
  })
  it('waiting when the needs-input marker is set (even mid-turn)', () => {
    expect(deriveStatus({ ...base, needsInput: true, active: true, mtimeMs: now - 60_000 })).toBe(
      'waiting'
    )
  })
  it('working while the active-turn marker is set, even with a stale mtime (thinking)', () => {
    expect(deriveStatus({ ...base, active: true, mtimeMs: now - 60_000 })).toBe('working')
  })
  it('working when a tool is executing even if mtime is stale', () => {
    expect(deriveStatus({ ...base, pendingToolUse: true, mtimeMs: now - 60_000 })).toBe('working')
  })
  it('checkout when the turn ended (done) and not active', () => {
    expect(deriveStatus({ ...base, done: true, mtimeMs: now - 60_000 })).toBe('checkout')
  })
  it('working overrides done while a new turn is active', () => {
    expect(deriveStatus({ ...base, done: true, active: true })).toBe('working')
  })
  it('working when recently written (no hook markers)', () => {
    expect(deriveStatus({ ...base, mtimeMs: now - 1000 })).toBe('working')
  })
  it('idle when open, quiet, nothing pending, no markers', () => {
    expect(deriveStatus({ ...base, mtimeMs: now - 60_000 })).toBe('idle')
  })
})
