import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import type { HandoffSize } from './handoffsize'

export const COST_WEIGHTS = { input: 1, cacheCreation: 1.25, cacheRead: 0.1, output: 5 }
export const BIG_CONTEXT = 200_000

export type ContextBucket = 'lt100k' | '100to200k' | '200to300k' | 'gt300k'

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
  costUnits: number
  costByModel: Record<string, number>
  costByStage: Record<string, number>
  buckets: Record<ContextBucket, { turns: number; cost: number }>
  costAbove200k: number
  firstAt: number | null
  lastAt: number | null
  activeMinutes: number
  testRuns: number
  isLastTestFailed: boolean
  hasSourceEdits: boolean
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
const COMMIT_ASKED = /commit|amend|push|wypchnij|zacommituj|(?<!\p{L})tak(?!\p{L})/iu
const GIT_COMMIT = /\bgit\s+(commit|push)\b/i
const CHROME_LAUNCH = /chrome(\.exe)?\b.*--remote-debugging-port|--user-data-dir/i
const CO_AUTHORED = /co-authored-by/i
const MAX_CORRECTIONS = 10
const CORRECTION_LENGTH = 200
const REPEAT_THRESHOLD = 3
const TEST_RUN = /\b(vitest|jest|npm (run )?test|npx vitest|pnpm (test|vitest)|yarn test)\b/
const NOT_USER_TEXT = ['<task-notification>', '<local-command']
const HANDOFF_CLEAR = '<command-name>/clear</command-name>'
const IDLE_GAP = 10 * 60_000
const ASSISTANT_TEXT_LENGTH = 600
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

export const turnCost = (usage: Record<string, number>): number =>
  (usage.input_tokens ?? 0) * COST_WEIGHTS.input +
  (usage.cache_creation_input_tokens ?? 0) * COST_WEIGHTS.cacheCreation +
  (usage.cache_read_input_tokens ?? 0) * COST_WEIGHTS.cacheRead +
  (usage.output_tokens ?? 0) * COST_WEIGHTS.output

export const bucketOf = (context: number): ContextBucket =>
  context < 100_000 ? 'lt100k' : context < BIG_CONTEXT ? '100to200k' : context < 300_000 ? '200to300k' : 'gt300k'

