import { describe, it, expect } from 'vitest'
import { jiraApiUrl, isAccepting, descriptionText, commentUrl, parseTransitions, transitionsUrl, parseTicketDetail, parsePriority } from '../src/main/jira'

describe('jiraApiUrl', () => {
  it('derives the issue API url from a browse base (trailing slash)', () => {
    expect(jiraApiUrl('https://jira.redge.com/browse/', 'SOFKRS-8028')).toBe(
      'https://jira.redge.com/rest/api/2/issue/SOFKRS-8028?fields=status,summary'
    )
  })
  it('ignores the path of the browse base, using only the origin', () => {
    expect(jiraApiUrl('https://jira.redge.com/browse/SOFKRS-1', 'KAN-2')).toBe(
      'https://jira.redge.com/rest/api/2/issue/KAN-2?fields=status,summary'
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

describe('descriptionText', () => {
  it('returns a string description', () => {
    expect(descriptionText({ fields: { description: 'Steps' } })).toBe('Steps')
  })
  it('returns null for a missing, empty or non-string description', () => {
    expect(descriptionText({ fields: { description: null } })).toBeNull()
    expect(descriptionText({ fields: { description: '' } })).toBeNull()
    expect(descriptionText({ fields: { description: { type: 'doc' } } })).toBeNull()
    expect(descriptionText(null)).toBeNull()
  })
})

describe('commentUrl', () => {
  it('builds the comment endpoint of a ticket from the browse base', () => {
    expect(commentUrl('https://jira.redge.com/browse/', 'SOFRMPT-1')).toBe('https://jira.redge.com/rest/api/2/issue/SOFRMPT-1/comment')
  })
})

describe('parseTransitions', () => {
  it('lists the transitions with their target status', () => {
    const json = { transitions: [{ id: '21', name: 'Start progress', to: { name: 'In Progress' } }, { id: 'x' }, { id: '31', name: 'Done', to: {} }] }
    expect(parseTransitions(json)).toEqual([
      { id: '21', name: 'Start progress', to: 'In Progress' },
      { id: '31', name: 'Done', to: 'Done' }
    ])
  })
  it('returns nothing for garbage', () => {
    expect(parseTransitions(null)).toEqual([])
  })
})

describe('transitionsUrl', () => {
  it('builds the transitions endpoint', () => {
    expect(transitionsUrl('https://jira.redge.com/browse/', 'SOFRMPT-1')).toBe('https://jira.redge.com/rest/api/2/issue/SOFRMPT-1/transitions')
  })
})

describe('parseTicketDetail', () => {
  it('maps the fields the Ticket tab shows', () => {
    const json = {
      key: 'SOFRMPT-1',
      fields: {
        summary: 'Fix',
        description: 'Steps',
        status: { name: 'In Progress' },
        issuetype: { name: 'Bug' },
        priority: { name: 'High' },
        reporter: { displayName: 'Karolina Rosa' },
        assignee: { displayName: 'Patryk Dorau' },
        labels: ['salt'],
        fixVersions: [{ name: '1.2' }],
        created: '2026-08-24T10:00:00.000+0200',
        updated: '2026-11-09T13:31:08.191+0100',
        attachment: [{ filename: 'a.mov', content: 'https://jira/a.mov' }],
        comment: { comments: [{ author: { displayName: 'Bot' }, created: '2026-08-24T16:17:24.453+0200', body: 'Found' }] }
      }
    }
    expect(parseTicketDetail(json)).toEqual({
      key: 'SOFRMPT-1',
      summary: 'Fix',
      description: 'Steps',
      status: 'In Progress',
      type: 'Bug',
      priority: 'High',
      reporter: 'Karolina Rosa',
      assignee: 'Patryk Dorau',
      labels: ['salt'],
      fixVersions: ['1.2'],
      created: '2026-08-24T10:00:00.000+0200',
      updated: '2026-11-09T13:31:08.191+0100',
      attachments: [{ name: 'a.mov', url: 'https://jira/a.mov' }],
      comments: [{ author: 'Bot', created: '2026-08-24T16:17:24.453+0200', body: 'Found' }]
    })
  })
  it('returns null for garbage', () => {
    expect(parseTicketDetail(null)).toBeNull()
  })
})

describe('parsePriority', () => {
  it('reads the priority name of an issue', () => {
    expect(parsePriority({ fields: { priority: { name: 'Major' } } })).toBe('Major')
  })
  it('returns null without a priority', () => {
    expect(parsePriority({ fields: {} })).toBeNull()
    expect(parsePriority(null)).toBeNull()
  })
})
