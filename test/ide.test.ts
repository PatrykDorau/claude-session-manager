import { describe, it, expect } from 'vitest'
import { safeRelPath, parseStatus, isNoisePath, parseNameStatus, isSafeRef, worktreeForBranch, parseStatusPaths } from '../src/main/ide'
import { languageOf, buildTree } from '../src/renderer/src/dashboard/code'

describe('safeRelPath', () => {
  it('resolves a path inside the worktree', () => {
    expect(safeRelPath('C:\\w\\SOF-1', 'src/a.ts')).toBe('C:\\w\\SOF-1\\src\\a.ts')
  })
  it('refuses paths that leave the worktree', () => {
    expect(safeRelPath('C:\\w\\SOF-1', '../SOF-2/a.ts')).toBeNull()
    expect(safeRelPath('C:\\w\\SOF-1', 'C:\\Windows\\win.ini')).toBeNull()
  })
})

describe('parseStatus', () => {
  it('reads porcelain status lines including renames and untracked files', () => {
    expect(parseStatus(' M src/a.ts\nA  src/b.ts\n D old.ts\nR  x.ts -> y.ts\n?? new.vue\n')).toEqual([
      { path: 'src/a.ts', state: 'modified' },
      { path: 'src/b.ts', state: 'added' },
      { path: 'old.ts', state: 'deleted' },
      { path: 'y.ts', state: 'renamed' },
      { path: 'new.vue', state: 'untracked' }
    ])
  })
})

describe('languageOf', () => {
  it('maps file extensions to editor languages', () => {
    expect(languageOf('a/b.vue')).toBe('vue')
    expect(languageOf('x.ts')).toBe('ts')
    expect(languageOf('x.tsx')).toBe('ts')
    expect(languageOf('x.mjs')).toBe('js')
    expect(languageOf('x.scss')).toBe('scss')
    expect(languageOf('x.json')).toBe('json')
    expect(languageOf('README.md')).toBe('text')
  })
})

describe('buildTree', () => {
  it('nests files into folders, folders first, sorted', () => {
    expect(buildTree(['src/b.ts', 'README.md', 'src/a/c.ts'])).toEqual([
      {
        name: 'src',
        path: 'src',
        children: [
          { name: 'a', path: 'src/a', children: [{ name: 'c.ts', path: 'src/a/c.ts', children: null }] },
          { name: 'b.ts', path: 'src/b.ts', children: null }
        ]
      },
      { name: 'README.md', path: 'README.md', children: null }
    ])
  })
})

describe('isNoisePath', () => {
  it('drops notes, docs and hidden tool folders from the ticket changes', () => {
    expect(isNoisePath('docs/superpowers/review.md')).toBe(true)
    expect(isNoisePath('.claude/rules/code-style.md')).toBe(true)
    expect(isNoisePath('.codebase-memory.json')).toBe(true)
    expect(isNoisePath('README.md')).toBe(true)
    expect(isNoisePath('src/javascript/state.js')).toBe(false)
  })
})

describe('parseNameStatus', () => {
  it('reads git diff --name-status output, keeping the new path of renames', () => {
    expect(parseNameStatus('M\tsrc/a.ts\nA\tsrc/b.ts\nD\told.ts\nR087\tx.ts\ty.ts\n')).toEqual([
      { path: 'src/a.ts', state: 'modified' },
      { path: 'src/b.ts', state: 'added' },
      { path: 'old.ts', state: 'deleted' },
      { path: 'y.ts', state: 'renamed' }
    ])
  })
})

describe('isSafeRef', () => {
  it('accepts normal branch names', () => {
    expect(isSafeRef('feat/SOFNJJ-2350-kidjo-tv-shop-context')).toBe(true)
    expect(isSafeRef('develop')).toBe(true)
  })
  it('rejects names git could read as options or ranges', () => {
    expect(isSafeRef('-x')).toBe(false)
    expect(isSafeRef('a..b')).toBe(false)
    expect(isSafeRef('a b')).toBe(false)
    expect(isSafeRef('')).toBe(false)
  })
})

describe('worktreeForBranch', () => {
  const porcelain = [
    'worktree C:/p/repo',
    'HEAD abc',
    'branch refs/heads/fix/SOFRMPT-3954-x',
    '',
    'worktree C:/p/repo/.claude/worktrees/SOFNJJ-2350',
    'HEAD def',
    'branch refs/heads/feat/SOFNJJ-2350-kidjo-tv-shop-context',
    '',
    'worktree C:/p/repo/.claude/worktrees/MR-9',
    'HEAD 123',
    'detached',
    ''
  ].join(String.fromCharCode(10))
  it('finds the folder that has the branch checked out', () => {
    expect(worktreeForBranch(porcelain, 'feat/SOFNJJ-2350-kidjo-tv-shop-context')).toBe('C:/p/repo/.claude/worktrees/SOFNJJ-2350')
  })
  it('finds nothing for a branch no folder has', () => {
    expect(worktreeForBranch(porcelain, 'feat/other')).toBeNull()
  })
})

describe('parseStatusPaths', () => {
  it('lists paths with uncommitted changes, including renamed targets', () => {
    const out = [' M src/a.ts', '?? src/new.ts', 'R  src/old.ts -> src/moved.ts', ''].join(String.fromCharCode(10))
    expect(parseStatusPaths(out)).toEqual(['src/a.ts', 'src/new.ts', 'src/moved.ts'])
  })
})
