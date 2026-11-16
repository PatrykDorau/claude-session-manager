import { createReadStream, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import type { HandoffSize } from './handoffsize'

export type Digest = {
  sessionId: string
  project: string
  ticket: string | null
  model: string | null
  turns: number
  tokensRead: number
  peakContext: number
  avgContext: number
  compactions: number
  tools: Record<string, { calls: number; errors: number }>
  repeatedCommands: { command: string; count: number }[]
  skills: string[]
  subagents: { type: string; model: string | null }[]
  stages: string[]
  size: HandoffSize['size'] | null
  risk: HandoffSize['risk']
  userMessages: number
  corrections: string[]
  ruleFlags: string[]
}

export type Proposal = {
  id: string
  target: string
  title: string
  evidence: string[]
  find: string
  replace: string
}

const CORRECTION = /(?<!\p{L})(nie|źle|dlaczego|znowu|miało być|przecież)(?!\p{L})/iu
const COMMIT_ASKED = /commit|push|wypchnij|zacommituj|(?<!\p{L})tak(?!\p{L})/iu
const GIT_COMMIT = /\bgit\s+(commit|push)\b/i
const CHROME_LAUNCH = /chrome(\.exe)?\b.*--remote-debugging-port|--user-data-dir/i
const CO_AUTHORED = /co-authored-by/i
const MAX_CORRECTIONS = 10
const CORRECTION_LENGTH = 200
const REPEAT_THRESHOLD = 3
const DAY = 24 * 3_600_000
const STAGES: Record<string, string> = {
  'browser-recorder': 'repro/verify',
  'side-effect-analyst': 'analyze',
  'qa-writer': 'qa',
  'self-reviewer': 'review',
  'task-implementer': 'implement'
}

export const stageOf = (subagentType: string): string => STAGES[subagentType] ?? 'other'

type Block = { type?: string; text?: string; id?: string; name?: string; input?: Record<string, unknown>; tool_use_id?: string; is_error?: boolean }

const parseLine = (line: string): Record<string, unknown> | null => {
  try {
    const value = JSON.parse(line)
    return value && typeof value === 'object' ? value : null
  } catch {
    return null
  }
}

const blocksOf = (content: unknown): Block[] =>
  Array.isArray(content) ? content.filter((b): b is Block => !!b && typeof b === 'object') : []

const userTextOf = (content: unknown): string | null => {
  if (typeof content === 'string') return content
  const blocks = blocksOf(content)
  if (!blocks.length || blocks.some((b) => b.type === 'tool_result')) return null
  const text = blocks.filter((b) => b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n')
  return text || null
}

export const digestEntries = (
  entries: (Record<string, unknown> | null)[],
  meta: { sessionId: string; project: string; ticket: string | null }
): Digest => {
  const seenTurns = new Set<string>()
  const contexts: number[] = []
  const toolOfId = new Map<string, string>()
  const tools: Digest['tools'] = {}
  const commandCounts = new Map<string, number>()
  const skills: string[] = []
  const subagents: Digest['subagents'] = []
  const corrections: string[] = []
  const ruleFlags = new Set<string>()
  let model: string | null = null
  let compactions = 0
  let userMessages = 0
  let lastUserText: string | null = null
  let isAfterAssistant = false

  const recordToolUse = (block: Block) => {
    const name = block.name ?? 'unknown'
    const input = block.input ?? {}
    tools[name] = { calls: (tools[name]?.calls ?? 0) + 1, errors: tools[name]?.errors ?? 0 }
    if (block.id) toolOfId.set(block.id, name)
    if (CO_AUTHORED.test(JSON.stringify(input))) ruleFlags.add('co-authored-by')
    if (name === 'Skill' && typeof input.skill === 'string' && !skills.includes(input.skill)) skills.push(input.skill)
    if (name === 'Agent' && typeof input.subagent_type === 'string')
      subagents.push({ type: input.subagent_type, model: typeof input.model === 'string' ? input.model : null })
    if (name !== 'Bash' || typeof input.command !== 'string') return
    const command = input.command
    commandCounts.set(command, (commandCounts.get(command) ?? 0) + 1)
    if (GIT_COMMIT.test(command) && !COMMIT_ASKED.test(lastUserText ?? '')) ruleFlags.add('commit-without-ask')
    if (CHROME_LAUNCH.test(command)) ruleFlags.add('chrome-launch')
  }

  const recordAssistant = (message: Record<string, unknown>, index: number) => {
    isAfterAssistant = true
    if (!model && typeof message.model === 'string' && message.model !== '<synthetic>') model = message.model
    blocksOf(message.content).filter((b) => b.type === 'tool_use').forEach(recordToolUse)
    const usage = message.usage as Record<string, number> | undefined
    const turnKey = typeof message.id === 'string' ? message.id : `line:${index}`
    if (!usage || seenTurns.has(turnKey)) return
    seenTurns.add(turnKey)
    contexts.push((usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0))
  }

  const recordUser = (message: Record<string, unknown>) => {
    blocksOf(message.content)
      .filter((b) => b.type === 'tool_result' && b.is_error === true && b.tool_use_id)
      .forEach((b) => {
        const name = toolOfId.get(b.tool_use_id as string)
        if (name) tools[name].errors += 1
      })
    const text = userTextOf(message.content)
    if (text === null) return
    userMessages += 1
    lastUserText = text
    if (isAfterAssistant && CORRECTION.test(text) && corrections.length < MAX_CORRECTIONS)
      corrections.push(text.slice(0, CORRECTION_LENGTH))
    isAfterAssistant = false
  }

  entries.forEach((entry, index) => {
    if (!entry) return
    if (entry.isCompactSummary === true || (entry.type === 'system' && entry.subtype === 'compact_boundary')) {
      compactions += 1
      return
    }
    const message = entry.message as Record<string, unknown> | undefined
    if (!message || typeof message !== 'object') return
    if (entry.type === 'assistant') recordAssistant(message, index)
    if (entry.type === 'user') recordUser(message)
  })

  const tokensRead = contexts.reduce((sum, value) => sum + value, 0)
  return {
    ...meta,
    model,
    turns: contexts.length,
    tokensRead,
    peakContext: contexts.reduce((peak, value) => Math.max(peak, value), 0),
    avgContext: contexts.length ? Math.round(tokensRead / contexts.length) : 0,
    compactions,
    tools,
    repeatedCommands: [...commandCounts]
      .filter(([, count]) => count >= REPEAT_THRESHOLD)
      .map(([command, count]) => ({ command, count }))
      .sort((a, b) => b.count - a.count),
    skills,
    subagents,
    stages: subagents.map((s) => stageOf(s.type)),
    size: null,
    risk: null,
    userMessages,
    corrections,
    ruleFlags: [...ruleFlags]
  }
}

export const digestTranscript = (
  lines: string[],
  meta: { sessionId: string; project: string; ticket: string | null }
): Digest => digestEntries(lines.map(parseLine), meta)

const normalisePath = (path: string): string => path.replace(/\\/g, '/').replace(/\/+$/, '')

const resolveTarget = (target: string, home: string): string =>
  normalisePath(target.startsWith('~/') || target.startsWith('~\\') ? `${home}/${target.slice(2)}` : target)

const isAllowedTarget = (target: string, home: string): boolean => {
  const path = target.toLowerCase()
  const claudeDir = `${normalisePath(home)}/.claude`.toLowerCase()
  if (path.split('/').includes('..')) return false
  return path === `${claudeDir}/claude.md` || (path.startsWith(`${claudeDir}/skills/`) && path.length > `${claudeDir}/skills/`.length)
}

const isProposalShape = (value: unknown): value is Proposal => {
  const p = value as Record<string, unknown> | null
  return (
    !!p &&
    typeof p === 'object' &&
    ['id', 'target', 'title', 'find'].every((key) => typeof p[key] === 'string' && p[key] !== '') &&
    typeof p.replace === 'string' &&
    Array.isArray(p.evidence) &&
    p.evidence.every((e) => typeof e === 'string')
  )
}

export const parseProposals = (json: unknown, home: string): Proposal[] =>
  (Array.isArray(json) ? json : [])
    .filter(isProposalShape)
    .map((p) => ({
      id: p.id,
      target: resolveTarget(p.target, home),
      title: p.title,
      evidence: [...p.evidence],
      find: p.find,
      replace: p.replace
    }))
    .filter((p) => isAllowedTarget(p.target, home))

export const applyProposal = (text: string, p: Proposal): { text: string } | { error: string } => {
  const parts = text.split(p.find)
  if (parts.length === 1) return { error: `"${p.find.slice(0, 60)}" not found in ${p.target}` }
  if (parts.length > 2) return { error: `"${p.find.slice(0, 60)}" occurs ${parts.length - 1} times in ${p.target}` }
  return { text: parts.join(p.replace) }
}

export const isFactoryDue = (lastRun: number | null, now: number): boolean => lastRun === null || now - lastRun >= DAY

export const tokenTrend = (digestsByDate: Record<string, Digest[]>): { date: string; tokens: number }[] =>
  Object.keys(digestsByDate)
    .sort()
    .map((date) => ({ date, tokens: digestsByDate[date].reduce((sum, d) => sum + d.tokensRead, 0) }))

export type DismissedEntry = { id: string; target: string; title: string; find: string }

const TICKET = /[A-Z][A-Z0-9]+-\d+/
const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.(md|json)$/
const FACTORY_PROJECT = '-claude-factory'

export const dayStamp = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export const ticketOfEntry = (entry: Record<string, unknown>): string | null =>
  [entry.gitBranch, entry.cwd].map((v) => (typeof v === 'string' ? TICKET.exec(v)?.[0] ?? null : null)).find((t) => t !== null) ?? null

const USER_TEXT_LENGTH = 400

const slimInput = (name: string, input: Record<string, unknown>): Record<string, unknown> => {
  const kept =
    name === 'Bash'
      ? { command: input.command }
      : name === 'Skill'
        ? { skill: input.skill }
        : name === 'Agent'
          ? { subagent_type: input.subagent_type, model: input.model }
          : {}
  return CO_AUTHORED.test(JSON.stringify(input)) ? { ...kept, co: 'Co-Authored-By' } : kept
}

const slimAssistantBlock = (block: Block): Block[] =>
  block.type === 'tool_use' ? [{ type: 'tool_use', id: block.id, name: block.name, input: slimInput(block.name ?? '', block.input ?? {}) }] : []

const slimUserBlock = (block: Block): Block =>
  block.type === 'text'
    ? { type: 'text', text: typeof block.text === 'string' ? block.text.slice(0, USER_TEXT_LENGTH) : block.text }
    : { type: block.type, ...(block.tool_use_id ? { tool_use_id: block.tool_use_id } : {}), ...(block.is_error !== undefined ? { is_error: block.is_error } : {}) }

export const slimEntry = (entry: Record<string, unknown>): Record<string, unknown> | null => {
  if (entry.isCompactSummary === true) return { isCompactSummary: true }
  if (entry.type === 'system') return entry.subtype === 'compact_boundary' ? { type: 'system', subtype: 'compact_boundary' } : null
  const message = entry.message as Record<string, unknown> | undefined
  if (!message || typeof message !== 'object') return null
  if (entry.type === 'assistant')
    return { type: 'assistant', message: { id: message.id, model: message.model, usage: message.usage, content: blocksOf(message.content).flatMap(slimAssistantBlock) } }
  if (entry.type !== 'user') return null
  const content = typeof message.content === 'string' ? message.content.slice(0, USER_TEXT_LENGTH) : blocksOf(message.content).map(slimUserBlock)
  return { type: 'user', message: { content } }
}

export const dismissedList = (json: unknown): DismissedEntry[] =>
  (Array.isArray(json) ? json : [])
    .filter((e): e is DismissedEntry => !!e && typeof e === 'object' && ['id', 'target', 'title', 'find'].every((key) => typeof e[key] === 'string'))
    .map(({ id, target, title, find }) => ({ id, target, title, find }))

export const isDismissedBy = (list: DismissedEntry[], p: Proposal): boolean =>
  list.some((e) => e.id === p.id || (e.target === p.target && e.find === p.find))

export const withDismissed = (list: DismissedEntry[], p: Proposal): DismissedEntry[] =>
  isDismissedBy(list, p) ? list : [...list, { id: p.id, target: p.target, title: p.title, find: p.find }]

export const latestDay = (names: string[]): string | null =>
  names.flatMap((name) => DAY_FILE.exec(name)?.[1] ?? []).sort().pop() ?? null

export const isRecentEntry = (entry: Record<string, unknown>, since: number): boolean => {
  const time = typeof entry.timestamp === 'string' ? Date.parse(entry.timestamp) : Number.NaN
  return Number.isNaN(time) || time >= since
}

const digestFile = async (path: string, since: number, meta: { sessionId: string; project: string }): Promise<Digest> => {
  const entries: Record<string, unknown>[] = []
  let ticket: string | null = null
  const reader = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity })
  for await (const line of reader) {
    const entry = parseLine(line)
    if (!entry) continue
    if (!ticket) ticket = ticketOfEntry(entry)
    if (!isRecentEntry(entry, since)) continue
    const slim = slimEntry(entry)
    if (slim) entries.push(slim)
  }
  return digestEntries(entries, { ...meta, ticket })
}

