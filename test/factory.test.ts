import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  stageOf,
  digestTranscript,
  parseProposals,
  applyProposal,
  isFactoryDue,
  tokenTrend,
  dayStamp,
  ticketOfEntry,
  slimEntry,
  isRecentEntry,
  digestEntries,
  dismissedList,
  withDismissed,
  isDismissedBy,
  latestDay,
  collectDigests,
  ensureRubric,
  splitScoreOutput
} from '../src/main/factory'
import type { Digest, Proposal } from '../src/main/factory'

const meta = { sessionId: 's1', project: 'proj', ticket: 'ABC-1' }

const usage = (input: number, read: number, create: number) => ({
  input_tokens: input,
  cache_read_input_tokens: read,
  cache_creation_input_tokens: create,
  output_tokens: 5
})

const assistant = (id: string | null, content: unknown[], u = usage(10, 100, 0)) =>
  JSON.stringify({
    type: 'assistant',
    message: { ...(id ? { id } : {}), model: 'claude-opus-5-5', content, usage: u }
  })

const toolUse = (id: string, name: string, input: unknown) => ({ type: 'tool_use', id, name, input })

const userText = (text: string) => JSON.stringify({ type: 'user', message: { content: text } })

const toolResult = (id: string, isError: boolean) =>
  JSON.stringify({
    type: 'user',
    message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content: 'x' }] }
  })

const bash = (id: string, command: string) => toolUse(id, 'Bash', { command })

describe('digestTranscript', () => {
  it('sums context per distinct turn and reports peak and average', () => {
    const d = digestTranscript(
      [
        assistant('m1', [{ type: 'text', text: 'a' }], usage(10, 100, 90)),
        assistant('m1', [bash('t1', 'ls')], usage(10, 100, 90)),
        assistant('m2', [{ type: 'text', text: 'b' }], usage(0, 300, 100)),
        assistant(null, [{ type: 'text', text: 'c' }], usage(0, 0, 100)),
        'not json'
      ],
      meta
    )
    expect(d.sessionId).toBe('s1')
    expect(d.project).toBe('proj')
    expect(d.ticket).toBe('ABC-1')
    expect(d.model).toBe('claude-opus-5-5')
    expect(d.turns).toBe(3)
    expect(d.tokensRead).toBe(700)
    expect(d.peakContext).toBe(400)
    expect(d.avgContext).toBe(233)
  })

  it('counts compactions', () => {
    const d = digestTranscript(
      [
        JSON.stringify({ type: 'system', subtype: 'compact_boundary' }),
        JSON.stringify({ type: 'user', isCompactSummary: true, message: { content: 'summary' } })
      ],
      meta
    )
    expect(d.compactions).toBe(2)
    expect(d.userMessages).toBe(0)
  })

  it('attributes a tool error to the tool of its tool_use_id', () => {
    const d = digestTranscript(
      [
        assistant('m1', [bash('t1', 'npm test'), toolUse('t2', 'Read', { file_path: 'a' })]),
        toolResult('t1', true),
        toolResult('t2', false)
      ],
      meta
    )
    expect(d.tools).toEqual({ Bash: { calls: 1, errors: 1 }, Read: { calls: 1, errors: 0 } })
  })

  it('lists commands repeated 3 or more times only', () => {
    const d = digestTranscript(
      [
        assistant('m1', [bash('a1', 'npm test')]),
        assistant('m2', [bash('a2', 'npm test')]),
        assistant('m3', [bash('a3', 'npm test')]),
        assistant('m4', [bash('b1', 'git status')]),
        assistant('m5', [bash('b2', 'git status')])
      ],
      meta
    )
    expect(d.repeatedCommands).toEqual([{ command: 'npm test', count: 3 }])
  })

  it('records skills and subagents', () => {
    const d = digestTranscript(
      [
        assistant('m1', [
          toolUse('k1', 'Skill', { skill: 'browser-verify' }),
          toolUse('g1', 'Agent', { subagent_type: 'task-implementer', model: 'opus' }),
          toolUse('g2', 'Agent', { subagent_type: 'Explore' })
        ])
      ],
      meta
    )
    expect(d.skills).toEqual(['browser-verify'])
    expect(d.subagents).toEqual([
      { type: 'task-implementer', model: 'opus' },
      { type: 'Explore', model: null }
    ])
  })

  it('captures a correction after an assistant message, clipped to 200 characters', () => {
    const long = `nie, to źle ${'x'.repeat(300)}`
    const d = digestTranscript(
      [
        userText('dlaczego to nie działa'),
        assistant('m1', [{ type: 'text', text: 'ok' }]),
        userText(long),
        assistant('m2', [{ type: 'text', text: 'ok' }]),
        userText('świetnie, dzięki'),
        assistant('m3', [{ type: 'text', text: 'ok' }]),
        userText('źle')
      ],
      meta
    )
    expect(d.userMessages).toBe(4)
    expect(d.corrections).toEqual([long.slice(0, 200), 'źle'])
  })

  it('keeps at most 10 corrections', () => {
    const lines = Array.from({ length: 12 }, (_, i) => [
      assistant(`m${i}`, [{ type: 'text', text: 'ok' }]),
      userText(`znowu ${i}`)
    ]).flat()
    expect(digestTranscript(lines, meta).corrections).toHaveLength(10)
  })

  it('raises each rule flag once', () => {
    const d = digestTranscript(
      [
        userText('napraw test'),
        assistant('m1', [bash('c1', 'git commit -m "fix"')]),
        assistant('m2', [bash('c2', 'git push')]),
        assistant('m3', [bash('c3', 'git commit -m "x\n\nCo-Authored-By: Claude <noreply@anthropic.com>"')]),
        assistant('m4', [bash('c4', 'chrome.exe --remote-debugging-port=9222')]),
        assistant('m5', [bash('c5', 'start x --user-data-dir=C:/tmp')])
      ],
      meta
    )
    expect([...d.ruleFlags].sort()).toEqual(['chrome-launch', 'co-authored-by', 'commit-without-ask'])
  })

  it('does not flag a commit the user asked for', () => {
    const d = digestTranscript(
      [userText('zacommituj to proszę'), assistant('m1', [bash('c1', 'git commit -m "fix" && git push')])],
      meta
    )
    expect(d.ruleFlags).toEqual([])
  })

  it('treats only a whole-word "tak" as a commit request', () => {
    const commitAfter = (text: string) =>
      digestTranscript([userText(text), assistant('m1', [bash('c1', 'git commit -m "fix"')])], meta).ruleFlags
    expect(commitAfter('tak')).toEqual([])
    expect(commitAfter('także popraw test')).toEqual(['commit-without-ask'])
  })

  it('computes the peak of a very long transcript', () => {
    const lines = Array.from({ length: 200_000 }, (_, i) => assistant(null, [], usage(i, 0, 0)))
    expect(digestTranscript(lines, meta).peakContext).toBe(199_999)
  })
})

