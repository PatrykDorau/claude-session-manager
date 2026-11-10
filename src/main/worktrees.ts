import { normalizePath } from './lock'
import { parseWorktreeRepo } from './worktree'
import type { Session, WorktreeRow } from '../renderer/src/types'

export const worktreeRows = (
  sessions: Session[],
  isExisting: (path: string) => boolean
): WorktreeRow[] => {
  const groups = new Map<string, Session[]>()
  for (const s of sessions.filter((x) => x.worktree && x.projectPath)) {
    const key = normalizePath(s.projectPath)
    groups.set(key, [...(groups.get(key) ?? []), s])
  }
  return [...groups.values()]
    .map((list) => {
      const newest = list.reduce((a, b) => (b.lastActive > a.lastActive ? b : a))
      return {
        path: newest.projectPath,
        repo: newest.repo ?? '',
        name: newest.projectPath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? '',
        branch: newest.gitBranch,
        sessionCount: list.length,
        isLive: list.some((x) => x.isLive),
        isDirty: newest.dirty
      }
    })
    .filter((r) => isExisting(r.path))
    .sort((a, b) => a.repo.localeCompare(b.repo) || a.name.localeCompare(b.name))
}

export const nodeModulesAction = (entries: string[] | null, isRepoInstalled: boolean): 'link' | 'relink' | 'none' => {
  if (!isRepoInstalled) return 'none'
  if (entries === null) return 'link'
  return entries.every((name) => name.startsWith('.')) ? 'relink' : 'none'
}

export const parseCount = (out: string): number => {
  const n = Number.parseInt(out.trim(), 10)
  return Number.isNaN(n) ? 0 : n
}

export const isLinkedWorktreeGitFile = (content: string): boolean =>
  parseWorktreeRepo(content) !== null

export const branchToDelete = (
  branch: string,
  parentBranch: string,
  worktreeName: string
): string | null =>
  branch === `worktree-${worktreeName}` && branch !== parentBranch ? branch : null
