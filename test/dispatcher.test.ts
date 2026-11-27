import { describe, expect, it, vi } from 'vitest'
import {
  EVENT_LIMIT,
  appendEvents,
  dispatcherArgs,
  dispatcherStartError,
  eventsSince,
  findDispatcherSession,
  isDispatcherLive,
  jobLogEvents,
  jobRow,
  answerPrompt,
  parseAnswer,
  refusedAnswer,
  refusedPrompt,
  refusedPromptAnswer,
  findSessionRef,
  pendingOptions,
  sessionEvents,
  sessionWaitingEvents,
  startRequestOf,
  waitingEvent,
  type DispatchEvent,
  type SessionEventInput
} from '../src/main/dispatcher'
import type { Job } from '../src/main/orchestrator'
import { parseTail, pendingPrompt, pendingRawInput, promptRawInput } from '../src/main/transcript'
import type { PendingPrompt, PendingTool, PromptQuestion } from '../src/renderer/src/types'

const makeJob = (overrides: Partial<Job> = {}): Job => ({
  id: 'j1',
  kind: 'ticket',
  key: 'SOF-1',
  title: 'Title',
  repo: null,
  autonomy: 'manual',
  state: 'working',
  sessionId: null,
  handoffPhase: 'none',
  lastSeenNoteId: null,
  isCommentsPending: false,
  autoHandoffs: 0,
  log: [],
  createdAt: 0,
  ...overrides
})

const makeEvent = (seq: number): DispatchEvent => ({
  seq,
  at: seq,
  type: 'job',
  jobId: 'j1',
  key: 'SOF-1',
  kind: 'ticket',
  state: 'working',
  text: `t${seq}`,
  toolUseId: null,
  tool: null,
  options: [],
  prompt: null
})

const makePending = (name: string): PendingTool => ({ name, input: 'input', toolUseId: 'tu1' })

describe('appendEvents', () => {
  it('numbers events from 1 on an empty list', () => {
    const { seq: _a, ...a } = makeEvent(0)
    const { seq: _b, ...b } = makeEvent(0)
    expect(appendEvents([], [a, b]).map((e) => e.seq)).toEqual([1, 2])
  })

  it('keeps the last EVENT_LIMIT events', () => {
    const events = Array.from({ length: EVENT_LIMIT }, (_, i) => makeEvent(i + 1))
    const { seq: _s, ...added } = makeEvent(0)
    const result = appendEvents(events, [added])
    expect(result).toHaveLength(EVENT_LIMIT)
    expect(result[result.length - 1].seq).toBe(EVENT_LIMIT + 1)
  })
})

describe('eventsSince', () => {
  const events = [makeEvent(1), makeEvent(2), makeEvent(3)]

  it('returns events after since', () => {
    const result = eventsSince(events, 1)
    expect(result.events.map((e) => e.seq)).toEqual([2, 3])
    expect(result.latest).toBe(3)
    expect(result.isReset).toBe(false)
  })

  it('resets when since is ahead of latest', () => {
    const result = eventsSince(events, 812)
    expect(result.events).toHaveLength(3)
    expect(result.isReset).toBe(true)
  })

  it('handles an empty list', () => {
    const result = eventsSince([], 0)
    expect(result.latest).toBe(0)
    expect(result.isReset).toBe(false)
  })
})

describe('jobLogEvents', () => {
  it('emits only the new lines of a known job', () => {
    const first = { at: 1, text: 'a' }
    const prev = [makeJob({ log: [first] })]
    const next = [
      makeJob({
        log: [
          first,
          { at: 2, text: 'b' },
          { at: 3, text: 'c' }
        ]
      })
    ]
    expect(jobLogEvents(prev, next, 99).map((e) => e.text)).toEqual(['b', 'c'])
  })

  it('emits new lines with the same timestamp as the previous newest', () => {
    const first = { at: 5, text: 'a' }
    const prev = [makeJob({ log: [first] })]
    const next = [makeJob({ log: [first, { at: 5, text: 'b' }, { at: 5, text: 'c' }] })]
    expect(jobLogEvents(prev, next, 99).map((e) => e.text)).toEqual(['b', 'c'])
  })

  it('emits every line of a new job', () => {
    const next = [
      makeJob({
        log: [
          { at: 1, text: 'a' },
          { at: 2, text: 'b' }
        ]
      })
    ]
    const events = jobLogEvents([], next, 99)
    expect(events.map((e) => e.text)).toEqual(['a', 'b'])
    expect(events[0].type).toBe('job')
  })

  it('emits nothing for an unchanged job', () => {
    const jobs = [makeJob({ log: [{ at: 1, text: 'a' }] })]
    expect(jobLogEvents(jobs, jobs, 99)).toEqual([])
  })
})

