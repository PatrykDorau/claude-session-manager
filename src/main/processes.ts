import { spawn } from 'node:child_process'

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

function git(repo: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    let out = ''
    const p = spawn('git', ['-C', repo, ...args], { windowsHide: true })
    p.stdout.on('data', (d) => (out += d.toString()))
    p.on('error', () => resolve(null))
    p.on('close', (code) => resolve(code === 0 ? out.trim() : null))
  })
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

export async function runningResumeIds(): Promise<Set<string>> {
  const ps =
    "Get-CimInstance Win32_Process -Filter \"Name='claude.exe'\" | ForEach-Object { $_.CommandLine }"
  return new Promise((resolve) => {
    let out = ''
    const p = spawn('powershell.exe', ['-NoProfile', '-Command', ps], { windowsHide: true })
    p.stdout.on('data', (d) => (out += d.toString()))
    p.on('error', () => resolve(new Set()))
    p.on('close', () => resolve(new Set(extractResumeIds(out.split(/\r?\n/)))))
  })
}
