import { describe, it, expect } from 'vitest'
import { parseExplainDoc, explainArgs } from '../src/main/explaindoc'

describe('parseExplainDoc', () => {
  it('reads the flow and the changes the skill writes', () => {
    const json = {
      ticket: 'SOFRMPT-3868',
      branch: 'feat/x',
      base: 'a1b2',
      process: 'Przewijanie DPADem',
      flow: [
        { step: 1, title: 'Wciśnięcie', before: 'a', after: 'a', isChanged: false },
        { step: 2, title: 'Krok', before: 'stały', after: 'rośnie', isChanged: true, ms: 120 },
        { step: 'x' }
      ],
      changes: [
        { file: 'src\\utils\\seek.ts', line: 12, step: 2, title: 'Krzywa', why: 'Bo tak' },
        { file: 'src/a.ts', line: 'nope', why: 'skip' }
      ]
    }
    expect(parseExplainDoc(json)).toEqual({
      ticket: 'SOFRMPT-3868',
      branch: 'feat/x',
      base: 'a1b2',
      process: 'Przewijanie DPADem',
      flow: [
        { step: 1, title: 'Wciśnięcie', before: 'a', after: 'a', isChanged: false, ms: null },
        { step: 2, title: 'Krok', before: 'stały', after: 'rośnie', isChanged: true, ms: 120 }
      ],
      changes: [{ file: 'src/utils/seek.ts', line: 12, step: 2, title: 'Krzywa', why: 'Bo tak' }]
    })
  })
  it('returns null when the file is not an explanation', () => {
    expect(parseExplainDoc(null)).toBeNull()
    expect(parseExplainDoc({ ticket: 'X' })).toBeNull()
  })
})

describe('explainArgs', () => {
  it('starts a named background session that runs the skill with the implementing session transcript', () => {
    expect(explainArgs('SOFRMPT-1', 'C:/Users/me/.claude/projects/p/abc.jsonl')).toEqual([
      '--bg',
      '--name',
      'SOFRMPT-1 explain',
      '/explain-changes SOFRMPT-1 --dashboard --transcript "C:/Users/me/.claude/projects/p/abc.jsonl"'
    ])
  })
  it('runs without a transcript when the ticket has no session', () => {
    expect(explainArgs('SOFRMPT-1', null)).toEqual(['--bg', '--name', 'SOFRMPT-1 explain', '/explain-changes SOFRMPT-1 --dashboard'])
  })
})
