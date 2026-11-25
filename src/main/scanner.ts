import { readdir, readFile, stat, open } from 'node:fs/promises'
import { join } from 'node:path'
import { ideDir, projectsDir, needsInputDir, activeDir, doneDir, jobsDir } from './paths'
import { parseLockFile } from './lock'
import { parseTranscriptHead, parseTail } from './transcript'
import { mergeClearedSessions, parseClearLink, type RawSession } from './aggregate'
import { createStageScanner } from './stages'
import { createFileCache } from './filecache'
import type { Stage } from '../renderer/src/types'

const stageScanner = createStageScanner()

export interface ScanResult {
  raw: RawSession[]
  lockedFolders: string[]
  cleared: Map<string, string>
}

export const readClearLinks = async (): Promise<Map<string, string>> => {
  const jobs = await readdir(jobsDir()).catch(() => [] as string[])
  const links = await Promise.all(jobs.map((job) => readFile(join(jobsDir(), job, 'state.json'), 'utf8').then(parseClearLink, () => null)))
  return new Map(links.filter((link): link is [string, string] => link !== null))
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export async function liveFolders(): Promise<string[]> {
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

const HEAD_START = 32768
const HEAD_MAX = 4 * 1024 * 1024
const heads = new Map<string, ReturnType<typeof parseTranscriptHead>>()

export async function readHead(file: string, size: number): Promise<ReturnType<typeof parseTranscriptHead>> {
  const cached = heads.get(file)
  if (cached) return cached
  let len = HEAD_START
  for (;;) {
    const head = parseTranscriptHead(await readChunk(file, len, false, size).catch(() => []))
    const isComplete = len >= size || len >= HEAD_MAX
    if (head.firstPrompt != null || (isComplete && size >= HEAD_MAX)) heads.set(file, head)
    if (head.firstPrompt != null || isComplete) return head
    len *= 4
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

const transcriptCache = createFileCache<{ tail: ReturnType<typeof parseTail>; stages: Stage[] }>()

const loadTranscript = (file: string, size: number) => {
  const load = async () => ({
    tail: parseTail(await readChunk(file, 65536, true, size)),
    stages: await stageScanner.scan(file, size)
  })
  return load
}

const emptyTranscript = () => ({ tail: parseTail([]), stages: [] as Stage[] })

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
    return { raw: [], lockedFolders: folders, cleared: new Map() }
  }

  const raw: RawSession[] = []
  const seen = new Set<string>()
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
      const head = await readHead(full, st.size)
      if (!head.cwd) continue
      seen.add(full)
      const { tail, stages } = await transcriptCache
        .get(full, st.size, st.mtimeMs, loadTranscript(full, st.size))
        .catch(emptyTranscript)
      raw.push({
        id,
        cwd: head.cwd,
        gitBranch: head.gitBranch ?? tail.gitBranch,
        firstPrompt: head.firstPrompt,
        title: head.title ?? null,
        mtimeMs: st.mtimeMs,
        needsInput: (needsInput.get(id) ?? -1) >= st.mtimeMs || tail.isQuestion,
        needsInputMtimeMs: needsInput.get(id) ?? null,
        active: active.has(id),
        done: done.has(id),
        pendingToolUse: tail.pendingToolUse,
        model: tail.model,
        contextTokens: tail.contextTokens,
        stages
      })
    }
  }
  transcriptCache.prune(seen)
  const cleared = await readClearLinks()
  return { raw: mergeClearedSessions(raw, cleared), lockedFolders: folders, cleared }
}
