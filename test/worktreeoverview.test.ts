import { describe, it, expect } from 'vitest'
import {
  isWorktreeFinished,
  isOnlyDocsUntracked,
  parseWorktreeList,
  ticketFromBranch,
  gitlabProjectPath,
  mrStateOf,
  parseJiraStatus,
  createLimiter,
  type FinishInput
} from '../src/main/worktreeoverview'

const done = (over: Partial<FinishInput> = {}): FinishInput => ({
  mrState: 'merged',
  unpushed: 0,
  porcelain: '',
  jiraCategory: 'done',
  ...over
})

describe('isWorktreeFinished', () => {
  it('is finished when every condition is met', () => {
    expect(isWorktreeFinished(done())).toBe(true)
  })
  it('is not finished when the MR is not merged', () => {
    expect(isWorktreeFinished(done({ mrState: 'opened' }))).toBe(false)
    expect(isWorktreeFinished(done({ mrState: 'closed' }))).toBe(false)
    expect(isWorktreeFinished(done({ mrState: 'none' }))).toBe(false)
  })
  it('is not finished with unpushed commits', () => {
    expect(isWorktreeFinished(done({ unpushed: 1 }))).toBe(false)
  })
  it('is not finished with uncommitted changes', () => {
    expect(isWorktreeFinished(done({ porcelain: '?? src/new.ts\n' }))).toBe(false)
  })
  it('is not finished when the ticket is not done', () => {
    expect(isWorktreeFinished(done({ jiraCategory: 'indeterminate' }))).toBe(false)
  })
  it('allows untracked entries under docs/', () => {
    expect(
      isWorktreeFinished(
        done({ porcelain: '?? docs/\n?? docs/superpowers/plan.md\n?? "docs/a b.md"\n' })
      )
    ).toBe(true)
  })
  it('does not allow a modified tracked file, even under docs/', () => {
    expect(isWorktreeFinished(done({ porcelain: ' M src/a.ts\n' }))).toBe(false)
    expect(isWorktreeFinished(done({ porcelain: ' M docs/readme.md\n' }))).toBe(false)
  })
  it('is not finished when the MR, Jira or git state is unknown', () => {
    expect(isWorktreeFinished(done({ mrState: null }))).toBe(false)
    expect(isWorktreeFinished(done({ jiraCategory: null }))).toBe(false)
    expect(isWorktreeFinished(done({ unpushed: null }))).toBe(false)
    expect(isWorktreeFinished(done({ porcelain: null }))).toBe(false)
  })
})

describe('isOnlyDocsUntracked', () => {
  it('accepts an empty status', () => {
    expect(isOnlyDocsUntracked('')).toBe(true)
  })
  it('rejects an untracked folder whose name only starts with docs', () => {
    expect(isOnlyDocsUntracked('?? docsx/a.md\n')).toBe(false)
  })
})

describe('parseWorktreeList', () => {
  it('returns linked worktrees with their branches and skips the main, bare and prunable ones', () => {
    const out = [
      'worktree C:/repo',
      'HEAD aaa',
      'branch refs/heads/develop',
      '',
      'worktree C:/repo/.claude/worktrees/SOFKRS-1',
      'HEAD bbb',
      'branch refs/heads/fix/SOFKRS-1-x',
      '',
      'worktree C:/repo/.claude/worktrees/det',
      'HEAD ccc',
      'detached',
      '',
      'worktree C:/repo/.claude/worktrees/gone',
      'HEAD ddd',
      'branch refs/heads/gone',
      'prunable gitdir file points to non-existent location',
      ''
    ].join('\n')
    expect(parseWorktreeList(out)).toEqual([
      { path: 'C:/repo/.claude/worktrees/SOFKRS-1', branch: 'fix/SOFKRS-1-x' },
      { path: 'C:/repo/.claude/worktrees/det', branch: null }
    ])
  })
  it('returns nothing for empty output', () => {
    expect(parseWorktreeList('')).toEqual([])
  })
})

describe('ticketFromBranch', () => {
  it('finds the ticket key in the branch name', () => {
    expect(ticketFromBranch('fix/SOFKRS-1234-cw-section')).toBe('SOFKRS-1234')
    expect(ticketFromBranch('worktree-SOFKAN2-7')).toBe('SOFKAN2-7')
  })
  it('returns null without a ticket', () => {
    expect(ticketFromBranch('develop')).toBeNull()
    expect(ticketFromBranch(null)).toBeNull()
  })
})

describe('gitlabProjectPath', () => {
  it('reads scp-style, ssh and https remotes', () => {
    expect(gitlabProjectPath('git@host.pl:group/sub/proj.git')).toBe('group/sub/proj')
    expect(gitlabProjectPath('ssh://git@host.pl:2222/group/proj.git')).toBe('group/proj')
    expect(gitlabProjectPath('https://user:tok@host.pl/group/proj.git\n')).toBe('group/proj')
    expect(gitlabProjectPath('https://host.pl/group/proj')).toBe('group/proj')
  })
  it('returns null for an unreadable remote', () => {
    expect(gitlabProjectPath('')).toBeNull()
    expect(gitlabProjectPath('not a url')).toBeNull()
  })
})

describe('mrStateOf', () => {
  it('prefers opened, then merged, then closed', () => {
    expect(mrStateOf([{ state: 'merged' }, { state: 'opened' }])).toBe('opened')
    expect(mrStateOf([{ state: 'closed' }, { state: 'merged' }])).toBe('merged')
    expect(mrStateOf([{ state: 'closed' }, { state: 'opened' }])).toBe('opened')
    expect(mrStateOf([{ state: 'closed' }])).toBe('closed')
  })
  it('is none for an empty list and unknown for anything else', () => {
    expect(mrStateOf([])).toBe('none')
    expect(mrStateOf(null)).toBeNull()
    expect(mrStateOf([{ state: 'locked' }])).toBeNull()
  })
})

describe('parseJiraStatus', () => {
  it('reads the status name and category key', () => {
    expect(
      parseJiraStatus({ fields: { status: { name: 'Accepted', statusCategory: { key: 'done' } } } })
    ).toEqual({
      name: 'Accepted',
      category: 'done'
    })
  })
  it('returns null without a status', () => {
    expect(parseJiraStatus({ fields: {} })).toBeNull()
    expect(parseJiraStatus(null)).toBeNull()
  })
})

describe('createLimiter', () => {
  it('runs at most the limit at once and resolves every task', async () => {
    const limit = createLimiter(2)
    let running = 0
    let peak = 0
    const task = async (n: number): Promise<number> => {
      running++
      peak = Math.max(peak, running)
      await new Promise((r) => setTimeout(r, 5))
      running--
      return n
    }
    const results = await Promise.all([1, 2, 3, 4, 5].map((n) => limit(() => task(n))))
    expect(results).toEqual([1, 2, 3, 4, 5])
    expect(peak).toBe(2)
  })
  it('keeps going after a task fails', async () => {
    const limit = createLimiter(1)
    const failing = limit(() => Promise.reject(new Error('x')))
    await expect(failing).rejects.toThrow('x')
    expect(await limit(() => Promise.resolve(7))).toBe(7)
  })
})
