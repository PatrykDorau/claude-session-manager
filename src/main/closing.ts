import type { CloseCandidate, Session } from '../renderer/src/types'

export interface ProcInfo {
  pid: number
  parentPid: number
  name: string
  startedAt: number
}

export interface SessionFile {
  pid: number
  sessionId: string
  procStart: number
}

const FINISHED = ['done', 'internal testing', 'waiting for internal release']
const SHELLS = ['powershell.exe', 'pwsh.exe', 'bash.exe', 'cmd.exe', 'sh.exe']
const START_TOLERANCE = 10_000

export const isFinishedStatus = (status: string | null | undefined): boolean =>
  !!status && FINISHED.includes(status.trim().toLowerCase())

export const closeCandidates = (
  sessions: Session[],
  titles: Record<string, string | null>
): CloseCandidate[] =>
  sessions
    .filter((s) => s.isLive && !s.bg && !!s.ticket && isFinishedStatus(s.jiraStatus))
    .map((s) => ({
      id: s.id,
      ticket: s.ticket as string,
      title: titles[s.ticket as string] ?? s.firstPrompt ?? '',
      projectName: s.projectName,
      status: s.status
    }))
    .sort((a, b) => a.ticket.localeCompare(b.ticket))

export const parseSessionFile = (text: string): SessionFile | null => {
  try {
    const o = JSON.parse(text)
    const procStart = Number(o?.procStart)
    return typeof o?.pid === 'number' && typeof o?.sessionId === 'string' && procStart > 0
      ? { pid: o.pid, sessionId: o.sessionId, procStart }
      : null
  } catch {
    return null
  }
}

export const killChain = (claudePid: number, procs: ProcInfo[]): number[] => {
  const byPid = new Map(procs.map((p) => [p.pid, p]))
  if (byPid.get(claudePid)?.name.toLowerCase() !== 'claude.exe') return []
  const chain = [claudePid]
  let parent = byPid.get(byPid.get(claudePid)?.parentPid ?? -1)
  let child = byPid.get(claudePid) as ProcInfo
  while (
    parent &&
    SHELLS.includes(parent.name.toLowerCase()) &&
    parent.startedAt < child.startedAt &&
    !chain.includes(parent.pid)
  ) {
    chain.push(parent.pid)
    child = parent
    parent = byPid.get(parent.parentPid)
  }
  return chain
}

export const isSessionProcess = (file: SessionFile, procs: ProcInfo[]): boolean =>
  procs.some(
    (p) =>
      p.pid === file.pid &&
      p.name.toLowerCase() === 'claude.exe' &&
      Math.abs(p.startedAt - file.procStart) < START_TOLERANCE
  )

export const sessionPid = (
  files: SessionFile[],
  sessionId: string,
  procs: ProcInfo[]
): number | null => {
  const live = files.filter((f) => f.sessionId === sessionId && isSessionProcess(f, procs))
  return live.length === 1 ? live[0].pid : null
}
