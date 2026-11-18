import { describe, it, expect } from 'vitest'
import { safeRelPath, parseStatus, isNoisePath, parseNameStatus, isSafeRef, worktreeForBranch, parseStatusPaths, countChanges, parseGrep, searchArgs, parseNumstat, parseRawBlobs } from '../src/main/ide'
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

describe('countChanges', () => {
  it('counts changed code files and skips docs, dot folders and markdown', () => {
    const out = [' M src/a.ts', '?? src/b.vue', 'R  src/old.ts -> src/new.ts', '?? .playwright-mcp/x.png', ' M docs/plan.md', '?? notes.md'].join('\n')
    expect(countChanges(out)).toBe(3)
  })
  it('is zero for a clean tree', () => {
    expect(countChanges('')).toBe(0)
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

describe('parseGrep', () => {
  it('splits path, line and text and keeps colons inside the text', () => {
    const out = ['src/a.ts:12:  const x = { a: 1 }', 'src/b.vue:3:<div>', 'Binary file c.png matches', ''].join(String.fromCharCode(10))
    expect(parseGrep(out, 10)).toEqual([
      { path: 'src/a.ts', line: 12, text: 'const x = { a: 1 }' },
      { path: 'src/b.vue', line: 3, text: '<div>' }
    ])
  })

  it('stops at the limit', () => {
    expect(parseGrep(['a:1:x', 'b:2:y'].join(String.fromCharCode(10)), 1)).toHaveLength(1)
  })
})

describe('searchArgs', () => {
  const base = ['grep', '-n', '-I', '-i', '-F', '--untracked', '--full-name']
  it('searches the whole repository by default', () => {
    expect(searchArgs('foo', '', false)).toEqual([...base, '-e', 'foo'])
  })
  it('adds whole-word matching for names', () => {
    expect(searchArgs('load', '', true)).toEqual([...base, '-w', '-e', 'load'])
  })
  it('turns a scope into a pathspec', () => {
    expect(searchArgs('foo', ' ./src/javascript/ ', false)).toEqual([...base, '-e', 'foo', '--', 'src/javascript/'])
    expect(searchArgs('foo', 'components', false)).toEqual([...base, '-e', 'foo', '--', ':(glob)**/components/**'])
    expect(searchArgs('foo', '**/store/**', false)).toEqual([...base, '-e', 'foo', '--', ':(glob)**/store/**'])
    expect(searchArgs('foo', '*.vue', false)).toEqual([...base, '-e', 'foo', '--', '*.vue'])
    expect(searchArgs('foo', 'src/', false)).toEqual([...base, '-e', 'foo', '--', 'src/'])
    expect(searchArgs('foo', 'src\\javascript\\app', false)).toEqual([...base, '-e', 'foo', '--', 'src/javascript/app'])
  })
})

describe('parseRawBlobs', () => {
  it('maps each path to its new blob id', () => {
    const out = [':100644 100644 1111111 2222222 M\tsrc/a.ts', ':100644 100644 3333333 4444444 R087\tsrc/old.ts\tsrc/new.ts', ''].join('\n')
    const blobs = parseRawBlobs(out)
    expect(blobs.get('src/a.ts')).toBe('2222222')
    expect(blobs.get('src/new.ts')).toBe('4444444')
  })
})

describe('parseNumstat', () => {
  it('reads added and removed lines per file, binary files and renames', () => {
    const out = ['12\t3\tsrc/a.ts', '-\t-\timg/x.png', '4\t1\tsrc/{old => new}/b.ts', '2\t2\told.ts => new.ts', ''].join('\n')
    const stats = parseNumstat(out)
    expect(stats.get('src/a.ts')).toEqual({ added: 12, removed: 3 })
    expect(stats.get('img/x.png')).toEqual({ added: null, removed: null })
    expect(stats.get('src/new/b.ts')).toEqual({ added: 4, removed: 1 })
    expect(stats.get('new.ts')).toEqual({ added: 2, removed: 2 })
  })
})
