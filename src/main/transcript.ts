import type { PendingTool } from '../renderer/src/types'

interface Head {
  sessionId: string | null
  cwd: string | null
  gitBranch: string | null
  firstPrompt: string | null
  title?: string | null
}

const NOT_PROMPT = /^<(local-command-caveat|system-reminder|local-command-stdout)>/

function textOf(content: unknown): string | null {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const t = content.find((c) => c && typeof c === 'object' && (c as any).type === 'text')
    if (t && typeof (t as any).text === 'string') return (t as any).text
  }
  return null
}

interface Tail {
  pendingToolUse: boolean
  pendingTool: PendingTool | null
  isOpaqueRequest: boolean
  questionOptions: string[]
  isQuestion: boolean
  question: string | null
  model: string | null
  contextTokens: number | null
  gitBranch: string | null
}

const OPAQUE_TOOLS = ['Agent', 'Task', 'ExitPlanMode']
const FILE_TOOLS = ['Edit', 'Write', 'Read', 'MultiEdit', 'NotebookEdit']
const INPUT_MAX = 300

const toolInput = (name: string, input: any): string => {
  const text =
    name === 'Bash' && typeof input?.command === 'string'
      ? input.command
      : FILE_TOOLS.includes(name) && typeof input?.file_path === 'string'
        ? input.file_path
        : JSON.stringify(input ?? {})
  return text.length > INPUT_MAX ? `${text.slice(0, INPUT_MAX - 1)}…` : text
}

const singlePendingUse = (message: any): { use: any; questions: any[]; isNone: boolean; isOpaque: boolean } => {
  const uses = message?.stop_reason === 'tool_use' && Array.isArray(message.content) ? message.content.filter((c: any) => c?.type === 'tool_use') : []
  const use = uses[0]
  const questions = use?.name === 'AskUserQuestion' && Array.isArray(use.input?.questions) ? use.input.questions : []
  const isOpaque = uses.length > 1 || OPAQUE_TOOLS.includes(use?.name) || questions.length > 1 || !!questions[0]?.multiSelect
  return { use, questions, isNone: !uses.length, isOpaque }
}

const pendingRequest = (message: any): { pendingTool: PendingTool | null; isOpaqueRequest: boolean; questionOptions: string[] } => {
  const { use, questions, isNone, isOpaque } = singlePendingUse(message)
  if (isNone) return { pendingTool: null, isOpaqueRequest: false, questionOptions: [] }
  if (isOpaque) return { pendingTool: null, isOpaqueRequest: true, questionOptions: [] }
  const options = questions[0]?.options
  return {
    pendingTool: { name: String(use.name), input: toolInput(String(use.name), use.input), toolUseId: String(use.id ?? '') },
    isOpaqueRequest: false,
    questionOptions: Array.isArray(options) ? options.map((o: any) => o?.label).filter((l: unknown): l is string => typeof l === 'string') : []
  }
}

const lastMessage = (lines: string[]): any => {
  const entries = lines.flatMap((line) => {
    try {
      const o = JSON.parse(line)
      return o?.type === 'assistant' || o?.type === 'user' ? [o] : []
    } catch {
      return []
    }
  })
  const last = entries[entries.length - 1]
  if (last?.type !== 'assistant') return null
  const id = last.message?.id
  const sameMessage: any[] = []
  for (let i = entries.length - 1; i >= 0 && entries[i].type === 'assistant' && (id ? entries[i].message?.id === id : i === entries.length - 1); i--) sameMessage.unshift(entries[i])
  return { ...last.message, content: sameMessage.flatMap((o) => (Array.isArray(o.message?.content) ? o.message.content : [])) }
}

export const pendingRawInput = (lines: string[]): unknown | null => {
  const { use, isNone, isOpaque } = singlePendingUse(lastMessage(lines))
  return isNone || isOpaque ? null : use.input ?? null
}

