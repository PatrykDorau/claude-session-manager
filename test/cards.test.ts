import { describe, it, expect } from 'vitest'
import { reactive } from 'vue'
import {
  buildCards,
  splitSections,
  sortCards,
  primarySession,
  sortNoTask,
  cardMatches,
  plainSession,
  jiraGroup
} from '../src/renderer/src/cards'
import type { Session, TaskMeta } from '../src/renderer/src/types'

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

function meta(ticket: string, over: Partial<TaskMeta> = {}): TaskMeta {
  return {
    ticket,
    title: null,
    jiraStatus: null,
    stage: null,
    reached: [],
    folder: null,
    mrUrl: null,
    isWatched: false,
    isFinished: false,
    ...over
  }
}

describe('buildCards', () => {
  it('groups sessions of one ticket across projects into one card', () => {
    const cards = buildCards(
      [
        s({ id: 'a', ticket: 'X-1', projectName: 'krs-web', lastActive: 5 }),
        s({ id: 'b', ticket: 'X-1', projectName: 'krs-smarttv', lastActive: 9 }),
        s({ id: 'c', ticket: null })
      ],
      {}
    )
    expect(cards).toHaveLength(1)
    expect(cards[0].projects).toEqual(['krs-web', 'krs-smarttv'])
    expect(cards[0].lastActive).toBe(9)
  })
  it('takes the most urgent session status for the card', () => {
    const [card] = buildCards(
      [
        s({ id: 'a', ticket: 'X-1', status: 'idle' }),
        s({ id: 'b', ticket: 'X-1', status: 'waiting' })
      ],
      {}
    )
    expect(card.status).toBe('waiting')
    expect(card.isActive).toBe(true)
  })
})

describe('splitSections', () => {
  it('keeps a finished card in Tasks while a session needs you', () => {
    const sessions = [s({ id: 'a', ticket: 'X-1', status: 'waiting' })]
    const cards = buildCards(sessions, { 'X-1': meta('X-1', { isFinished: true }) })
    const out = splitSections(cards, [])
    expect(out.tasks.map((c) => c.ticket)).toEqual(['X-1'])
    expect(out.finishedCards).toEqual([])
  })
  it('moves a finished card with only closed sessions to Finished', () => {
    const cards = buildCards([s({ id: 'a', ticket: 'X-1' })], {
      'X-1': meta('X-1', { isFinished: true })
    })
    const out = splitSections(cards, [])
    expect(out.finishedCards.map((c) => c.ticket)).toEqual(['X-1'])
    expect(out.tasks).toEqual([])
  })
  it('splits no-task sessions by finished unless live', () => {
    const out = splitSections(
      [],
      [s({ id: 'a', finished: true }), s({ id: 'b', finished: true, isLive: true }), s({ id: 'c' })]
    )
    expect(out.finishedSessions.map((x) => x.id)).toEqual(['a'])
    expect(out.noTask.map((x) => x.id)).toEqual(['b', 'c'])
  })
})

describe('primarySession', () => {
  it('picks needs-you over a newer idle session', () => {
    const [card] = buildCards(
      [
        s({ id: 'idle', ticket: 'X-1', status: 'idle', isLive: true, lastActive: 99 }),
        s({ id: 'wait', ticket: 'X-1', status: 'waiting', lastActive: 1 })
      ],
      {}
    )
    expect(primarySession(card).id).toBe('wait')
  })
  it('falls back to the newest session', () => {
    const [card] = buildCards(
      [
        s({ id: 'old', ticket: 'X-1', lastActive: 1 }),
        s({ id: 'new', ticket: 'X-1', lastActive: 5 })
      ],
      {}
    )
    expect(primarySession(card).id).toBe('new')
  })
})

