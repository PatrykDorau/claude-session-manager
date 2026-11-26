import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseReleaseMrs, parsePipeline, parseDeploys, releaseBlockers, releaseStage, internalTestingTransition, markdownToJira, findTestCases, releaseTicket, isCommentPosted, isReleasable } from '../src/main/release'
import type { ReleaseDeps } from '../src/main/release'
import type { JiraTransition } from '../src/main/jira'
import type { ReleaseCheck, ReleaseMr, ReleaseRow } from '../src/renderer/src/types'

const mr = (over: Partial<ReleaseMr> = {}): ReleaseMr => ({ iid: 12, projectId: 1, state: 'merged', title: 'SOFNJJ-2388 x', url: 'u', targetBranch: 'develop', mergeSha: 'abc', mergedAt: 'd', ...over })
const check = (over: Partial<ReleaseCheck> = {}): ReleaseCheck => ({ mr: mr(), pipeline: { id: 1, status: 'success' }, deploys: [], ...over })

describe('parseReleaseMrs', () => {
  const json = [
    { iid: 1, project_id: 3, state: 'opened', title: 'SOFNJJ-2388 a', web_url: 'w1', target_branch: 'develop', merge_commit_sha: null, squash_commit_sha: null, merged_at: null },
    { iid: 2, project_id: 3, state: 'merged', title: 'fix SOFNJJ-2388', web_url: 'w2', target_branch: 'develop', merge_commit_sha: null, squash_commit_sha: 'abc', merged_at: '2026-01-01' },
    { iid: 3, project_id: 3, state: 'closed', title: 'SOFNJJ-2388', web_url: 'w3', target_branch: 'develop' },
    { iid: 4, project_id: 3, state: 'merged', title: 'SOFNJJ-23881', web_url: 'w4', target_branch: 'develop' }
  ]

  it('keeps opened and merged MRs of the ticket only', () => {
    const toIid = (m: ReleaseMr): number => m.iid
    expect(parseReleaseMrs(json, 'SOFNJJ-2388').map(toIid)).toEqual([1, 2])
  })

  it('maps the fields', () => {
    expect(parseReleaseMrs(json, 'SOFNJJ-2388')[1]).toEqual({ iid: 2, projectId: 3, state: 'merged', title: 'fix SOFNJJ-2388', url: 'w2', targetBranch: 'develop', mergeSha: 'abc', mergedAt: '2026-01-01' })
  })

  it('returns an empty list for a non-array', () => {
    expect(parseReleaseMrs(null, 'SOFNJJ-2388')).toEqual([])
  })
})

describe('parsePipeline and parseDeploys', () => {
  it('reads the first pipeline', () => {
    expect(parsePipeline([{ id: 5, status: 'success' }])).toEqual({ id: 5, status: 'success' })
  })

  it('returns null for no pipelines', () => {
    expect(parsePipeline([])).toBeNull()
  })

  it('keeps deploys of the pipeline only', () => {
    const json = [
      { status: 'success', environment: { name: 'tigo-dev' }, deployable: { pipeline: { id: 7 } } },
      { status: 'success', environment: { name: 'x' }, deployable: { pipeline: { id: 8 } } }
    ]
    expect(parseDeploys(json, 7)).toEqual([{ environment: 'tigo-dev', status: 'success' }])
  })
})

describe('releaseBlockers', () => {
  it('blocks without a merge request', () => {
    expect(releaseBlockers([], true)).toEqual(['no merge request'])
  })

  it('blocks on an open MR', () => {
    expect(releaseBlockers([check({ mr: mr({ state: 'opened' }) })], true)).toContain('MR !12 still open')
  })

  it('blocks on a missing pipeline', () => {
    expect(releaseBlockers([check({ pipeline: null })], true)).toContain('MR !12: no pipeline on develop yet')
  })

  const expectPipelineBlocker = (status: string): void => {
    expect(releaseBlockers([check({ pipeline: { id: 1, status } })], true)).toContain(`MR !12: pipeline ${status}`)
  }

  it.each(['manual', 'running', 'failed'])('blocks on pipeline %s', expectPipelineBlocker)

  it('blocks on a deploy that is not successful', () => {
    expect(releaseBlockers([check({ deploys: [{ environment: 'salt-dev', status: 'blocked' }] })], true)).toContain('MR !12: deploy to salt-dev blocked')
  })

  it('blocks when the deployments could not be read', () => {
    expect(releaseBlockers([check({ deploys: null })], true)).toEqual(['MR !12: could not read deployments'])
  })

  it('blocks without test cases', () => {
    expect(releaseBlockers([check()], false)).toEqual(['no test cases'])
  })

  it('has no blockers when all is green', () => {
    expect(releaseBlockers([check()], true)).toEqual([])
  })

  it('blocks when one of two MRs is open', () => {
    expect(releaseBlockers([check(), check({ mr: mr({ iid: 13, state: 'opened' }) })], true)).not.toEqual([])
  })
})

