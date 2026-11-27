import { describe, it, expect } from 'vitest'
import { isInInternalRelease, internalReleaseTransition, internalReleaseRow, internalReleaseTicket, internalReleaseBlocker } from '../src/main/internalrelease'
import type { InternalReleaseDeps } from '../src/main/internalrelease'
import type { JiraTransition } from '../src/main/jira'
import type { ReleaseCheck } from '../src/renderer/src/types'

describe('isInInternalRelease', () => {
  it('matches Internal release in any case', () => {
    expect(isInInternalRelease('Internal release')).toBe(true)
    expect(isInInternalRelease('INTERNAL  RELEASE')).toBe(true)
  })

  it('does not match Waiting for internal release', () => {
    expect(isInInternalRelease('Waiting for internal release')).toBe(false)
  })
})

describe('internalReleaseTransition', () => {
  const back = { id: '1', name: 'Back', to: 'Waiting for internal release' }
  const release = { id: '2', name: 'Release', to: 'Internal release' }

  it('finds the transition to Internal release', () => {
    expect(internalReleaseTransition([back, release])?.id).toBe('2')
  })

  it('falls back to the transition name', () => {
    expect(internalReleaseTransition([back, { id: '3', name: 'internal release', to: 'Other' }])?.id).toBe('3')
  })

  it('returns null when absent', () => {
    expect(internalReleaseTransition([back])).toBeNull()
  })
})

describe('internalReleaseRow', () => {
  const ticket = { key: 'K-1', summary: 's', status: 'Waiting for internal release' }
  const checks: ReleaseCheck[] = []

  it('names the target status of the available transition', () => {
    expect(internalReleaseRow(ticket, checks, [{ id: '2', name: 'Release', to: 'Internal release' }])).toEqual({ ...ticket, checks, transition: 'Internal release' })
  })

  it('has no transition when Jira offers none or cannot be read', () => {
    expect(internalReleaseRow(ticket, checks, []).transition).toBeNull()
    expect(internalReleaseRow(ticket, checks, null).transition).toBeNull()
  })
})

describe('internalReleaseTicket', () => {
  const makeDeps = (over: Partial<InternalReleaseDeps> = {}): { deps: InternalReleaseDeps; calls: string[] } => {
    const calls: string[] = []
    const readStatus = async (): Promise<string | null> => 'Waiting for internal release'
    const readTransitions = async (): Promise<JiraTransition[] | null> => [{ id: '9', name: 'Release', to: 'Internal release' }]
    const recordTransition = async (_key: string, id: string): Promise<boolean> => {
      calls.push(`transition ${id}`)
      return true
    }
    const recordUnassign = async (): Promise<boolean> => {
      calls.push('unassign')
      return true
    }
    const deps: InternalReleaseDeps = { status: readStatus, transitions: readTransitions, transition: recordTransition, unassign: recordUnassign, ...over }
    return { deps, calls }
  }

  it('moves to Internal release and unassigns', async () => {
    const { deps, calls } = makeDeps()
    expect(await internalReleaseTicket('K-1', deps)).toEqual({ key: 'K-1', error: null, done: ['Internal release', 'unassigned'] })
    expect(calls).toEqual(['transition 9', 'unassign'])
  })

  it('only unassigns when already in Internal release', async () => {
    const { deps, calls } = makeDeps({ status: async () => 'Internal release' })
    expect(await internalReleaseTicket('K-1', deps)).toEqual({ key: 'K-1', error: null, done: ['unassigned'] })
    expect(calls).toEqual(['unassign'])
  })

  it('reports a missing transition with the current status and does not unassign', async () => {
    const { deps, calls } = makeDeps({ transitions: async () => [] })
    expect(await internalReleaseTicket('K-1', deps)).toEqual({ key: 'K-1', error: 'Cannot move K-1 to Internal release from Waiting for internal release', done: [] })
    expect(calls).toEqual([])
  })

  it('reports unknown when the status cannot be read', async () => {
    const { deps } = makeDeps({ status: async () => null, transitions: async () => null })
    expect((await internalReleaseTicket('K-1', deps)).error).toBe('Cannot move K-1 to Internal release from unknown')
  })

  it('reports a rejected transition and does not unassign', async () => {
    const { deps, calls } = makeDeps({ transition: async () => false })
    expect(await internalReleaseTicket('K-1', deps)).toEqual({ key: 'K-1', error: 'Jira did not accept moving K-1 to Internal release', done: [] })
    expect(calls).toEqual([])
  })

  it('reports a rejected unassign', async () => {
    const { deps } = makeDeps({ unassign: async () => false })
    expect(await internalReleaseTicket('K-1', deps)).toEqual({ key: 'K-1', error: 'Jira did not accept removing the assignee', done: ['Internal release'] })
  })
})

describe('internalReleaseBlocker', () => {
  const passed: ReleaseCheck = {
    mr: { iid: 12, projectId: 1, state: 'merged', title: 'K-1 x', url: 'u', targetBranch: 'develop', mergeSha: 'abc', mergedAt: 'd' },
    pipeline: { id: 1, status: 'success' },
    deploys: []
  }

  it('has no blocker when waiting for internal release with a passed pipeline', () => {
    expect(internalReleaseBlocker('K-1', 'Waiting for internal release', [passed])).toBeNull()
  })

  it('blocks when Jira cannot be read', () => {
    expect(internalReleaseBlocker('K-1', null, [passed])).toBe('Not ready: could not read K-1 from Jira')
  })

  it('blocks when the status moved on', () => {
    expect(internalReleaseBlocker('K-1', 'In progress', [passed])).toBe('Not ready: status is In progress, not Waiting for internal release')
  })

  it('blocks when the pipeline has not passed', () => {
    expect(internalReleaseBlocker('K-1', 'Waiting for internal release', [{ ...passed, pipeline: { id: 1, status: 'failed' } }])).toBe('Not ready: pipeline has not passed')
    expect(internalReleaseBlocker('K-1', 'Waiting for internal release', [])).toBe('Not ready: pipeline has not passed')
  })
})
