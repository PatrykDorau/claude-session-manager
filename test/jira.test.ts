import { describe, it, expect } from 'vitest'
import { jiraApiUrl, isAccepting } from '../src/main/jira'

describe('jiraApiUrl', () => {
  it('derives the issue API url from a browse base (trailing slash)', () => {
    expect(jiraApiUrl('https://jira.redge.com/browse/', 'SOFKRS-8028')).toBe(
      'https://jira.redge.com/rest/api/2/issue/SOFKRS-8028?fields=status'
    )
  })
  it('ignores the path of the browse base, using only the origin', () => {
    expect(jiraApiUrl('https://jira.redge.com/browse/SOFKRS-1', 'KAN-2')).toBe(
      'https://jira.redge.com/rest/api/2/issue/KAN-2?fields=status'
    )
  })
})

describe('isAccepting', () => {
  const list = 'Accepted, Done, Closed'
  it('matches case-insensitively against the list', () => {
    expect(isAccepting('Accepted', list)).toBe(true)
    expect(isAccepting('done', list)).toBe(true)
    expect(isAccepting('CLOSED', list)).toBe(true)
  })
  it('rejects non-listed and null statuses', () => {
    expect(isAccepting('In Progress', list)).toBe(false)
    expect(isAccepting(null, list)).toBe(false)
    expect(isAccepting('Done', '')).toBe(false)
  })
})
