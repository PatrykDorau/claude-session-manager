import { describe, it, expect } from 'vitest'
import { parseWorktreeRepo } from '../src/main/worktree'

describe('parseWorktreeRepo', () => {
  it('extracts the parent repo name from a worktree .git file', () => {
    const c = 'gitdir: C:/Users/x/Desktop/Projekty/zwo/krs-fo-smarttv/.git/worktrees/SOFKRS-8028'
    expect(parseWorktreeRepo(c)).toBe('krs-fo-smarttv')
  })
  it('handles backslash paths', () => {
    const c = 'gitdir: C:\\Users\\x\\zwo\\kan-player-web\\.git\\worktrees\\feat-1'
    expect(parseWorktreeRepo(c)).toBe('kan-player-web')
  })
  it('tolerates a trailing newline and extra whitespace', () => {
    expect(parseWorktreeRepo('gitdir:   /home/u/repo-a/.git/worktrees/wt\n')).toBe('repo-a')
  })
  it('returns null for a normal (non-worktree) gitdir file', () => {
    expect(parseWorktreeRepo('gitdir: /home/u/repo/.git/modules/sub')).toBe(null)
  })
  it('returns null when there is no gitdir line', () => {
    expect(parseWorktreeRepo('ref: refs/heads/main')).toBe(null)
    expect(parseWorktreeRepo('')).toBe(null)
  })
})
