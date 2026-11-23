import { describe, it, expect } from 'vitest'
import { sessionWorkRows } from '../src/renderer/src/dashboard/sessionwork'
import type { MrRow, Session } from '../src/renderer/src/types'
import type { TaskRow } from '../src/renderer/src/taskview'

const session = (id: string, extra: Partial<Session>): Session =>
  ({ id, name: null, ticket: null, status: 'idle', isLive: true, lastActive: 1, ...extra }) as Session

const task = (key: string, sessions: Session[]): TaskRow => ({ key, summary: `${key} title`, status: 'In Progress', sessions, isFromJira: true })

const mr = (key: string, extra: Partial<MrRow>): MrRow =>
  ({ key, iid: 5, title: `${key} title`, ticket: null, author: 'Someone', sessionId: null, ...extra }) as MrRow

describe('sessionWorkRows', () => {
  it('shows a ticket and its own MR once, as the ticket', () => {
    const work = session('w1', { ticket: 'SOF-1', status: 'working' })
    const address = session('a1', { ticket: 'SOF-1', name: 'SOF-1-cr' })
    const own = mr('1!5', { ticket: 'SOF-1', author: 'Me' })
    const rows = sessionWorkRows([task('SOF-1', [work])], [own], [work, address], 'Me')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'ticket', key: 'SOF-1', mr: own })
  })

  it('lists another person MR with a live review session', () => {
    const review = session('r1', { name: 'MR-7' })
    const other = mr('1!7', { iid: 7, sessionId: 'r1' })
    expect(sessionWorkRows([], [other], [review], 'Me')).toEqual([{ kind: 'mr', key: '1!7', title: '1!7 title', session: review, mr: other, isMine: false }])
  })

  it('lists my own MR whose ticket is not in my tickets', () => {
    const address = session('a2', { ticket: 'SOF-9', name: 'SOF-9-cr' })
    const own = mr('1!9', { iid: 9, ticket: 'SOF-9', author: 'Me' })
    expect(sessionWorkRows([], [own], [address], 'Me')[0]).toMatchObject({ kind: 'mr', key: '1!9', isMine: true, session: address })
  })

  it('skips sessions that are not live', () => {
    const dead = session('d1', { ticket: 'SOF-2', isLive: false })
    const other = mr('1!8', { iid: 8, sessionId: 'd2' })
    expect(sessionWorkRows([task('SOF-2', [dead])], [other], [dead, session('d2', { isLive: false })], 'Me')).toEqual([])
  })

  it('puts sessions that need you first, then working, then idle, newest first within a group', () => {
    const idle = session('i', { ticket: 'A-1', status: 'idle', lastActive: 9 })
    const working = session('w', { ticket: 'A-2', status: 'working', lastActive: 5 })
    const waitingOld = session('q1', { ticket: 'A-3', status: 'waiting', lastActive: 1 })
    const checkoutNew = session('q2', { ticket: 'A-4', status: 'checkout', lastActive: 7 })
    const rows = sessionWorkRows([task('A-1', [idle]), task('A-2', [working]), task('A-3', [waitingOld]), task('A-4', [checkoutNew])], [], [idle, working, waitingOld, checkoutNew], 'Me')
    expect(rows.map((r) => r.key)).toEqual(['A-4', 'A-3', 'A-2', 'A-1'])
  })
})
