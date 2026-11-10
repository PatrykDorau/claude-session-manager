import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

export type AgentState = 'working' | 'stuck' | 'interrupted' | 'finished'
export type ModelTier = 'opus' | 'sonnet' | 'haiku' | 'other'

export interface AgentMeta {
  agentType: string
  description: string
  model: string | null
  isFinished: boolean
  depth: number
}

export interface AgentSummary {
  toolCalls: number
  lastText: string
  lastAt: number | null
  model: string | null
  task: string
}

export interface AgentStep {
  role: 'user' | 'assistant'
  text: string
  tools: string[]
}

export interface AgentNode {
  id: string
  agentType: string
  description: string
  model: ModelTier
  state: AgentState
  toolCalls: number
  lastText: string
  lastAt: number | null
  task: string
  depth: number
}

export interface AgentGroup {
  sessionId: string
  agents: AgentNode[]
}

const STUCK_MS = 5 * 60 * 1000
const RECENT_MS = 3 * 24 * 60 * 60 * 1000
const MAX_STEPS = 300

const asText = (v: unknown): string => (typeof v === 'string' ? v : '')
const firstLine = (text: string, max: number): string => text.trim().split('\n')[0].slice(0, max)

export const modelTier = (model: string | null): ModelTier => {
  const m = (model ?? '').toLowerCase()
  if (m.includes('opus')) return 'opus'
  if (m.includes('sonnet')) return 'sonnet'
  if (m.includes('haiku')) return 'haiku'
  return 'other'
}

export const parseAgentMeta = (raw: string): AgentMeta | null => {
  try {
    const o = JSON.parse(raw)
    return {
      agentType: asText(o.agentType) || 'agent',
      description: asText(o.description),
      model: asText(o.pickedEffortModel) || asText(o.model) || null,
      isFinished: o.finished === true,
      depth: typeof o.spawnDepth === 'number' ? o.spawnDepth : 1
    }
  } catch {
    return null
  }
}

const parseLines = (lines: string[]): any[] =>
  lines.flatMap((l) => {
    try {
      return l.trim() ? [JSON.parse(l)] : []
    } catch {
      return []
    }
  })

const contentOf = (o: any): unknown[] => {
  const c = o?.message?.content
  if (typeof c === 'string') return [{ type: 'text', text: c }]
  return Array.isArray(c) ? c : []
}

const textOf = (o: any): string =>
  contentOf(o)
    .filter((c: any) => c?.type === 'text')
    .map((c: any) => asText(c.text))
    .join('\n')
    .trim()

export const summarizeAgent = (lines: string[]): AgentSummary => {
  const rows = parseLines(lines)
  const assistants = rows.filter((o) => o.type === 'assistant')
  const lastWithText = [...assistants].reverse().find((o) => textOf(o))
  const times = rows.map((o) => Date.parse(asText(o.timestamp))).filter((t) => !Number.isNaN(t))
  const firstUser = rows.find((o) => o.type === 'user' && textOf(o))
  return {
    toolCalls: assistants.reduce((n, o) => n + contentOf(o).filter((c: any) => c?.type === 'tool_use').length, 0),
    lastText: lastWithText ? firstLine(textOf(lastWithText), 200) : '',
    lastAt: times.length ? Math.max(...times) : null,
    model: asText(assistants.find((o) => o.message?.model)?.message?.model) || null,
    task: firstUser ? firstLine(textOf(firstUser), 200) : ''
  }
}

export const agentState = (input: { isFinished: boolean; isParentLive: boolean; lastAt: number | null; now: number }): AgentState => {
  if (input.isFinished) return 'finished'
  if (!input.isParentLive) return 'interrupted'
  return input.lastAt !== null && input.now - input.lastAt < STUCK_MS ? 'working' : 'stuck'
}

const toolLabel = (c: any): string => {
  const input = c?.input ?? {}
  const target = asText(input.file_path) || asText(input.pattern) || asText(input.command) || asText(input.description)
  return target ? `${asText(c.name)} ${firstLine(target, 80)}` : asText(c.name)
}

export const agentMessages = (lines: string[]): AgentStep[] =>
  parseLines(lines)
    .flatMap((o): AgentStep[] => {
      if (o.type !== 'user' && o.type !== 'assistant') return []
      const text = textOf(o)
      const tools = contentOf(o).filter((c: any) => c?.type === 'tool_use').map(toolLabel)
      return text || tools.length ? [{ role: o.type, text, tools }] : []
    })
    .slice(-MAX_STEPS)

const summaryCache = new Map<string, { key: string; summary: AgentSummary }>()

const readSummary = async (file: string): Promise<AgentSummary | null> => {
  try {
    const info = await stat(file)
    const key = `${info.size}:${info.mtimeMs}`
    const cached = summaryCache.get(file)
    if (cached?.key === key) return cached.summary
    const summary = summarizeAgent((await readFile(file, 'utf8')).split('\n'))
    summaryCache.set(file, { key, summary })
    return summary
  } catch {
    return null
  }
}

const readGroup = async (dir: string, sessionId: string, isLive: (id: string) => boolean, now: number): Promise<AgentGroup | null> => {
  const files = await readdir(dir).catch(() => [] as string[])
  const ids = files.filter((f) => f.endsWith('.meta.json')).map((f) => f.slice(0, -'.meta.json'.length))
  const agents = (
    await Promise.all(
      ids.map(async (id): Promise<AgentNode | null> => {
        const meta = parseAgentMeta(await readFile(join(dir, `${id}.meta.json`), 'utf8').catch(() => ''))
        const summary = await readSummary(join(dir, `${id}.jsonl`))
        if (!meta || !summary) return null
        return {
          id,
          agentType: meta.agentType,
          description: meta.description,
          model: modelTier(meta.model ?? summary.model),
          state: agentState({ isFinished: meta.isFinished, isParentLive: isLive(sessionId), lastAt: summary.lastAt, now }),
          toolCalls: summary.toolCalls,
          lastText: summary.lastText,
          lastAt: summary.lastAt,
          task: summary.task,
          depth: meta.depth
        }
      })
    )
  ).flatMap((a) => (a ? [a] : []))
  return agents.length ? { sessionId, agents: agents.sort((a, b) => (a.lastAt ?? 0) - (b.lastAt ?? 0)) } : null
}

export const listAgentGroups = async (projectsDir: string, isLive: (id: string) => boolean, now: number): Promise<AgentGroup[]> => {
  const projects = await readdir(projectsDir).catch(() => [] as string[])
  const groups = await Promise.all(
    projects.map(async (p) => {
      const sessions = await readdir(join(projectsDir, p)).catch(() => [] as string[])
      return Promise.all(
        sessions
          .filter((s) => !s.includes('.'))
          .map(async (s) => {
            const dir = join(projectsDir, p, s, 'subagents')
            const info = await stat(dir).catch(() => null)
            return info && now - info.mtimeMs < RECENT_MS ? readGroup(dir, s, isLive, now) : null
          })
      )
    })
  )
  return groups.flat().flatMap((g) => (g ? [g] : []))
}

export const readAgentRun = async (projectsDir: string, sessionId: string, agentId: string): Promise<AgentStep[]> => {
  if (!/^[\w-]+$/.test(sessionId) || !/^[\w-]+$/.test(agentId)) return []
  const projects = await readdir(projectsDir).catch(() => [] as string[])
  for (const p of projects) {
    const raw = await readFile(join(projectsDir, p, sessionId, 'subagents', `${agentId}.jsonl`), 'utf8').catch(() => null)
    if (raw !== null) return agentMessages(raw.split('\n'))
  }
  return []
}
