import { describe, it, expect } from 'vitest'
import { searchPrompts } from '../src/renderer/src/dashboard/promptquery'
import type { PromptEntry } from '../src/renderer/src/types'

const entry = (text: string, ticket: string | null = null): PromptEntry => ({ text, at: 1, ticket, project: 'p', sessionId: null, isIncomplete: false })

describe('searchPrompts', () => {
  const entries = [entry('Repro in Chrome please', 'SOFKRS-12'), entry('repro on tv'), entry('open chrome')]

  it('matches entries containing every word in any case', () => {
    expect(searchPrompts(entries, 'repro CHROME').map((e) => e.text)).toEqual(['Repro in Chrome please'])
  })

  it('matches by ticket key', () => {
    expect(searchPrompts(entries, 'sofkrs-12')).toHaveLength(1)
  })

  it('returns the first entries for an empty query, up to the limit', () => {
    expect(searchPrompts(entries, '  ', 2).map((e) => e.text)).toEqual(['Repro in Chrome please', 'repro on tv'])
  })

  it('respects the limit', () => {
    expect(searchPrompts(entries, 'r', 1)).toHaveLength(1)
  })

  it('matches by project folder', () => {
    expect(searchPrompts([{ ...entry('x'), project: 'C:/w/SOFNJJ-9-thing' }], 'sofnjj-9')).toHaveLength(1)
  })
})