const waitingPrompt = (overrides: Partial<PendingPrompt> = {}): PendingPrompt => ({
  toolUseId: 'tu1',
  tool: 'AskUserQuestion',
  isOpaque: false,
  text: 'input',
  questions: [],
  ...overrides
})

describe('waitingEvent', () => {
  it('pairs question labels with option keys', () => {
    const questions: PromptQuestion[] = [
      {
        question: 'input',
        header: 'h',
        isMultiSelect: false,
        options: [
          { key: '1', label: 'Subagent-Driven', description: 'd1' },
          { key: '2', label: 'Inline', description: 'd2' }
        ]
      }
    ]
    const prompt = waitingPrompt({ questions })
    const event = waitingEvent(makeJob({ state: 'waiting' }), prompt, 5)
    expect(event.options).toEqual([
      { key: '1', label: 'Subagent-Driven' },
      { key: '2', label: 'Inline' }
    ])
    expect(event.type).toBe('waiting')
    expect(event.text).toBe('input')
    expect(event.prompt).toBe(prompt)
  })

  it('offers Yes and No for permission prompts', () => {
    const event = waitingEvent(makeJob({ state: 'waiting' }), waitingPrompt({ tool: 'Bash' }), 5)
    expect(event.options).toEqual([
      { key: '1', label: 'Yes' },
      { key: '3', label: 'No' }
    ])
  })

  it('uses the opaque text for an opaque prompt', () => {
    const event = waitingEvent(makeJob({ state: 'waiting' }), waitingPrompt({ isOpaque: true, text: '{"raw":1}' }), 5)
    expect(event.text).toBe('opaque: open the session')
  })

  it('carries the full question text', () => {
    const text = 'q'.repeat(400)
    const event = waitingEvent(makeJob({ state: 'waiting' }), waitingPrompt({ text }), 5)
    expect(event.text.length).toBe(400)
  })
})

describe('sessionWaitingEvents', () => {
  const waiting = (prompt: PendingPrompt | null, id = 'a') => ({ id, label: `L-${id}`, title: `T-${id}`, prompt })

  it('emits once for a session first seen while waiting', () => {
    const first = sessionWaitingEvents(new Set(), [waiting(waitingPrompt({ text: 'Which?' }))], [], 7)
    expect(first.events).toEqual([
      expect.objectContaining({ at: 7, type: 'waiting', jobId: 'a', key: 'L-a', kind: 'session', state: 'waiting', text: 'Which?', toolUseId: 'tu1', tool: 'AskUserQuestion' })
    ])
    expect(sessionWaitingEvents(first.seen, [waiting(waitingPrompt({ text: 'Which?' }))], [], 8).events).toEqual([])
  })

  it('emits again for a new toolUseId', () => {
    const first = sessionWaitingEvents(new Set(), [waiting(waitingPrompt())], [], 1)
    const second = sessionWaitingEvents(first.seen, [waiting(waitingPrompt({ toolUseId: 'tu2' }))], [], 2)
    expect(second.events).toHaveLength(1)
    expect(second.events[0].toolUseId).toBe('tu2')
  })

  it('marks an opaque prompt', () => {
    const { events } = sessionWaitingEvents(new Set(), [waiting(waitingPrompt({ isOpaque: true, tool: 'ExitPlanMode', text: '{}' }))], [], 1)
    expect(events[0].tool).toBe('ExitPlanMode')
    expect(events[0].text).toBe('opaque: open the session')
  })

  it('skips skipIds', () => {
    expect(sessionWaitingEvents(new Set(), [waiting(waitingPrompt())], ['a'], 1).events).toEqual([])
  })

  it('emits an opaque event once for a waiting session with no readable prompt, and again after it stops waiting', () => {
    const first = sessionWaitingEvents(new Set(), [waiting(null)], [], 1)
    expect(first.events).toHaveLength(1)
    expect(first.events[0].text).toBe('opaque: open the session')
    const again = sessionWaitingEvents(first.seen, [waiting(null)], [], 2)
    expect(again.events).toEqual([])
    const gap = sessionWaitingEvents(again.seen, [], [], 3)
    expect(sessionWaitingEvents(gap.seen, [waiting(null)], [], 4).events).toHaveLength(1)
  })

  it('does not collide on empty toolUseIds of different sessions', () => {
    const empty = waitingPrompt({ toolUseId: '' })
    const { events } = sessionWaitingEvents(new Set(), [waiting(empty, 'a'), waiting(empty, 'b')], [], 1)
    expect(events).toHaveLength(2)
  })
})