const isSourcePath = (path: string): boolean => {
  const slashed = path.replace(/\\/g, '/')
  return !/(^|\/)docs\//.test(slashed) && !slashed.endsWith('.md')
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

const isNotUserText = (text: string, isMeta: boolean): boolean =>
  isMeta || NOT_USER_TEXT.some((prefix) => text.trimStart().startsWith(prefix))

const contextOfUsage = (usage: Record<string, number>): number =>
  (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)

const ruleFlagsOf = (name: string, input: Record<string, unknown>, lastUserText: string | null): string[] => {
  const command = name === 'Bash' && typeof input.command === 'string' ? input.command : ''
  return [
    ...(CO_AUTHORED.test(JSON.stringify(input)) ? ['co-authored-by'] : []),
    ...(GIT_COMMIT.test(command) && !COMMIT_ASKED.test(lastUserText ?? '') ? ['commit-without-ask'] : []),
    ...(CHROME_LAUNCH.test(command) ? ['chrome-launch'] : [])
  ]
}

export const isHandoffSignal = (entry: Record<string, unknown>): boolean => {
  if (entry.type === 'system') return entry.subtype === 'compact_boundary'
  const message = entry.message as Record<string, unknown> | undefined
  if (!message || typeof message !== 'object') return false
  if (entry.type === 'user') return (userTextOf(message.content) ?? '').includes(HANDOFF_CLEAR)
  if (entry.type !== 'assistant') return false
  return blocksOf(message.content).some(
    (b) =>
      b.type === 'tool_use' &&
      ((b.name === 'Skill' && b.input?.skill === 'handoff') ||
        ((b.name === 'Write' || b.name === 'Edit') && typeof b.input?.file_path === 'string' && /(^|[\\/])handoff\.md$/.test(b.input.file_path)))
  )
}

export const digestEntries = (
  entries: (Record<string, unknown> | null)[],
  meta: { sessionId: string; project: string; ticket: string | null }
): Digest => {
  const turnUsages = new Map<string, { usage: Record<string, number>; model: string | null }>()
  const timestamps: number[] = []
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
  let testRuns = 0
  let lastTestId: string | null = null
  let isLastTestFailed = false
  let hasSourceEdits = false

  const recordToolUse = (block: Block) => {
    const name = block.name ?? 'unknown'
    const input = block.input ?? {}
    tools[name] = { calls: (tools[name]?.calls ?? 0) + 1, errors: tools[name]?.errors ?? 0 }
    if (block.id) toolOfId.set(block.id, name)
    ruleFlagsOf(name, input, lastUserText).forEach((flag) => ruleFlags.add(flag))
    if (name === 'Skill' && typeof input.skill === 'string' && !skills.includes(input.skill)) skills.push(input.skill)
    if (name === 'Agent' && typeof input.subagent_type === 'string')
      subagents.push({ type: input.subagent_type, model: typeof input.model === 'string' ? input.model : null })
    if ((name === 'Edit' || name === 'Write') && typeof input.file_path === 'string' && isSourcePath(input.file_path)) hasSourceEdits = true
    if (name !== 'Bash' || typeof input.command !== 'string') return
    const command = input.command
    if (TEST_RUN.test(command)) {
      testRuns += 1
      lastTestId = block.id ?? null
      isLastTestFailed = false
    }
    commandCounts.set(command, (commandCounts.get(command) ?? 0) + 1)
  }

  const recordAssistant = (message: Record<string, unknown>, index: number) => {
    isAfterAssistant = true
    if (!model && typeof message.model === 'string' && message.model !== '<synthetic>') model = message.model
    blocksOf(message.content).filter((b) => b.type === 'tool_use').forEach(recordToolUse)
    const usage = message.usage as Record<string, number> | undefined
    const turnKey = typeof message.id === 'string' ? message.id : `line:${index}`
    if (!usage) return
    const previous = turnUsages.get(turnKey)
    if (previous && (previous.usage.output_tokens ?? 0) >= (usage.output_tokens ?? 0)) return
    turnUsages.set(turnKey, { usage, model: typeof message.model === 'string' ? message.model : null })
  }

  const recordUser = (message: Record<string, unknown>, isMeta: boolean) => {
    blocksOf(message.content)
      .filter((b) => b.type === 'tool_result' && b.tool_use_id)
      .forEach((b) => {
        if (b.tool_use_id === lastTestId) isLastTestFailed = b.is_error === true
        const name = toolOfId.get(b.tool_use_id as string)
        if (name && b.is_error === true) tools[name].errors += 1
      })
    const text = userTextOf(message.content)
    if (text === null || isNotUserText(text, isMeta)) return
    userMessages += 1
    lastUserText = text
    if (isAfterAssistant && CORRECTION.test(text) && corrections.length < MAX_CORRECTIONS)
      corrections.push(text.slice(0, CORRECTION_LENGTH))
    isAfterAssistant = false
  }

  entries.forEach((entry, index) => {
    if (!entry) return
    const time = typeof entry.timestamp === 'string' ? Date.parse(entry.timestamp) : Number.NaN
    if (!Number.isNaN(time)) timestamps.push(time)
    if (entry.isCompactSummary === true || (entry.type === 'system' && entry.subtype === 'compact_boundary')) {
      compactions += 1
      return
    }
    const message = entry.message as Record<string, unknown> | undefined
    if (!message || typeof message !== 'object') return
    if (entry.type === 'assistant') recordAssistant(message, index)
    if (entry.type === 'user') recordUser(message, entry.isMeta === true)
  })

  const turns = [...turnUsages.values()].map(({ usage, model: turnModel }) => ({
    context: contextOfUsage(usage),
    cost: turnCost(usage),
    model: turnModel
  }))
  const contexts = turns.map((t) => t.context)
  const costByModel: Record<string, number> = {}
  const buckets: Digest['buckets'] = {
    lt100k: { turns: 0, cost: 0 },
    '100to200k': { turns: 0, cost: 0 },
    '200to300k': { turns: 0, cost: 0 },
    gt300k: { turns: 0, cost: 0 }
  }
  let costUnits = 0
  let costAbove200k = 0
  turns.forEach((t) => {
    costUnits += t.cost
    if (t.model && t.model !== '<synthetic>') costByModel[t.model] = (costByModel[t.model] ?? 0) + t.cost
    const bucket = buckets[bucketOf(t.context)]
    bucket.turns += 1
    bucket.cost += t.cost
    if (t.context >= BIG_CONTEXT) costAbove200k += t.cost
  })
  timestamps.sort((a, b) => a - b)
  let activeMs = 0
  timestamps.forEach((time, i) => {
    if (i > 0 && time - timestamps[i - 1] <= IDLE_GAP) activeMs += time - timestamps[i - 1]
  })
  if (hasSourceEdits && testRuns === 0) ruleFlags.add('no-tests')
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
    ruleFlags: [...ruleFlags],
    costUnits,
    costByModel,
    costByStage: { main: costUnits },
    buckets,
    costAbove200k,
    firstAt: timestamps.length ? timestamps[0] : null,
    lastAt: timestamps.length ? timestamps[timestamps.length - 1] : null,
    activeMinutes: Math.round(activeMs / 60_000),
    testRuns,
    isLastTestFailed,
    hasSourceEdits
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

export const isInsightsDue = (lastRun: number | null, now: number): boolean => lastRun === null || now - lastRun >= DAY

export type DismissedEntry = { id: string; target: string; title: string; find: string }

const TICKET = /[A-Z][A-Z0-9]+-\d+/
const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.(md|json)$/
const SKIPPED_PROJECTS = ['-claude-insights', '-claude-factory']

export const dayStamp = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const belowHome = (path: string, home: string): string => {
  const slashed = path.replace(/\\/g, '/')
  const prefix = home.replace(/\\/g, '/').replace(/\/+$/, '')
  return prefix && slashed.toLowerCase().startsWith(prefix.toLowerCase()) ? slashed.slice(prefix.length) : slashed
}

export const ticketOfEntry = (entry: Record<string, unknown>, home: string): string | null =>
  [entry.gitBranch, typeof entry.cwd === 'string' ? belowHome(entry.cwd, home) : entry.cwd]
    .map((v) => (typeof v === 'string' ? TICKET.exec(v)?.[0] ?? null : null))
    .find((t) => t !== null) ?? null

const USER_TEXT_LENGTH = 400

const slimInput = (name: string, input: Record<string, unknown>): Record<string, unknown> => {
  const kept =
    name === 'Bash'
      ? { command: input.command }
      : name === 'Skill'
        ? { skill: input.skill }
        : name === 'Agent'
          ? { subagent_type: input.subagent_type, model: input.model }
          : name === 'Edit' || name === 'Write'
            ? { file_path: input.file_path }
            : {}
  return CO_AUTHORED.test(JSON.stringify(input)) ? { ...kept, co: 'Co-Authored-By' } : kept
}

const slimAssistantBlock = (block: Block): Block[] =>
  block.type === 'tool_use'
    ? [{ type: 'tool_use', id: block.id, name: block.name, input: slimInput(block.name ?? '', block.input ?? {}) }]
    : block.type === 'text' && typeof block.text === 'string'
      ? [{ type: 'text', text: block.text.slice(0, ASSISTANT_TEXT_LENGTH) }]
      : []

const slimUserBlock = (block: Block): Block =>
  block.type === 'text'
    ? { type: 'text', text: typeof block.text === 'string' ? block.text.slice(0, USER_TEXT_LENGTH) : block.text }
    : { type: block.type, ...(block.tool_use_id ? { tool_use_id: block.tool_use_id } : {}), ...(block.is_error !== undefined ? { is_error: block.is_error } : {}) }

const slimBody = (entry: Record<string, unknown>): Record<string, unknown> | null => {
  if (entry.isCompactSummary === true) return { isCompactSummary: true }
  if (entry.type === 'system') return entry.subtype === 'compact_boundary' ? { type: 'system', subtype: 'compact_boundary' } : null
  const message = entry.message as Record<string, unknown> | undefined
  if (!message || typeof message !== 'object') return null
  if (entry.type === 'assistant')
    return { type: 'assistant', message: { id: message.id, model: message.model, usage: message.usage, content: blocksOf(message.content).flatMap(slimAssistantBlock) } }
  if (entry.type !== 'user') return null
  const content = typeof message.content === 'string' ? message.content.slice(0, USER_TEXT_LENGTH) : blocksOf(message.content).map(slimUserBlock)
  return { type: 'user', ...(entry.isMeta === true ? { isMeta: true } : {}), message: { content } }
}

export const slimEntry = (entry: Record<string, unknown>): Record<string, unknown> | null => {
  const slim = slimBody(entry)
  return typeof entry.timestamp === 'string' ? { ...slim, timestamp: entry.timestamp } : slim
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

export const reportDay = (findingNames: string[], metricNames: string[]): string | null =>
  latestDay(findingNames) ?? latestDay(metricNames)

export const isRecentEntry = (entry: Record<string, unknown>, since: number): boolean => {
  const time = typeof entry.timestamp === 'string' ? Date.parse(entry.timestamp) : Number.NaN
  return Number.isNaN(time) || time >= since
}

const SUBAGENT_FILE = /^agent-.+\.jsonl$/

const readRecentEntries = async (path: string, since: number): Promise<Record<string, unknown>[]> => {
  const entries: Record<string, unknown>[] = []
  const reader = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity })
  for await (const line of reader) {
    const entry = parseLine(line)
    const slim = entry && isRecentEntry(entry, since) ? slimEntry(entry) : null
    if (slim) entries.push(slim)
  }
  return entries
}

const agentTypeOf = (metaPath: string): string => {
  try {
    const value = JSON.parse(readFileSync(metaPath, 'utf8'))
    return typeof value?.agentType === 'string' ? value.agentType : ''
  } catch {
    return ''
  }
}

export const digestSubagents = async (
  sessionDir: string,
  since: number
): Promise<{ costByStage: Record<string, number>; costByModel: Record<string, number> }> => {
  const costByStage: Record<string, number> = {}
  const costByModel: Record<string, number> = {}
  const dir = join(sessionDir, 'subagents')
  let names: string[] = []
  try {
    names = readdirSync(dir).filter((name) => SUBAGENT_FILE.test(name))
  } catch {
    return { costByStage, costByModel }
  }
  for (const name of names) {
    try {
      const entries = await readRecentEntries(join(dir, name), since)
      const digest = digestEntries(entries, { sessionId: '', project: '', ticket: null })
      const stage = stageOf(agentTypeOf(join(dir, name.replace(/\.jsonl$/, '.meta.json'))))
      costByStage[stage] = (costByStage[stage] ?? 0) + digest.costUnits
      Object.entries(digest.costByModel).forEach(([model, cost]) => {
        costByModel[model] = (costByModel[model] ?? 0) + cost
      })
    } catch {
      continue
    }
  }
  return { costByStage, costByModel }
}

export type IncidentKind = 'correction' | 'tool-errors' | 'rule' | 'repeat' | 'big-context'

export type Incident = {
  id: string
  sessionId: string
  ticket: string | null
  kind: IncidentKind
  at: number | null
  user: string | null
  before: { text: string; tools: string[] }[]
}

const INCIDENT_TURNS = 2
const BIG_CONTEXT_GRACE_TURNS = 10
const TOOL_ERROR_STREAK = 2
const COMMAND_LENGTH = 200
const MAX_INCIDENTS_PER_SESSION = 8
const MAX_INCIDENTS_PER_DAY = 40
const MAX_INCIDENT_CHARS = 60_000

type Turn = { id: string | null; text: string[]; tools: string[]; context: number | null }
type Found = Omit<Incident, 'id' | 'sessionId' | 'ticket'> & { pos: number }

const toolLabelOf = (block: Block): string => {
  const name = block.name ?? 'unknown'
  const input = block.input ?? {}
  if (name === 'Bash' && typeof input.command === 'string') return `Bash: ${input.command.slice(0, COMMAND_LENGTH)}`
  if (name === 'Skill' && typeof input.skill === 'string') return `Skill: ${input.skill}`
  if (name === 'Agent' && typeof input.subagent_type === 'string') return `Agent: ${input.subagent_type}`
  return name
}

export const incidentsOf = (
  entries: Record<string, unknown>[],
  meta: { sessionId: string; ticket: string | null }
): Incident[] => {
  const found: Found[] = []
  const turns: Turn[] = []
  const toolOfId = new Map<string, string>()
  const errorStreaks = new Map<string, number>()
  const commandCounts = new Map<string, number>()
  const flagged = new Set<string>()
  let pos = 0
  let at: number | null = null
  let lastUserText: string | null = null
  let isAfterAssistant = false
  let testRuns = 0
  let lastSourceEdit: Found | null = null
  let isArmed = true
  let pending: { turnsSince: number; incident: Found } | null = null

  const makeIncident = (kind: IncidentKind, user: string | null = null): Found => ({
    pos,
    kind,
    at,
    user,
    before: turns.slice(-INCIDENT_TURNS).map((t) => ({ text: t.text.join('\n').slice(0, ASSISTANT_TEXT_LENGTH), tools: [...t.tools] }))
  })

  const recordToolUse = (block: Block) => {
    const name = block.name ?? 'unknown'
    const input = block.input ?? {}
    if (block.id) toolOfId.set(block.id, name)
    ruleFlagsOf(name, input, lastUserText)
      .filter((flag) => !flagged.has(flag))
      .forEach((flag) => {
        flagged.add(flag)
        found.push(makeIncident('rule'))
      })
    if ((name === 'Edit' || name === 'Write') && typeof input.file_path === 'string' && isSourcePath(input.file_path))
      lastSourceEdit = makeIncident('rule')
    if (name !== 'Bash' || typeof input.command !== 'string') return
    if (TEST_RUN.test(input.command)) testRuns += 1
    const count = (commandCounts.get(input.command) ?? 0) + 1
    commandCounts.set(input.command, count)
    if (count === REPEAT_THRESHOLD) found.push(makeIncident('repeat'))
  }

  const recordAssistant = (message: Record<string, unknown>) => {
    const id = typeof message.id === 'string' ? message.id : null
    let turn = turns[turns.length - 1]
    if (!turn || id === null || turn.id !== id) {
      turn = { id, text: [], tools: [], context: null }
      turns.push(turn)
      if (pending && ++pending.turnsSince > BIG_CONTEXT_GRACE_TURNS) {
        found.push(pending.incident)
        pending = null
      }
    }
    isAfterAssistant = true
    blocksOf(message.content).forEach((block) => {
      if (block.type === 'text' && typeof block.text === 'string') turn.text.push(block.text)
      if (block.type !== 'tool_use') return
      turn.tools.push(toolLabelOf(block))
      recordToolUse(block)
    })
    const usage = message.usage as Record<string, number> | undefined
    if (!usage || turn.context !== null) return
    turn.context = contextOfUsage(usage)
    if (!isArmed || turn.context <= BIG_CONTEXT) return
    isArmed = false
    pending = { turnsSince: 0, incident: makeIncident('big-context') }
  }

  const recordUser = (message: Record<string, unknown>, isMeta: boolean) => {
    blocksOf(message.content)
      .filter((b) => b.type === 'tool_result' && b.tool_use_id)
      .forEach((b) => {
        const name = toolOfId.get(b.tool_use_id as string)
        if (!name) return
        if (b.is_error !== true) {
          errorStreaks.set(name, 0)
          return
        }
        const streak = (errorStreaks.get(name) ?? 0) + 1
        errorStreaks.set(name, streak)
        if (streak === TOOL_ERROR_STREAK) found.push(makeIncident('tool-errors'))
      })
    const text = userTextOf(message.content)
    if (text === null || isNotUserText(text, isMeta)) return
    lastUserText = text
    if (isAfterAssistant && CORRECTION.test(text)) found.push(makeIncident('correction', text.slice(0, USER_TEXT_LENGTH)))
    isAfterAssistant = false
  }

  entries.forEach((entry, index) => {
    pos = index
    const time = typeof entry.timestamp === 'string' ? Date.parse(entry.timestamp) : Number.NaN
    at = Number.isNaN(time) ? null : time
    const message = entry.message as Record<string, unknown> | undefined
    if (message && typeof message === 'object') {
      if (entry.type === 'assistant') recordAssistant(message)
      if (entry.type === 'user') recordUser(message, entry.isMeta === true)
    }
    if (!isHandoffSignal(entry)) return
    pending = null
    isArmed = true
  })
  const unfinished = pending as { incident: Found } | null
  if (unfinished) found.push(unfinished.incident)
  if (lastSourceEdit && testRuns === 0) found.push(lastSourceEdit)
  return found
    .sort((a, b) => a.pos - b.pos)
    .map(({ pos: _pos, ...rest }, index) => ({ id: `${meta.sessionId.slice(0, 8)}-${index}`, sessionId: meta.sessionId, ticket: meta.ticket, ...rest }))
}

const keepRecent = (list: Incident[], limit: number): Incident[] => {
  const recent = list
    .map((incident, order) => ({ incident, order }))
    .sort((a, b) => (b.incident.at ?? 0) - (a.incident.at ?? 0) || b.order - a.order)
  const kept = new Set<(typeof recent)[number]>()
  const seenKinds = new Set<IncidentKind>()
  recent.forEach((item) => {
    if (seenKinds.has(item.incident.kind)) return
    seenKinds.add(item.incident.kind)
    kept.add(item)
  })
  recent.filter((item) => !kept.has(item)).slice(0, Math.max(0, limit - kept.size)).forEach((item) => kept.add(item))
  return recent.filter((item) => kept.has(item)).map((item) => item.incident)
}

const oldestDroppable = (list: Incident[]): number => {
  for (let i = list.length - 1; i >= 0; i--) if (list.some((other, j) => j !== i && other.kind === list[i].kind)) return i
  return list.length - 1
}

export const capIncidents = (all: Incident[]): Incident[] => {
  const bySession = new Map<string, Incident[]>()
  all.forEach((incident) => bySession.set(incident.sessionId, [...(bySession.get(incident.sessionId) ?? []), incident]))
  const perSession = [...bySession.values()].flatMap((list) => keepRecent(list, MAX_INCIDENTS_PER_SESSION))
  const kept = keepRecent(perSession, MAX_INCIDENTS_PER_DAY)
  while (kept.length > 1 && JSON.stringify(kept).length > MAX_INCIDENT_CHARS) kept.splice(oldestDroppable(kept), 1)
  return kept
}

const digestFile = async (
  path: string,
  since: number,
  meta: { sessionId: string; project: string },
  home: string
): Promise<{ digest: Digest; incidents: Incident[] }> => {
  const entries: Record<string, unknown>[] = []
  let ticket: string | null = null
  const reader = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity })
  for await (const line of reader) {
    const entry = parseLine(line)
    if (!entry) continue
    if (!ticket) ticket = ticketOfEntry(entry, home)
    if (!isRecentEntry(entry, since)) continue
    const slim = slimEntry(entry)
    if (slim) entries.push(slim)
  }
  const digest = digestEntries(entries, { ...meta, ticket })
  const sub = await digestSubagents(join(dirname(path), meta.sessionId), since)
  Object.entries(sub.costByStage).forEach(([stage, cost]) => {
    digest.costByStage[stage] = (digest.costByStage[stage] ?? 0) + cost
    digest.costUnits += cost
  })
  Object.entries(sub.costByModel).forEach(([model, cost]) => {
    digest.costByModel[model] = (digest.costByModel[model] ?? 0) + cost
  })
  return { digest, incidents: incidentsOf(entries, { sessionId: meta.sessionId, ticket }) }
}

