import { ticketOfEntry } from './insights'

export interface AttentionEvent {
  at: number
  ticket: string | null
  source: 'transcript' | 'cockpit'
}

export interface TicketTime {
  ticket: string | null
  minutes: number
  share: number
  hours: number
}

export interface DayResult {
  day: string
  totalMinutes: number
  baseHours: number
  rows: TicketTime[]
  strip: { ticket: string | null; from: number; to: number }[]
}

interface Bounds {
  start: number
  end: number
}

export const CAP_MS = 15 * 60_000

const MINUTE_MS = 60_000
const ROUND_STEP = 0.25
const NON_PROMPT_PREFIXES = [
  '<command-',
  '<local-command-',
  'Caveat:',
  '[Request interrupted by user',
  '<system-reminder>',
  '<task-notification>'
]

type ContentBlock = {
  type?: string
  text?: unknown
  tool_use_id?: unknown
  id?: unknown
  name?: unknown
}

const contentOf = (entry: Record<string, unknown>): unknown =>
  (entry.message as Record<string, unknown> | undefined)?.content

const blocksOf = (content: unknown): ContentBlock[] =>
  Array.isArray(content) ? (content as ContentBlock[]) : []

const isPromptText = (text: string): boolean => {
  const trimmed = text.trimStart()
  const isNonPrompt = (prefix: string): boolean => trimmed.startsWith(prefix)
  return trimmed !== '' && !NON_PROMPT_PREFIXES.some(isNonPrompt)
}

const isToolResultBlock = (block: ContentBlock): boolean => block.type === 'tool_result'

const isTextBlock = (block: ContentBlock): boolean =>
  block.type === 'text' && typeof block.text === 'string'

const isBlockPromptText = (block: ContentBlock): boolean => isPromptText(block.text as string)

const sumOf = (values: number[]): number => values.reduce(addNumbers, 0)

const addNumbers = (a: number, b: number): number => a + b

const byStart = (a: AttentionEvent, b: AttentionEvent): number => a.at - b.at

const byRemainderThenIndex = (
  a: { index: number; remainder: number },
  b: { index: number; remainder: number }
): number => b.remainder - a.remainder || a.index - b.index

export const TODAY_CACHE_MS = 60_000

export const isDayCacheFresh = (
  cachedAt: number | null,
  day: string,
  today: string,
  now: number,
  isForced: boolean
): boolean => {
  if (cachedAt === null || isForced) return false
  return day === today ? now - cachedAt < TODAY_CACHE_MS : cachedAt >= dayBounds(day).end
}