describe('refusedAnswer', () => {
  it('refuses a forbidden command', () => {
    expect(refusedAnswer(makePending('Bash'), { command: 'git push origin HEAD' }, [], '1')).not.toBeNull()
  })

  it('refuses always-allow on permission prompts', () => {
    expect(refusedAnswer(makePending('Bash'), { command: 'npm test' }, [], '2')).not.toBeNull()
  })

  it('refuses a key outside the question options', () => {
    expect(refusedAnswer(makePending('AskUserQuestion'), { questions: [] }, ['a', 'b'], '9')).not.toBeNull()
  })

  it('allows a safe command', () => {
    expect(refusedAnswer(makePending('Bash'), { command: 'npm test' }, [], '1')).toBeNull()
  })

  it('refuses a PowerShell git push', () => {
    expect(refusedAnswer(makePending('PowerShell'), { command: 'git push origin HEAD' }, [], '1')).not.toBeNull()
  })

  it('refuses an MCP tool', () => {
    expect(refusedAnswer(makePending('mcp__atlassian__addComment'), { body: 'hi' }, [], '1')).not.toBeNull()
  })

  it('refuses a raw input that is not a plain object', () => {
    expect(refusedAnswer(makePending('Bash'), 'npm test', [], '1')).not.toBeNull()
    expect(refusedAnswer(makePending('Bash'), null, [], '1')).not.toBeNull()
    expect(refusedAnswer(makePending('Bash'), ['npm test'], [], '1')).not.toBeNull()
  })

  it('refuses a question about a Jira comment or publishing', () => {
    const ask = (question: string): unknown => ({ questions: [{ question, options: [{ label: 'Tak' }, { label: 'Nie' }] }] })
    expect(refusedAnswer(makePending('AskUserQuestion'), ask('Dodać komentarz w Jirze?'), ['Tak', 'Nie'], '1')).not.toBeNull()
    expect(refusedAnswer(makePending('AskUserQuestion'), ask('Publish the review?'), ['Tak', 'Nie'], '1')).not.toBeNull()
    expect(refusedAnswer(makePending('AskUserQuestion'), ask('Czy plan jest dobry?'), ['Tak', 'Nie'], '1')).toBeNull()
  })
})

const makeQuestion = (question: string, labels: string[], isMultiSelect = false): PromptQuestion => {
  const toOption = (label: string, index: number): PromptQuestion['options'][number] => ({ key: String(index + 1), label, description: '' })
  return { question, header: '', isMultiSelect, options: labels.map(toOption) }
}

const makePrompt = (questions: PromptQuestion[], overrides: Partial<PendingPrompt> = {}): PendingPrompt => ({
  toolUseId: 'tu1',
  tool: 'AskUserQuestion',
  isOpaque: false,
  text: questions[0]?.question ?? '',
  questions,
  ...overrides
})

const rawInputOf = (prompt: PendingPrompt): unknown => {
  const toRawOption = (o: { label: string }): { label: string } => ({ label: o.label })
  const toRawQuestion = (q: PromptQuestion): unknown => ({ question: q.question, header: q.header, multiSelect: q.isMultiSelect, options: q.options.map(toRawOption) })
  return { questions: prompt.questions.map(toRawQuestion) }
}

