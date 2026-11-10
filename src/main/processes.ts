import { spawn } from 'node:child_process'
import { branchTicket } from './ticket'
import type { ProcInfo } from './closing'

const RESUME =
  /--resume\s+([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/g

export function extractResumeIds(commandLines: string[]): string[] {
  const ids = new Set<string>()
  for (const line of commandLines) {
    RESUME.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = RESUME.exec(line)) !== null) ids.add(m[1])
  }
  return [...ids]
}

export async function probeCommand(cmd: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    let out = ''
    const p = spawn(cmd, args, { windowsHide: true, shell: true })
    p.stdout?.on('data', (d) => (out += d.toString()))
    p.on('error', () => resolve(null))
    p.on('close', (codeNum) => resolve(codeNum === 0 ? out.trim() : null))
  })
}

export async function gitDirty(folder: string): Promise<boolean> {
  return new Promise((resolve) => {
    let out = ''
    const p = spawn('git', ['-C', folder, 'status', '--porcelain'], { windowsHide: true })
    p.stdout.on('data', (d) => (out += d.toString()))
    p.on('error', () => resolve(false))
    p.on('close', () => resolve(out.trim().length > 0))
  })
}

export const runGit = (
  cwd: string,
  args: string[]
): Promise<{ isOk: boolean; out: string; err: string }> =>
  new Promise((resolve) => {
    let out = ''
    let err = ''
    const p = spawn('git', ['-C', cwd, ...args], { windowsHide: true })
    p.stdout.on('data', (d) => (out += d.toString()))
    p.stderr.on('data', (d) => (err += d.toString()))
    p.on('error', (e) => resolve({ isOk: false, out, err: e.message }))
    p.on('close', (codeNum) => resolve({ isOk: codeNum === 0, out, err: err.trim() }))
  })

function git(repo: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    let out = ''
    const p = spawn('git', ['-C', repo, ...args], { windowsHide: true })
    p.stdout.on('data', (d) => (out += d.toString()))
    p.on('error', () => resolve(null))
    p.on('close', (code) => resolve(code === 0 ? out.trim() : null))
  })
}

export async function gitRemote(repo: string): Promise<string | null> {
  return git(repo, ['remote', 'get-url', 'origin'])
}

export function branchTickets(gitOutput: string): { ticket: string; branch: string }[] {
  const seen = new Set<string>()
  const out: { ticket: string; branch: string }[] = []
  for (const line of gitOutput.split(/\r?\n/)) {
    const branch = line.trim()
    if (!branch) continue
    const ticket = branchTicket(branch)
    if (!ticket || seen.has(ticket)) continue
    seen.add(ticket)
    out.push({ ticket, branch })
  }
  return out
}

export async function listBranchTickets(
  repo: string
): Promise<{ ticket: string; branch: string }[]> {
  const out = await git(repo, [
    'for-each-ref',
    '--sort=-committerdate',
    '--format=%(refname:short)',
    'refs/heads'
  ])
  return out ? branchTickets(out) : []
}

export function mergedListHas(branchListOutput: string, branch: string): boolean {
  return branchListOutput
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .includes(branch)
}