const home = 'C:\\Users\\me'

const proposal = (overrides: Record<string, unknown> = {}) => ({
  id: 'p1',
  target: 'C:/Users/me/.claude/skills/run/SKILL.md',
  title: 'Shorter',
  evidence: ['s1'],
  find: 'old',
  replace: 'new',
  ...overrides
})

describe('parseProposals', () => {
  it('keeps valid proposals in the skills folder and CLAUDE.md, case-insensitively', () => {
    const result = parseProposals(
      [proposal(), proposal({ id: 'p2', target: 'c:\\users\\ME\\.claude\\claude.md' })],
      home
    )
    expect(result.map((p) => p.id)).toEqual(['p1', 'p2'])
  })

  it('drops a target outside the allowed paths', () => {
    const result = parseProposals(
      [
        proposal({ target: 'C:/Users/me/.claude/settings.json' }),
        proposal({ target: 'C:/Users/me/.claude/skills/../settings.json' }),
        proposal({ target: 'C:/Users/me/.claude/skillsx/a.md' }),
        proposal({ target: 'C:/Users/other/.claude/CLAUDE.md' })
      ],
      home
    )
    expect(result).toEqual([])
  })

  it('drops entries with missing fields and non-array input', () => {
    expect(parseProposals([proposal({ find: undefined }), proposal({ evidence: 'x' }), null], home)).toEqual([])
    expect(parseProposals({ nope: true }, home)).toEqual([])
  })

  it('expands a ~ target to the home dir', () => {
    expect(parseProposals([proposal({ target: '~/.claude/CLAUDE.md' })], home)[0].target).toBe(
      'C:/Users/me/.claude/CLAUDE.md'
    )
  })
})

describe('applyProposal', () => {
  const p = proposal() as Proposal

  it('replaces a single occurrence', () => {
    expect(applyProposal('a old b', { ...p, replace: '$& new' })).toEqual({ text: 'a $& new b' })
  })

  it('refuses a find that does not occur', () => {
    expect(applyProposal('a b', p)).toHaveProperty('error')
  })

  it('refuses a find that occurs twice', () => {
    expect(applyProposal('old old', p)).toHaveProperty('error')
  })
})

