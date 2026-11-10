import { describe, it, expect } from 'vitest'
import { ticketFromPath, isAuthorized } from '../src/main/bridge'

describe('ticketFromPath', () => {
  it('reads the ticket from a task worktree folder', () => {
    expect(ticketFromPath(String.raw`C:\Projekty\telco\tigo-fo-smarttv\.claude\worktrees\SOFNJJ-2537`)).toBe('SOFNJJ-2537')
    expect(ticketFromPath('C:/p/repo/.claude/worktrees/SOFRMPT-3868/src')).toBe('SOFRMPT-3868')
  })
  it('gives nothing for a plain checkout', () => {
    expect(ticketFromPath('C:/Projekty/telco/tigo-fo-smarttv')).toBeNull()
  })
})

describe('isAuthorized', () => {
  it('accepts only the exact token', () => {
    expect(isAuthorized({ 'x-cockpit-token': 'abc' }, 'abc')).toBe(true)
    expect(isAuthorized({ 'x-cockpit-token': 'abd' }, 'abc')).toBe(false)
    expect(isAuthorized({}, 'abc')).toBe(false)
  })
})
