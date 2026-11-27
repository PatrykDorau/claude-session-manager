import { describe, it, expect } from 'vitest'
import { filterThreads, threadCounts, noteLink } from '../src/renderer/src/dashboard/mrfilter'
import type { MrDiscussion, MrDraftNote } from '../src/renderer/src/types'

const thread = (extra: Partial<MrDiscussion>): MrDiscussion => ({
  id: 'd',
  isSystem: false,
  isResolved: false,
  isResolvable: true,
  where: null,
  anchor: null,
  snippet: null,
  notes: [],
  ...extra
})

const draft = (replyTo: string): MrDraftNote => ({ id: 1, body: 'x', anchor: null, replyTo, isResolving: false })

const unresolved = thread({ id: 'a' })
const resolved = thread({ id: 'b', isResolved: true })
const resolvedWithDraft = thread({ id: 'c', isResolved: true })
const plain = thread({ id: 'd', isResolvable: false })
const system = thread({ id: 'e', isSystem: true, isResolvable: false })
const drafts = [draft('c')]

describe('filterThreads', () => {
  it('open keeps unresolved and drops resolved', () => {
    expect(filterThreads([unresolved, resolved], [], 'open', false)).toEqual([unresolved])
  })

  it('open keeps resolved thread with my draft', () => {
    expect(filterThreads([resolvedWithDraft], drafts, 'open', false)).toEqual([resolvedWithDraft])
  })

  it('open keeps non-resolvable comment', () => {
    expect(filterThreads([plain], [], 'open', false)).toEqual([plain])
  })

  it('open drops system notes unless shown, then keeps them in place', () => {
    expect(filterThreads([unresolved, system, plain], [], 'open', false)).toEqual([unresolved, plain])
    expect(filterThreads([unresolved, system, plain], [], 'open', true)).toEqual([unresolved, system, plain])
  })

  it('resolved returns only resolved resolvable threads', () => {
    expect(filterThreads([unresolved, resolved, plain, system], [], 'resolved', false)).toEqual([resolved])
  })

  it('resolved keeps resolved thread with my draft', () => {
    expect(filterThreads([resolvedWithDraft], drafts, 'resolved', false)).toEqual([resolvedWithDraft])
  })

  it('all returns every non-system thread', () => {
    expect(filterThreads([unresolved, resolved, plain, system], [], 'all', false)).toEqual([unresolved, resolved, plain])
  })

  it('keeps threads with a kept id whatever the filter says', () => {
    expect(filterThreads([unresolved, resolved], [], 'open', false, [resolved.id])).toEqual([unresolved, resolved])
    expect(filterThreads([unresolved, resolved], [], 'resolved', false, [unresolved.id])).toEqual([unresolved, resolved])
  })
})

describe('threadCounts', () => {
  it('counts open and resolved', () => {
    expect(threadCounts([unresolved, resolved, resolvedWithDraft, plain, system], drafts)).toEqual({ open: 3, resolved: 2 })
  })
})

describe('noteLink', () => {
  it('appends the note anchor', () => {
    expect(noteLink('https://gl/x/-/merge_requests/5', 42)).toBe('https://gl/x/-/merge_requests/5#note_42')
  })
})
