interface Head {
  sessionId: string | null
  cwd: string | null
  gitBranch: string | null
  firstPrompt: string | null
}

function textOf(content: unknown): string | null {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const t = content.find((c) => c && typeof c === 'object' && (c as any).type === 'text')
    if (t && typeof (t as any).text === 'string') return (t as any).text
  }
  return null
}

export function parseTail(lines: string[]): { pendingToolUse: boolean } {
  for (let i = lines.length - 1; i >= 0; i--) {
    let o: any
    try {
      o = JSON.parse(lines[i])
    } catch {
      continue
    }
    if (o.type === 'assistant') return { pendingToolUse: o.message?.stop_reason === 'tool_use' }
    if (o.type === 'user') return { pendingToolUse: false }
  }
  return { pendingToolUse: false }
}

export function parseTranscriptHead(lines: string[]): Head {
  const head: Head = { sessionId: null, cwd: null, gitBranch: null, firstPrompt: null }
  for (const line of lines) {
    let o: any
    try {
      o = JSON.parse(line)
    } catch {
      continue
    }
    if (head.sessionId == null && typeof o.sessionId === 'string') head.sessionId = o.sessionId
    if (head.cwd == null && typeof o.cwd === 'string') head.cwd = o.cwd
    if (head.gitBranch == null && typeof o.gitBranch === 'string') head.gitBranch = o.gitBranch
    if (head.firstPrompt == null && o.type === 'user' && o.message) {
      const t = textOf(o.message.content)
      if (t) head.firstPrompt = t
    }
  }
  return head
}
