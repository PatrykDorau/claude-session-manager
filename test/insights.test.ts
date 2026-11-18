import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  stageOf,
  digestTranscript,
  parseProposals,
  applyProposal,
  isInsightsDue,
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
  expiredDayFiles,
  recentDayFiles,
  isEmptyInsights,
  storedInsights,
  appliedList,
  withProposalStates,
  aggregateDay,
  parseInsights,
  reportDay,
  ensureGuide,
  migrateFactoryDir,
  turnCost,
  bucketOf,
  isHandoffSignal,
  incidentsOf,
  capIncidents,
  COST_WEIGHTS
} from '../src/main/insights'
import type { Digest, Incident, Proposal } from '../src/main/insights'

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

  it('does not flag a commit after an "Amend" request', () => {
    const d = digestTranscript(
      [userText('Amend this change'), assistant('m1', [bash('c1', 'git commit --amend --no-edit')])],
      meta
    )
    expect(d.ruleFlags).not.toContain('commit-without-ask')
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

describe('isInsightsDue', () => {
  const hour = 3_600_000

  it('is due when never run', () => {
    expect(isInsightsDue(null, 0)).toBe(true)
  })

  it('is false at 23h and true at 24h', () => {
    expect(isInsightsDue(0, 23 * hour)).toBe(false)
    expect(isInsightsDue(0, 24 * hour)).toBe(true)
  })
})

describe('dayStamp', () => {
  it('names the day folder by the local date', () => {
    expect(dayStamp(new Date(2026, 10, 6, 23, 30))).toBe('2026-11-06')
  })
})

describe('ticketOfEntry', () => {
  it('prefers the ticket in the git branch', () => {
    expect(ticketOfEntry({ gitBranch: 'fix/SOFKRS-12-a', cwd: 'C:\repo\.claude\worktrees\ABC-1' }, '')).toBe('SOFKRS-12')
  })

  it('falls back to the ticket in the cwd', () => {
    expect(ticketOfEntry({ gitBranch: 'develop', cwd: 'C:\repo\.claude\worktrees\ABC-1' }, '')).toBe('ABC-1')
  })

  it('returns null without a ticket', () => {
    expect(ticketOfEntry({ gitBranch: 'master', cwd: 'C:\repo' }, '')).toBeNull()
  })

  it('ignores the user name in the home path', () => {
    expect(ticketOfEntry({ cwd: 'C:\\Users\\ASSET-17300\\Desktop\\Projekty\\app' }, 'C:\\Users\\ASSET-17300')).toBeNull()
  })

  it('prefers the branch, then the cwd below home', () => {
    const home = 'C:\\Users\\ASSET-17300'
    expect(ticketOfEntry({ gitBranch: 'fix/SOFKRS-12-x', cwd: 'C:\\Users\\ASSET-17300\\r\\.claude\\worktrees\\SOFKAN-9' }, home)).toBe('SOFKRS-12')
    expect(ticketOfEntry({ cwd: 'C:/Users/ASSET-17300/r/.claude/worktrees/SOFKAN-9' }, home)).toBe('SOFKAN-9')
  })
})

const stamped = (line: string, minutes: number) =>
  JSON.stringify({ ...JSON.parse(line), timestamp: new Date(minutes * 60_000).toISOString() })

const metaUserText = (text: string) => JSON.stringify({ type: 'user', isMeta: true, message: { content: text } })

describe('session metrics', () => {
  it('weights cost units by token kind', () => {
    expect(turnCost({ input_tokens: 10, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000, output_tokens: 2 })).toBe(10 + 125 + 100 + 10)
    expect(COST_WEIGHTS).toEqual({ input: 1, cacheCreation: 1.25, cacheRead: 0.1, output: 5 })
  })

  it('maps a context size to its bucket', () => {
    expect([50_000, 150_000, 250_000, 350_000].map(bucketOf)).toEqual(['lt100k', '100to200k', '200to300k', 'gt300k'])
  })

  it('splits turns and cost into context buckets', () => {
    const turn = (id: string, context: number) => assistant(id, [], { input_tokens: context, output_tokens: 0 })
    const d = digestTranscript([turn('a', 50_000), turn('b', 150_000), turn('c', 250_000), turn('d', 350_000)], meta)
    expect(Object.values(d.buckets).map((b) => b.turns)).toEqual([1, 1, 1, 1])
    expect(d.buckets.gt300k.cost).toBe(350_000)
    expect(d.costAbove200k).toBe(600_000)
    expect(d.costUnits).toBe(800_000)
  })

  it('keeps one usage per message id, taking the largest output', () => {
    const only = (output: number) => ({ input_tokens: 0, output_tokens: output })
    const d = digestTranscript([assistant('m1', [], only(1)), assistant('m1', [], only(40))], meta)
    expect(d.costUnits).toBe(200)
    expect(d.turns).toBe(1)
    expect(d.costByModel).toEqual({ 'claude-opus-5-5': 200 })
    expect(d.costByStage).toEqual({ main: 200 })
  })

  it('skips synthetic models in the model cost split', () => {
    const synthetic = JSON.stringify({ type: 'assistant', message: { id: 's', model: '<synthetic>', content: [], usage: { output_tokens: 2 } } })
    const d = digestTranscript([synthetic], meta)
    expect(d.costByModel).toEqual({})
    expect(d.costUnits).toBe(10)
  })

  it('counts active minutes without gaps over 10 minutes', () => {
    const d = digestTranscript(
      [stamped(userText('a'), 0), stamped(userText('b'), 5), stamped(userText('c'), 30), stamped(userText('d'), 32)],
      meta
    )
    expect(d.activeMinutes).toBe(7)
    expect(d.firstAt).toBe(0)
    expect(d.lastAt).toBe(32 * 60_000)
  })

  it('flags no-tests only for sessions that edit source files', () => {
    const run = (...blocks: unknown[]) => digestTranscript([assistant('m1', blocks)], meta)
    expect(run(toolUse('e1', 'Edit', { file_path: 'src/a.ts' })).ruleFlags).toContain('no-tests')
    expect(run(toolUse('e1', 'Edit', { file_path: 'docs/x.md' })).ruleFlags).not.toContain('no-tests')
    const tested = run(toolUse('e1', 'Edit', { file_path: 'src/a.ts' }), bash('b1', 'npx vitest run'))
    expect(tested.testRuns).toBe(1)
    expect(tested.hasSourceEdits).toBe(true)
    expect(tested.ruleFlags).not.toContain('no-tests')
  })

  it('marks the last test run failed from its tool_result', () => {
    const lines = (isError: boolean) => [assistant('m1', [bash('b1', 'npm test')]), toolResult('b1', isError)]
    expect(digestTranscript(lines(true), meta).isLastTestFailed).toBe(true)
    expect(digestTranscript(lines(false), meta).isLastTestFailed).toBe(false)
  })

  it('recognises handoff signals', () => {
    expect(isHandoffSignal({ type: 'user', message: { content: '<command-name>/clear</command-name>' } })).toBe(true)
    expect(isHandoffSignal({ type: 'system', subtype: 'compact_boundary' })).toBe(true)
    expect(isHandoffSignal({ type: 'assistant', message: { content: [toolUse('k1', 'Skill', { skill: 'handoff' })] } })).toBe(true)
    expect(isHandoffSignal({ type: 'assistant', message: { content: [toolUse('w1', 'Write', { file_path: 'docs/superpowers/handoff.md' })] } })).toBe(true)
    expect(isHandoffSignal({ type: 'assistant', message: { content: [toolUse('e1', 'Edit', { file_path: 'docs/superpowers/handoff.md' })] } })).toBe(true)
    expect(isHandoffSignal({ type: 'user', message: { content: 'hello' } })).toBe(false)
    expect(isHandoffSignal({ type: 'assistant', message: { content: [bash('b1', 'ls')] } })).toBe(false)
  })

  it('produces a zero-cost digest for a session without usage', () => {
    const d = digestTranscript([stamped(userText('hi'), 3)], meta)
    expect(d.costUnits).toBe(0)
    expect(d.costByModel).toEqual({})
    expect(Object.values(d.buckets)).toEqual(Array(4).fill({ turns: 0, cost: 0 }))
    expect(d.firstAt).toBe(3 * 60_000)
  })

  it('ignores meta and notification texts as user messages', () => {
    const d = digestTranscript(
      [
        assistant('m1', [{ type: 'text', text: 'ok' }]),
        metaUserText('Base directory for this skill. nie rób tego'),
        userText('<task-notification>nie</task-notification>'),
        userText('<local-command-stdout>źle</local-command-stdout>')
      ],
      meta
    )
    expect(d.userMessages).toBe(0)
    expect(d.corrections).toEqual([])
  })

  it('does not let a meta text hide the commit request', () => {
    const d = digestTranscript(
      [userText('zacommituj'), metaUserText('skill body'), assistant('m1', [bash('c1', 'git commit -m x')])],
      meta
    )
    expect(d.ruleFlags).not.toContain('commit-without-ask')
  })

  it('slims a dropped entry with a timestamp to its timestamp', () => {
    expect(slimEntry({ type: 'file-history-snapshot', timestamp: 't' })).toEqual({ timestamp: 't' })
  })

  it('keeps isMeta when slimming a user entry', () => {
    expect(slimEntry({ type: 'user', isMeta: true, timestamp: 't', message: { content: 'x' } })).toEqual({
      type: 'user',
      isMeta: true,
      timestamp: 't',
      message: { content: 'x' }
    })
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
        content: [{ type: 'text', text: 'z'.repeat(600) }, toolUse('w1', 'Write', { file_path: 'a' }), toolUse('w2', 'Write', { file_path: 'b', co: 'Co-Authored-By' }), bash('b1', 'ls')]
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
  it('returns a digest for each transcript changed since the cutoff, skipping the insights run itself', async () => {
    const root = mkdtempSync(join(tmpdir(), 'insights-'))
    const projects = join(root, 'projects')
    mkdirSync(join(projects, 'C--repo'), { recursive: true })
    const line = (o: unknown) => JSON.stringify(o)
    writeFileSync(
      join(projects, 'C--repo', 'new.jsonl'),
      [line({ type: 'user', gitBranch: 'feat/ABC-7-x', cwd: 'C:\repo', message: { content: 'start' } }), line({ type: 'assistant', message: { id: 'm1', model: 'claude-opus', content: [], usage: usage(1, 2, 3) } })].join('\n')
    )
    writeFileSync(join(projects, 'C--repo', 'old.jsonl'), line({ type: 'user', message: { content: 'x' } }))
    utimesSync(join(projects, 'C--repo', 'old.jsonl'), new Date(1000), new Date(1000))
    mkdirSync(join(projects, 'C--Users-me--claude-insights'))
    writeFileSync(join(projects, 'C--Users-me--claude-insights', 'scoring.jsonl'), line({ type: 'user', message: { content: 'x' } }))
    const { digests } = await collectDigests(projects, Date.now() - 60_000, undefined, '')
    expect(digests).toHaveLength(1)
    expect(readdirSync(root).sort()).toEqual(['projects'])
    expect(digests[0]).toMatchObject({ sessionId: 'new', project: 'C--repo', ticket: 'ABC-7', tokensRead: 6 })
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
    const root = mkdtempSync(join(tmpdir(), 'insights-'))
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
    const { digests } = await collectDigests(projects, since, undefined, '')
    expect(digests[0]).toMatchObject({ turns: 1, tokensRead: 6, compactions: 0, corrections: [], tools: { Bash: { calls: 1, errors: 0 } } })
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
    const root = mkdtempSync(join(tmpdir(), 'insights-size-'))
    const projects = join(root, 'projects')
    mkdirSync(join(projects, 'C--repo'), { recursive: true })
    const line = (o: unknown) => JSON.stringify(o)
    writeFileSync(join(projects, 'C--repo', 'withticket.jsonl'), line({ type: 'user', gitBranch: 'feat/ABC-7-x', message: { content: 'start' } }))
    writeFileSync(join(projects, 'C--repo', 'noticket.jsonl'), line({ type: 'user', message: { content: 'start' } }))
    const { digests } = await collectDigests(projects, Date.now() - 60_000, (ticket) => (ticket === 'ABC-7' ? { size: 'L', risk: 'critical' } : null), '')
    expect(digests.find((d) => d.sessionId === 'withticket')).toMatchObject({ size: 'L', risk: 'critical' })
    expect(digests.find((d) => d.sessionId === 'noticket')).toMatchObject({ size: null, risk: null })
  })
})

describe('subagent cost', () => {
  const setup = (agentMeta: string | null) => {
    const root = mkdtempSync(join(tmpdir(), 'insights-sub-'))
    const projects = join(root, 'projects')
    const subagents = join(projects, 'C--repo', 's1', 'subagents')
    mkdirSync(subagents, { recursive: true })
    writeFileSync(join(projects, 'C--repo', 's1.jsonl'), assistant('m1', [], usage(10, 100, 0)))
    writeFileSync(join(subagents, 'agent-a.jsonl'), JSON.stringify({ type: 'assistant', message: { id: 'sm1', model: 'claude-sonnet-4-5', content: [], usage: usage(20, 0, 0) } }))
    if (agentMeta) writeFileSync(join(subagents, 'agent-a.meta.json'), agentMeta)
    return { root, projects }
  }
  const run = async (agentMeta: string | null) => {
    const { root, projects } = setup(agentMeta)
    const { digests } = await collectDigests(projects, Date.now() - 60_000, undefined, '')
    return digests[0]
  }
  it('adds subagent cost under its stage and model', async () => {
    const digest = await run(JSON.stringify({ agentType: 'task-implementer' }))
    const main = turnCost(usage(10, 100, 0))
    const sub = turnCost(usage(20, 0, 0))
    expect(digest.costByStage.implement).toBe(sub)
    expect(digest.costByStage.main).toBe(main)
    expect(digest.costByModel['claude-sonnet-4-5']).toBe(sub)
    expect(digest.costUnits).toBe(main + sub)
  })
  it('files a subagent without a meta file under other', async () => {
    const digest = await run(null)
    expect(digest.costByStage.other).toBe(turnCost(usage(20, 0, 0)))
  })
})

describe('migrateFactoryDir', () => {
  const entries = [{ id: 'a', target: 't', title: 'x', find: 'f' }]
  const setup = () => {
    const root = mkdtempSync(join(tmpdir(), 'insights-migrate-'))
    const oldDir = join(root, 'factory')
    const newDir = join(root, 'insights')
    mkdirSync(oldDir)
    return { oldDir, newDir }
  }
  it('copies dismissed.json from the old folder when the new one lacks it', () => {
    const { oldDir, newDir } = setup()
    writeFileSync(join(oldDir, 'dismissed.json'), JSON.stringify(entries))
    migrateFactoryDir(oldDir, newDir)
    expect(JSON.parse(readFileSync(join(newDir, 'dismissed.json'), 'utf8'))).toEqual(entries)
    expect(existsSync(join(oldDir, 'dismissed.json'))).toBe(true)
  })
  it('keeps an existing dismissed.json in the new folder', () => {
    const { oldDir, newDir } = setup()
    writeFileSync(join(oldDir, 'dismissed.json'), JSON.stringify(entries))
    mkdirSync(newDir)
    writeFileSync(join(newDir, 'dismissed.json'), '[]')
    migrateFactoryDir(oldDir, newDir)
    expect(readFileSync(join(newDir, 'dismissed.json'), 'utf8')).toBe('[]')
  })
  it('does nothing when the old folder has no dismissed.json', () => {
    const { oldDir, newDir } = setup()
    migrateFactoryDir(oldDir, newDir)
    expect(existsSync(join(newDir, 'dismissed.json'))).toBe(false)
  })
})

const turnEntry = (id: string, content: unknown[], context = 1000) => ({
  type: 'assistant',
  message: { id, content, usage: { input_tokens: context, output_tokens: 5 } }
})
const said = (text: string) => ({ type: 'text', text })
const userEntry = (text: string, extra: Record<string, unknown> = {}) => ({ type: 'user', ...extra, message: { content: text } })
const resultEntry = (id: string, isError: boolean) => ({
  type: 'user',
  message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: isError }] }
})
const handoffTurn = (id: string) => turnEntry(id, [toolUse(`h-${id}`, 'Skill', { skill: 'handoff' })], 250_000)
const plainTurns = (from: number, count: number, context: number) =>
  Array.from({ length: count }, (_, i) => turnEntry(`t${from + i}`, [said(`turn ${from + i}`)], context))
const kindsOf = (incidents: Incident[]) => incidents.map((i) => i.kind)

describe('incidentsOf', () => {
  it('cuts a correction with the two assistant turns before it', () => {
    const incidents = incidentsOf(
      [turnEntry('a0', [said('A0')]), turnEntry('a1', [said('A1')]), turnEntry('a2', [said('A2'), bash('t1', 'ls')]), userEntry('nie, źle')],
      meta
    )
    expect(incidents).toEqual([
      {
        id: 's1-0',
        sessionId: 's1',
        ticket: 'ABC-1',
        kind: 'correction',
        at: null,
        user: 'nie, źle',
        before: [
          { text: 'A1', tools: [] },
          { text: 'A2', tools: ['Bash: ls'] }
        ]
      }
    ])
  })

  it('merges consecutive entries of one message id into one turn and labels tools', () => {
    const incidents = incidentsOf(
      [
        turnEntry('a1', [said('first')]),
        turnEntry('a1', [toolUse('s', 'Skill', { skill: 'handoff' }), toolUse('g', 'Agent', { subagent_type: 'task-implementer' }), toolUse('r', 'Read', {})]),
        userEntry('znowu to samo')
      ],
      meta
    )
    expect(incidents[0].before).toEqual([{ text: 'first', tools: ['Skill: handoff', 'Agent: task-implementer', 'Read'] }])
  })

  it('truncates the user text, assistant text and Bash command', () => {
    const command = `echo ${'y'.repeat(400)}`
    const incidents = incidentsOf([turnEntry('a1', [said('x'.repeat(900)), bash('b', command)]), userEntry(`nie ${'z'.repeat(900)}`)], meta)
    expect(incidents[0].user).toHaveLength(400)
    expect(incidents[0].before[0].text).toHaveLength(600)
    expect(incidents[0].before[0].tools[0]).toBe(`Bash: ${command.slice(0, 200)}`)
  })

  it('ignores corrections without a preceding assistant turn and meta or notification texts', () => {
    const incidents = incidentsOf(
      [userEntry('nie'), turnEntry('a1', [said('A')]), userEntry('nie', { isMeta: true }), userEntry('<task-notification>nie</task-notification>'), userEntry('<local-command-stdout>nie')],
      meta
    )
    expect(incidents).toEqual([])
  })

  it('reports two consecutive errors of one tool once', () => {
    const incidents = incidentsOf(
      [
        turnEntry('a1', [bash('b1', 'one'), bash('b2', 'two'), bash('b3', 'three')]),
        resultEntry('b1', true),
        resultEntry('b2', true),
        resultEntry('b3', true)
      ],
      meta
    )
    expect(kindsOf(incidents)).toEqual(['tool-errors'])
  })

  it('does not report errors separated by a success of the same tool', () => {
    const incidents = incidentsOf(
      [turnEntry('a1', [bash('b1', 'one'), bash('b2', 'two'), bash('b3', 'three')]), resultEntry('b1', true), resultEntry('b2', false), resultEntry('b3', true)],
      meta
    )
    expect(incidents).toEqual([])
  })

  it('reports a big-context crossing only without a handoff within 10 turns', () => {
    const withHandoff = [...plainTurns(0, 4, 1000), turnEntry('big', [said('big')], 250_000), ...plainTurns(10, 2, 250_000), handoffTurn('ho'), ...plainTurns(20, 4, 1000)]
    expect(incidentsOf(withHandoff, meta)).toEqual([])
    const withoutHandoff = [...plainTurns(0, 4, 1000), turnEntry('big', [said('big')], 250_000), ...plainTurns(10, 14, 250_000)]
    const incidents = incidentsOf(withoutHandoff, meta)
    expect(kindsOf(incidents)).toEqual(['big-context'])
    expect(incidents[0].before.at(-1)?.text).toBe('big')
  })

  it('counts a crossing when the session ends before 10 turns without a handoff', () => {
    const incidents = incidentsOf([turnEntry('big', [said('big')], 250_000), ...plainTurns(10, 3, 250_000)], meta)
    expect(kindsOf(incidents)).toEqual(['big-context'])
  })

  it('reports a second crossing after a clear', () => {
    const clear = userEntry('<command-name>/clear</command-name>')
    const incidents = incidentsOf(
      [turnEntry('big1', [said('one')], 250_000), ...plainTurns(10, 12, 250_000), clear, ...plainTurns(30, 2, 1000), turnEntry('big2', [said('two')], 260_000), ...plainTurns(40, 12, 260_000)],
      meta
    )
    expect(kindsOf(incidents)).toEqual(['big-context', 'big-context'])
    expect(incidents.map((i) => i.id)).toEqual(['s1-0', 's1-1'])
  })

  it('reports a rule flag at the tool call that raised it and a 3x repeated command once', () => {
    const incidents = incidentsOf(
      [
        userEntry('zrób to'),
        turnEntry('a1', [said('commituję'), bash('c1', 'git commit -m x')]),
        turnEntry('a2', [bash('r1', 'ls')]),
        turnEntry('a3', [bash('r2', 'ls')]),
        turnEntry('a4', [bash('r3', 'ls')]),
        turnEntry('a5', [bash('r4', 'ls')])
      ],
      meta
    )
    expect(kindsOf(incidents)).toEqual(['rule', 'repeat'])
    expect(incidents[0].before.at(-1)).toEqual({ text: 'commituję', tools: ['Bash: git commit -m x'] })
    expect(incidents[1].before.at(-1)?.tools).toEqual(['Bash: ls'])
  })

  it('does not flag a commit that the user asked for', () => {
    const incidents = incidentsOf([userEntry('zrób commit'), turnEntry('a1', [bash('c1', 'git commit -m x')])], meta)
    expect(incidents).toEqual([])
  })

  it('reports no-tests once at the last source edit', () => {
    const incidents = incidentsOf(
      [
        turnEntry('a1', [said('first edit'), toolUse('e1', 'Edit', { file_path: 'src/a.ts' })]),
        turnEntry('a2', [said('last edit'), toolUse('e2', 'Write', { file_path: 'src/b.ts' })]),
        turnEntry('a3', [toolUse('e3', 'Edit', { file_path: 'docs/plan.md' })])
      ],
      meta
    )
    expect(kindsOf(incidents)).toEqual(['rule'])
    expect(incidents[0].before.at(-1)?.text).toBe('last edit')
  })

  it('does not report no-tests when a test ran', () => {
    const incidents = incidentsOf(
      [turnEntry('a1', [toolUse('e1', 'Edit', { file_path: 'src/a.ts' })]), turnEntry('a2', [bash('t1', 'npx vitest run')])],
      meta
    )
    expect(incidents).toEqual([])
  })
})

describe('capIncidents', () => {
  const incident = (sessionId: string, index: number, kind: Incident['kind'], text = 'x'): Incident => ({
    id: `${sessionId}-${index}`,
    sessionId,
    ticket: null,
    kind,
    at: index,
    user: null,
    before: [{ text, tools: [] }]
  })

  it('caps incidents per session keeping one of each kind', () => {
    const all = [...Array.from({ length: 20 }, (_, i) => incident('s1', i + 1, 'correction')), incident('s1', 0, 'rule')]
    const capped = capIncidents(all)
    expect(capped).toHaveLength(8)
    expect(kindsOf(capped)).toContain('rule')
    expect(capped[0].id).toBe('s1-20')
  })

  it('caps incidents per day', () => {
    const all = Array.from({ length: 10 }, (_, s) => Array.from({ length: 6 }, (_, i) => incident(`s${s}`, i, 'correction'))).flat()
    expect(all).toHaveLength(60)
    expect(capIncidents(all)).toHaveLength(40)
  })

  it('caps the total JSON size per day', () => {
    const all = Array.from({ length: 10 }, (_, s) =>
      Array.from({ length: 6 }, (_, i) => incident(`s${s}`, i, i === 0 ? 'rule' : 'correction', 'y'.repeat(1500)))
    ).flat()
    const capped = capIncidents(all)
    expect(JSON.stringify(capped).length).toBeLessThanOrEqual(60_000)
    expect(capped.length).toBeGreaterThan(0)
    expect(kindsOf(capped)).toContain('rule')
  })
})

describe('collectDigests incidents', () => {
  it('returns capped incidents of all sessions next to the digests', async () => {
    const root = mkdtempSync(join(tmpdir(), 'insights-'))
    const projects = join(root, 'projects')
    mkdirSync(join(projects, 'C--repo'), { recursive: true })
    const lines = [turnEntry('m1', [said('did it')]), userEntry('nie, źle')].map((e) => JSON.stringify(e))
    writeFileSync(join(projects, 'C--repo', 'abcdef123456.jsonl'), lines.join('\n'))
    const result = await collectDigests(projects, Date.now() - 60_000, undefined, '')
    expect(result.digests).toHaveLength(1)
    expect(result.incidents).toHaveLength(1)
    expect(result.incidents[0]).toMatchObject({ id: 'abcdef12-0', sessionId: 'abcdef123456', kind: 'correction' })
  })
})

const makeDigest = (over: Partial<Digest>): Digest =>
  ({
    sessionId: 's',
    project: 'p',
    ticket: null,
    turns: 0,
    avgContext: 0,
    tools: {},
    repeatedCommands: [],
    corrections: [],
    ruleFlags: [],
    costUnits: 0,
    costByModel: {},
    costByStage: {},
    buckets: { lt100k: { turns: 0, cost: 0 }, '100to200k': { turns: 0, cost: 0 }, '200to300k': { turns: 0, cost: 0 }, gt300k: { turns: 0, cost: 0 } },
    costAbove200k: 0,
    activeMinutes: 0,
    ...over
  }) as Digest

describe('aggregateDay', () => {
  it('aggregates a day from digests', () => {
    const day = aggregateDay('2026-11-16', [
      makeDigest({ sessionId: 'a', ticket: 'A', costUnits: 10, turns: 2, avgContext: 100, activeMinutes: 7, ruleFlags: ['no-tests', 'commit-without-ask'], tools: { Bash: { calls: 3, errors: 2 }, Read: { calls: 1, errors: 1 } }, repeatedCommands: [{ command: 'x', count: 3 }], corrections: ['nie', 'źle'], costByModel: { opus: 10 }, costByStage: { main: 10 } }),
      makeDigest({ sessionId: 'b', ticket: null, costUnits: 5, turns: 2, avgContext: 200, costAbove200k: 4, costByModel: { opus: 5 }, costByStage: { main: 5 } })
    ])
    expect(day).toMatchObject({
      day: '2026-11-16',
      costUnits: 15,
      sessions: 2,
      noTests: 1,
      ruleBreaks: 2,
      toolErrors: 3,
      repeatedCommands: 1,
      corrections: 2,
      avgContext: 150,
      costAbove200k: 4,
      costByModel: { opus: 15 },
      costByStage: { main: 15 },
      tickets: [{ ticket: 'A', cost: 10, sessions: 1, activeMinutes: 7 }],
      topSessions: [
        { sessionId: 'a', ticket: 'A', cost: 10 },
        { sessionId: 'b', ticket: null, cost: 5 }
      ]
    })
  })
  it('handles no digests and keeps only the 5 costliest sessions', () => {
    expect(aggregateDay('d', [])).toMatchObject({ costUnits: 0, avgContext: 0, sessions: 0, tickets: [], topSessions: [] })
    const many = [1, 2, 3, 4, 5, 6, 7].map((n) => makeDigest({ sessionId: `s${n}`, costUnits: n }))
    expect(aggregateDay('d', many).topSessions.map((s) => s.sessionId)).toEqual(['s7', 's6', 's5', 's4', 's3'])
  })
})

describe('parseInsights', () => {
  const ctx = { home: 'C:/Users/me', day: '2026-11-16', applied: [], dismissed: [] }
  const finding = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    kind: 'claude',
    severity: 'high',
    title: 'T',
    cause: 'Jeden. Dwa. Trzy.',
    metric: 'costUnits',
    sessions: ['s1'],
    incidents: ['i1'],
    ...over
  })
  const proposal = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    finding: 'f1',
    target: '~/.claude/CLAUDE.md',
    title: 'P',
    evidence: ['e'],
    find: 'a',
    replace: 'b',
    why: 'Bo tak. Drugie.',
    expected: 'Mniej. Drugie.',
    metric: 'costUnits',
    ...over
  })
  const fence = '```'
  const out = (body: unknown, prose = 'Wstęp') => `${prose}\n${fence}json\n${JSON.stringify(body)}\n${fence}\n`

  it('parses the last json block and drops invalid entries', () => {
    const body = {
      headline: 'H.',
      findings: [finding('f1'), finding('f2', { metric: 'foo' }), finding('f3'), finding('f4'), finding('f5'), finding('f6'), finding('f7')],
      proposals: [proposal('p1'), proposal('p2', { finding: 'nope' }), proposal('p3', { target: '~/other/file.md' })],
      tips: [{ id: 't1', finding: 'f1', title: 'x', detail: 'd' }, { id: 't2', finding: 'nope', title: 'x', detail: 'd' }],
      effects: []
    }
    const first = out({ headline: 'old', findings: [], proposals: [], tips: [], effects: [] })
    const result = parseInsights(`${first}${out(body)}`, ctx)
    expect(result.findings.map((f) => f.id)).toEqual(['f1', 'f3', 'f4', 'f5', 'f6'])
    expect(result.proposals.map((p) => p.id)).toEqual(['p1'])
    expect(result.proposals[0]).toMatchObject({ finding: 'f1', target: 'C:/Users/me/.claude/CLAUDE.md', metric: 'costUnits' })
    expect(result.tips.map((t) => t.id)).toEqual(['t1'])
  })
  it('drops entries with unknown severity or kind', () => {
    const result = parseInsights(out({ headline: 'H', findings: [finding('a', { severity: 'x' }), finding('b', { kind: 'z' }), finding('c')] }), ctx)
    expect(result.findings.map((f) => f.id)).toEqual(['c'])
  })
  it('truncates headline to one sentence and cause to two', () => {
    const result = parseInsights(out({ headline: 'A. B.', findings: [finding('f1')], proposals: [proposal('p1')], tips: [{ id: 't', finding: 'f1', title: 'x', detail: 'Jeden. Dwa. Trzy.' }] }), ctx)
    expect(result.headline).toBe('A.')
    expect(result.findings[0].cause).toBe('Jeden. Dwa.')
    expect(result.proposals[0]).toMatchObject({ why: 'Bo tak.', expected: 'Mniej.' })
    expect(result.tips[0].detail).toBe('Jeden. Dwa.')
  })
  it('forces too-early for proposals applied less than 3 days ago', () => {
    const applied = [
      { id: 'new', target: 't', title: 'x', day: '2026-11-15', metric: 'costUnits' as const },
      { id: 'old', target: 't', title: 'x', day: '2026-11-10', metric: 'costUnits' as const }
    ]
    const effects = [
      { proposal: 'new', verdict: 'improved', note: 'n' },
      { proposal: 'old', verdict: 'improved', note: 'n' }
    ]
    const result = parseInsights(out({ headline: 'H', effects }), { ...ctx, applied })
    expect(result.effects.map((e) => [e.proposal, e.verdict])).toEqual([
      ['new', 'too-early'],
      ['old', 'improved']
    ])
  })
  it('forces too-early when the applied day cannot be parsed', () => {
    const applied = [{ id: 'bad', target: 't', title: 'x', day: 'garbage', metric: 'costUnits' as const }]
    const result = parseInsights(out({ headline: 'H', effects: [{ proposal: 'bad', verdict: 'improved', note: 'n' }] }), { ...ctx, applied })
    expect(result.effects[0].verdict).toBe('too-early')
  })
  it('drops effects for unknown proposals and bad verdicts, and proposals already dismissed', () => {
    const applied = [{ id: 'old', target: 't', title: 'x', day: '2026-11-01', metric: 'costUnits' as const }]
    const effects = [
      { proposal: 'ghost', verdict: 'improved', note: 'n' },
      { proposal: 'old', verdict: 'great', note: 'n' }
    ]
    const dismissed = [{ id: 'p1', target: 'x', title: 'x', find: 'x' }]
    const result = parseInsights(out({ headline: 'H', findings: [finding('f1')], proposals: [proposal('p1'), proposal('p2', { find: 'c' })], effects }), { ...ctx, applied, dismissed })
    expect(result.effects).toEqual([])
    expect(result.proposals.map((p) => p.id)).toEqual(['p2'])
  })
  it('returns an empty result for output without json', () => {
    const empty = { headline: '', findings: [], proposals: [], tips: [], effects: [] }
    expect(parseInsights('nothing', ctx)).toEqual(empty)
    expect(parseInsights('```json\n[oops\n```', ctx)).toEqual(empty)
  })
})