describe('parseAnswer', () => {
  it('maps --keys to choices per question', () => {
    expect(parseAnswer({ keys: '1|2,3' })).toEqual({ choices: [['1'], ['2', '3']], text: null })
  })

  it('maps a single --key to one choice', () => {
    expect(parseAnswer({ key: '2' })).toEqual({ choices: [['2']], text: null })
  })

  it('reads --text', () => {
    expect(parseAnswer({ keys: '1', text: 'use the cache' })).toEqual({ choices: [['1']], text: 'use the cache' })
    expect(parseAnswer({ text: 'only text' })).toEqual({ choices: [], text: 'only text' })
  })
})

describe('refusedPromptAnswer', () => {
  const twoQuestions = makePrompt([makeQuestion('Which approach?', ['A', 'B']), makeQuestion('Which parts?', ['X', 'Y', 'Z'], true)])

  it('allows keys within each question', () => {
    expect(refusedPromptAnswer(twoQuestions, rawInputOf(twoQuestions), { choices: [['1'], ['2', '3']], text: null })).toBeNull()
  })

  it('refuses a key outside its own question', () => {
    expect(refusedPromptAnswer(twoQuestions, rawInputOf(twoQuestions), { choices: [['3'], ['1']], text: null })).toBe('key not allowed')
  })

  it('refuses text that asks to commit', () => {
    const prompt = makePrompt([makeQuestion('Which approach?', ['A', 'B'])])
    expect(refusedPromptAnswer(prompt, rawInputOf(prompt), { choices: [], text: 'commit and push it' })).toBe('forbidden text')
  })

  it('refuses text with control characters', () => {
    const prompt = makePrompt([makeQuestion('Which approach?', ['A', 'B'])])
    expect(refusedPromptAnswer(prompt, rawInputOf(prompt), { choices: [], text: 'ok\r1' })).toBe('text has control characters')
  })

  it('refuses the stage-8 MR confirmation at any level', () => {
    const prompt = makePrompt([makeQuestion('Czy plan jest dobry?', ['Tak', 'Nie']), makeQuestion('Next step?', ['Publish the review', 'Wait'])])
    expect(refusedPromptAnswer(prompt, rawInputOf(prompt), { choices: [['1'], ['2']], text: null })).toBe('forbidden request')
    expect(refusedPromptAnswer(prompt, rawInputOf(prompt), { choices: [['1']], text: 'wait' })).toBe('forbidden request')
  })

  it('refuses the task-workflow stage-8 wording in Polish and English', () => {
    const polish = makePrompt([makeQuestion('Zrobić commit, push i utworzyć draft MR z tym opisem?', ['Tak', 'Nie'])])
    const english = makePrompt([makeQuestion('Commit, push and create the MR?', ['Yes', 'No'])])
    expect(refusedPromptAnswer(polish, rawInputOf(polish), { choices: [['1']], text: null })).toBe('forbidden request')
    expect(refusedPromptAnswer(english, rawInputOf(english), { choices: [['1']], text: null })).toBe('forbidden request')
  })

  it('refuses text with C1 control characters', () => {
    const prompt = makePrompt([makeQuestion('Which approach?', ['A', 'B'])])
    expect(refusedPromptAnswer(prompt, rawInputOf(prompt), { choices: [], text: 'ok\u009b1' })).toBe('text has control characters')
  })

  it('refuses an opaque prompt', () => {
    const prompt = makePrompt([], { isOpaque: true })
    expect(refusedPromptAnswer(prompt, { questions: [] }, { choices: [['1']], text: null })).toBe('only the user can answer this prompt')
  })

  it('takes exactly one key for a permission prompt', () => {
    const prompt = makePrompt([], { tool: 'Bash', text: 'npm test' })
    expect(refusedPromptAnswer(prompt, { command: 'npm test' }, { choices: [['1']], text: null })).toBeNull()
    expect(refusedPromptAnswer(prompt, { command: 'npm test' }, { choices: [['2']], text: null })).toBe('always-allow is not permitted')
    expect(refusedPromptAnswer(prompt, { command: 'npm test' }, { choices: [['1'], ['3']], text: null })).toBe('a permission takes one key')
    expect(refusedPromptAnswer(prompt, { command: 'npm test' }, { choices: [], text: 'yes' })).toBe('a permission takes one key')
  })
})

