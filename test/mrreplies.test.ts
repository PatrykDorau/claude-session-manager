import { describe, it, expect } from 'vitest'
import { isBotThread, isMyThread, isReplyUnseen, lastThreadReply, newReplyIds, sortThreads } from '../src/renderer/src/dashboard/mrreplies'
import type { MrDiscussion, MrNote } from '../src/renderer/src/types'

const note = (id: number, extra: Partial<MrNote> = {}): MrNote => ({ id, author: 'Anna', body: 'x', createdAt: 't', isMine: false, isBot: false, ...extra })
const mine = (id: number): MrNote => note(id, { author: 'Me', isMine: true })
const thread = (id: string, notes: MrNote[], extra: Partial<MrDiscussion> = {}): MrDiscussion => ({
  id,
  isSystem: false,
  isResolved: false,
  isResolvable: true,
  where: null,
  anchor: null,
  snippet: null,
  notes,
  ...extra
})

describe('newReplyIds', () => {
  const threads = [thread('a', [mine(1), note(2), note(5)]), thread('b', [note(3), note(4)]), thread('c', [note(6), mine(7), note(8, { isBot: true }), note(9)])]
  it('lists replies by people after my note, newer than the seen id', () => {
    expect([...newReplyIds(threads, 0)]).toEqual([2, 5, 9])
    expect([...newReplyIds(threads, 5)]).toEqual([9])
  })
  it('skips system threads', () => {
    expect([...newReplyIds([thread('s', [mine(1), note(2)], { isSystem: true })], 0)]).toEqual([])
  })
})

describe('lastThreadReply', () => {
  it('returns the newest reply to me or null', () => {
    expect(lastThreadReply([thread('a', [mine(1), note(4)]), thread('b', [mine(2), note(3)])])).toBe(4)
    expect(lastThreadReply([thread('a', [note(1), note(2)])])).toBeNull()
  })
})

describe('isReplyUnseen', () => {
  it('compares the reply id with the seen id', () => {
    expect(isReplyUnseen(5, undefined)).toBe(true)
    expect(isReplyUnseen(5, 4)).toBe(true)
    expect(isReplyUnseen(5, 5)).toBe(false)
    expect(isReplyUnseen(null, undefined)).toBe(false)
  })
})

describe('isBotThread and isMyThread', () => {
  it('reads the thread starter for bots and any note for mine', () => {
    expect(isBotThread(thread('a', [note(1, { isBot: true }), note(2)]))).toBe(true)
    expect(isBotThread(thread('a', [note(1), note(2, { isBot: true })]))).toBe(false)
    expect(isMyThread(thread('a', [note(1), mine(2)]))).toBe(true)
    expect(isMyThread(thread('a', [note(1)]))).toBe(false)
  })
})

describe('sortThreads', () => {
  it('puts threads with new replies first, then mine, keeping the order inside each group', () => {
    const threads = [thread('other1', [note(1)]), thread('mine1', [mine(2)]), thread('fresh', [mine(3), note(4)]), thread('other2', [note(5)]), thread('mine2', [mine(6)])]
    expect(sortThreads(threads, new Set([4])).map((t) => t.id)).toEqual(['fresh', 'mine1', 'mine2', 'other1', 'other2'])
  })
})
