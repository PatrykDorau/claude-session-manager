import { describe, it, expect } from 'vitest'
import { computeFinished, branchKey, type FinishCtx } from '../src/main/finished'

function ctx(over: Partial<FinishCtx> = {}): FinishCtx {
  return {
    finished: new Set(),
    optOut: new Set(),
    jiraStatus: new Map(),
    branchDone: new Map(),
    accepting: 'Accepted, Done, Closed',
    ...over
  }
}

describe('computeFinished', () => {
  it('manual finished wins over everything', () => {
    const c = ctx({ finished: new Set(['a']) })
    expect(computeFinished({ id: 'a', ticket: 'X-1', gitBranch: 'b' }, 'k', c).finished).toBe(true)
  })
  it('optOut forces not-finished even if Jira accepts', () => {
    const c = ctx({ optOut: new Set(['a']), jiraStatus: new Map([['X-1', 'Accepted']]) })
    expect(computeFinished({ id: 'a', ticket: 'X-1', gitBranch: null }, 'k', c).finished).toBe(false)
  })
  it('ticketed session finishes on accepting Jira status and exposes the status', () => {
    const c = ctx({ jiraStatus: new Map([['X-1', 'Accepted']]) })
    const r = computeFinished({ id: 'a', ticket: 'X-1', gitBranch: null }, 'k', c)
    expect(r.finished).toBe(true)
    expect(r.jiraStatus).toBe('Accepted')
  })
  it('ticketed session not finished on a non-accepting status', () => {
    const c = ctx({ jiraStatus: new Map([['X-1', 'In Progress']]) })
    expect(computeFinished({ id: 'a', ticket: 'X-1', gitBranch: null }, 'k', c).finished).toBe(false)
  })
  it('ticketed session ignores git branchDone entirely', () => {
    const c = ctx({ branchDone: new Map([[branchKey('k', 'b'), true]]) })
    expect(computeFinished({ id: 'a', ticket: 'X-1', gitBranch: 'b' }, 'k', c).finished).toBe(false)
  })
  it('ticket-less branch session finishes when its branch is done', () => {
    const c = ctx({ branchDone: new Map([[branchKey('k', 'b'), true]]) })
    const r = computeFinished({ id: 'a', ticket: null, gitBranch: 'b' }, 'k', c)
    expect(r.finished).toBe(true)
    expect(r.jiraStatus).toBe(null)
  })
  it('session with neither ticket nor branch is never auto-finished', () => {
    expect(computeFinished({ id: 'a', ticket: null, gitBranch: null }, 'k', ctx()).finished).toBe(
      false
    )
  })
})