describe('answerPrompt', () => {
  const prompt = makePrompt([makeQuestion('Which approach?', ['A', 'B'])])
  const okKeys = (): Promise<{ error: string | null }> => Promise.resolve({ error: null })

  it('/answer returns no such pending prompt for a stale toolUseId and writes nothing', async () => {
    const writeKeys = vi.fn(okKeys)
    const result = await answerPrompt({ prompt, rawInput: rawInputOf(prompt), writeKeys }, 'stale', { choices: [['1']], text: null })
    expect(result).toEqual({ error: 'no such pending prompt', isRefusal: false })
    expect(writeKeys).not.toHaveBeenCalled()
  })

  it('returns no such pending prompt without a prompt and writes nothing', async () => {
    const writeKeys = vi.fn(okKeys)
    const result = await answerPrompt({ prompt: null, rawInput: null, writeKeys }, 'tu1', { choices: [['1']], text: null })
    expect(result).toEqual({ error: 'no such pending prompt', isRefusal: false })
    expect(writeKeys).not.toHaveBeenCalled()
  })

  it('refuses an empty choice for a multiSelect-only prompt and writes nothing', async () => {
    const multiSelect = makePrompt([makeQuestion('Which parts?', ['X', 'Y'], true)])
    const writeKeys = vi.fn(okKeys)
    const result = await answerPrompt({ prompt: multiSelect, rawInput: rawInputOf(multiSelect), writeKeys }, 'tu1', { choices: [[]], text: null })
    expect(result).toEqual({ error: 'every question needs an answer', isRefusal: false })
    expect(writeKeys).not.toHaveBeenCalled()
  })

  it('refuses before writing anything', async () => {
    const writeKeys = vi.fn(okKeys)
    const result = await answerPrompt({ prompt, rawInput: rawInputOf(prompt), writeKeys }, 'tu1', { choices: [], text: 'commit it' })
    expect(result).toEqual({ error: 'forbidden text', isRefusal: true })
    expect(writeKeys).not.toHaveBeenCalled()
  })

  it('returns the keystroke error without writing', async () => {
    const multi = makePrompt([makeQuestion('Q1?', ['A', 'B']), makeQuestion('Q2?', ['C', 'D'])])
    const writeKeys = vi.fn(okKeys)
    const result = await answerPrompt({ prompt: multi, rawInput: rawInputOf(multi), writeKeys }, 'tu1', { choices: [['1']], text: null })
    expect(result).toEqual({ error: 'every question needs an answer', isRefusal: false })
    expect(writeKeys).not.toHaveBeenCalled()
  })

  it('writes the keystrokes of a valid answer', async () => {
    const writeKeys = vi.fn(okKeys)
    const result = await answerPrompt({ prompt, rawInput: rawInputOf(prompt), writeKeys }, 'tu1', { choices: [], text: 'other idea' })
    expect(result).toEqual({ error: null, isRefusal: false })
    expect(writeKeys).toHaveBeenCalledWith(['3', 'other idea', '\r'])
  })

  it('writes the single key of a permission prompt', async () => {
    const permission = makePrompt([], { tool: 'Bash', text: 'npm test' })
    const writeKeys = vi.fn(okKeys)
    await answerPrompt({ prompt: permission, rawInput: { command: 'npm test' }, writeKeys }, 'tu1', { choices: [['1']], text: null })
    expect(writeKeys).toHaveBeenCalledWith(['1'])
  })
})

