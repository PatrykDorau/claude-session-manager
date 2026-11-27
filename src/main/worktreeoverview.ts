import type { WorktreeMrState } from '../renderer/src/types'

export interface FinishInput {
  mrState: WorktreeMrState | null
  unpushed: number | null
  porcelain: string | null
  jiraCategory: string | null
}

const DOCS_UNTRACKED = /^\?\? "?docs\//

const isNonBlank = (line: string): boolean => !!line.trim()

const isDocsUntracked = (line: string): boolean => DOCS_UNTRACKED.test(line)

export const isOnlyDocsUntracked = (porcelain: string): boolean =>
  porcelain.split(/\r?\n/).filter(isNonBlank).every(isDocsUntracked)

export const isWorktreeFinished = (input: FinishInput): boolean =>
  input.mrState === 'merged' &&
  input.unpushed === 0 &&
  input.porcelain !== null &&
  isOnlyDocsUntracked(input.porcelain) &&
  input.jiraCategory === 'done'

const toBlockLines = (block: string): string[] => block.split(/\r?\n/).filter(Boolean)

const isWorktreeBlock = (lines: string[]): boolean => !!lines[0]?.startsWith('worktree ')

const isBareOrPrunable = (line: string): boolean => line === 'bare' || line.startsWith('prunable')

const isUsableBlock = (lines: string[]): boolean => !lines.some(isBareOrPrunable)

const isBranchLine = (line: string): boolean => line.startsWith('branch ')

const toWorktreeEntry = (lines: string[]): { path: string; branch: string | null } => {
  const ref = lines.find(isBranchLine)?.slice('branch '.length) ?? null
  return {
    path: lines[0].slice('worktree '.length),
    branch: ref ? ref.replace(/^refs\/heads\//, '') : null
  }
}

export const parseWorktreeList = (out: string): { path: string; branch: string | null }[] =>
  out
    .split(/\r?\n\r?\n/)
    .map(toBlockLines)
    .filter(isWorktreeBlock)
    .slice(1)
    .filter(isUsableBlock)
    .map(toWorktreeEntry)

export const ticketFromBranch = (branch: string | null): string | null =>
  branch ? (/[A-Z][A-Z0-9]+-\d+/.exec(branch)?.[0] ?? null) : null

export const gitlabProjectPath = (remoteUrl: string): string | null => {
  const url = remoteUrl.trim()
  const scp = url.includes('://') ? null : /^[^@\s/]+@[^:\s/]+:(.+)$/.exec(url)
  let path: string
  if (scp) path = scp[1]
  else {
    try {
      path = new URL(url).pathname
    } catch {
      return null
    }
  }
  const clean = path
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/, '')
  return clean.includes('/') ? clean : null
}

export const mrStateOf = (json: unknown): WorktreeMrState | null => {
  if (!Array.isArray(json)) return null
  if (!json.length) return 'none'
  const toState = (mr: unknown): unknown => (mr as { state?: unknown } | null)?.state
  const states = json.map(toState)
  const isPresent = (s: WorktreeMrState): boolean => states.includes(s)
  const found = (['opened', 'merged', 'closed'] as const).find(isPresent)
  return found ?? null
}

export const parseJiraStatus = (
  json: unknown
): { name: string; category: string | null } | null => {
  const status = (
    json as { fields?: { status?: { name?: unknown; statusCategory?: { key?: unknown } } } } | null
  )?.fields?.status
  if (typeof status?.name !== 'string') return null
  const key = status.statusCategory?.key
  return { name: status.name, category: typeof key === 'string' ? key : null }
}

export const createLimiter = (limit: number): (<T>(task: () => Promise<T>) => Promise<T>) => {
  let running = 0
  const waiting: (() => void)[] = []
  const release = (): void => {
    const next = waiting.shift()
    if (next) next()
    else running--
  }
  const run = async <T>(task: () => Promise<T>): Promise<T> => {
    const enqueue = (resolve: () => void): void => {
      waiting.push(resolve)
    }
    if (running >= limit) await new Promise<void>(enqueue)
    else running++
    try {
      return await task()
    } finally {
      release()
    }
  }
  return run
}
