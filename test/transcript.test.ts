import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseTranscriptHead, parseTail, countTurns, lastMessages, createDetailCache } from '../src/main/transcript'

describe('parseTranscriptHead', () => {
  const lines = readFileSync(join(__dirname, 'fixtures/session-sample.jsonl'), 'utf8')
    .split(/\r?\n/).filter(Boolean)

  it('extracts session id, cwd, branch', () => {
    const h = parseTranscriptHead(lines)
    expect(h.sessionId).toBe('9d84c0ea')
    expect(h.cwd).toContain('krs-fo-smarttv')
    expect(h.gitBranch).toBe('fix/SOFKRS-8028-next-episode')
  })
  it('uses the first user message as firstPrompt', () => {
    expect(parseTranscriptHead(lines).firstPrompt).toBe('Fix the next episode bug')
  })
  it('skips meta, caveat, reminder and tool_result entries when picking firstPrompt', () => {
    const l = [
      '{"type":"user","cwd":"C:/x","isMeta":true,"message":{"content":"<local-command-caveat>x</local-command-caveat>"}}',
      '{"type":"user","message":{"content":[{"type":"tool_result","content":"SOFKAN-1"}]}}',
      '{"type":"user","message":{"content":"<system-reminder>SOFKAN-2</system-reminder>"}}',
      '{"type":"user","message":{"content":"SOFRMPT-3769 popraw"}}'
    ]
    expect(parseTranscriptHead(l).firstPrompt).toBe('SOFRMPT-3769 popraw')
  })
  it('skips a local command such as /clear that follows the caveat entry', () => {
    const l = [
      '{"type":"user","cwd":"C:/x","isMeta":true,"message":{"content":"<local-command-caveat>Caveat</local-command-caveat>"}}',
      '{"type":"user","message":{"content":"<command-name>/clear</command-name> <command-message>clear</command-message> <command-args></command-args>"}}',
      '{"type":"user","message":{"content":"<local-command-stdout></local-command-stdout>"}}',
      '{"type":"user","message":{"content":"SOFKRS-77 napraw"}}'
    ]
    expect(parseTranscriptHead(l).firstPrompt).toBe('SOFKRS-77 napraw')
  })
  it('keeps a skill slash command as the first prompt', () => {
    const l = [
      '{"type":"user","cwd":"C:/x","message":{"content":"<command-message>superpowers:brainstorming</command-message> <command-name>/superpowers:brainstorming</command-name> <command-args>SOFKAN-5 x</command-args>"}}'
    ]
    expect(parseTranscriptHead(l).firstPrompt).toContain('SOFKAN-5')
  })
  it('tolerates garbage lines', () => {
    const h = parseTranscriptHead(['not json', ...lines, '{bad'])
    expect(h.sessionId).toBe('9d84c0ea')
  })
  it('returns nulls for empty input', () => {
    expect(parseTranscriptHead([])).toEqual({ sessionId: null, cwd: null, gitBranch: null, firstPrompt: null })
  })
})

