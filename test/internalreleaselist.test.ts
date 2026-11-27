import { describe, it, expect } from 'vitest'
import { internalReleaseCandidates, isPipelinePassed, isPreselected, preselectedKeys } from '../src/renderer/src/dashboard/internalrelease'
import type { InternalReleaseRow, ReleaseCheck, ReleaseMr } from '../src/renderer/src/types'
import type { TaskRow } from '../src/renderer/src/taskview'

const task = (key: string, status: string, isFromJira = true): TaskRow => ({ key, summary: `${key} title`, status, sessions: [], isFromJira })

const mr = (over: Partial<ReleaseMr> = {}): ReleaseMr => ({ iid: 12, projectId: 1, state: 'merged', title: 'K-1 x', url: 'u', targetBranch: 'develop', mergeSha: 'abc', mergedAt: 'd', ...over })
const check = (over: Partial<ReleaseCheck> = {}): ReleaseCheck => ({ mr: mr(), pipeline: { id: 1, status: 'success' }, deploys: [], ...over })
const row = (over: Partial<InternalReleaseRow> = {}): InternalReleaseRow => ({ key: 'K-1', summary: 's', status: 'Waiting for internal release', checks: [check()], transition: 'Internal release', ...over })

describe('internalReleaseCandidates', () => {
  it('keeps Jira tickets waiting for internal release in any case', () => {
    const rows = [task('A-1', 'Waiting for internal release'), task('A-2', 'WAITING FOR INTERNAL RELEASE')]
    expect(internalReleaseCandidates(rows)).toEqual([
      { key: 'A-1', summary: 'A-1 title', status: 'Waiting for internal release' },
      { key: 'A-2', summary: 'A-2 title', status: 'WAITING FOR INTERNAL RELEASE' }
    ])
  })

  it('drops other statuses and rows outside Jira', () => {
    const rows = [task('A-3', 'Internal testing'), task('A-4', 'Internal release'), task('A-5', 'Waiting for internal release', false)]
    expect(internalReleaseCandidates(rows)).toEqual([])
  })
})

describe('isPipelinePassed', () => {
  it('passes when every merged MR has a successful pipeline', () => {
    expect(isPipelinePassed([check(), check({ mr: mr({ iid: 13 }) })])).toBe(true)
  })

  it('fails without MRs, with an open MR, a missing or an unsuccessful pipeline', () => {
    expect(isPipelinePassed([])).toBe(false)
    expect(isPipelinePassed([check({ mr: mr({ state: 'opened' }) })])).toBe(false)
    expect(isPipelinePassed([check({ pipeline: null })])).toBe(false)
    expect(isPipelinePassed([check(), check({ pipeline: { id: 2, status: 'failed' } })])).toBe(false)
  })
})

describe('isPreselected and preselectedKeys', () => {
  it('preselects rows with a passed pipeline and an available transition', () => {
    expect(isPreselected(row())).toBe(true)
    expect(isPreselected(row({ transition: null }))).toBe(false)
    expect(isPreselected(row({ checks: [check({ pipeline: { id: 1, status: 'running' } })] }))).toBe(false)
  })

  it('lists the keys of preselected rows', () => {
    expect(preselectedKeys([row({ key: 'K-1' }), row({ key: 'K-2', transition: null }), row({ key: 'K-3' })])).toEqual(['K-1', 'K-3'])
  })
})