describe('refusedPrompt', () => {
  it('refuses commit wording', () => {
    expect(refusedPrompt('zrób commit i wypchnij', 'idle')).not.toBeNull()
  })

  it('refuses forbidden commands', () => {
    expect(refusedPrompt('run gitlab.js mr create', 'idle')).not.toBeNull()
  })

  it('allows negated commit wording', () => {
    expect(refusedPrompt('zostaw zmiany niezacommitowane i popraw test', 'idle')).toBeNull()
  })

  it('refuses Jira comment and publishing wording', () => {
    expect(refusedPrompt('dodaj to jako komentarz do zadania', 'idle')).not.toBeNull()
    expect(refusedPrompt('publish the MR', 'idle')).not.toBeNull()
    expect(refusedPrompt('publish the review', 'idle')).not.toBeNull()
  })

  it('allows a harmless prompt for an idle session', () => {
    expect(refusedPrompt('popraw test', 'idle')).toBeNull()
  })

  it('refuses any prompt unless the session is idle', () => {
    expect(refusedPrompt('popraw test', 'working')).not.toBeNull()
    expect(refusedPrompt('popraw test', 'waiting')).not.toBeNull()
    expect(refusedPrompt('popraw test', 'checkout')).not.toBeNull()
    expect(refusedPrompt('popraw test', 'closed')).not.toBeNull()
    expect(refusedPrompt('popraw test', null)).not.toBeNull()
  })
})

describe('isDispatcherLive', () => {
  it('is live unless closed or missing', () => {
    expect(isDispatcherLive('idle')).toBe(true)
    expect(isDispatcherLive('closed')).toBe(false)
    expect(isDispatcherLive(null)).toBe(false)
  })
})

describe('jobRow', () => {
  it('lists the last three log texts and no pending prompt', () => {
    const job = makeJob({
      log: [
        { at: 1, text: 'a' },
        { at: 2, text: 'b' },
        { at: 3, text: 'c' },
        { at: 4, text: 'd' }
      ]
    })
    const row = jobRow(job, null, [])
    expect(row.log).toEqual(['b', 'c', 'd'])
    expect(row.pending).toBeNull()
    expect(row).toMatchObject({ id: 'j1', kind: 'ticket', key: 'SOF-1', title: 'Title', state: 'working', autonomy: 'manual' })
  })

  it('describes the pending prompt with its options', () => {
    const prompt = makePrompt([], { tool: 'Bash' })
    const row = jobRow(makeJob({ state: 'waiting' }), makePending('Bash'), [], prompt)
    expect(row.prompt).toBe(prompt)
    expect(row.pending).toEqual({
      toolUseId: 'tu1',
      tool: 'Bash',
      text: 'input',
      options: [
        { key: '1', label: 'Yes' },
        { key: '3', label: 'No' }
      ]
    })
  })
})

describe('startRequestOf', () => {
  const mrs = [
    { key: '7!12', iid: 12, title: 'Fix thing' },
    { key: '7!13', iid: 13, title: 'Other' }
  ]
  const lookups = { jiraTitles: { 'SOF-1': 'Jira title' }, mrs, repoFor: () => 'C:/repo' }

  it('builds a ticket request with the Jira title and repo', () => {
    expect(startRequestOf({ ticket: 'sof-1', review: '', watch: '', autonomy: 'autonomous' }, lookups)).toEqual({
      kind: 'ticket',
      key: 'SOF-1',
      title: 'Jira title',
      repo: 'C:/repo',
      autonomy: 'autonomous'
    })
  })

  it('falls back to manual autonomy', () => {
    expect(startRequestOf({ ticket: 'SOF-1', review: '', watch: '', autonomy: 'routine' }, lookups)?.autonomy).toBe('manual')
  })

  it('builds a review request from an iid', () => {
    expect(startRequestOf({ ticket: '', review: '12', watch: '', autonomy: '' }, lookups)).toEqual({
      kind: 'review',
      key: '7!12',
      title: 'Fix thing',
      repo: null,
      autonomy: 'routine'
    })
  })

  it('builds a watch request from an MR key', () => {
    expect(startRequestOf({ ticket: '', review: '', watch: '7!13', autonomy: '' }, lookups)?.kind).toBe('watch')
  })

  it('returns null for an unknown ticket or MR', () => {
    expect(startRequestOf({ ticket: 'SOF-9', review: '', watch: '', autonomy: '' }, lookups)).toBeNull()
    expect(startRequestOf({ ticket: '', review: '99', watch: '', autonomy: '' }, lookups)).toBeNull()
    expect(startRequestOf({ ticket: '', review: '', watch: '', autonomy: '' }, lookups)).toBeNull()
  })
})