describe('isFactoryDue', () => {
  const hour = 3_600_000

  it('is due when never run', () => {
    expect(isFactoryDue(null, 0)).toBe(true)
  })

  it('is false at 23h and true at 24h', () => {
    expect(isFactoryDue(0, 23 * hour)).toBe(false)
    expect(isFactoryDue(0, 24 * hour)).toBe(true)
  })
})

describe('tokenTrend', () => {
  it('sums tokens per date sorted by date', () => {
    const digest = (tokensRead: number) => ({ tokensRead }) as Digest
    expect(
      tokenTrend({ '2026-11-15': [digest(5), digest(7)], '2026-11-14': [digest(3)], '2026-11-16': [] })
    ).toEqual([
      { date: '2026-11-14', tokens: 3 },
      { date: '2026-11-15', tokens: 12 },
      { date: '2026-11-16', tokens: 0 }
    ])
  })
})

describe('dayStamp', () => {
  it('names the day folder by the local date', () => {
    expect(dayStamp(new Date(2026, 10, 6, 23, 30))).toBe('2026-11-06')
  })
})

describe('ticketOfEntry', () => {
  it('prefers the ticket in the git branch', () => {
    expect(ticketOfEntry({ gitBranch: 'fix/SOFKRS-12-a', cwd: 'C:\repo\.claude\worktrees\ABC-1' })).toBe('SOFKRS-12')
  })

  it('falls back to the ticket in the cwd', () => {
    expect(ticketOfEntry({ gitBranch: 'develop', cwd: 'C:\repo\.claude\worktrees\ABC-1' })).toBe('ABC-1')
  })

  it('returns null without a ticket', () => {
    expect(ticketOfEntry({ gitBranch: 'master', cwd: 'C:\repo' })).toBeNull()
  })
})

describe('slimEntry', () => {
  it('drops tool result content but keeps the error flag and id', () => {
    const entry = { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'x'.repeat(10000) }] } }
    expect(slimEntry(entry)).toEqual({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', is_error: true }] } })
  })

  it('keeps only tool calls of an assistant turn, with inputs the digest reads', () => {
    const entry = {
      type: 'assistant',
      cwd: 'C:/repo',
      message: {
        id: 'm1',
        model: 'claude-opus',
        usage: usage(1, 2, 3),
        content: [
          { type: 'thinking', thinking: 'y'.repeat(5000) },
          { type: 'text', text: 'z'.repeat(5000) },
          toolUse('w1', 'Write', { file_path: 'a', content: 'q'.repeat(5000) }),
          toolUse('w2', 'Write', { file_path: 'b', content: 'Co-Authored-By: x' }),
          bash('b1', 'ls')
        ]
      }
    }
    expect(slimEntry(entry)).toEqual({
      type: 'assistant',
      message: {
        id: 'm1',
        model: 'claude-opus',
        usage: usage(1, 2, 3),
        content: [toolUse('w1', 'Write', {}), toolUse('w2', 'Write', { co: 'Co-Authored-By' }), bash('b1', 'ls')]
      }
    })
  })

  it('clips user text and drops entries the digest never reads', () => {
    const slim = slimEntry({ type: 'user', message: { content: 'n'.repeat(1000) } })
    expect((slim?.message as { content: string }).content).toHaveLength(400)
    expect(slimEntry({ type: 'file-history-snapshot' })).toBeNull()
    expect(slimEntry({ type: 'system', subtype: 'turn_duration' })).toBeNull()
  })

  it('gives the same digest as the full transcript', () => {
    const lines = [
      userText('zrób zadanie'),
      assistant('m1', [{ type: 'thinking', thinking: 'long' }, bash('t1', 'npm test'), toolUse('t2', 'Read', { file_path: 'a' })], usage(10, 100, 5)),
      toolResult('t1', true),
      toolResult('t2', false),
      assistant('m1', [bash('t3', 'npm test')], usage(10, 100, 5)),
      userText('nie, znowu źle'),
      assistant(null, [toolUse('k1', 'Skill', { skill: 'browser-verify' }), toolUse('g1', 'Agent', { subagent_type: 'Explore', model: 'haiku', prompt: 'p'.repeat(3000) })], usage(0, 300, 0)),
      assistant('m3', [bash('t4', 'npm test'), bash('t5', 'git commit -m x'), toolUse('w1', 'Write', { file_path: 'f', content: 'Co-Authored-By: Claude' })]),
      assistant('m4', [bash('t6', 'chrome.exe --remote-debugging-port=9222')], usage(0, 0, 50)),
      JSON.stringify({ type: 'system', subtype: 'compact_boundary' }),
      JSON.stringify({ type: 'user', isCompactSummary: true, message: { content: 'summary' } }),
      JSON.stringify({ type: 'file-history-snapshot', snapshot: {} }),
      'not json',
      ...readFileSync(join(__dirname, 'fixtures', 'session-sample.jsonl'), 'utf8').split('\n')
    ]
    const slim = lines.map((line) => {
      try {
        return slimEntry(JSON.parse(line))
      } catch {
        return null
      }
    })
    const full = digestTranscript(lines, meta)
    expect(full.ruleFlags.length).toBeGreaterThan(0)
    expect(digestEntries(slim, meta)).toEqual(full)
  })
})

