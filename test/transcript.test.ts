import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseTranscriptHead, parseTail } from '../src/main/transcript'

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
  it('not pending for empty or garbage input', () => {
    expect(parseTail([]).pendingToolUse).toBe(false)
    expect(parseTail(['not json', '{bad']).pendingToolUse).toBe(false)
  })
})
