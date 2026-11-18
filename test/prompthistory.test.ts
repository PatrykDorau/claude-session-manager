import { describe, it, expect } from 'vitest'
import { parseHistory } from '../src/main/prompthistory'

const line = (display: string, timestamp: number, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ display, pastedContents: {}, timestamp, project: 'C:\\r', sessionId: 's1', ...extra })

describe('parseHistory', () => {
  it('replaces a pasted text marker with its content', () => {
    const out = parseHistory([line('fix [Pasted text #1 +3 lines] now', 1, { pastedContents: { '1': { id: 1, type: 'text', content: 'BODY' } } })])
    expect(out[0].text).toBe('fix BODY now')
  })

  it('takes the ticket from a worktree path', () => {
    const out = parseHistory([line('a', 1, { project: 'C:\\r\\.claude\\worktrees\\SOFKRS-12' }), line('b', 2)])
    expect(out.find((e) => e.text === 'a')?.ticket).toBe('SOFKRS-12')
    expect(out.find((e) => e.text === 'b')?.ticket).toBeNull()
  })

  it('drops bare slash commands but keeps ones with arguments', () => {
    expect(parseHistory([line('/clear', 1), line('/review-mr 12', 2)]).map((e) => e.text)).toEqual(['/review-mr 12'])
  })

  it('merges identical texts and keeps the newest', () => {
    const out = parseHistory([line('same', 1), line('same ', 2)])
    expect(out).toHaveLength(1)
    expect(out[0].at).toBe(2)
  })

  it('skips broken lines and returns newest first', () => {
    expect(parseHistory([line('old', 1), '{broken', line('new', 5)]).map((e) => e.text)).toEqual(['new', 'old'])
  })

  it('takes the ticket from a worktree folder named after it inside a repo folder', () => {
    const out = parseHistory([line('a', 1, { project: 'C:\\r\\.claude\\worktrees\\tigo\\sofkrs-77-fix-focus' })])
    expect(out[0].ticket).toBe('SOFKRS-77')
  })

  it('fills a hashed paste from the paste cache', () => {
    const out = parseHistory(
      [line('see [Pasted text #2 +40 lines]', 1, { pastedContents: { '2': { id: 2, type: 'text', contentHash: 'abc' } } })],
      (hash) => (hash === 'abc' ? 'CACHED' : null)
    )
    expect(out[0].text).toBe('see CACHED')
    expect(out[0].isIncomplete).toBe(false)
  })

  it('flags an entry whose paste cannot be found', () => {
    const out = parseHistory([line('see [Pasted text #2 +40 lines]', 1, { pastedContents: { '2': { id: 2, type: 'text', contentHash: 'gone' } } })])
    expect(out[0].text).toBe('see [Pasted text #2 +40 lines]')
    expect(out[0].isIncomplete).toBe(true)
  })
})