const dismissable: Proposal = { id: 'p1', target: 'C:/h/.claude/CLAUDE.md', title: 'T', evidence: ['e'], find: 'a', replace: 'b' }

describe('dismissed list', () => {
  it('reads only well-formed entries', () => {
    expect(dismissedList([{ id: 'p1', target: 't', title: 'T', find: 'a' }, { id: 1 }, 'x'])).toEqual([{ id: 'p1', target: 't', title: 'T', find: 'a' }])
    expect(dismissedList({})).toEqual([])
  })

  it('appends a proposal once', () => {
    const once = withDismissed([], dismissable)
    expect(once).toEqual([{ id: 'p1', target: dismissable.target, title: 'T', find: 'a' }])
    expect(withDismissed(once, dismissable)).toEqual(once)
  })

  it('matches by id or by the same target and find', () => {
    const list = withDismissed([], dismissable)
    expect(isDismissedBy(list, dismissable)).toBe(true)
    expect(isDismissedBy(list, { ...dismissable, id: 'other' })).toBe(true)
    expect(isDismissedBy(list, { ...dismissable, id: 'other', find: 'z' })).toBe(false)
  })
})

describe('latestDay', () => {
  it('picks the newest day among report and dismissable file names', () => {
    expect(latestDay(['2026-11-14.md', '2026-11-16.json', 'notes.txt', '2026-11-15.md'])).toBe('2026-11-16')
    expect(latestDay(['notes.txt'])).toBeNull()
  })
})

describe('collectDigests', () => {
  it('writes a digest for each transcript changed since the cutoff, skipping the factory run itself', async () => {
    const root = mkdtempSync(join(tmpdir(), 'factory-'))
    const projects = join(root, 'projects')
    mkdirSync(join(projects, 'C--repo'), { recursive: true })
    const line = (o: unknown) => JSON.stringify(o)
    writeFileSync(
      join(projects, 'C--repo', 'new.jsonl'),
      [line({ type: 'user', gitBranch: 'feat/ABC-7-x', cwd: 'C:\repo', message: { content: 'start' } }), line({ type: 'assistant', message: { id: 'm1', model: 'claude-opus', content: [], usage: usage(1, 2, 3) } })].join('\n')
    )
    writeFileSync(join(projects, 'C--repo', 'old.jsonl'), line({ type: 'user', message: { content: 'x' } }))
    utimesSync(join(projects, 'C--repo', 'old.jsonl'), new Date(1000), new Date(1000))
    mkdirSync(join(projects, 'C--Users-me--claude-factory'))
    writeFileSync(join(projects, 'C--Users-me--claude-factory', 'scoring.jsonl'), line({ type: 'user', message: { content: 'x' } }))
    const out = join(root, 'digests', '2026-11-16')
    const count = await collectDigests(projects, Date.now() - 60_000, out)
    expect(count).toBe(1)
    expect(readdirSync(out)).toEqual(['new.json'])
    const digest = JSON.parse(readFileSync(join(out, 'new.json'), 'utf8'))
    expect(digest).toMatchObject({ sessionId: 'new', project: 'C--repo', ticket: 'ABC-7', tokensRead: 6 })
  })
})

describe('isRecentEntry', () => {
  it('keeps entries at or after the cutoff and entries without a timestamp', () => {
    const since = Date.parse('2026-11-16T00:00:00Z')
    expect(isRecentEntry({ timestamp: '2026-11-15T23:59:59Z' }, since)).toBe(false)
    expect(isRecentEntry({ timestamp: '2026-11-16T00:00:00Z' }, since)).toBe(true)
    expect(isRecentEntry({}, since)).toBe(true)
    expect(isRecentEntry({ timestamp: 'garbage' }, since)).toBe(true)
  })
})

