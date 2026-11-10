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