export const dayOf = (at: number): string => {
  const date = new Date(at)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export const dayBounds = (day: string): Bounds => {
  const [year, month, date] = day.split('-').map(Number)
  return {
    start: new Date(year, month - 1, date).getTime(),
    end: new Date(year, month - 1, date + 1).getTime()
  }
}

export const isAttentionEntry = (
  entry: Record<string, unknown>,
  askToolIds: Set<string>
): boolean => {
  if (entry.type !== 'user' || entry.isMeta || entry.isCompactSummary || entry.isSidechain)
    return false
  const content = contentOf(entry)
  if (typeof content === 'string') return isPromptText(content)
  const blocks = blocksOf(content)
  const isAskResult = (block: ContentBlock): boolean =>
    typeof block.tool_use_id === 'string' && askToolIds.has(block.tool_use_id)
  const results = blocks.filter(isToolResultBlock)
  if (results.length > 0) return results.some(isAskResult)
  const texts = blocks.filter(isTextBlock)
  return texts.length > 0 && texts.every(isBlockPromptText)
}

export const askToolIdsOf = (entries: Record<string, unknown>[]): Set<string> => {
  const ids = new Set<string>()
  for (const entry of entries) {
    for (const block of blocksOf(contentOf(entry))) {
      if (
        block.type === 'tool_use' &&
        block.name === 'AskUserQuestion' &&
        typeof block.id === 'string'
      )
        ids.add(block.id)
    }
  }
  return ids
}

const SLIM_TEXT_LENGTH = 64

const slimBlock = (block: ContentBlock): ContentBlock => {
  if (block.type === 'text' && typeof block.text === 'string')
    return { type: 'text', text: block.text.trimStart().slice(0, SLIM_TEXT_LENGTH) }
  if (block.type === 'tool_result') return { type: 'tool_result', tool_use_id: block.tool_use_id }
  if (block.type === 'tool_use') return { type: 'tool_use', id: block.id, name: block.name }
  return { type: block.type }
}

export const slimEntry = (
  entry: Record<string, unknown>,
  bounds: Bounds
): Record<string, unknown> | null => {
  const at = typeof entry.timestamp === 'string' ? Date.parse(entry.timestamp) : NaN
  if (Number.isNaN(at) || at < bounds.start || at >= bounds.end) return null
  const content = contentOf(entry)
  const slimContent =
    typeof content === 'string'
      ? content.trimStart().slice(0, SLIM_TEXT_LENGTH)
      : Array.isArray(content)
        ? blocksOf(content).map(slimBlock)
        : undefined
  return {
    type: entry.type,
    timestamp: entry.timestamp,
    isMeta: entry.isMeta,
    isSidechain: entry.isSidechain,
    isCompactSummary: entry.isCompactSummary,
    gitBranch: entry.gitBranch,
    cwd: entry.cwd,
    message: { content: slimContent }
  }
}

export const transcriptEvents = (
  entries: Record<string, unknown>[],
  home: string,
  bounds: Bounds
): AttentionEvent[] => {
  const askToolIds = askToolIdsOf(entries)
  const events: AttentionEvent[] = []
  for (const entry of entries) {
    if (!isAttentionEntry(entry, askToolIds)) continue
    const at = typeof entry.timestamp === 'string' ? Date.parse(entry.timestamp) : NaN
    if (Number.isNaN(at) || at < bounds.start || at >= bounds.end) continue
    events.push({ at, ticket: ticketOfEntry(entry, home), source: 'transcript' })
  }
  return events
}

export const attribute = (
  events: AttentionEvent[],
  bounds: Bounds,
  capMs: number
): { minutes: Map<string | null, number>; strip: DayResult['strip'] } => {
  const isInBounds = (event: AttentionEvent): boolean =>
    event.at >= bounds.start && event.at < bounds.end
  const sorted = events.filter(isInBounds).sort(byStart)
  const minutes = new Map<string | null, number>()
  const strip: DayResult['strip'] = []
  const credit = (event: AttentionEvent, index: number): void => {
    const nextAt = sorted[index + 1]?.at ?? Infinity
    const to = Math.min(event.at + Math.min(nextAt - event.at, capMs), bounds.end)
    if (to <= event.at) return
    minutes.set(event.ticket, (minutes.get(event.ticket) ?? 0) + (to - event.at) / MINUTE_MS)
    const last = strip[strip.length - 1]
    if (last && last.ticket === event.ticket && last.to === event.at) last.to = to
    else strip.push({ ticket: event.ticket, from: event.at, to })
  }
  sorted.forEach(credit)
  return { minutes, strip }
}

export const roundHours = (
  shares: { ticket: string | null; share: number }[],
  baseHours: number,
  step: number
): Map<string | null, number> => {
  const totalUnits = Math.round(baseHours / step)
  const toExact = (s: {
    ticket: string | null
    share: number
  }): {
    ticket: string | null
    units: number
  } => ({ ticket: s.ticket, units: s.share * totalUnits })
  const exact = shares.map(toExact)
  const toFloor = (e: { units: number }): number => Math.floor(e.units + 1e-9)
  const floors = exact.map(toFloor)
  let remaining = totalUnits - sumOf(floors)
  const toRemainder = (
    e: { units: number },
    index: number
  ): { index: number; remainder: number } => ({ index, remainder: e.units - floors[index] })
  const byRemainder = exact.map(toRemainder).sort(byRemainderThenIndex)
  for (const { index } of byRemainder) {
    if (remaining <= 0) break
    floors[index] += 1
    remaining -= 1
  }
  const toEntry = (e: { ticket: string | null }, index: number): [string | null, number] => [
    e.ticket,
    floors[index] * step
  ]
  return new Map(exact.map(toEntry))
}

export const buildDay = (day: string, events: AttentionEvent[], baseHours: number): DayResult => {
  const { minutes, strip } = attribute(events, dayBounds(day), CAP_MS)
  const total = sumOf([...minutes.values()])
  if (total === 0) return { day, totalMinutes: 0, baseHours, rows: [], strip }
  const toShare = ([ticket, m]: [string | null, number]): {
    ticket: string | null
    share: number
  } => ({ ticket, share: m / total })
  const hours = roundHours([...minutes].map(toShare), baseHours, ROUND_STEP)
  const byMinutesDesc = (a: [string | null, number], b: [string | null, number]): number =>
    b[1] - a[1]
  const toRow = ([ticket, m]: [string | null, number]): TicketTime => ({
    ticket,
    minutes: Math.round(m),
    share: m / total,
    hours: hours.get(ticket) ?? 0
  })
  const rows = [...minutes].sort(byMinutesDesc).map(toRow)
  return { day, totalMinutes: Math.round(total), baseHours, rows, strip }
}
