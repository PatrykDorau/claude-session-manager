export type PromptEntry = {
  text: string
  at: number
  ticket: string | null
  project: string
  sessionId: string | null
  isIncomplete: boolean
}

const WORKTREE_TAIL = /[\\/]\.claude[\\/]worktrees[\\/](.+)$/
const TICKET_SEGMENT = /^([A-Z][A-Z0-9]+-\d+)(?:-|$)/i
const PASTED_MARKER = /\[Pasted text #(\d+)[^\]]*\]/g
const BARE_COMMAND = /^\/[\w:-]+$/

const ticketOf = (project: string): string | null => {
  const tail = WORKTREE_TAIL.exec(project)?.[1] ?? ''
  for (const segment of tail.split(/[\\/]/)) {
    const key = TICKET_SEGMENT.exec(segment)?.[1]
    if (key) return key.toUpperCase()
  }
  return null
}

const parseLine = (
  line: string,
  readPaste: (hash: string) => string | null
): PromptEntry | null => {
  try {
    const raw = JSON.parse(line)
    if (typeof raw?.display !== 'string' || typeof raw.timestamp !== 'number') return null
    const pasted = raw.pastedContents ?? {}
    let isIncomplete = false
    const fillPaste = (marker: string, id: string): string => {
      const item = pasted[id]
      if (item?.type !== 'text') return marker
      if (typeof item.content === 'string') return item.content
      const cached = typeof item.contentHash === 'string' ? readPaste(item.contentHash) : null
      if (cached !== null) return cached
      isIncomplete = true
      return marker
    }
    const text = raw.display.replace(PASTED_MARKER, fillPaste).trim()
    if (!text || BARE_COMMAND.test(text)) return null
    const project = typeof raw.project === 'string' ? raw.project : ''
    return {
      text,
      at: raw.timestamp,
      ticket: ticketOf(project),
      project,
      sessionId: typeof raw.sessionId === 'string' ? raw.sessionId : null,
      isIncomplete
    }
  } catch {
    return null
  }
}

const noPaste = (): string | null => null

export const parseHistory = (
  lines: string[],
  readPaste: (hash: string) => string | null = noPaste
): PromptEntry[] => {
  const newest = new Map<string, PromptEntry>()
  for (const line of lines) {
    const entry = parseLine(line, readPaste)
    if (!entry) continue
    const known = newest.get(entry.text)
    if (!known || known.at < entry.at) newest.set(entry.text, entry)
  }
  return [...newest.values()].sort((a, b) => b.at - a.at)
}