const recentTranscripts = (projectsDir: string, since: number): { path: string; project: string; sessionId: string }[] =>
  readdirSync(projectsDir).flatMap((project) => {
    if (SKIPPED_PROJECTS.some((suffix) => project.endsWith(suffix))) return []
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
  sizeOf: ((ticket: string) => HandoffSize | null) | undefined,
  home: string
): Promise<{ digests: Digest[]; incidents: Incident[] }> => {
  const digests: Digest[] = []
  const incidents: Incident[] = []
  for (const t of recentTranscripts(projectsDir, since)) {
    try {
      const file = await digestFile(t.path, since, { sessionId: t.sessionId, project: t.project }, home)
      const digest = { ...file.digest, ...((file.digest.ticket && sizeOf?.(file.digest.ticket)) || {}) }
      digests.push(digest)
      incidents.push(...file.incidents)
    } catch (e) {
      console.error('[insights] digest failed:', t.path, e)
    }
  }
  return { digests, incidents: capIncidents(incidents) }
}

export const METRIC_KEYS = ['costUnits', 'avgContext', 'costAbove200k', 'corrections', 'toolErrors', 'ruleBreaks', 'repeatedCommands', 'noTests', 'sessions'] as const
export type MetricKey = (typeof METRIC_KEYS)[number]
export type DayMetrics = Record<MetricKey, number> & {
  day: string
  costByModel: Record<string, number>
  costByStage: Record<string, number>
  buckets: Record<ContextBucket, { turns: number; cost: number }>
  tickets: { ticket: string; cost: number; sessions: number; activeMinutes: number }[]
  topSessions: { sessionId: string; ticket: string | null; cost: number }[]
}

const RULE_BREAK_FLAGS = ['commit-without-ask', 'co-authored-by', 'chrome-launch', 'no-tests']
const TOP_SESSIONS = 5

const sumOf = (values: number[]): number => values.reduce((sum, value) => sum + value, 0)

const mergeCosts = (maps: Record<string, number>[]): Record<string, number> => {
  const merged: Record<string, number> = {}
  maps.forEach((map) => Object.entries(map).forEach(([key, cost]) => (merged[key] = (merged[key] ?? 0) + cost)))
  return merged
}

export const aggregateDay = (day: string, digests: Digest[]): DayMetrics => {
  const turns = sumOf(digests.map((d) => d.turns))
  const buckets: DayMetrics['buckets'] = {
    lt100k: { turns: 0, cost: 0 },
    '100to200k': { turns: 0, cost: 0 },
    '200to300k': { turns: 0, cost: 0 },
    gt300k: { turns: 0, cost: 0 }
  }
  digests.forEach((d) =>
    (Object.keys(buckets) as ContextBucket[]).forEach((key) => {
      buckets[key].turns += d.buckets[key].turns
      buckets[key].cost += d.buckets[key].cost
    })
  )
  const byTicket = new Map<string, DayMetrics['tickets'][number]>()
  digests.forEach((d) => {
    if (!d.ticket) return
    const entry = byTicket.get(d.ticket) ?? { ticket: d.ticket, cost: 0, sessions: 0, activeMinutes: 0 }
    byTicket.set(d.ticket, { ...entry, cost: entry.cost + d.costUnits, sessions: entry.sessions + 1, activeMinutes: entry.activeMinutes + d.activeMinutes })
  })
  return {
    day,
    costUnits: sumOf(digests.map((d) => d.costUnits)),
    avgContext: turns ? Math.round(sumOf(digests.map((d) => d.avgContext * d.turns)) / turns) : 0,
    costAbove200k: sumOf(digests.map((d) => d.costAbove200k)),
    corrections: sumOf(digests.map((d) => d.corrections.length)),
    toolErrors: sumOf(digests.flatMap((d) => Object.values(d.tools).map((t) => t.errors))),
    ruleBreaks: sumOf(digests.map((d) => d.ruleFlags.filter((flag) => RULE_BREAK_FLAGS.includes(flag)).length)),
    repeatedCommands: sumOf(digests.map((d) => d.repeatedCommands.length)),
    noTests: digests.filter((d) => d.ruleFlags.includes('no-tests')).length,
    sessions: digests.length,
    costByModel: mergeCosts(digests.map((d) => d.costByModel)),
    costByStage: mergeCosts(digests.map((d) => d.costByStage)),
    buckets,
    tickets: [...byTicket.values()].sort((a, b) => b.cost - a.cost),
    topSessions: digests
      .map((d) => ({ sessionId: d.sessionId, ticket: d.ticket, cost: d.costUnits }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, TOP_SESSIONS)
  }
}

export type Finding = {
  id: string
  kind: 'claude' | 'you'
  severity: 'high' | 'medium' | 'low'
  title: string
  cause: string
  metric: MetricKey
  sessions: string[]
  incidents: string[]
}
export type InsightsProposal = Proposal & { finding: string; why: string; expected: string; metric: MetricKey }
export type Tip = { id: string; finding: string; title: string; detail: string }
export type Effect = { proposal: string; verdict: 'improved' | 'no-change' | 'worse' | 'too-early'; note: string }
export type AppliedEntry = { id: string; target: string; title: string; day: string; metric: MetricKey }
export type InsightsResult = { headline: string; findings: Finding[]; proposals: InsightsProposal[]; tips: Tip[]; effects: Effect[] }

const MAX_FINDINGS = 5
const TOO_EARLY_DAYS = 3
const KINDS = ['claude', 'you']
const SEVERITIES = ['high', 'medium', 'low']
const VERDICTS = ['improved', 'no-change', 'worse', 'too-early']

type Raw = Record<string, unknown>

const isRaw = (value: unknown): value is Raw => !!value && typeof value === 'object' && !Array.isArray(value)
const isText = (value: unknown): value is string => typeof value === 'string' && value !== ''
const isMetric = (value: unknown): value is MetricKey => METRIC_KEYS.includes(value as MetricKey)
const rawList = (value: unknown): Raw[] => (Array.isArray(value) ? value.filter(isRaw) : [])
const textList = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [])

const sentences = (text: string, count: number): string => text.trim().split(/(?<=[.!?])\s+/).slice(0, count).join(' ')

const tryParse = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

const lastJsonBlock = (out: string): unknown => {
  const first = out.indexOf('```json')
  const last = out.lastIndexOf('```')
  const fenced = first >= 0 && last > first + 7 ? tryParse(out.slice(first + 7, last)) : null
  if (fenced !== null) return fenced
  const open = out.indexOf('{')
  const close = out.lastIndexOf('}')
  const bare = open >= 0 && close > open ? tryParse(out.slice(open, close + 1)) : null
  if (bare !== null) return bare
  const start = out.lastIndexOf('```json')
  const end = out.indexOf('```', start + 7)
  return start < 0 ? null : tryParse(out.slice(start + 7, end < 0 ? undefined : end))
}

const findingOf = (raw: Raw): Finding[] =>
  isText(raw.id) && KINDS.includes(raw.kind as string) && SEVERITIES.includes(raw.severity as string) && isText(raw.title) && isText(raw.cause) && isMetric(raw.metric)
    ? [{ id: raw.id, kind: raw.kind as Finding['kind'], severity: raw.severity as Finding['severity'], title: raw.title, cause: sentences(raw.cause, 2), metric: raw.metric, sessions: textList(raw.sessions), incidents: textList(raw.incidents) }]
    : []

const insightsProposalOf = (raw: Raw, home: string, findingIds: Set<string>): InsightsProposal[] => {
  if (!isText(raw.finding) || !findingIds.has(raw.finding) || !isText(raw.why) || !isText(raw.expected) || !isMetric(raw.metric)) return []
  const base = parseProposals([{ ...raw, evidence: raw.evidence ?? [] }], home)[0]
  return base ? [{ ...base, finding: raw.finding, why: sentences(raw.why, 1), expected: sentences(raw.expected, 1), metric: raw.metric }] : []
}

const tipOf = (raw: Raw, findingIds: Set<string>): Tip[] =>
  isText(raw.id) && isText(raw.finding) && findingIds.has(raw.finding) && isText(raw.title) && isText(raw.detail)
    ? [{ id: raw.id, finding: raw.finding, title: raw.title, detail: sentences(raw.detail, 2) }]
    : []

const daysBetween = (from: string, to: string): number => Math.round((Date.parse(to) - Date.parse(from)) / DAY)

const effectOf = (raw: Raw, ctx: { day: string; applied: AppliedEntry[] }): Effect[] => {
  const entry = ctx.applied.find((a) => a.id === raw.proposal)
  if (!entry || !VERDICTS.includes(raw.verdict as string) || typeof raw.note !== 'string') return []
  const elapsed = daysBetween(entry.day, ctx.day)
  const isTooEarly = Number.isNaN(elapsed) || elapsed < TOO_EARLY_DAYS
  return [{ proposal: entry.id, verdict: isTooEarly ? 'too-early' : (raw.verdict as Effect['verdict']), note: raw.note }]
}

export const parseInsights = (out: string, ctx: { home: string; day: string; applied: AppliedEntry[]; dismissed: DismissedEntry[] }): InsightsResult => {
  const json = lastJsonBlock(out)
  if (!isRaw(json)) return { headline: '', findings: [], proposals: [], tips: [], effects: [] }
  const findings = rawList(json.findings).flatMap(findingOf).slice(0, MAX_FINDINGS)
  const findingIds = new Set(findings.map((f) => f.id))
  return {
    headline: typeof json.headline === 'string' ? sentences(json.headline, 1) : '',
    findings,
    proposals: rawList(json.proposals)
      .flatMap((raw) => insightsProposalOf(raw, ctx.home, findingIds))
      .filter((p) => !isDismissedBy(ctx.dismissed, p)),
    tips: rawList(json.tips).flatMap((raw) => tipOf(raw, findingIds)),
    effects: rawList(json.effects).flatMap((raw) => effectOf(raw, ctx))
  }
}

const DEFAULT_GUIDE = [
  '# Przewodnik: co jest problemem',
  '',
  '- Commit, push i MR tylko na wyraźną prośbę użytkownika w tej wiadomości.',
  '- Żadnych linii Co-Authored-By ani innej atrybucji Claude w commitach i opisach MR.',
  '- Nigdy nie uruchamiaj Chrome samodzielnie; przeglądarka tylko przez `cockpit.js chrome`.',
  '- Każde pytanie do użytkownika idzie przez narzędzie AskUserQuestion.',
  '- Styl kodu: named exports, nazwane arrow functions, brak komentarzy, prefiks `is` dla booleanów, najmniejszy możliwy diff.',
  '- Na granicy etapu: handoff i `/clear`, a nie praca w kontekście powyżej 200k.',
  '- `task-implementer` pracuje na Sonnecie.',
  '- Zmiana źródeł bez uruchomienia testów to błąd.',
  ''
].join('\n')

export const ensureGuide = (path: string): void => {
  if (existsSync(path)) return
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, DEFAULT_GUIDE, 'utf8')
}

