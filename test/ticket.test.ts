import { describe, it, expect } from 'vitest'
import { branchTicket, openingTicket } from '../src/main/ticket'

describe('branchTicket', () => {
  it('pulls a ticket from a branch name', () => {
    expect(branchTicket('fix/SOFKRS-8028-next-episode')).toBe('SOFKRS-8028')
  })
  it('is null when the branch has no ticket', () => {
    expect(branchTicket('develop')).toBe(null)
    expect(branchTicket(null)).toBe(null)
  })
})

describe('openingTicket', () => {
  it('returns the first ticket found across opening user texts', () => {
    expect(openingTicket(['no ticket', 'please do SOFKAN-12 today'])).toBe('SOFKAN-12')
  })
  it('is null when none of the texts carry a ticket', () => {
    expect(openingTicket(['just some work', 'keep going'])).toBe(null)
    expect(openingTicket([])).toBe(null)
  })
})