describe('dispatcherArgs', () => {
  it('starts a named background sonnet session', () => {
    expect(dispatcherArgs()).toEqual(['--bg', '--name', 'dispatcher', '--model', 'sonnet', 'Use the dispatcher skill.'])
  })
})

describe('findDispatcherSession', () => {
  const sessions = [{ id: 'abcdef12-0000-4000-8000-000000000000' }, { id: 'zzz' }]

  it('matches the full id', () => {
    expect(findDispatcherSession(sessions, 'abcdef12-0000-4000-8000-000000000000')).toBe(sessions[0])
  })

  it('matches a stored short id by prefix', () => {
    expect(findDispatcherSession(sessions, 'abcdef12')).toBe(sessions[0])
  })

  it('returns undefined for null or no match', () => {
    expect(findDispatcherSession(sessions, null)).toBeUndefined()
    expect(findDispatcherSession(sessions, 'nope')).toBeUndefined()
  })
})

describe('sessionEvents', () => {
  const input = (id: string, status: SessionEventInput['status'], isLive = true): SessionEventInput => ({
    id,
    status,
    isLive,
    label: `L-${id}`,
    title: `T-${id}`
  })

  it('emits waiting and checkout transitions of known sessions', () => {
    const { events } = sessionEvents({ a: 'working', b: 'working' }, [input('a', 'waiting'), input('b', 'checkout')], [], 5)
    expect(events).toEqual([
      { at: 5, type: 'session', jobId: 'a', key: 'L-a', kind: 'session', state: 'waiting', text: 'T-a', toolUseId: null, tool: null, options: [], prompt: null },
      { at: 5, type: 'session', jobId: 'b', key: 'L-b', kind: 'session', state: 'checkout', text: 'T-b', toolUseId: null, tool: null, options: [], prompt: null }
    ])
  })

  it('skips unknown sessions, unchanged status, skipIds and closed sessions', () => {
    expect(sessionEvents({}, [input('a', 'waiting')], [], 0).events).toEqual([])
    expect(sessionEvents({ a: 'waiting' }, [input('a', 'waiting')], [], 0).events).toEqual([])
    expect(sessionEvents({ a: 'working' }, [input('a', 'waiting')], ['a'], 0).events).toEqual([])
    expect(sessionEvents({ a: 'working' }, [input('a', 'waiting', false)], [], 0).events).toEqual([])
    expect(sessionEvents({ a: 'waiting' }, [input('a', 'working')], [], 0).events).toEqual([])
  })

  it('next holds the status of every live session', () => {
    expect(sessionEvents({ a: 'working' }, [input('a', 'idle'), input('b', 'waiting'), input('c', 'idle', false)], [], 0).next).toEqual({
      a: 'idle',
      b: 'waiting'
    })
  })
})

describe('findSessionRef', () => {
  const rows = [
    { id: 'aaaaaaaa-1111', label: 'SOF-1' },
    { id: 'bbbbbbbb-2222', label: 'SOF-2' },
    { id: 'cccccccc-3333', label: 'SOF-2' }
  ]
  it('matches an id prefix of at least 8 characters', () => {
    expect(findSessionRef(rows, 'aaaaaaaa')).toBe(rows[0])
    expect(findSessionRef(rows, 'aaaa')).toBeNull()
  })
  it('matches a label that is unique, ignoring case', () => {
    expect(findSessionRef(rows, 'sof-1')).toBe(rows[0])
    expect(findSessionRef(rows, 'SOF-2')).toBeNull()
    expect(findSessionRef(rows, '')).toBeNull()
  })
})

