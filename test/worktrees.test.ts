import { describe, it, expect } from 'vitest'
import { worktreeRows, parseCount, isLinkedWorktreeGitFile, branchToDelete, nodeModulesAction } from '../src/main/worktrees'
import type { Session } from '../src/renderer/src/types'

function s(over: Partial<Session>): Session {
  return {
    id: 'x',
    projectPath: '',
    projectName: 'p',
    gitBranch: null,
    ticket: null,
    firstPrompt: null,
    lastActive: 0,
    isLive: false,
    status: 'closed',
    watched: false,
    name: null,
    model: null,
    contextTokens: null,
    dirty: false,
    stages: [],
    ...over
  }
}

const isAlways = (): boolean => true

describe('worktreeRows', () => {
  it('groups sessions of one worktree folder regardless of case and slashes', () => {
    const list = [
      s({ id: 'a1', projectPath: 'C:\\R\\.claude\\worktrees\\a', worktree: true, repo: 'R', gitBranch: 'worktree-a', lastActive: 1 }),
      s({ id: 'a2', projectPath: 'c:/r/.claude/worktrees/a', worktree: true, repo: 'R', gitBranch: 'worktree-a2', lastActive: 5, isLive: true, dirty: true }),
      s({ id: 'n', projectPath: 'C:\\R', lastActive: 9 })
    ]
    expect(worktreeRows(list, isAlways)).toEqual([
      {
        path: 'c:/r/.claude/worktrees/a',
        repo: 'R',
        name: 'a',
        branch: 'worktree-a2',
        sessionCount: 2,
        isLive: true,
        isDirty: true
      }
    ])
  })
  it('drops worktrees whose folder is gone and sorts by repo then name', () => {
    const list = [
      s({ id: 'b', projectPath: 'C:\\Z\\.claude\\worktrees\\b', worktree: true, repo: 'Z' }),
      s({ id: 'c', projectPath: 'C:\\A\\.claude\\worktrees\\c', worktree: true, repo: 'A' }),
      s({ id: 'g', projectPath: 'C:\\A\\.claude\\worktrees\\gone', worktree: true, repo: 'A' })
    ]
    const isExisting = (path: string): boolean => !path.endsWith('gone')
    expect(worktreeRows(list, isExisting).map((r) => r.name)).toEqual(['c', 'b'])
  })
})

describe('parseCount', () => {
  it('reads git counts and falls back to zero', () => {
    expect(parseCount('3\n')).toBe(3)
    expect(parseCount('')).toBe(0)
    expect(parseCount('fatal')).toBe(0)
  })
})

describe('isLinkedWorktreeGitFile', () => {
  it('accepts a gitdir pointing into .git/worktrees only', () => {
    expect(isLinkedWorktreeGitFile('gitdir: C:/r/.git/worktrees/a\n')).toBe(true)
    expect(isLinkedWorktreeGitFile('gitdir: C:/r/.git\n')).toBe(false)
    expect(isLinkedWorktreeGitFile('')).toBe(false)
  })
})

describe('branchToDelete', () => {
  it('returns only the worktree-<name> branch the native flag creates', () => {
    expect(branchToDelete('worktree-a', 'master', 'a')).toBe('worktree-a')
    expect(branchToDelete('HEAD', 'master', 'a')).toBeNull()
    expect(branchToDelete('', 'master', 'a')).toBeNull()
    expect(branchToDelete('worktree-a', 'worktree-a', 'a')).toBeNull()
  })
  it('keeps a long-lived branch checked out in a hand-made worktree', () => {
    expect(branchToDelete('master', 'feat/x', 'master')).toBeNull()
    expect(branchToDelete('fix/SOFKRS-1', 'master', 'SOFKRS-1')).toBeNull()
  })
})

describe('nodeModulesAction', () => {
  it('links a worktree without node_modules to the repo install', () => {
    expect(nodeModulesAction(null, true)).toBe('link')
  })
  it('replaces a node_modules that only holds a tool cache', () => {
    expect(nodeModulesAction(['.cache'], true)).toBe('relink')
    expect(nodeModulesAction([], true)).toBe('relink')
  })
  it('keeps a real install or an existing link', () => {
    expect(nodeModulesAction(['.cache', 'core-js', 'vue'], true)).toBe('none')
  })
  it('does nothing when the repo itself has no install', () => {
    expect(nodeModulesAction(null, false)).toBe('none')
  })
})
