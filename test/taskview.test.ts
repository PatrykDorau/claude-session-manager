import { describe, it, expect } from 'vitest'
import { buildTaskRows, statusLane, splitTag, laneGroups } from '../src/renderer/src/taskview'
import type { Session } from '../src/renderer/src/types'

function s(over: Partial<Session>): Session {
  return {
    id: 'x',
    projectPath: '',
    projectName: 'p',
    gitBranch: null,
    ticket: null,
    firstPrompt: null,
    lastActive: 0,
    isLive: false,
    status: 'closed',
    watched: false,
    name: null,
    model: null,
    contextTokens: null,
    dirty: false,
    stages: [],
    ...over
  }
}

describe('buildTaskRows', () => {
  it('lists Jira tickets in order with their sessions newest first', () => {
    const tickets = [
      { key: 'A-2', summary: 'Second', status: 'To Do' },
      { key: 'A-1', summary: 'First', status: 'In Progress' }
    ]
    const sessions = [
      s({ id: 'old', ticket: 'a-1', lastActive: 1 }),
      s({ id: 'new', ticket: 'A-1', lastActive: 9 })
    ]
    const rows = buildTaskRows(tickets, sessions, [], {})
    expect(rows.map((r) => [r.key, r.sessions.map((x) => x.id), r.isFromJira])).toEqual([
      ['A-2', [], true],
      ['A-1', ['new', 'old'], true]
    ])
  })
  it('adds unfinished tickets that only have sessions after the Jira ones', () => {
    const sessions = [
      s({ id: 'b', ticket: 'B-1', firstPrompt: '<command-message>x</command-message>', lastActive: 2 }),
      s({ id: 'c', ticket: 'C-1', name: 'C name', firstPrompt: 'raw', lastActive: 1 }),
      s({ id: 'd', ticket: 'D-1', firstPrompt: '<command-name>/go</command-name> <command-args>D-1</command-args>' }),
      s({ id: 'f', ticket: 'F-1', lastActive: 3 }),
      s({ id: 'n', ticket: null })
    ]
    const titles = { 'B-1': 'Jira title of B' }
    const rows = buildTaskRows([{ key: 'A-1', summary: 'A', status: 'To Do' }], sessions, ['F-1'], titles)
    expect(rows.map((r) => [r.key, r.summary, r.isFromJira])).toEqual([
      ['A-1', 'A', true],
      ['B-1', 'Jira title of B', false],
      ['C-1', 'C name', false],
      ['D-1', '/go D-1', false]
    ])
  })
})

describe('statusLane', () => {
  it('maps statuses to lanes, To do only for Backlog and To Do, unknown ones to Other', () => {
    const order = ['In Progress', 'Code review', 'Internal testing', 'To Release', 'To Do', 'On hold', 'Rejected', 'Weird']
      .map((st) => statusLane(st).key)
    expect(order).toEqual(['progress', 'review', 'testing', 'release', 'todo', 'hold', 'rejected', 'other'])
    expect(statusLane('Backlog').key).toBe('todo')
    expect(statusLane('User Acceptance Testing').key).toBe('testing')
    expect(statusLane('Waiting for internal release').key).toBe('release')
  })
})

describe('laneGroups', () => {
  it('groups Jira rows by lane in flow order and keeps Jira order inside a lane', () => {
    const rows = buildTaskRows(
      [
        { key: 'A-1', summary: '', status: 'To Do' },
        { key: 'A-2', summary: '', status: 'In Progress' },
        { key: 'A-3', summary: '', status: 'Backlog' },
        { key: 'A-4', summary: '', status: 'Code review' },
        { key: 'A-5', summary: '', status: 'Analysis' }
      ],
      [],
      [],
      {}
    )
    expect(laneGroups(rows).map((g) => [g.lane.key, g.rows.map((r) => r.key)])).toEqual([
      ['progress', ['A-2']],
      ['todo', ['A-1', 'A-3']],
      ['review', ['A-4']],
      ['other', ['A-5']]
    ])
  })
})

describe('splitTag', () => {
  it('moves a leading [TAG] out of the title', () => {
    expect(splitTag('[FO_SMART_TV] Focus jumps')).toEqual({ tag: 'FO_SMART_TV', text: 'Focus jumps' })
    expect(splitTag('[FO_SMART_TV][LG] Remote')).toEqual({ tag: 'FO_SMART_TV / LG', text: 'Remote' })
    expect(splitTag('Plain title')).toEqual({ tag: '', text: 'Plain title' })
  })
})
