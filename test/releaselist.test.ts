import { describe, it, expect } from 'vitest'
import { releaseCandidates, isReleasableRow } from '../src/renderer/src/dashboard/release'
import type { ReleaseRow } from '../src/renderer/src/types'
import type { TaskRow } from '../src/renderer/src/taskview'

const task = (key: string, status: string, isFromJira = true): TaskRow => ({ key, summary: `${key} title`, status, sessions: [], isFromJira })

const row = (extra: Partial<ReleaseRow>): ReleaseRow => ({ key: 'SOF-1', summary: 's', status: 'x', stage: 'ready', blockers: [], checks: [], hasTestCases: true, ...extra })

describe('releaseCandidates', () => {
  it('keeps waiting for internal release and internal testing', () => {
    const rows = [task('A-1', 'Waiting for internal release'), task('A-2', 'Internal testing')]
    expect(releaseCandidates(rows)).toEqual([
      { key: 'A-1', summary: 'A-1 title', status: 'Waiting for internal release' },
      { key: 'A-2', summary: 'A-2 title', status: 'Internal testing' }
    ])
  })

  it('drops other statuses and rows outside Jira', () => {
    const rows = [
      task('A-3', 'Waiting for internal testing'),
      task('A-4', 'Code review'),
      task('A-5', 'Waiting for internal release', false)
    ]
    expect(releaseCandidates(rows)).toEqual([])
  })
})

describe('isReleasableRow', () => {
  it('accepts ready and unfinished rows without blockers', () => {
    expect(isReleasableRow(row({ stage: 'ready' }))).toBe(true)
    expect(isReleasableRow(row({ stage: 'unfinished' }))).toBe(true)
  })

  it('rejects waiting rows and rows with blockers', () => {
    expect(isReleasableRow(row({ stage: 'waiting' }))).toBe(false)
    expect(isReleasableRow(row({ stage: 'unfinished', blockers: ['no test cases'] }))).toBe(false)
  })
})
