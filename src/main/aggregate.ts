import type { Session } from '../renderer/src/types'
import { extractTicket } from './ticket'
import { deriveStatus } from './status'
import { normalizePath } from './lock'

export interface RawSession {
  id: string
  cwd: string | null
  gitBranch: string | null
  firstPrompt: string | null
  mtimeMs: number
  needsInput: boolean
  active: boolean
  done: boolean
  pendingToolUse: boolean
  model: string | null
  contextTokens: number | null
}

function projectName(cwd: string | null): string {
  if (!cwd) return 'unknown'
  const parts = cwd.replace(/\\/g, '/').replace(/\/+$/, '').split('/')
  return parts[parts.length - 1] || 'unknown'
}

const STATUS_RANK: Record<string, number> = { waiting: 0, working: 1, idle: 2, closed: 3 }

export function computeOpen(
  prev: Record<string, string>,
  raw: { id: string; cwd: string | null; mtimeMs: number }[],
  runningIds: string[],
  lockedFolders: string[]
): Record<string, string> {
  const locked = new Set(lockedFolders.map(normalizePath))
  const folderOf = (cwd: string | null): string => (cwd ? normalizePath(cwd) : '')
  const next: Record<string, string> = {}

  for (const [id, folder] of Object.entries(prev)) {
    if (locked.has(folder)) next[id] = folder
  }

  const byId = new Map(raw.map((r) => [r.id, r]))
  for (const id of runningIds) {
    const r = byId.get(id)
    if (!r) continue
    const f = folderOf(r.cwd)
    if (locked.has(f)) next[id] = f
  }

  const newest = new Map<string, { id: string; mtimeMs: number }>()
  for (const r of raw) {
    const f = folderOf(r.cwd)
    if (!locked.has(f)) continue
    const cur = newest.get(f)
    if (!cur || r.mtimeMs > cur.mtimeMs) newest.set(f, { id: r.id, mtimeMs: r.mtimeMs })
  }
  for (const [f, { id }] of newest) next[id] = f

  return next
}

export function buildSessions(
  raw: RawSession[],
  openIds: string[],
  nowMs: number,
  workingWindowMs = 8000
): Session[] {
  const openSet = new Set(openIds)

  const sessions = raw.map<Session>((r) => {
    const isLive = openSet.has(r.id)
    return {
      id: r.id,
      projectPath: r.cwd ?? '',
      projectName: projectName(r.cwd),
      gitBranch: r.gitBranch,
      ticket: extractTicket(r.gitBranch, r.firstPrompt),
      firstPrompt: r.firstPrompt,
      lastActive: r.mtimeMs,
      isLive,
      status: deriveStatus({
        isLive,
        needsInput: r.needsInput,
        active: r.active,
        done: r.done,
        pendingToolUse: r.pendingToolUse,
        mtimeMs: r.mtimeMs,
        nowMs,
        workingWindowMs
      }),
      watched: false,
      name: null,
      model: r.model,
      contextTokens: r.contextTokens,
      dirty: false
    }
  })

  return sessions.sort((a, b) => {
    const r = STATUS_RANK[a.status] - STATUS_RANK[b.status]
    return r !== 0 ? r : b.lastActive - a.lastActive
  })
}
