import { open } from 'node:fs/promises'
import { STAGES, type Stage } from '../renderer/src/types'

const SKILL_STAGE: Record<string, Stage> = {
  'superpowers:brainstorming': 'brainstorm',
  'superpowers:writing-plans': 'plan',
  'superpowers:executing-plans': 'impl',
  'superpowers:subagent-driven-development': 'impl',
  'pair-programming': 'impl',
  'review-mr': 'review',
  'commit-and-push': 'mr'
}
const MR_COMMAND = /gitlab\.js\s+mr\s+create\b|git\s+push\b.*merge_request\.create/
const VERIFY_MODES: Record<string, Stage> = { repro: 'repro', verify: 'verify', qa: 'qa' }
const SLASH =
  /^\s*(?:<command-message>[^<]*<\/command-message>\s*)?<command-name>\/?([^<]+)<\/command-name>\s*(?:<command-args>([^<]*)<\/command-args>)?/

function stageOfSkill(name: string, args: string): Stage | null {
  const skill = name.replace(/^\//, '').trim()
  if (skill === 'browser-verify') return VERIFY_MODES[args.trim().split(/\s+/)[0]] ?? null
  return SKILL_STAGE[skill] ?? null
}

function isCandidate(line: string): boolean {
  return (
    line.includes('"Skill"') ||
    line.includes('gitlab.js') ||
    line.includes('merge_request.create') ||
    line.includes('<command-name>')
  )
}

export function stagesFromLine(line: string): Stage[] {
  if (!isCandidate(line)) return []
  let o: any
  try {
    o = JSON.parse(line)
  } catch {
    return []
  }
  const out: Stage[] = []
  const content = o?.message?.content
  if (o?.type === 'assistant' && Array.isArray(content)) {
    for (const c of content) {
      if (c?.type !== 'tool_use') continue
      if (c.name === 'Skill' && typeof c.input?.skill === 'string') {
        const st = stageOfSkill(c.input.skill, typeof c.input.args === 'string' ? c.input.args : '')
        if (st) out.push(st)
      } else if (c.name === 'Bash' && MR_COMMAND.test(c.input?.command ?? '')) {
        out.push('mr')
      }
    }
  } else if (o?.type === 'user') {
    const text = typeof content === 'string' ? content : null
    const m = text?.match(SLASH)
    const st = m ? stageOfSkill(m[1], m[2] ?? '') : null
    if (st) out.push(st)
  }
  return out
}

export function createStageScanner(chunkSize = 8 * 1024 * 1024): {
  scan: (file: string, size: number) => Promise<Stage[]>
} {
  const cache = new Map<string, { offset: number; stages: Set<Stage> }>()
  const inFlight = new Map<string, Promise<Stage[]>>()

  const readNew = async (file: string, size: number): Promise<Stage[]> => {
    let entry = cache.get(file)
    if (!entry || size < entry.offset) {
      entry = { offset: 0, stages: new Set() }
      cache.set(file, entry)
    }
    if (size > entry.offset) {
      const fh = await open(file, 'r')
      try {
        let want = chunkSize
        while (entry.offset < size) {
          const len = Math.min(want, size - entry.offset)
          const buf = Buffer.alloc(len)
          await fh.read(buf, 0, len, entry.offset)
          const end = buf.lastIndexOf(0x0a)
          if (end < 0) {
            if (entry.offset + len >= size) break
            want *= 2
            continue
          }
          for (const line of buf.subarray(0, end).toString('utf8').split(/\r?\n/))
            if (line) for (const st of stagesFromLine(line)) entry.stages.add(st)
          entry.offset += end + 1
          want = chunkSize
        }
      } finally {
        await fh.close()
      }
    }
    return STAGES.filter((st) => entry.stages.has(st))
  }

  const scan = (file: string, size: number): Promise<Stage[]> => {
    const running = inFlight.get(file)
    if (running) return running
    const job = readNew(file, size).finally(() => inFlight.delete(file))
    inFlight.set(file, job)
    return job
  }
  return { scan }
}
