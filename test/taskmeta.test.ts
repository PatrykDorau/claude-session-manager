import { describe, it, expect } from 'vitest'
import {
  findTaskFolder,
  folderStages,
  mrSearchUrl,
  taskFinished,
  highestStage
} from '../src/main/taskmeta'

describe('findTaskFolder', () => {
  it('picks the newest month, dir or file', () => {
    const out = findTaskFolder(
      [
        { month: '05-2026', names: ['SOFKAN-3701'] },
        { month: '09-2026', names: ['SOFKAN-3701.txt'] }
      ],
      'SOFKAN-3701'
    )
    expect(out).toEqual({ month: '09-2026', name: 'SOFKAN-3701.txt' })
  })
  it('compares months by year first', () => {
    const out = findTaskFolder(
      [
        { month: '12-2025', names: ['X-1'] },
        { month: '01-2026', names: ['X-1'] }
      ],
      'X-1'
    )
    expect(out?.month).toBe('01-2026')
  })
  it('prefers the dir over a file in the same month', () => {
    const out = findTaskFolder([{ month: '05-2026', names: ['X-1.txt', 'X-1'] }], 'X-1')
    expect(out?.name).toBe('X-1')
  })
  it('does not match a longer ticket with the same prefix', () => {
    expect(findTaskFolder([{ month: '05-2026', names: ['X-12'] }], 'X-1')).toBe(null)
  })
})

describe('folderStages', () => {
  it('maps recorded artefacts to stages', () => {
    expect(folderStages(['repro.webm', 'fix-2.webm', 'test-case.md', 'kroki.md'])).toEqual([
      'repro',
      'verify',
      'qa'
    ])
  })
})

describe('mrSearchUrl', () => {
  const want =
    'https://drm-gitlab.redlabs.pl/fo/tigo/-/merge_requests?scope=all&state=all&search=X-1'
  it('handles ssh remotes', () => {
    expect(mrSearchUrl('git@drm-gitlab.redlabs.pl:fo/tigo.git', 'X-1')).toBe(want)
  })
  it('handles https remotes with and without .git or credentials', () => {
    expect(mrSearchUrl('https://drm-gitlab.redlabs.pl/fo/tigo.git', 'X-1')).toBe(want)
    expect(mrSearchUrl('https://user:tok@drm-gitlab.redlabs.pl/fo/tigo', 'X-1')).toBe(want)
  })
  it('is null for garbage', () => {
    expect(mrSearchUrl('', 'X-1')).toBe(null)
    expect(mrSearchUrl('not a remote', 'X-1')).toBe(null)
  })
})

describe('taskFinished', () => {
  it('is true when Jira status is on the done list', () => {
    expect(taskFinished('X-1', 'Accepted', 'Accepted, Done', [], [])).toBe(true)
  })
  it('honours manual finish and opt-out', () => {
    expect(taskFinished('X-1', 'In Progress', 'Done', ['X-1'], [])).toBe(true)
    expect(taskFinished('X-1', 'Done', 'Done', [], ['X-1'])).toBe(false)
  })
})

describe('highestStage', () => {
  it('returns the latest stage in workflow order or null', () => {
    expect(highestStage(['qa', 'brainstorm'])).toBe('qa')
    expect(highestStage([])).toBe(null)
  })
})
