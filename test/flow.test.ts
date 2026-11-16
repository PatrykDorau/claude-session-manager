import { describe, it, expect } from 'vitest'
import { parseWorkflow, parseHandoffStage, parseAgentFile, parseBoosters } from '../src/main/flow'

const skill = [
  '## Task workflow',
  '1. **Brainstorming** as usual.',
  '2. **Repro before the plan.** Gate yes.',
  '3. **Plan and implementation** as usual.',
  '4. **Verify after implementation.** Gate "yes" → verify.',
  '5. **Analyze the fix** → x.',
  '6. **QA test cases** for testers.',
  '7. **Review** → `review-mr`.',
  '8. **Draft MR, after one confirmation.** Show.',
  '',
  '| Stage | Who | Model |',
  '|---|---|---|',
  '| 1. Brainstorming, spec | main session | Opus |',
  '| 2. Repro, `repro.webm` | `browser-recorder` | Sonnet |',
  '| 3. Plan | main session | Opus |',
  '| 3. Implementation | main session, or `task-implementer` | per task size |',
  '| 4. Verify | `browser-recorder` | Sonnet |',
  '| 5. Analyze the fix | `side-effect-analyst` | Opus |',
  '| 5. Fixing what it found | main session | Opus |',
  '| 6. QA test cases | `qa-writer` | Haiku |',
  '| 7. Review SELF | `self-reviewer` | Opus |',
  '| 8. Commit, push, draft MR | main session | Opus |',
  '',
  'Risk — judge it from the code:',
  '- **critical** → at least L: player.',
  '- **high** → at least M: blast radius.',
  '- **low**: leaf code.',
  '',
  '| Size | Agent stages | Models |',
  '|---|---|---|',
  '| S | only `browser-recorder` | Sonnet |',
  '| M | verify + self-review | Sonnet implements, Opus reviews |',
  '| L | the full workflow | `opusplan` |'
].join('\n')

describe('parseWorkflow', () => {
  it('builds the stages from the list and the stage table', () => {
    const flow = parseWorkflow(skill)
    expect(flow.error).toBeNull()
    expect(flow.stages).toHaveLength(8)
    expect(flow.stages[0]).toMatchObject({ n: 1, title: 'Brainstorming' })
    expect(flow.stages[1].roles).toEqual([{ stage: '2. Repro, repro.webm', who: 'browser-recorder', model: 'Sonnet', isMain: false, agents: [] }])
    expect(flow.stages[2].roles).toHaveLength(2)
    expect(flow.stages[4].roles).toHaveLength(2)
  })

  it('reads the size table with its header and the risk bullets', () => {
    const flow = parseWorkflow(skill)
    expect(flow.sizes).toHaveLength(4)
    expect(flow.sizes[0]).toEqual(['Size', 'Agent stages', 'Models'])
    expect(flow.sizes[1]).toEqual(['S', 'only browser-recorder', 'Sonnet'])
    expect(flow.risk).toEqual(['critical → at least L: player.', 'high → at least M: blast radius.', 'low: leaf code.'])
  })

  it('reports an error instead of a partial diagram without the stage table', () => {
    const flow = parseWorkflow(skill.replace('| Stage | Who | Model |', '| Etap | Kto | Model |'))
    expect(flow.error).toBe('Stage table not found')
    expect(flow.stages).toEqual([])
  })

  it('parses CRLF the same as LF', () => {
    expect(parseWorkflow(skill.replace(/\n/g, '\r\n'))).toEqual(parseWorkflow(skill))
  })
})

describe('roles and gates', () => {
  const agents = ['browser-recorder', 'task-implementer', 'side-effect-analyst', 'qa-writer', 'self-reviewer']
  it('splits who into the main session and named agents', () => {
    const flow = parseWorkflow(skill, agents)
    expect(flow.stages[0].roles[0]).toMatchObject({ isMain: true, agents: [] })
    expect(flow.stages[1].roles[0]).toMatchObject({ isMain: false, agents: ['browser-recorder'] })
    expect(flow.stages[2].roles[1]).toMatchObject({ isMain: true, agents: ['task-implementer'] })
  })
  it('marks stages whose list item mentions the browser gate', () => {
    const flow = parseWorkflow(skill, agents)
    expect(flow.stages.map((s) => s.isGated)).toEqual([false, true, false, true, false, false, false, false])
  })
})

describe('parseAgentFile', () => {
  it('reads name, model and description from the frontmatter', () => {
    const text = ['---', 'name: qa-writer', 'description: Writes QA test cases.', 'model: haiku', '---', 'body'].join('\r\n')
    expect(parseAgentFile(text)).toEqual({ name: 'qa-writer', model: 'haiku', description: 'Writes QA test cases.' })
  })
  it('returns null without a name', () => {
    expect(parseAgentFile('no frontmatter')).toBeNull()
  })
})

describe('parseBoosters', () => {
  it('finds the rtk Bash hook and the caveman plugin', () => {
    const settings = {
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '"C:/x/rtk.exe" hook claude' }] }] },
      enabledPlugins: { 'caveman@caveman': true, 'superpowers@x': true }
    }
    expect(parseBoosters(JSON.stringify(settings)).map((b) => b.id)).toEqual(['rtk', 'caveman'])
  })
  it('skips disabled plugins, missing hooks and broken JSON', () => {
    expect(parseBoosters(JSON.stringify({ enabledPlugins: { 'caveman@caveman': false } }))).toEqual([])
    expect(parseBoosters('{oops')).toEqual([])
  })
})

describe('parseHandoffStage', () => {
  it('reads the stage, the next stage and the first next step', () => {
    const text = '# T — handoff\nEtap: 4. Verify — zrobione; następny: 5. Analyze\n\n## Następne kroki\n1. Run x\n2. y\n'
    expect(parseHandoffStage(text)).toEqual({ n: 4, stage: '4. Verify — zrobione', next: '5. Analyze', firstStep: 'Run x' })
  })

  it('has no stage number for koniec or a missing line', () => {
    expect(parseHandoffStage('Etap: koniec').n).toBeNull()
    expect(parseHandoffStage('# nothing')).toEqual({ n: null, stage: '', next: '', firstStep: '' })
  })

  it('takes the first step only from the Następne kroki section', () => {
    expect(parseHandoffStage('## Następne kroki\nBrak\n\n## Decyzje\n1. not a step\n').firstStep).toBe('')
  })

  it('parses CRLF', () => {
    expect(parseHandoffStage('Etap: 2. Repro; następny: 3. Plan\r\n').next).toBe('3. Plan')
  })
})