export const migrateFactoryDir = (oldDir: string, newDir: string): void => {
  const source = join(oldDir, 'dismissed.json')
  const target = join(newDir, 'dismissed.json')
  if (!existsSync(source) || existsSync(target)) return
  mkdirSync(newDir, { recursive: true })
  copyFileSync(source, target)
}

const JSON_DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.json$/
const KEEP_DAYS = 60
const HISTORY_DAYS = 30

export const expiredDayFiles = (names: string[], today: string): string[] => {
  const limit = Date.parse(today) - KEEP_DAYS * DAY
  return names.filter((name) => {
    const match = JSON_DAY_FILE.exec(name)
    return !!match && Date.parse(match[1]) < limit
  })
}

export const recentDayFiles = (names: string[]): string[] =>
  names
    .filter((name) => JSON_DAY_FILE.test(name))
    .sort()
    .slice(-HISTORY_DAYS)

export const isEmptyInsights = (result: InsightsResult): boolean =>
  !result.headline && !result.findings.length && !result.proposals.length && !result.tips.length && !result.effects.length

export const storedInsights = (json: unknown, home: string): InsightsResult | null => {
  if (!isRaw(json) || !Array.isArray(json.findings)) return null
  const findings = rawList(json.findings).flatMap(findingOf)
  const findingIds = new Set(findings.map((f) => f.id))
  return {
    headline: typeof json.headline === 'string' ? json.headline : '',
    findings,
    proposals: rawList(json.proposals).flatMap((raw) => insightsProposalOf(raw, home, findingIds)),
    tips: rawList(json.tips).flatMap((raw) => tipOf(raw, findingIds)),
    effects: rawList(json.effects).flatMap((raw) =>
      isText(raw.proposal) && VERDICTS.includes(raw.verdict as string) && typeof raw.note === 'string'
        ? [{ proposal: raw.proposal, verdict: raw.verdict as Effect['verdict'], note: raw.note }]
        : []
    )
  }
}

export const appliedList = (json: unknown): AppliedEntry[] =>
  rawList(json).flatMap((raw) =>
    isText(raw.id) && isText(raw.target) && isText(raw.title) && isText(raw.day) && isMetric(raw.metric)
      ? [{ id: raw.id, target: raw.target, title: raw.title, day: raw.day, metric: raw.metric }]
      : []
  )

export type InsightsReportResult = Omit<InsightsResult, 'proposals'> & { proposals: (InsightsProposal & { isDismissed: boolean; isApplied: boolean })[] }

export const withProposalStates = (result: InsightsResult, dismissed: DismissedEntry[], applied: AppliedEntry[]): InsightsReportResult => ({
  ...result,
  proposals: result.proposals.map((p) => ({ ...p, isDismissed: isDismissedBy(dismissed, p), isApplied: applied.some((a) => a.id === p.id) }))
})
