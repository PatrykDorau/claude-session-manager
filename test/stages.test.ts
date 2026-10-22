import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, appendFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { stagesFromLine, createStageScanner } from '../src/main/stages'

const skill = (name: string, args?: string): string =>
  JSON.stringify({
    type: 'assistant',
    message: {
      content: [
        { type: 'tool_use', name: 'Skill', input: { skill: name, ...(args ? { args } : {}) } }
      ]
    }
  })
const slash = (name: string, args = ''): string =>
  JSON.stringify({
    type: 'user',
    message: {
      content: `<command-message>${name}</command-message>\n<command-name>/${name}</command-name>\n<command-args>${args}</command-args>`
    }
  })
const bash = (command: string): string =>
  JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', name: 'Bash', input: { command } }] }
  })

describe('stagesFromLine', () => {
  it('maps each skill to its stage', () => {
    expect(stagesFromLine(skill('superpowers:brainstorming'))).toEqual(['brainstorm'])
    expect(stagesFromLine(skill('browser-verify', 'repro krok'))).toEqual(['repro'])
    expect(stagesFromLine(skill('superpowers:writing-plans'))).toEqual(['plan'])
    expect(stagesFromLine(skill('superpowers:executing-plans'))).toEqual(['impl'])
    expect(stagesFromLine(skill('superpowers:subagent-driven-development'))).toEqual(['impl'])
    expect(stagesFromLine(skill('pair-programming'))).toEqual(['impl'])
    expect(stagesFromLine(skill('browser-verify', 'verify'))).toEqual(['verify'])
    expect(stagesFromLine(skill('browser-verify', 'qa'))).toEqual(['qa'])
    expect(stagesFromLine(skill('review-mr'))).toEqual(['review'])
  })
  it('reads user slash commands', () => {
    expect(stagesFromLine(slash('review-mr'))).toEqual(['review'])
    expect(stagesFromLine(slash('browser-verify', 'verify SOFKRS-1'))).toEqual(['verify'])
  })
  it('detects MR creation from a Bash call', () => {
    expect(stagesFromLine(bash('node C:/x/gitlab.js mr create --draft'))).toEqual(['mr'])
    expect(stagesFromLine(bash('node C:/x/gitlab.js mr list'))).toEqual([])
  })
  it('detects MR creation from a push with merge request options', () => {
    expect(
      stagesFromLine(
        bash('git push -u origin fix/X-1 -o merge_request.create -o merge_request.target=develop')
      )
    ).toEqual(['mr'])
    expect(stagesFromLine(bash('git push origin fix/X-1'))).toEqual([])
  })
  it('detects MR creation from the commit-and-push skill', () => {
    expect(stagesFromLine(skill('commit-and-push'))).toEqual(['mr'])
    expect(stagesFromLine(slash('commit-and-push'))).toEqual(['mr'])
  })
  it('ignores stage names quoted inside ordinary text', () => {
    const quoted = JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'text',
            text: '<command-name>/review-mr</command-name> superpowers:brainstorming'
          }
        ]
      }
    })
    expect(stagesFromLine(quoted)).toEqual([])
  })
  it('returns nothing for unrelated or broken lines', () => {
    expect(stagesFromLine(bash('ls'))).toEqual([])
    expect(stagesFromLine('{bad')).toEqual([])
    expect(stagesFromLine(skill('browser-verify'))).toEqual([])
  })
})

describe('createStageScanner', () => {
  it('reads only appended complete lines and rescans after truncation', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'stages-'))
    const f = join(dir, 's.jsonl')
    const scanner = createStageScanner()
    writeFileSync(f, skill('superpowers:brainstorming') + '\n' + bash('ls') + '\n')
    expect(await scanner.scan(f, statSync(f).size)).toEqual(['brainstorm'])

    const plan = skill('superpowers:writing-plans')
    const review = skill('review-mr')
    appendFileSync(f, plan + '\n' + review.slice(0, 20))
    expect(await scanner.scan(f, statSync(f).size)).toEqual(['brainstorm', 'plan'])

    appendFileSync(f, review.slice(20) + '\n')
    expect(await scanner.scan(f, statSync(f).size)).toEqual(['brainstorm', 'plan', 'review'])

    writeFileSync(f, skill('pair-programming') + '\n')
    expect(await scanner.scan(f, statSync(f).size)).toEqual(['impl'])
  })
})

describe('createStageScanner concurrency', () => {
  it('gives the same result to overlapping scans and keeps the offset right', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'stages-'))
    const f = join(dir, 's.jsonl')
    const scanner = createStageScanner()
    writeFileSync(f, skill('superpowers:brainstorming') + '\n')
    const size = statSync(f).size
    const [a, b] = await Promise.all([scanner.scan(f, size), scanner.scan(f, size)])
    expect(a).toEqual(['brainstorm'])
    expect(b).toEqual(['brainstorm'])
    const filler = JSON.stringify({ type: 'user', message: { content: 'x'.repeat(4 * size) } })
    appendFileSync(f, skill('review-mr') + '\n' + filler + '\n')
    expect(await scanner.scan(f, statSync(f).size)).toEqual(['brainstorm', 'review'])
  })
  it('reads a file bigger than one chunk', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'stages-'))
    const f = join(dir, 'big.jsonl')
    const filler = JSON.stringify({ type: 'user', message: { content: 'x'.repeat(1000) } }) + '\n'
    writeFileSync(f, filler.repeat(3000) + skill('review-mr') + '\n')
    const scanner = createStageScanner(64 * 1024)
    expect(await scanner.scan(f, statSync(f).size)).toEqual(['review'])
  })
})