describe('isReleasable', () => {
  const row = (stage: ReleaseRow['stage'], blockers: string[]): ReleaseRow => ({ key: 'K-1', summary: 's', status: 'x', stage, blockers, checks: [], hasTestCases: true })

  it('is false for an unfinished row with a blocker', () => {
    expect(isReleasable(row('unfinished', ['MR !12: pipeline failed']))).toBe(false)
  })

  it('is true for an unfinished row without blockers', () => {
    expect(isReleasable(row('unfinished', []))).toBe(true)
  })

  it('is true for a ready row', () => {
    expect(isReleasable(row('ready', []))).toBe(true)
  })

  it('is false for a waiting row', () => {
    expect(isReleasable(row('waiting', []))).toBe(false)
  })
})

describe('releaseStage', () => {
  it('is unfinished in Internal testing', () => {
    expect(releaseStage('Internal testing', ['x'])).toBe('unfinished')
  })

  it('is ready when waiting without blockers', () => {
    expect(releaseStage('Waiting for internal release', [])).toBe('ready')
  })

  it('is waiting with blockers', () => {
    expect(releaseStage('Waiting for internal release', ['x'])).toBe('waiting')
  })

  it('tolerates extra whitespace', () => {
    expect(releaseStage('Waiting  for internal release', [])).toBe('ready')
    expect(releaseStage('Internal  testing', [])).toBe('unfinished')
  })
})

describe('internalTestingTransition', () => {
  const first = { id: '1', name: 'To WIT', to: 'Waiting for internal testing' }
  const second = { id: '2', name: 'Start testing', to: 'Internal testing' }

  it('finds the Internal testing transition', () => {
    expect(internalTestingTransition([first, second])?.id).toBe('2')
  })

  it('returns null when absent', () => {
    expect(internalTestingTransition([first])).toBeNull()
  })

  it('falls back to the transition name', () => {
    expect(internalTestingTransition([first, { id: '3', name: 'Internal testing', to: 'Other' }])?.id).toBe('3')
  })
})

const expectConversion = (md: string, jira: string): void => {
  expect(markdownToJira(md)).toBe(jira)
}

describe('markdownToJira', () => {
  it.each([
    ['### TC1 — A', 'h3. TC1 — A'],
    ['- **Priorytet:** Critical', '* *Priorytet:* Critical'],
    ['  1. Otwórz', '## Otwórz'],
    ['1. Otwórz', '# Otwórz'],
    ['  - x', '** x'],
    ['use `x`', 'use {{x}}'],
    ['[a](http://b)', '[a|http://b]'],
    ['```\ncode\n```', '{code}\ncode\n{code}'],
    ['| a | b |\n|---|---|\n| 1 | 2 |', '|| a || b ||\n| 1 | 2 |']
  ])('converts %j', expectConversion)
})

describe('findTestCases', () => {
  it('returns the newest test case file', () => {
    const root = mkdtempSync(join(tmpdir(), 'tc-'))
    const oldDir = join(root, '11-2026', 'K-1')
    const newDir = join(root, '12-2026', 'K-1')
    mkdirSync(oldDir, { recursive: true })
    mkdirSync(newDir, { recursive: true })
    writeFileSync(join(oldDir, 'test-case.md'), 'old')
    writeFileSync(join(newDir, 'test-case.md'), 'new')
    utimesSync(join(oldDir, 'test-case.md'), new Date(1000), new Date(1000))
    utimesSync(join(newDir, 'test-case.md'), new Date(2000), new Date(2000))
    expect(findTestCases(root, 'K-1')).toBe('new')
    expect(findTestCases(root, 'K-2')).toBeNull()
  })
})