const QUESTION_END = /\?[\s*_`)"'\]]*$/

const askedQuestion = (message: any): string | null => {
  const content = Array.isArray(message?.content) ? message.content : []
  if (message?.stop_reason === 'tool_use') {
    const ask = content.find((c: any) => c?.type === 'tool_use' && c.name === 'AskUserQuestion')
    if (!ask) return null
    const first = ask.input?.questions?.[0]?.question
    return typeof first === 'string' ? first : 'Claude asked a question'
  }
  const lastText = [...content].reverse().find((c: any) => c?.type === 'text' && typeof c.text === 'string')
  if (message?.stop_reason !== 'end_turn' || !lastText || !QUESTION_END.test(lastText.text)) return null
  return lastText.text.trim().split(/\n\s*\n/).pop().trim()
}

export function parseTail(lines: string[]): Tail {
  let lastRealType: string | null = null
  let pendingToolUse = false
  let question: string | null = null
  let model: string | null = null
  let contextTokens: number | null = null
  let gitBranch: string | null = null
  for (let i = lines.length - 1; i >= 0; i--) {
    let o: any
    try {
      o = JSON.parse(lines[i])
    } catch {
      continue
    }
    if (o.type !== 'assistant' && o.type !== 'user') continue
    if (gitBranch === null && typeof o.gitBranch === 'string' && o.gitBranch) gitBranch = o.gitBranch
    if (lastRealType === null) {
      lastRealType = o.type
      if (o.type === 'assistant') pendingToolUse = o.message?.stop_reason === 'tool_use'
      if (o.type === 'assistant') question = askedQuestion(o.message)
    }
    if (o.type === 'assistant' && model === null && o.message) {
      if (typeof o.message.model === 'string') model = o.message.model
      const u = o.message.usage
      if (u) {
        contextTokens =
          (u.input_tokens || 0) +
          (u.cache_read_input_tokens || 0) +
          (u.cache_creation_input_tokens || 0)
      }
    }
    if (lastRealType !== null && model !== null && gitBranch !== null) break
  }
  const request = pendingRequest(lastMessage(lines))
  return { pendingToolUse, ...request, isQuestion: question !== null, question, model, contextTokens, gitBranch }
}

const createPromptFilter = (): ((o: any) => string | null) => {
  let isAfterCaveat = false
  const realPrompt = (o: any): string | null => {
    if (o?.type !== 'user' || !o.message) return null
    const t = textOf(o.message.content)?.trimStart()
    const isCaveat = !!t?.startsWith('<local-command-caveat>')
    const isLocalCommand = isAfterCaveat && !!t?.startsWith('<command-')
    isAfterCaveat = isCaveat || isLocalCommand
    if (o.isMeta || o.isCompactSummary || !t || isLocalCommand || NOT_PROMPT.test(t)) return null
    return textOf(o.message.content)
  }
  return realPrompt
}

const parseLine = (line: string): any => {
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}

export function parseTranscriptHead(lines: string[]): Head {
  const head: Head = { sessionId: null, cwd: null, gitBranch: null, firstPrompt: null }
  const realPrompt = createPromptFilter()
  for (const line of lines) {
    const o = parseLine(line)
    if (!o) continue
    if (head.sessionId == null && typeof o.sessionId === 'string') head.sessionId = o.sessionId
    if (head.cwd == null && typeof o.cwd === 'string') head.cwd = o.cwd
    if (head.gitBranch == null && typeof o.gitBranch === 'string') head.gitBranch = o.gitBranch
    if (head.title == null && o.type === 'custom-title' && typeof o.customTitle === 'string') head.title = o.customTitle
    if (head.firstPrompt != null) continue
    head.firstPrompt = realPrompt(o)
  }
  return head
}

export const countTurns = (lines: string[]): number => {
  const realPrompt = createPromptFilter()
  return lines.filter((line) => realPrompt(parseLine(line)) !== null).length
}

export const lastMessages = (lines: string[], limit: number): { role: 'user' | 'assistant'; text: string }[] => {
  const realPrompt = createPromptFilter()
  const messages = lines.flatMap((line) => {
    const o = parseLine(line)
    if ((o?.type !== 'user' && o?.type !== 'assistant') || !o.message) return []
    const text = o.type === 'user' ? realPrompt(o) : textOf(o.message.content)
    return text?.trim() ? [{ role: o.type as 'user' | 'assistant', text }] : []
  })
  return messages.slice(-limit)
}

export interface DetailCache<T> {
  get: (file: string, size: number, mtimeMs: number, read: () => string[]) => T
}

export const createDetailCache = <T>(parse: (lines: string[]) => T): DetailCache<T> => {
  const entries = new Map<string, { size: number; mtimeMs: number; value: T }>()
  const get = (file: string, size: number, mtimeMs: number, read: () => string[]): T => {
    const hit = entries.get(file)
    if (hit && hit.size === size && hit.mtimeMs === mtimeMs) return hit.value
    const value = parse(read())
    entries.set(file, { size, mtimeMs, value })
    return value
  }
  return { get }
}