describe('parseTail', () => {
  const asstToolUse = '{"type":"assistant","message":{"stop_reason":"tool_use","content":[{"type":"tool_use"}]}}'
  const asstEndTurn = '{"type":"assistant","message":{"stop_reason":"end_turn","content":[{"type":"text","text":"done"}]}}'
  const userResult = '{"type":"user","message":{"content":[{"type":"tool_result"}]}}'
  const marker = '{"type":"system","subtype":"turn_duration"}'
  const lastPrompt = '{"type":"last-prompt","leafUuid":"x"}'

  it('flags pending when the last message is an assistant tool_use', () => {
    expect(parseTail([userResult, asstToolUse]).pendingToolUse).toBe(true)
  })
  it('looks past trailing markers and system lines', () => {
    expect(parseTail([asstToolUse, marker, lastPrompt]).pendingToolUse).toBe(true)
  })
  it('not pending when the last message ended the turn', () => {
    expect(parseTail([asstToolUse, userResult, asstEndTurn, marker]).pendingToolUse).toBe(false)
  })
  it('not pending when the last message is a user message', () => {
    expect(parseTail([asstToolUse, userResult]).pendingToolUse).toBe(false)
  })
  it('treats a turn that ends with a question as a question to the user', () => {
    const ask = '{"type":"assistant","message":{"stop_reason":"end_turn","content":[{"type":"text","text":"Which repo should I use?**\\n"}]}}'
    expect(parseTail([userResult, ask, marker]).isQuestion).toBe(true)
  })
  it('treats a pending AskUserQuestion call as a question to the user', () => {
    const ask = '{"type":"assistant","message":{"stop_reason":"tool_use","content":[{"type":"tool_use","name":"AskUserQuestion"}]}}'
    expect(parseTail([userResult, ask]).isQuestion).toBe(true)
  })
  it('returns the last paragraph of a text question', () => {
    const ask = '{"type":"assistant","message":{"stop_reason":"end_turn","content":[{"type":"text","text":"I read the ticket.\\n\\nWhich repo should I use?"}]}}'
    expect(parseTail([userResult, ask]).question).toBe('Which repo should I use?')
  })
  it('returns the first question of a pending AskUserQuestion call', () => {
    const ask = '{"type":"assistant","message":{"stop_reason":"tool_use","content":[{"type":"tool_use","name":"AskUserQuestion","input":{"questions":[{"question":"Pick a layout?"}]}}]}}'
    expect(parseTail([userResult, ask]).question).toBe('Pick a layout?')
  })
  it('has no question text when the turn is not a question', () => {
    expect(parseTail([asstToolUse, userResult, asstEndTurn]).question).toBeNull()
  })
  it('is not a question when the turn ends with a statement, a tool call or a user message', () => {
    expect(parseTail([asstToolUse, userResult, asstEndTurn, marker]).isQuestion).toBe(false)
    expect(parseTail([userResult, asstToolUse]).isQuestion).toBe(false)
    expect(parseTail([asstEndTurn, userResult]).isQuestion).toBe(false)
  })
  it('not pending for empty or garbage input', () => {
    expect(parseTail([]).pendingToolUse).toBe(false)
    expect(parseTail(['not json', '{bad']).pendingToolUse).toBe(false)
  })

  it('extracts model and summed context tokens from the latest assistant usage', () => {
    const asst = JSON.stringify({
      type: 'assistant',
      message: {
        stop_reason: 'end_turn',
        model: 'claude-opus-4-8',
        usage: { input_tokens: 2, cache_read_input_tokens: 55961, cache_creation_input_tokens: 416 }
      }
    })
    const r = parseTail([asst])
    expect(r.model).toBe('claude-opus-4-8')
    expect(r.contextTokens).toBe(56379)
  })

  it('returns the most recent gitBranch (post branch switch)', () => {
    const oldB = '{"type":"user","gitBranch":"fix/OLD-1-foo","message":{"content":"a"}}'
    const newB = '{"type":"assistant","gitBranch":"feat/NEW-2-bar","message":{"stop_reason":"end_turn"}}'
    expect(parseTail([oldB, newB]).gitBranch).toBe('feat/NEW-2-bar')
  })
  it('gitBranch is null when no entry carries one', () => {
    expect(parseTail([asstEndTurn]).gitBranch).toBe(null)
  })

  it('reads model/context from the most recent assistant even if the last entry is a user', () => {
    const asst = JSON.stringify({
      type: 'assistant',
      message: {
        stop_reason: 'tool_use',
        model: 'claude-sonnet-4-6',
        usage: { input_tokens: 10, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0 }
      }
    })
    const user = JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result' }] } })
    const r = parseTail([asst, user])
    expect(r.pendingToolUse).toBe(false)
    expect(r.model).toBe('claude-sonnet-4-6')
    expect(r.contextTokens).toBe(1010)
  })
})

describe('countTurns', () => {
  it('counts only real prompts', () => {
    const l = [
      '{"type":"user","cwd":"C:/x","isMeta":true,"message":{"content":"<local-command-caveat>Caveat</local-command-caveat>"}}',
      '{"type":"user","message":{"content":"<command-name>/clear</command-name> <command-message>clear</command-message> <command-args></command-args>"}}',
      '{"type":"user","message":{"content":"SOFKRS-77 napraw"}}',
      '{"type":"assistant","message":{"stop_reason":"tool_use","content":[{"type":"tool_use"}]}}',
      '{"type":"user","message":{"content":[{"type":"tool_result","content":"ok"}]}}',
      '{"type":"user","message":{"content":"<system-reminder>x</system-reminder>"}}',
      '{"type":"user","message":{"content":[{"type":"text","text":"a teraz testy"}]}}'
    ]
    expect(countTurns(l)).toBe(2)
  })
  it('counts the fixture prompt', () => {
    const lines = readFileSync(join(__dirname, 'fixtures/session-sample.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean)
    expect(countTurns(lines)).toBe(1)
  })
})

describe('lastMessages', () => {
  it('returns the last text messages in order, skipping tool results', () => {
    const l = [
      '{"type":"user","message":{"content":"a"}}',
      '{"type":"assistant","message":{"content":[{"type":"text","text":"b"}]}}',
      '{"type":"user","message":{"content":[{"type":"tool_result","content":"x"}]}}',
      '{"type":"assistant","message":{"content":[{"type":"text","text":"c"}]}}'
    ]
    expect(lastMessages(l, 2)).toEqual([
      { role: 'assistant', text: 'b' },
      { role: 'assistant', text: 'c' }
    ])
  })
})

describe('createDetailCache', () => {
  it('re-parses a transcript only when its size or mtime changed', () => {
    let parses = 0
    const cache = createDetailCache((lines) => {
      parses += 1
      return lines.length
    })
    expect(cache.get('f', 10, 1, () => ['a'])).toBe(1)
    expect(cache.get('f', 10, 1, () => ['a', 'b'])).toBe(1)
    expect(cache.get('f', 12, 1, () => ['a', 'b'])).toBe(2)
    expect(parses).toBe(2)
  })
})

describe('lastMessages filtering', () => {
  it('skips skill bodies, reminders and local command lines on the user side', () => {
    const l = [
      '{"type":"user","message":{"content":"/review-mr 42"}}',
      '{"type":"user","isMeta":true,"message":{"content":[{"type":"text","text":"Base directory for this skill: C:/x"}]}}',
      '{"type":"user","message":{"content":"<system-reminder>x</system-reminder>"}}',
      '{"type":"assistant","message":{"content":[{"type":"text","text":"done"}]}}'
    ]
    expect(lastMessages(l, 10)).toEqual([
      { role: 'user', text: '/review-mr 42' },
      { role: 'assistant', text: 'done' }
    ])
  })
})
