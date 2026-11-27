import { describe, expect, it } from 'vitest'
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
  refusedAnswer,
  refusedPrompt,
  findSessionRef,
  pendingOptions,
  sessionEvents,
  startRequestOf,
  waitingEvent,
  type DispatchEvent,
  type SessionEventInput
} from '../src/main/dispatcher'
import type { Job } from '../src/main/orchestrator'
import type { PendingTool } from '../src/renderer/src/types'

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
  options: []
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

describe('waitingEvent', () => {
  it('pairs question labels with option keys', () => {
    const event = waitingEvent(makeJob({ state: 'waiting' }), makePending('AskUserQuestion'), ['Subagent-Driven', 'Inline'], 5)
    expect(event.options).toEqual([
      { key: '1', label: 'Subagent-Driven' },
      { key: '2', label: 'Inline' }
    ])
    expect(event.type).toBe('waiting')
    expect(event.text).toBe('input')
  })

  it('offers Yes and No for permission prompts', () => {
    const event = waitingEvent(makeJob({ state: 'waiting' }), makePending('Bash'), [], 5)
    expect(event.options).toEqual([
      { key: '1', label: 'Yes' },
      { key: '3', label: 'No' }
    ])
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
    const row = jobRow(makeJob({ state: 'waiting' }), makePending('Bash'), [])
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
      { at: 5, type: 'session', jobId: 'a', key: 'L-a', kind: 'session', state: 'waiting', text: 'T-a', toolUseId: null, tool: null, options: [] },
      { at: 5, type: 'session', jobId: 'b', key: 'L-b', kind: 'session', state: 'checkout', text: 'T-b', toolUseId: null, tool: null, options: [] }
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
