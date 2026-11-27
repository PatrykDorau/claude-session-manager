import type { Autonomy, Job, JobKind, JobRequest, JobState } from './orchestrator'
import type { PendingPrompt, PendingTool, Status } from '../renderer/src/types'
import { answerKeystrokes, type PromptAnswer } from './answerkeys'
import { isForbiddenDispatcherQuestion, isForbiddenPrompt, isForbiddenRequest } from './guard'
import { JUDGEABLE_TOOLS, allowedKeys, isPlainObject } from './judge'
import { PERMISSION_KEYS } from '../renderer/src/dashboard/inbox'

export interface DispatchOption {
  key: string
  label: string
}

export interface DispatchEvent {
  seq: number
  at: number
  type: 'job' | 'waiting' | 'session'
  jobId: string
  key: string
  kind: JobKind | 'session'
  state: JobState | Status
  text: string
  toolUseId: string | null
  tool: string | null
  options: DispatchOption[]
  prompt: PendingPrompt | null
}

export const EVENT_LIMIT = 500
export const DISPATCHER_NAME = 'dispatcher'

export type NewEvent = Omit<DispatchEvent, 'seq'>

export const appendEvents = (events: DispatchEvent[], added: NewEvent[]): DispatchEvent[] => {
  const last = events.length > 0 ? events[events.length - 1].seq : 0
  const numbered = added.map((event, index) => ({ ...event, seq: last + index + 1 }))
  return [...events, ...numbered].slice(-EVENT_LIMIT)
}

export const eventsSince = (
  events: DispatchEvent[],
  since: number
): { events: DispatchEvent[]; latest: number; isReset: boolean } => {
  const latest = events.length > 0 ? events[events.length - 1].seq : 0
  const isReset = since > latest
  return { events: isReset ? events : events.filter((event) => event.seq > since), latest, isReset }
}

export const jobLogEvents = (prev: Job[], next: Job[], at: number): NewEvent[] =>
  next.flatMap((job) => {
    const before = prev.find((candidate) => candidate.id === job.id)
    const known = new Set(before?.log)
    return job.log
      .filter((line) => !known.has(line))
      .map((line) => ({
        at,
        type: 'job' as const,
        jobId: job.id,
        key: job.key,
        kind: job.kind,
        state: job.state,
        text: line.text,
        toolUseId: null,
        tool: null,
        options: [],
        prompt: null
      }))
  })

export const pendingOptions = (pending: PendingTool, questionOptions: string[]): DispatchOption[] => {
  const labels = pending.name === 'AskUserQuestion' ? questionOptions : ['Yes', 'No']
  const toOption = (key: string, index: number): DispatchOption => ({ key, label: labels[index] })
  return allowedKeys(pending, questionOptions).map(toOption)
}

const MIN_ID_REF = 8

export const findSessionRef = <T extends { id: string; label: string }>(rows: T[], ref: string): T | null => {
  const wanted = ref.trim().toLowerCase()
  if (!wanted) return null
  const isIdMatch = (row: T): boolean => wanted.length >= MIN_ID_REF && row.id.toLowerCase().startsWith(wanted)
  const isLabelMatch = (row: T): boolean => row.label.toLowerCase() === wanted
  const byId = rows.filter(isIdMatch)
  if (byId.length === 1) return byId[0]
  const byLabel = rows.filter(isLabelMatch)
  return byLabel.length === 1 ? byLabel[0] : null
}

export const OPAQUE_PROMPT_TEXT = 'opaque: open the session'

export const opaquePrompt = (toolUseId: string, tool: string): PendingPrompt => ({
  toolUseId,
  tool,
  isOpaque: true,
  text: OPAQUE_PROMPT_TEXT,
  questions: []
})

const promptOptions = (prompt: PendingPrompt): DispatchOption[] => {
  if (prompt.isOpaque) return []
  if (prompt.tool !== 'AskUserQuestion') return pendingOptions({ name: prompt.tool, input: prompt.text, toolUseId: prompt.toolUseId }, [])
  const toOption = (option: { key: string; label: string }): DispatchOption => ({ key: option.key, label: option.label })
  return (prompt.questions[0]?.options ?? []).map(toOption)
}

export const waitingEvent = (job: Job, prompt: PendingPrompt, at: number): NewEvent => ({
  at,
  type: 'waiting',
  jobId: job.id,
  key: job.key,
  kind: job.kind,
  state: job.state,
  text: prompt.isOpaque ? OPAQUE_PROMPT_TEXT : prompt.text,
  toolUseId: prompt.toolUseId,
  tool: prompt.tool,
  options: promptOptions(prompt),
  prompt
})

const OPAQUE_KEY_SUFFIX = ':opaque'

export interface WaitingSession {
  id: string
  label: string
  title: string
  prompt: PendingPrompt | null
}

