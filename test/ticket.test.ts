import { describe, it, expect } from 'vitest'
import { extractTicket } from '../src/main/ticket'

describe('extractTicket', () => {
  it('pulls ticket from a branch name', () => {
    expect(extractTicket('fix/SOFKRS-8028-next-episode', null)).toBe('SOFKRS-8028')
  })
  it('falls back to the first prompt', () => {
    expect(extractTicket('develop', 'please look at SOFKAN-12 today')).toBe('SOFKAN-12')
  })
  it('prefers the branch over the prompt', () => {
    expect(extractTicket('feat/SOFKRS-1-a', 'mentions SOFKAN-999')).toBe('SOFKRS-1')
  })
  it('returns null when nothing matches', () => {
    expect(extractTicket('develop', 'no ticket here')).toBe(null)
    expect(extractTicket(null, null)).toBe(null)
  })
})