const recentTranscripts = (projectsDir: string, since: number): { path: string; project: string; sessionId: string }[] =>
  readdirSync(projectsDir).flatMap((project) => {
    if (project.endsWith(FACTORY_PROJECT)) return []
    try {
      return readdirSync(join(projectsDir, project))
        .filter((name) => name.endsWith('.jsonl'))
        .map((name) => ({ path: join(projectsDir, project, name), project, sessionId: name.slice(0, -'.jsonl'.length) }))
        .filter((t) => statSync(t.path).mtimeMs >= since)
    } catch {
      return []
    }
  })

export const collectDigests = async (
  projectsDir: string,
  since: number,
  outDir: string,
  sizeOf?: (ticket: string) => HandoffSize | null
): Promise<number> => {
  mkdirSync(outDir, { recursive: true })
  let count = 0
  for (const t of recentTranscripts(projectsDir, since)) {
    try {
      const raw = await digestFile(t.path, since, { sessionId: t.sessionId, project: t.project })
      const digest = { ...raw, ...((raw.ticket && sizeOf?.(raw.ticket)) || {}) }
      writeFileSync(join(outDir, `${t.sessionId}.json`), JSON.stringify(digest, null, 2), 'utf8')
      count += 1
    } catch (e) {
      console.error('[factory] digest failed:', t.path, e)
    }
  }
  return count
}