export const sessionWaitingEvents = (
  seen: Set<string>,
  sessions: WaitingSession[],
  skipIds: string[],
  at: number
): { events: NewEvent[]; seen: Set<string> } => {
  const isReported = (s: WaitingSession): boolean => !skipIds.includes(s.id)
  const promptOf = (s: WaitingSession): PendingPrompt => s.prompt ?? opaquePrompt('', 'unknown')
  const seenKeyOf = (s: WaitingSession): string => s.prompt?.toolUseId || `${s.id}${OPAQUE_KEY_SUFFIX}`
  const reported = sessions.filter(isReported)
  const currentKeys = new Set(reported.map(seenKeyOf))
  const isKept = (key: string): boolean => !key.endsWith(OPAQUE_KEY_SUFFIX) || currentKeys.has(key)
  const isNew = (s: WaitingSession): boolean => !seen.has(seenKeyOf(s))
  const toEvent = (s: WaitingSession): NewEvent => {
    const prompt = promptOf(s)
    return {
      at,
      type: 'waiting',
      jobId: s.id,
      key: s.label,
      kind: 'session',
      state: 'waiting',
      text: prompt.isOpaque ? OPAQUE_PROMPT_TEXT : prompt.text,
      toolUseId: prompt.toolUseId,
      tool: prompt.tool,
      options: promptOptions(prompt),
      prompt
    }
  }
  const fresh = reported.filter(isNew)
  const next = new Set([...seen].filter(isKept))
  for (const s of fresh) next.add(seenKeyOf(s))
  return { events: fresh.map(toEvent), seen: next }
}

export interface SessionEventInput {
  id: string
  status: Status
  isLive: boolean
  label: string
  title: string
}

const REPORTED_STATUSES: Status[] = ['waiting', 'checkout']

export const sessionEvents = (
  prev: Record<string, Status>,
  sessions: SessionEventInput[],
  skipIds: string[],
  at: number
): { events: NewEvent[]; next: Record<string, Status> } => {
  const isLive = (s: SessionEventInput): boolean => s.isLive
  const live = sessions.filter(isLive)
  const isReported = (s: SessionEventInput): boolean =>
    !skipIds.includes(s.id) && !!prev[s.id] && prev[s.id] !== s.status && REPORTED_STATUSES.includes(s.status)
  const toEvent = (s: SessionEventInput): NewEvent => ({
    at,
    type: 'session',
    jobId: s.id,
    key: s.label,
    kind: 'session',
    state: s.status,
    text: s.title,
    toolUseId: null,
    tool: null,
    options: [],
    prompt: null
  })
  const toEntry = (s: SessionEventInput): [string, Status] => [s.id, s.status]
  return { events: live.filter(isReported).map(toEvent), next: Object.fromEntries(live.map(toEntry)) }
}

const refusedTool = (pending: PendingTool, rawInput: unknown): string | null => {
  if (!JUDGEABLE_TOOLS.includes(pending.name) || !isPlainObject(rawInput)) return 'only the user can answer this prompt'
  if (isForbiddenRequest(pending.name, rawInput)) return 'forbidden request'
  if (pending.name === 'AskUserQuestion' && isForbiddenDispatcherQuestion(rawInput)) return 'forbidden request'
  return null
}

export const refusedAnswer =(pending: PendingTool, rawInput: unknown, questionOptions: string[], key: string): string | null => {
  const toolReason = refusedTool(pending, rawInput)
  if (toolReason) return toolReason
  if (pending.name !== 'AskUserQuestion' && key === PERMISSION_KEYS.always) return 'always-allow is not permitted'
  if (!allowedKeys(pending, questionOptions).includes(key)) return 'key not allowed'
  return null
}

const trimmedString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

export const parseAnswer = (body: Record<string, unknown>): PromptAnswer => {
  const keys = trimmedString(body.keys)
  const key = trimmedString(body.key)
  const text = trimmedString(body.text)
  const isPresent = (part: string): boolean => part !== ''
  const splitKeys = (part: string): string[] => part.split(',').map(trimmedString).filter(isPresent)
  const choices = keys ? keys.split('|').map(splitKeys) : key ? [[key]] : []
  return { choices, text: text || null }
}

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/

const isReason = (reason: string | null): reason is string => reason !== null