describe('collectDigests — multi-day session', () => {
  it('digests only the turns since the cutoff', async () => {
    const root = mkdtempSync(join(tmpdir(), 'factory-'))
    const projects = join(root, 'projects')
    mkdirSync(join(projects, 'C--repo'), { recursive: true })
    const since = Date.now() - 60_000
    const old = new Date(since - 3_600_000).toISOString()
    const fresh = new Date(since + 1000).toISOString()
    const entry = (timestamp: string, o: Record<string, unknown>) => JSON.stringify({ ...o, timestamp })
    writeFileSync(
      join(projects, 'C--repo', 'long.jsonl'),
      [
        entry(old, { type: 'assistant', message: { id: 'm1', model: 'claude-opus', content: [bash('a1', 'npm test')], usage: usage(100, 0, 0) } }),
        entry(old, { type: 'user', message: { content: 'nie, znowu źle' } }),
        entry(old, { type: 'system', subtype: 'compact_boundary' }),
        entry(fresh, { type: 'assistant', message: { id: 'm2', model: 'claude-opus', content: [bash('a2', 'ls')], usage: usage(1, 2, 3) } })
      ].join('\n')
    )
    const out = join(root, 'digests', 'day')
    await collectDigests(projects, since, out)
    const digest = JSON.parse(readFileSync(join(out, 'long.json'), 'utf8'))
    expect(digest).toMatchObject({ turns: 1, tokensRead: 6, compactions: 0, corrections: [], tools: { Bash: { calls: 1, errors: 0 } } })
  })
})

describe('ensureRubric', () => {
  it('writes the default rubric only when missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'rubric-'))
    const path = join(root, 'factory', 'rubric.md')
    ensureRubric(path)
    expect(existsSync(path)).toBe(true)
    expect(readFileSync(path, 'utf8')).toContain('1–5')
    writeFileSync(path, 'mine')
    ensureRubric(path)
    expect(readFileSync(path, 'utf8')).toBe('mine')
  })
})

describe('stageOf', () => {
  it('maps workflow agents to stages', () => {
    expect(stageOf('browser-recorder')).toBe('repro/verify')
    expect(stageOf('side-effect-analyst')).toBe('analyze')
    expect(stageOf('qa-writer')).toBe('qa')
    expect(stageOf('self-reviewer')).toBe('review')
    expect(stageOf('task-implementer')).toBe('implement')
    expect(stageOf('Explore')).toBe('other')
  })
})

describe('digest stages and size', () => {
  it('lists the stages of the agents the session ran, with no size by default', () => {
    const agent = (id: string, type: string) => ({ type: 'tool_use', id, name: 'Agent', input: { subagent_type: type } })
    const digest = digestEntries(
      [{ type: 'assistant', message: { id: 'm1', content: [agent('a', 'self-reviewer'), agent('b', 'qa-writer')], usage: usage(1, 0, 0) } }],
      { sessionId: 's', project: 'p', ticket: null }
    )
    expect(digest.stages).toEqual(['review', 'qa'])
    expect(digest.size).toBeNull()
    expect(digest.risk).toBeNull()
  })
  it('takes size and risk from the handoff of a ticketed session only', async () => {
    const root = mkdtempSync(join(tmpdir(), 'factory-size-'))
    const projects = join(root, 'projects')
    mkdirSync(join(projects, 'C--repo'), { recursive: true })
    const line = (o: unknown) => JSON.stringify(o)
    writeFileSync(join(projects, 'C--repo', 'withticket.jsonl'), line({ type: 'user', gitBranch: 'feat/ABC-7-x', message: { content: 'start' } }))
    writeFileSync(join(projects, 'C--repo', 'noticket.jsonl'), line({ type: 'user', message: { content: 'start' } }))
    const out = join(root, 'digests')
    await collectDigests(projects, Date.now() - 60_000, out, (ticket) => (ticket === 'ABC-7' ? { size: 'L', risk: 'critical' } : null))
    expect(JSON.parse(readFileSync(join(out, 'withticket.json'), 'utf8'))).toMatchObject({ size: 'L', risk: 'critical' })
    expect(JSON.parse(readFileSync(join(out, 'noticket.json'), 'utf8'))).toMatchObject({ size: null, risk: null })
  })
})

describe('splitScoreOutput', () => {
  it('takes the report text and the proposals from the last json block', () => {
    const out = '# Raport\n\nTabela\n\n```json\n[{"id":"d-1"}]\n```\n'
    expect(splitScoreOutput(out)).toEqual({ report: '# Raport\n\nTabela', proposals: [{ id: 'd-1' }] })
  })
  it('keeps the whole text as the report when there is no valid json block', () => {
    expect(splitScoreOutput('# Raport\n')).toEqual({ report: '# Raport', proposals: [] })
    expect(splitScoreOutput('# R\n```json\n[oops\n```')).toEqual({ report: '# R', proposals: [] })
  })
})