const DEFAULT_RUBRIC = [
  '# Rubryka oceny sesji',
  '',
  'Każde kryterium oceniaj w skali 1–5 (1 = bardzo źle, 5 = wzorowo).',
  '',
  '- **Efektywność**: mało tokenów i tur na wynik, brak powtarzanych komend, niski szczyt kontekstu, kompaktowanie rzadko lub wcale.',
  '- **Jakość kodu**: mały diff, styl użytkownika (named exports, nazwane arrow functions, brak komentarzy, prefiks `is`), brak poprawek wymuszonych przez użytkownika.',
  '- **Testy**: test napisany przed kodem (TDD), testy uruchomione i zielone przed ogłoszeniem sukcesu.',
  '- **Zgodność z zasadami**: brak commitów bez prośby, brak Co-Authored-By, brak samodzielnego uruchamiania Chrome, pytania przez AskUserQuestion, właściwe skille i modele agentów.',
  ''
].join('\n')

export const ensureRubric = (path: string): void => {
  if (existsSync(path)) return
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, DEFAULT_RUBRIC, 'utf8')
}

export const splitScoreOutput = (out: string): { report: string; proposals: unknown } => {
  const start = out.lastIndexOf('```json')
  if (start < 0) return { report: out.trim(), proposals: [] }
  const end = out.indexOf('```', start + 7)
  const body = out.slice(start + 7, end < 0 ? undefined : end)
  const report = out.slice(0, start).trim()
  try {
    return { report, proposals: JSON.parse(body) }
  } catch {
    return { report, proposals: [] }
  }
}
