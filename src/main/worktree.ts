import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

export function parseWorktreeRepo(gitFileContent: string): string | null {
  const m = gitFileContent.match(/^gitdir:\s*(.+)$/m)
  if (!m) return null
  const p = m[1].trim().replace(/\\/g, '/')
  const idx = p.indexOf('/.git/worktrees/')
  if (idx < 0) return null
  const root = p.slice(0, idx)
  const name = root.split('/').filter(Boolean).pop()
  return name || null
}

export async function detectWorktreeRepo(cwd: string): Promise<string | null> {
  try {
    const dotGit = join(cwd, '.git')
    if (!(await stat(dotGit)).isFile()) return null
    return parseWorktreeRepo(await readFile(dotGit, 'utf8'))
  } catch {
    return null
  }
}