describe('releaseTicket', () => {
  const makeDeps = (over: Partial<ReleaseDeps> = {}): { deps: ReleaseDeps; calls: string[] } => {
    const calls: string[] = []
    const readStatus = async (): Promise<string | null> => 'Waiting for internal release'
    const readTransitions = async (): Promise<JiraTransition[] | null> => [{ id: '5', name: 'Internal testing', to: 'Internal testing' }]
    const recordTransition = async (): Promise<boolean> => {
      calls.push('transition')
      return true
    }
    const readComments = async (): Promise<string[] | null> => []
    const recordComment = async (): Promise<boolean> => {
      calls.push('comment')
      return true
    }
    const recordUnassign = async (): Promise<boolean> => {
      calls.push('unassign')
      return true
    }
    const readTestCases = (): string | null => '# Cases\n- one'
    const deps: ReleaseDeps = {
      status: readStatus,
      transitions: readTransitions,
      transition: recordTransition,
      comments: readComments,
      comment: recordComment,
      unassign: recordUnassign,
      testCases: readTestCases,
      ...over
    }
    return { deps, calls }
  }

  it('runs transition, comment and unassign in order', async () => {
    const { deps, calls } = makeDeps()
    expect(await releaseTicket('K-1', deps)).toEqual({ key: 'K-1', error: null, done: ['Internal testing', 'test cases', 'unassigned'] })
    expect(calls).toEqual(['transition', 'comment', 'unassign'])
  })

  it('skips the transition when already in Internal testing', async () => {
    const { deps, calls } = makeDeps({ status: async () => 'Internal testing' })
    const result = await releaseTicket('K-1', deps)
    expect(calls).toEqual(['comment', 'unassign'])
    expect(result.done).toEqual(['test cases', 'unassigned'])
  })

  it('skips the comment when it is already posted', async () => {
    const { deps, calls } = makeDeps({ comments: async () => ['h1. Cases\n* one'] })
    const result = await releaseTicket('K-1', deps)
    expect(calls).toEqual(['transition', 'unassign'])
    expect(result.error).toBeNull()
  })

  it('stops before unassign when the comment is rejected', async () => {
    const { deps, calls } = makeDeps({ comment: async () => false })
    expect(await releaseTicket('K-1', deps)).toEqual({ key: 'K-1', error: 'Jira did not accept the test-case comment', done: ['Internal testing'] })
    expect(calls).toEqual(['transition'])
  })

  it('reports missing test cases', async () => {
    const { deps } = makeDeps({ testCases: () => null })
    expect(await releaseTicket('K-1', deps)).toEqual({ key: 'K-1', error: 'No test-case.md for K-1', done: ['Internal testing'] })
  })

  it('reports a missing transition with the current status', async () => {
    const { deps } = makeDeps({ transitions: async () => [] })
    const result = await releaseTicket('K-1', deps)
    expect(result.error).toBe('Cannot move K-1 to Internal testing from Waiting for internal release')
    expect(result.done).toEqual([])
  })

  it('reports unknown when the status cannot be read', async () => {
    const { deps } = makeDeps({ status: async () => null, transitions: async () => [] })
    expect((await releaseTicket('K-1', deps)).error).toBe('Cannot move K-1 to Internal testing from unknown')
  })

  it('stops without commenting when the comments cannot be read', async () => {
    const { deps, calls } = makeDeps({ comments: async () => null })
    expect(await releaseTicket('K-1', deps)).toEqual({ key: 'K-1', error: 'Could not read the comments of K-1', done: ['Internal testing'] })
    expect(calls).toEqual(['transition'])
  })

  it('reports a rejected transition', async () => {
    const { deps } = makeDeps({ transition: async () => false })
    expect((await releaseTicket('K-1', deps)).error).toBe('Jira did not accept moving K-1 to Internal testing')
  })

  it('reports a rejected unassign', async () => {
    const { deps } = makeDeps({ unassign: async () => false })
    expect(await releaseTicket('K-1', deps)).toEqual({ key: 'K-1', error: 'Jira did not accept removing the assignee', done: ['Internal testing', 'test cases'] })
  })
})

describe('isCommentPosted', () => {
  it('matches a comment containing the first non-empty line', () => {
    expect(isCommentPosted(['x h1. Cases y'], '\nh1. Cases\n* one')).toBe(true)
    expect(isCommentPosted(['other'], 'h1. Cases')).toBe(false)
  })
})
