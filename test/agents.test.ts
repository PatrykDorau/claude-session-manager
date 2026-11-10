import { describe, it, expect } from 'vitest'
import { parseAgentMeta, summarizeAgent, agentState, agentMessages, modelTier } from '../src/main/agents'

const line = (o: unknown): string => JSON.stringify(o)
const assistant = (content: unknown[], at: string): string =>
  line({ type: 'assistant', timestamp: at, message: { role: 'assistant', model: 'claude-sonnet-5-5', content } })
const user = (content: unknown, at: string): string => line({ type: 'user', timestamp: at, message: { role: 'user', content } })

describe('parseAgentMeta', () => {
  it('reads type, description, model and the finished flag', () => {
    const meta = parseAgentMeta(
      '{"agentType":"vue-reviewer","description":"Review diff","spawnDepth":1,"model":"opus","pickedEffortModel":"claude-opus-5-5","finished":true}'
    )
    expect(meta).toEqual({ agentType: 'vue-reviewer', description: 'Review diff', model: 'claude-opus-5-5', isFinished: true, depth: 1 })
  })
  it('falls back for missing fields and bad json', () => {
    expect(parseAgentMeta('{}')).toEqual({ agentType: 'agent', description: '', model: null, isFinished: false, depth: 1 })
    expect(parseAgentMeta('nope')).toBeNull()
  })
})

describe('summarizeAgent', () => {
  it('counts tool calls and keeps the last assistant text and time', () => {
    const lines = [
      user('Do the task', '2026-11-10T10:00:00Z'),
      assistant([{ type: 'text', text: 'Reading files' }, { type: 'tool_use', name: 'Read' }], '2026-11-10T10:00:05Z'),
      user([{ type: 'tool_result', content: 'x' }], '2026-11-10T10:00:06Z'),
      assistant([{ type: 'tool_use', name: 'Edit' }, { type: 'tool_use', name: 'Bash' }], '2026-11-10T10:00:09Z'),
      assistant([{ type: 'text', text: 'Status: done\nChanged: a.ts' }], '2026-11-10T10:00:12Z')
    ]
    expect(summarizeAgent(lines)).toEqual({
      toolCalls: 3,
      lastText: 'Status: done',
      lastAt: Date.parse('2026-11-10T10:00:12Z'),
      model: 'claude-sonnet-5-5',
      task: 'Do the task'
    })
  })
  it('survives broken lines', () => {
    expect(summarizeAgent(['{', ''])).toEqual({ toolCalls: 0, lastText: '', lastAt: null, model: null, task: '' })
  })
})

describe('agentState', () => {
  const now = Date.parse('2026-11-10T10:10:00Z')
  const base = { isFinished: false, isParentLive: true, lastAt: now - 60000, now }
  it('is finished when the meta says so', () => {
    expect(agentState({ ...base, isFinished: true })).toBe('finished')
  })
  it('is working when it wrote recently', () => {
    expect(agentState(base)).toBe('working')
  })
  it('is stuck after five quiet minutes', () => {
    expect(agentState({ ...base, lastAt: now - 6 * 60000 })).toBe('stuck')
  })
  it('is interrupted when its parent is gone', () => {
    expect(agentState({ ...base, isParentLive: false })).toBe('interrupted')
  })
})

describe('agentMessages', () => {
  it('turns the transcript into readable steps', () => {
    const lines = [
      user('Do the task', '2026-11-10T10:00:00Z'),
      assistant([{ type: 'text', text: 'Reading' }, { type: 'tool_use', name: 'Read', input: { file_path: 'a.ts' } }], '2026-11-10T10:00:05Z'),
      user([{ type: 'tool_result', content: 'x' }], '2026-11-10T10:00:06Z')
    ]
    expect(agentMessages(lines)).toEqual([
      { role: 'user', text: 'Do the task', tools: [] },
      { role: 'assistant', text: 'Reading', tools: ['Read a.ts'] }
    ])
  })
})

describe('modelTier', () => {
  it('names the model family', () => {
    expect(modelTier('claude-opus-5-5')).toBe('opus')
    expect(modelTier('sonnet')).toBe('sonnet')
    expect(modelTier('claude-haiku-5-5')).toBe('haiku')
    expect(modelTier(null)).toBe('other')
  })
})