describe('pendingOptions', () => {
  it('lists question options and yes/no for a permission', () => {
    const question: PendingTool = { name: 'AskUserQuestion', input: 'Q', toolUseId: 't' }
    expect(pendingOptions(question, ['A', 'B'])).toEqual([
      { key: '1', label: 'A' },
      { key: '2', label: 'B' }
    ])
    const permission: PendingTool = { name: 'Bash', input: 'ls', toolUseId: 't' }
    expect(pendingOptions(permission, []).map((o) => o.label)).toEqual(['Yes', 'No'])
  })
})

describe('dispatcherStartError', () => {
  it('returns the trust line from the CLI output', () => {
    const out = 'warming up\nWorkspace not trusted. Run `claude` in C:\\Users\\x\\.claude once and accept the trust prompt, then retry.\n'
    expect(dispatcherStartError(out)).toBe('Workspace not trusted. Run `claude` in C:\\Users\\x\\.claude once and accept the trust prompt, then retry.')
  })

  it('returns the last line otherwise', () => {
    expect(dispatcherStartError('first\nboom\n')).toBe('boom')
  })

  it('falls back when output is empty', () => {
    expect(dispatcherStartError('  \n')).toBe('claude did not start')
  })
})

describe('answerPrompt from transcript lines', () => {
  const askLine = (id: string, questions: unknown[]): string =>
    JSON.stringify({
      type: 'assistant',
      message: { id: `m-${id}`, stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name: 'AskUserQuestion', input: { questions } }] }
    })
  const option = (label: string): { label: string; description: string } => ({ label, description: '' })
  const okKeys = (): Promise<{ error: string | null }> => Promise.resolve({ error: null })
  const answerFromLines = async (lines: string[], toolUseId: string, choices: string[][]) => {
    const writeKeys = vi.fn(okKeys)
    const result = await answerPrompt({ prompt: pendingPrompt(lines), rawInput: promptRawInput(lines), writeKeys }, toolUseId, { choices, text: null })
    return { result, writeKeys }
  }

  it('answers a two-question prompt while the judge still sees no pending tool', async () => {
    const lines = [
      askLine('q2', [
        { question: 'Which approach?', header: 'Approach', multiSelect: false, options: [option('A'), option('B')] },
        { question: 'Which tests?', header: 'Tests', multiSelect: false, options: [option('Unit'), option('E2E')] }
      ])
    ]
    expect(parseTail(lines).pendingTool).toBeNull()
    expect(pendingRawInput(lines)).toBeNull()
    const { result, writeKeys } = await answerFromLines(lines, 'q2', [['2'], ['1']])
    expect(result).toEqual({ error: null, isRefusal: false })
    expect(writeKeys).toHaveBeenCalledWith(['2', '1', '\r'])
  })

  it('answers a multiSelect prompt', async () => {
    const lines = [askLine('qm', [{ question: 'Which parts?', header: 'Parts', multiSelect: true, options: [option('X'), option('Y'), option('Z')] }])]
    expect(parseTail(lines).pendingTool).toBeNull()
    const { result, writeKeys } = await answerFromLines(lines, 'qm', [['1', '3']])
    expect(result).toEqual({ error: null, isRefusal: false })
    expect(writeKeys).toHaveBeenCalledWith(['1', '3', '\t', '\r'])
  })

  it('refuses a two-question prompt whose second question confirms the commit and MR', async () => {
    const lines = [
      askLine('q8', [
        { question: 'Czy weryfikacja przeszła?', header: 'Verify', multiSelect: false, options: [option('Tak'), option('Nie')] },
        { question: 'Zrobić commit i utworzyć MR?', header: 'Stage 8', multiSelect: false, options: [option('Tak'), option('Nie')] }
      ])
    ]
    const { result, writeKeys } = await answerFromLines(lines, 'q8', [['1'], ['2']])
    expect(result).toEqual({ error: 'forbidden request', isRefusal: true })
    expect(writeKeys).not.toHaveBeenCalled()
  })

  it('still refuses an Agent call from transcript lines', async () => {
    const lines = [
      JSON.stringify({ type: 'assistant', message: { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'a1', name: 'Agent', input: { prompt: 'x' } }] } })
    ]
    expect(promptRawInput(lines)).toBeNull()
    const { result } = await answerFromLines(lines, 'a1', [['1']])
    expect(result.isRefusal).toBe(true)
  })
})
