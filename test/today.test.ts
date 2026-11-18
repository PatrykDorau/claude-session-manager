import { describe, it, expect } from 'vitest'
import { buildToday } from '../src/renderer/src/dashboard/today'
import type { InboxRow } from '../src/renderer/src/dashboard/inbox'
import type { JiraTicket, MrRow, Session } from '../src/renderer/src/types'

const session = (over: Partial<Session>): Session =>
  ({
    id: 's1',
    ticket: null,
    name: null,
    projectName: 'p',
    isLive: true,
    status: 'idle',
    lastActive: 5,
    firstPrompt: null,
    ...over
  }) as Session
const mr = (over: Partial<MrRow>): MrRow =>
  ({
    key: 'p!1',
    iid: 1,
    title: 'T',
    author: 'other',
    isDraft: false,
    review: 'not-reviewed',
    openThreads: 0,
    approvals: 0,
    ticket: null,
    sessionId: null,
    updatedAt: '2026-11-17T10:00:00Z',
    ...over
  }) as MrRow
const ticket = (key: string, status: string): JiraTicket => ({ key, summary: `Sum ${key}`, status })
const inboxRow: InboxRow = {
  sessionId: 's9',
  label: 'A-1',
  title: 'Fix',
  status: 'waiting',
  since: 3,
  ticket: 'A-1',
  mrKey: null
}

const build = (over: Partial<Parameters<typeof buildToday>[0]>): ReturnType<typeof buildToday> =>
  buildToday({ inbox: [], sessions: [], titles: {}, mrs: [], myName: 'me', tickets: [], ...over })

describe('buildToday', () => {
  it('puts inbox rows on me', () => {
    expect(build({ inbox: [inboxRow] }).onMe[0].target).toEqual({ kind: 'inbox', sessionId: 's9' })
  })

  it('lists other people’s unreviewed MRs on me, but not drafts or reviewed ones', () => {
    const out = build({
      mrs: [mr({ key: 'a' }), mr({ key: 'b', isDraft: true }), mr({ key: 'c', review: 'reviewed' })]
    })
    expect(out.onMe.map((i) => i.target)).toEqual([{ kind: 'mr', key: 'a' }])
    expect(out.onOthers).toEqual([])
  })

  it('splits my MRs by open threads', () => {
    const out = build({
      mrs: [mr({ key: 'a', author: 'me', openThreads: 2 }), mr({ key: 'b', author: 'me' })]
    })
    expect(out.onMe.map((i) => i.detail)).toEqual(['2 open threads'])
    expect(out.onOthers.map((i) => i.target)).toEqual([{ kind: 'mr', key: 'b' }])
  })

  it('skips MRs when my name is unknown', () => {
    const out = build({
      myName: null,
      mrs: [mr({ key: 'a' }), mr({ key: 'b', author: 'me', openThreads: 1 })]
    })
    expect([...out.onMe, ...out.onOthers]).toEqual([])
  })

  it('sorts Jira tickets by status and session', () => {
    const out = build({
      tickets: [
        ticket('A-1', 'To Do'),
        ticket('A-2', 'To Do'),
        ticket('A-3', 'Rejected'),
        ticket('A-4', 'Internal testing'),
        ticket('A-5', 'Done')
      ],
      sessions: [
        session({ id: 'x', ticket: 'A-2', isLive: false }),
        session({ id: 'y', ticket: 'A-3' })
      ]
    })
    expect(out.onMe.map((i) => i.target)).toEqual([
      { kind: 'ticket', key: 'A-1' },
      { kind: 'ticket', key: 'A-3' }
    ])
    expect(out.onOthers.map((i) => i.target)).toEqual([{ kind: 'ticket', key: 'A-4' }])
  })

  it('puts live working sessions on Claude', () => {
    const out = build({
      sessions: [
        session({ id: 'w', ticket: 'A-1', status: 'working' }),
        session({ id: 'i', status: 'idle' })
      ]
    })
    expect(out.onClaude.map((i) => i.target)).toEqual([
      { kind: 'session', sessionId: 'w', ticket: 'A-1', mrKey: null }
    ])
  })

  it('does not repeat a ticket or MR that is already waiting in the inbox', () => {
    const out = build({
      inbox: [inboxRow, { ...inboxRow, sessionId: 's8', label: '!5', ticket: null, mrKey: 'p!5' }],
      tickets: [ticket('A-1', 'Rejected')],
      mrs: [mr({ key: 'p!5', iid: 5 })]
    })
    expect(out.onMe.map((i) => i.target.kind)).toEqual(['inbox', 'inbox'])
  })

  it('points a working MR session at its MR', () => {
    const out = build({
      sessions: [session({ id: 'abcdef12-long', status: 'working' })],
      mrs: [mr({ key: 'p!7', iid: 7, sessionId: 'abcdef12' })]
    })
    expect(out.onClaude[0].target).toEqual({
      kind: 'session',
      sessionId: 'abcdef12-long',
      ticket: null,
      mrKey: 'p!7'
    })
  })
})