describe('sortCards', () => {
  it('puts a watched card above a waiting one, then orders by status', () => {
    const cards = buildCards(
      [
        s({ id: 'a', ticket: 'A-1', status: 'working' }),
        s({ id: 'b', ticket: 'B-1', status: 'waiting' }),
        s({ id: 'c', ticket: 'C-1', status: 'closed', lastActive: 99 })
      ],
      { 'C-1': meta('C-1', { isWatched: true }) }
    )
    expect(sortCards(cards, 'status').map((c) => c.ticket)).toEqual(['C-1', 'B-1', 'A-1'])
  })
  it('recency mode orders by the newest session', () => {
    const cards = buildCards(
      [s({ id: 'a', ticket: 'A-1', lastActive: 1 }), s({ id: 'b', ticket: 'B-1', lastActive: 2 })],
      {}
    )
    expect(sortCards(cards, 'recency').map((c) => c.ticket)).toEqual(['B-1', 'A-1'])
  })
})

describe('sortNoTask', () => {
  it('puts watched and live sessions first in recency mode', () => {
    const out = sortNoTask(
      [
        s({ id: 'new', lastActive: 9 }),
        s({ id: 'live', isLive: true, lastActive: 1 }),
        s({ id: 'star', watched: true, lastActive: 0 })
      ],
      'recency'
    )
    expect(out.map((x) => x.id)).toEqual(['star', 'live', 'new'])
  })
})

describe('cardMatches', () => {
  it('matches the Jira title or any session', () => {
    const [card] = buildCards([s({ id: 'a', ticket: 'X-1', firstPrompt: 'hello' })], {
      'X-1': meta('X-1', { title: 'Podwójne ładowanie EPG' })
    })
    expect(cardMatches(card, 'epg')).toBe(true)
    expect(cardMatches(card, 'hello')).toBe(true)
    expect(cardMatches(card, 'nothing')).toBe(false)
  })
})

describe('plainSession', () => {
  it('returns a session that survives structured cloning from a reactive source', () => {
    const state = reactive({ list: [s({ id: 'a', ticket: 'X-1', stages: ['brainstorm'] })] })
    const out = plainSession(state.list[0])
    expect(() => structuredClone(out)).not.toThrow()
    expect(out.stages).toEqual(['brainstorm'])
  })
})

describe('jiraGroup', () => {
  it('follows the flow: In Progress, Code review, testing, then everything else', () => {
    expect(jiraGroup('In Progress')).toBe(0)
    expect(jiraGroup('in progress')).toBe(0)
    expect(jiraGroup('Code review')).toBe(1)
    expect(jiraGroup('Waiting for internal testing')).toBe(2)
    expect(jiraGroup('Internal testing')).toBe(2)
    expect(jiraGroup('Rejected')).toBe(3)
    expect(jiraGroup('To Do')).toBe(3)
    expect(jiraGroup(null)).toBe(3)
  })
})

describe('sortCards by Jira status', () => {
  it('orders In Progress, Code review, testing, then the rest, before urgency', () => {
    const cards = buildCards(
      [
        s({ id: 'a', ticket: 'A-1', status: 'waiting' }),
        s({ id: 'b', ticket: 'B-1', status: 'closed' }),
        s({ id: 'c', ticket: 'C-1', status: 'closed' }),
        s({ id: 'd', ticket: 'D-1', status: 'working' }),
        s({ id: 'e', ticket: 'E-1', status: 'closed' })
      ],
      {
        'A-1': meta('A-1', { jiraStatus: 'On Hold' }),
        'B-1': meta('B-1', { jiraStatus: 'Internal testing' }),
        'C-1': meta('C-1', { jiraStatus: 'In Progress' }),
        'D-1': meta('D-1', { jiraStatus: 'Waiting for internal testing' }),
        'E-1': meta('E-1', { jiraStatus: 'Code review' })
      }
    )
    expect(sortCards(cards, 'status').map((c) => c.ticket)).toEqual(['C-1', 'E-1', 'D-1', 'B-1', 'A-1'])
  })
  it('keeps pinned cards above every group', () => {
    const cards = buildCards(
      [s({ id: 'a', ticket: 'A-1' }), s({ id: 'b', ticket: 'B-1' })],
      {
        'A-1': meta('A-1', { jiraStatus: 'To Do', isWatched: true }),
        'B-1': meta('B-1', { jiraStatus: 'In Progress' })
      }
    )
    expect(sortCards(cards, 'recency').map((c) => c.ticket)).toEqual(['A-1', 'B-1'])
  })
})
