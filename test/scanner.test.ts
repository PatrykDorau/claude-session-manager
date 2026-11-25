import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const parseTailSpy = vi.hoisted(() => vi.fn())

vi.mock('../src/main/transcript', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/main/transcript')>()
  parseTailSpy.mockImplementation(original.parseTail)
  return { ...original, parseTail: parseTailSpy }
})

import { readHead, scanRaw } from '../src/main/scanner'

describe('readHead', () => {
  it('finds a first prompt whose line is longer than the head chunk', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'head-'))
    const f = join(dir, 'a.jsonl')
    const meta = JSON.stringify({ type: 'system', cwd: 'C:/r', sessionId: 's1', content: 'y'.repeat(12000) })
    const prompt = JSON.stringify({
      type: 'user',
      message: { content: 'SOFRMPT-3085 ' + 'opis '.repeat(20000) }
    })
    writeFileSync(f, meta + '\n' + prompt + '\n')
    const head = await readHead(f, statSync(f).size)
    expect(head.cwd).toBe('C:/r')
    expect(head.firstPrompt?.startsWith('SOFRMPT-3085')).toBe(true)
  })
})

describe('scanRaw', () => {
  beforeEach(() => {
    parseTailSpy.mockClear()
  })

  it('tail and stages are reused for an unchanged file', async () => {
    const home = mkdtempSync(join(tmpdir(), 'home-'))
    process.env.USERPROFILE = home
    process.env.HOME = home
    const project = join(home, '.claude', 'projects', 'p1')
    mkdirSync(project, { recursive: true })
    const meta = JSON.stringify({ type: 'system', cwd: 'C:/r', sessionId: 's1' })
    const prompt = JSON.stringify({ type: 'user', message: { content: 'SOFRMPT-1 hello' } })
    writeFileSync(join(project, 's1.jsonl'), meta + '\n' + prompt + '\n')

    const first = await scanRaw()
    const second = await scanRaw()

    expect(first.raw).toHaveLength(1)
    expect(second.raw).toHaveLength(1)
    expect(parseTailSpy).toHaveBeenCalledTimes(1)
  })
})
