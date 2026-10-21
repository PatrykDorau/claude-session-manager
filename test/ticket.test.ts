import { describe, it, expect } from 'vitest'
import { branchTicket, findTicket } from '../src/main/ticket'

describe('branchTicket', () => {
  it('pulls a ticket from a branch name', () => {
    expect(branchTicket('fix/SOFKRS-8028-next-episode')).toBe('SOFKRS-8028')
  })
  it('is null when the branch has no ticket', () => {
    expect(branchTicket('develop')).toBe(null)
    expect(branchTicket(null)).toBe(null)
  })
})

describe('findTicket', () => {
  it('skips denylisted look-alikes and returns the real ticket', () => {
    expect(findTicket('fix UTF-8 bug in SOFKRS-1234', [])).toBe('SOFKRS-1234')
  })
  it('is null when only look-alikes are present', () => {
    expect(findTicket('SHA-256 only', [])).toBe(null)
    expect(findTicket('ISO-8601 and CVE-2024', [])).toBe(null)
  })
  it('ignores codes that are segments of a Windows path', () => {
    expect(findTicket('see C:\\Users\\ASSET-17300\\Desktop then SOFKRS-5', [])).toBe('SOFKRS-5')
    expect(findTicket('cd C:\\Users\\ASSET-17300', [])).toBe(null)
  })
  it('ignores codes inside a forward-slash path but keeps Jira URLs', () => {
    expect(findTicket('file:///C:/Users/ASSET-17300/Downloads/x.md', [])).toBe(null)
    expect(findTicket('https://jira.redge.com/browse/SOFKRS-8', [])).toBe('SOFKRS-8')
  })
  it('restricts to configured prefixes', () => {
    expect(findTicket('ABC-1 SOFKRS-2', ['SOF'])).toBe('SOFKRS-2')
  })
  it('is null for empty input', () => {
    expect(findTicket(null, [])).toBe(null)
    expect(findTicket('just a question', [])).toBe(null)
  })
})