async function resolveDefaultRef(repo: string): Promise<string | null> {
  const sym = await git(repo, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'])
  if (sym) return sym
  for (const r of ['origin/main', 'origin/master', 'main', 'master']) {
    if ((await git(repo, ['rev-parse', '--verify', '--quiet', r])) !== null) return r
  }
  return null
}

export async function branchMergedOrGone(repo: string, branch: string): Promise<boolean> {
  const exists = await git(repo, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`])
  if (exists === null) return true
  const def = await resolveDefaultRef(repo)
  if (!def) return false
  const merged = await git(repo, ['branch', '--merged', def, '--format=%(refname:short)'])
  if (merged === null) return false
  return mergedListHas(merged, branch)
}

export interface AgentInfo {
  sessionId: string
  kind: string
  status: string
  name: string | null
}

export async function listAgents(): Promise<AgentInfo[] | null> {
  return new Promise((resolve) => {
    let out = ''
    const p = spawn('claude', ['agents', '--json'], { windowsHide: true, shell: true })
    p.stdout.on('data', (d) => (out += d.toString()))
    p.on('error', () => resolve(null))
    p.on('close', () => {
      const start = out.indexOf('[')
      const end = out.lastIndexOf(']')
      if (start < 0 || end <= start) {
        resolve(null)
        return
      }
      try {
        const arr = JSON.parse(out.slice(start, end + 1))
        resolve(
          (arr as { sessionId?: string; kind?: string; status?: string; name?: string }[])
            .filter((a) => a.sessionId)
            .map((a) => ({
              sessionId: a.sessionId as string,
              kind: a.kind ?? 'interactive',
              status: a.status ?? 'idle',
              name: a.name ?? null
            }))
        )
      } catch {
        resolve(null)
      }
    })
  })
}

interface ClaudeProcess {
  pid: number
  commandLine: string
}

const claudeProcesses = (): Promise<ClaudeProcess[]> => {
  const ps =
    "ConvertTo-Json -Compress @(Get-CimInstance Win32_Process -Filter \"Name='claude.exe'\" | ForEach-Object { @{ p = $_.ProcessId; c = [string]$_.CommandLine } })"
  return new Promise((resolve) => {
    let out = ''
    const p = spawn('powershell.exe', ['-NoProfile', '-Command', ps], { windowsHide: true })
    p.stdout.on('data', (d) => (out += d.toString()))
    p.on('error', () => resolve([]))
    p.on('close', () => {
      try {
        const rows: { p: number; c: string | null }[] = JSON.parse(out)
        resolve(rows.map((r) => ({ pid: r.p, commandLine: r.c ?? '' })))
      } catch {
        resolve([])
      }
    })
  })
}

export async function runningResumeIds(): Promise<Set<string>> {
  return new Set(extractResumeIds((await claudeProcesses()).map((p) => p.commandLine)))
}

const ATTACH = /\battach\s+([0-9a-fA-F]{8})\b/

export const extractAttachIds = (commandLines: string[]): string[] =>
  commandLines.flatMap((line) => ATTACH.exec(line)?.[1] ?? [])

export const extractAttachPids = (rows: ClaudeProcess[]): Map<string, number> =>
  new Map(rows.flatMap((r) => {
    const id = ATTACH.exec(r.commandLine)?.[1]
    return id ? [[id, r.pid] as [string, number]] : []
  }))

export const runningAttaches = async (): Promise<Map<string, number>> => extractAttachPids(await claudeProcesses())

export const runningAttachIds = async (): Promise<Set<string>> => new Set((await runningAttaches()).keys())

export const listProcesses = (): Promise<ProcInfo[]> => {
  const ps =
    'ConvertTo-Json -Compress @(Get-CimInstance Win32_Process | ForEach-Object { @{ p = $_.ProcessId; pp = $_.ParentProcessId; n = $_.Name; s = $(if ($_.CreationDate) { $_.CreationDate.ToFileTimeUtc() } else { 0 }) } })'
  return new Promise((resolve) => {
    let out = ''
    const p = spawn('powershell.exe', ['-NoProfile', '-Command', ps], { windowsHide: true })
    p.stdout.on('data', (d) => (out += d.toString()))
    p.on('error', () => resolve([]))
    p.on('close', () => {
      try {
        const rows: { p: number; pp: number; n: string | null; s: number }[] = JSON.parse(out)
        resolve(rows.map((r) => ({ pid: r.p, parentPid: r.pp, name: r.n ?? '', startedAt: r.s })))
      } catch {
        resolve([])
      }
    })
  })
}

export const killProcess = (pid: number, isTree: boolean): Promise<boolean> =>
  new Promise((resolve) => {
    const args = ['/PID', String(pid), ...(isTree ? ['/T'] : []), '/F']
    const p = spawn('taskkill', args, { windowsHide: true })
    p.on('error', () => resolve(false))
    p.on('close', (codeNum) => resolve(codeNum === 0))
  })
