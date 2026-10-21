import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readHead } from '../src/main/scanner'

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