export const refusedPromptAnswer = (prompt: PendingPrompt, rawInput: unknown, answer: PromptAnswer): string | null => {
  if (prompt.isOpaque) return 'only the user can answer this prompt'
  const pending: PendingTool = { name: prompt.tool, input: prompt.text, toolUseId: prompt.toolUseId }
  const toolReason = refusedTool(pending, rawInput)
  if (toolReason) return toolReason
  if (answer.text !== null && isForbiddenPrompt(answer.text)) return 'forbidden text'
  if (answer.text !== null && CONTROL_CHARACTER.test(answer.text)) return 'text has control characters'
  const keys = answer.choices.flat()
  if (prompt.tool !== 'AskUserQuestion') {
    if (answer.text !== null || keys.length !== 1) return 'a permission takes one key'
    return refusedAnswer(pending, rawInput, [], keys[0])
  }
  const labelOf = (option: { label: string }): string => option.label
  const refusedChoice = (choice: string[], index: number): string | null => {
    const labels = (prompt.questions[index]?.options ?? []).map(labelOf)
    const refusedKey = (key: string): string | null => refusedAnswer(pending, rawInput, labels, key)
    return choice.map(refusedKey).find(isReason) ?? null
  }
  return answer.choices.map(refusedChoice).find(isReason) ?? null
}

export interface AnswerTarget {
  prompt: PendingPrompt | null
  rawInput: unknown
  writeKeys: (keystrokes: string[]) => Promise<{ error: string | null }>
}

export const answerPrompt = async (
  target: AnswerTarget,
  toolUseId: string,
  answer: PromptAnswer
): Promise<{ error: string | null; isRefusal: boolean }> => {
  const { prompt } = target
  if (!prompt || !toolUseId || prompt.toolUseId !== toolUseId) return { error: 'no such pending prompt', isRefusal: false }
  const reason = refusedPromptAnswer(prompt, target.rawInput, answer)
  if (reason) return { error: reason, isRefusal: true }
  const keystrokes = prompt.tool === 'AskUserQuestion' ? answerKeystrokes(prompt, answer) : answer.choices.flat()
  if ('error' in keystrokes) return { error: keystrokes.error, isRefusal: false }
  const written = await target.writeKeys(keystrokes)
  return { error: written.error, isRefusal: false }
}

export const answerSummary = (answer: PromptAnswer): string => {
  const joinKeys = (choice: string[]): string => choice.join(',')
  const parts = answer.choices.map(joinKeys)
  return (answer.text === null ? parts : [...parts, 'text']).join('|')
}

export const refusedPrompt = (text: string, status: Status | null): string | null => {
  if (status !== 'idle') return 'session is not ready for a prompt'
  if (isForbiddenPrompt(text)) return 'forbidden request'
  return null
}

export interface DispatchJobRow {
  id: string
  kind: JobKind
  key: string
  title: string
  state: JobState
  autonomy: Autonomy
  log: string[]
  pending: { toolUseId: string; tool: string; text: string; options: DispatchOption[] } | null
  prompt: PendingPrompt | null
}

export const jobRow = (job: Job, pending: PendingTool | null, questionOptions: string[], prompt: PendingPrompt | null = null): DispatchJobRow => ({
  id: job.id,
  kind: job.kind,
  key: job.key,
  title: job.title,
  state: job.state,
  autonomy: job.autonomy,
  log: job.log.slice(-3).map((line) => line.text),
  pending: pending
    ? { toolUseId: pending.toolUseId, tool: pending.name, text: pending.input, options: pendingOptions(pending, questionOptions) }
    : null,
  prompt
})

interface StartInput {
  ticket: string
  review: string
  watch: string
  autonomy: string
}

interface StartLookups {
  jiraTitles: Record<string, string | undefined>
  mrs: { key: string; iid: number; title: string }[]
  repoFor: (key: string) => string | null
}

export const startRequestOf = (input: StartInput, lookups: StartLookups): JobRequest | null => {
  const ticket = input.ticket.toUpperCase()
  if (ticket) {
    const title = lookups.jiraTitles[ticket]
    if (title === undefined) return null
    return {
      kind: 'ticket',
      key: ticket,
      title,
      repo: lookups.repoFor(ticket),
      autonomy: input.autonomy === 'autonomous' ? 'autonomous' : 'manual'
    }
  }
  const mrRef = input.review || input.watch
  const mr = lookups.mrs.find((m) => m.key === mrRef || String(m.iid) === mrRef)
  if (!mrRef || !mr) return null
  return { kind: input.review ? 'review' : 'watch', key: mr.key, title: mr.title, repo: null, autonomy: 'routine' }
}

export const isDispatcherLive = (status: Status | null): boolean => status !== null && status !== 'closed'

export const dispatcherStartError = (out: string): string => {
  const lines = out.trim().split(/\r?\n/).map((line) => line.trim())
  return lines.find((line) => /workspace not trusted/i.test(line)) ?? (lines.pop() || 'claude did not start')
}

export const findDispatcherSession = <T extends { id: string }>(sessions: T[], knownId: string | null): T | undefined =>
  knownId ? sessions.find((s) => s.id.startsWith(knownId)) : undefined

export const dispatcherArgs = (): string[] => ['--bg', '--name', DISPATCHER_NAME, '--model', 'sonnet', 'Use the dispatcher skill.']
