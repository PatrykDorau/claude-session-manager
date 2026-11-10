interface Head {
  sessionId: string | null
  cwd: string | null
  gitBranch: string | null
  firstPrompt: string | null
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
  isQuestion: boolean
  question: string | null
  model: string | null
  contextTokens: number | null
  gitBranch: string | null
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
  return { pendingToolUse, isQuestion: question !== null, question, model, contextTokens, gitBranch }
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