describe('ensureGuide', () => {
  it('writes the default guide only when missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'guide-'))
    const path = join(root, 'insights', 'guide.md')
    ensureGuide(path)
    expect(readFileSync(path, 'utf8')).toContain('AskUserQuestion')
    expect(readFileSync(path, 'utf8')).not.toContain('1–5')
    writeFileSync(path, 'mine')
    ensureGuide(path)
    expect(readFileSync(path, 'utf8')).toBe('mine')
  })
})

describe('insights files', () => {
  it('lists only YYYY-MM-DD.json files older than 60 days', () => {
    const names = ['2026-09-16.json', '2026-09-17.json', '2026-01-01.json', 'notes.json', '2026-01-01.md', 'guide.md']
    expect(expiredDayFiles(names, '2026-11-16')).toEqual(['2026-09-16.json', '2026-01-01.json'])
  })
  it('keeps the last 30 day files, sorted', () => {
    const names = Array.from({ length: 35 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}.json`).reverse()
    const recent = recentDayFiles([...names, 'x.json'])
    expect(recent).toHaveLength(30)
    expect(recent[0]).toBe('2026-10-06.json')
    expect(recent[29]).toBe('2026-10-35.json')
  })
  it('tells an empty result from a usable one', () => {
    const empty = { headline: '', findings: [], proposals: [], tips: [], effects: [] }
    expect(isEmptyInsights(empty)).toBe(true)
    expect(isEmptyInsights({ ...empty, headline: 'H' })).toBe(false)
  })
  it('reads a stored result and rejects the old proposal-only shape', () => {
    expect(storedInsights([{ id: 'x' }], '')).toBeNull()
    expect(storedInsights({ proposals: [] }, '')).toBeNull()
    expect(storedInsights({ headline: 'H', findings: [], proposals: [], tips: [], effects: [] }, '')).toMatchObject({ headline: 'H' })
  })
  it('keeps valid applied entries only', () => {
    const good = { id: 'a', target: 't', title: 'x', day: '2026-11-16', metric: 'costUnits' }
    expect(appliedList([good, { id: 'b' }, 5])).toEqual([good])
    expect(appliedList(null)).toEqual([])
  })
  it('flags dismissed and applied proposals', () => {
    const p = { id: 'p1', target: 't', title: 'x', evidence: [], find: 'f', replace: 'r', finding: 'f1', why: 'w', expected: 'e', metric: 'costUnits' as const }
    const result = { headline: 'H', findings: [], proposals: [p, { ...p, id: 'p2', find: 'g' }], tips: [], effects: [] }
    const states = withProposalStates(result, [{ id: 'p1', target: 'x', title: 'x', find: 'x' }], [{ id: 'p2', target: 't', title: 'x', day: 'd', metric: 'costUnits' }])
    expect(states.proposals.map((q) => [q.isDismissed, q.isApplied])).toEqual([[true, false], [false, true]])
  })
})

describe('parseInsights robustness', () => {
  const ctx = { home: 'C:/Users/me', day: '2026-11-16', applied: [], dismissed: [] }
  const fence = '```'
  const finding = { id: 'f1', kind: 'claude', severity: 'high', title: 'T', cause: 'C.', metric: 'costUnits', sessions: [], incidents: [] }
  it('keeps json whose strings contain code fences', () => {
    const body = { headline: `Use ${fence}json blocks ${fence} carefully.`, findings: [finding] }
    const result = parseInsights(`Intro
${fence}json
${JSON.stringify(body, null, 2)}
${fence}
`, ctx)
    expect(result.findings.map((f) => f.id)).toEqual(['f1'])
    expect(result.headline).toBe(body.headline)
  })
  it('falls back to a bare object in prose', () => {
    const result = parseInsights(`Here: ${JSON.stringify({ headline: 'H.', findings: [finding] })} done`, ctx)
    expect(result.findings.map((f) => f.id)).toEqual(['f1'])
  })
  it('returns empty for malformed output', () => {
    expect(parseInsights(`${fence}json
{"headline": oops}
${fence}`, ctx)).toEqual({ headline: '', findings: [], proposals: [], tips: [], effects: [] })
  })
  it('defaults missing evidence to an empty list', () => {
    const proposal = { id: 'p1', finding: 'f1', target: '~/.claude/CLAUDE.md', title: 'P', find: 'a', replace: 'b', why: 'W.', expected: 'E.', metric: 'costUnits' }
    const result = parseInsights(`${fence}json
${JSON.stringify({ headline: 'H', findings: [finding], proposals: [proposal] })}
${fence}`, ctx)
    expect(result.proposals.map((p) => [p.id, p.evidence])).toEqual([['p1', []]])
  })
})

describe('reportDay', () => {
  it('prefers the findings day over a newer metrics day', () => {
    expect(reportDay(['2026-11-15.json'], ['2026-11-15.json', '2026-11-16.json'])).toBe('2026-11-15')
  })
  it('falls back to the newest metrics day without findings', () => {
    expect(reportDay([], ['2026-11-15.json', '2026-11-16.json'])).toBe('2026-11-16')
    expect(reportDay([], [])).toBeNull()
  })
})
