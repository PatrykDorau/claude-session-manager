import { win32 } from 'node:path'
import type { ChangedFile } from '../renderer/src/types'

export const safeRelPath = (root: string, rel: string): string | null => {
  if (win32.isAbsolute(rel)) return null
  const base = win32.resolve(root)
  const full = win32.resolve(base, rel)
  return full.toLowerCase().startsWith(`${base.toLowerCase()}\\`) ? full : null
}

const STATES: Record<string, ChangedFile['state']> = {
  M: 'modified',
  A: 'added',
  D: 'deleted',
  R: 'renamed',
  C: 'added',
  U: 'modified'
}

export const parseStatus = (porcelain: string): ChangedFile[] =>
  porcelain.split(/\r?\n/).flatMap((line) => {
    if (line.length < 4) return []
    const code = line.slice(0, 2)
    const rest = line.slice(3)
    if (code === '??') return [{ path: rest, state: 'untracked' as const }]
    const path = rest.includes(' -> ') ? rest.split(' -> ').pop() ?? rest : rest
    const letter = [code[0], code[1]].find((c) => c !== ' ' && STATES[c]) ?? 'M'
    return [{ path, state: STATES[letter] }]
  })

const NOISE_DIRS = ['docs/', 'node_modules/', 'dist/']

export const isNoisePath = (path: string): boolean =>
  path.split('/').some((part) => part.startsWith('.')) ||
  NOISE_DIRS.some((dir) => path.startsWith(dir)) ||
  path.toLowerCase().endsWith('.md')

export const countChanges = (porcelain: string): number => parseStatus(porcelain).filter((f) => !isNoisePath(f.path)).length

const NAME_STATES: Record<string, ChangedFile['state']> = { M: 'modified', A: 'added', D: 'deleted', R: 'renamed', C: 'added', T: 'modified' }

export const parseNameStatus = (out: string): ChangedFile[] =>
  out.split(/\r?\n/).flatMap((line) => {
    const parts = line.split('\t')
    if (parts.length < 2) return []
    const state = NAME_STATES[parts[0][0]] ?? 'modified'
    return [{ path: parts[parts.length - 1], state }]
  })

export const isSafeRef = (name: string): boolean => /^[\w./-]+$/.test(name) && !name.startsWith('-') && !name.includes('..')

export const worktreeForBranch = (porcelain: string, branch: string): string | null => {
  const blocks = porcelain.split(/\r?\n\r?\n/)
  for (const block of blocks) {
    const lines = block.split(/\r?\n/)
    const path = lines.find((l) => l.startsWith('worktree '))?.slice('worktree '.length)
    const ref = lines.find((l) => l.startsWith('branch '))?.slice('branch '.length)
    if (path && ref === `refs/heads/${branch}`) return path
  }
  return null
}

export const parseStatusPaths = (out: string): string[] =>
  out
    .split(/\r?\n/)
    .filter((line) => line.length > 3)
    .map((line) => {
      const rest = line.slice(3)
      const arrow = rest.indexOf(' -> ')
      return (arrow >= 0 ? rest.slice(arrow + 4) : rest).replace(/^"|"$/g, '')
    })

export interface CodeMatch {
  path: string
  line: number
  text: string
}

export const parseGrep = (out: string, limit: number): CodeMatch[] =>
  out
    .split(/\r?\n/)
    .flatMap((row) => {
      const match = /^(.+?):(\d+):(.*)$/.exec(row)
      return match ? [{ path: match[1], line: Number(match[2]), text: match[3].trim().slice(0, 200) }] : []
    })
    .slice(0, limit)

export interface LineCounts {
  added: number | null
  removed: number | null
}

const renamedPath = (path: string): string => {
  const braces = /^(.*)\{[^{}]* => ([^{}]*)\}(.*)$/.exec(path)
  if (braces) return `${braces[1]}${braces[2]}${braces[3]}`.replace(/\/\//g, '/')
  return path.includes(' => ') ? (path.split(' => ').pop() ?? path) : path
}

export const parseNumstat = (out: string): Map<string, LineCounts> => {
  const stats = new Map<string, LineCounts>()
  for (const row of out.split(/\r?\n/)) {
    const [added, removed, ...rest] = row.split('\t')
    if (!rest.length) continue
    const toCount = (value: string): number | null => (value === '-' ? null : Number(value))
    stats.set(renamedPath(rest.join('\t')), { added: toCount(added), removed: toCount(removed) })
  }
  return stats
}

export const parseRawBlobs = (out: string): Map<string, string> => {
  const blobs = new Map<string, string>()
  for (const row of out.split(/\r?\n/)) {
    const [meta, ...paths] = row.split('\t')
    const blob = meta.split(' ')[3]
    if (blob && paths.length) blobs.set(paths[paths.length - 1], blob)
  }
  return blobs
}

const scopePathspec = (scope: string): string | null => {
  const path = scope.trim().replace(/\\/g, '/').replace(/^\.\//, '')
  if (!path) return null
  if (!/[/*.]/.test(path)) return `:(glob)**/${path}/**`
  return path.includes('**') ? `:(glob)${path}` : path
}

export const searchArgs = (query: string, scope: string, isWord: boolean): string[] => {
  const pathspec = scopePathspec(scope)
  return [
    'grep', '-n', '-I', '-i', '-F', '--untracked', '--full-name',
    ...(isWord ? ['-w'] : []),
    '-e', query,
    ...(pathspec ? ['--', pathspec] : [])
  ]
}
