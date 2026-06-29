import { readdir, readFile, stat, open } from 'node:fs/promises'
import { join } from 'node:path'
import { ideDir, projectsDir, needsInputDir, activeDir, doneDir } from './paths'
import { parseLockFile } from './lock'
import { parseTranscriptHead, parseTail } from './transcript'
import type { RawSession } from './aggregate'

export interface ScanResult {
  raw: RawSession[]
  lockedFolders: string[]
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function liveFolders(): Promise<string[]> {
  let entries: string[] = []
  try {
    entries = await readdir(ideDir())
  } catch {
    return []
  }
  const folders: string[] = []
  for (const f of entries.filter((e) => e.endsWith('.lock'))) {
    const lock = parseLockFile(await readFile(join(ideDir(), f), 'utf8').catch(() => ''))
    if (lock && pidAlive(lock.pid)) folders.push(...lock.workspaceFolders)
  }
  return folders
}

async function readChunk(file: string, maxBytes: number, fromEnd: boolean, size: number): Promise<string[]> {
  const fh = await open(file, 'r')
  try {
    const len = Math.min(maxBytes, size)
    const start = fromEnd ? size - len : 0
    const buf = Buffer.alloc(len)
    await fh.read(buf, 0, len, start)
    return buf
      .toString('utf8')
      .split(/\r?\n/)
      .filter(Boolean)
  } finally {
    await fh.close()
  }
}

async function markerIds(dir: string): Promise<Set<string>> {
  try {
    return new Set(await readdir(dir))
  } catch {
    return new Set()
  }
}

async function markerMtimes(dir: string): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  let files: string[] = []
  try {
    files = await readdir(dir)
  } catch {
    return out
  }
  for (const f of files) {
    const st = await stat(join(dir, f)).catch(() => null)
    if (st) out.set(f, st.mtimeMs)
  }
  return out
}

export async function scanRaw(): Promise<ScanResult> {
  const [folders, needsInput, active, done] = await Promise.all([
    liveFolders(),
    markerMtimes(needsInputDir()),
    markerIds(activeDir()),
    markerIds(doneDir())
  ])
  let projects: string[] = []
  try {
    projects = await readdir(projectsDir())
  } catch {
    return { raw: [], lockedFolders: folders }
  }

  const raw: RawSession[] = []
  for (const p of projects) {
    const dir = join(projectsDir(), p)
    let files: string[] = []
    try {
      files = (await readdir(dir)).filter((f) => f.endsWith('.jsonl'))
    } catch {
      continue
    }
    for (const f of files) {
      const full = join(dir, f)
      const st = await stat(full).catch(() => null)
      if (!st) continue
      const id = f.replace(/\.jsonl$/, '')
      const head = parseTranscriptHead(await readChunk(full, 32768, false, st.size).catch(() => []))
      const tail = parseTail(await readChunk(full, 65536, true, st.size).catch(() => []))
      raw.push({
        id,
        cwd: head.cwd,
        gitBranch: head.gitBranch,
        firstPrompt: head.firstPrompt,
        mtimeMs: st.mtimeMs,
        needsInput: (needsInput.get(id) ?? -1) >= st.mtimeMs,
        active: active.has(id),
        done: done.has(id),
        pendingToolUse: tail.pendingToolUse
      })
    }
  }
  return { raw, lockedFolders: folders }
}
