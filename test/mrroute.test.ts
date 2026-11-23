import { describe, it, expect } from 'vitest'
import { routeMr } from '../src/renderer/src/dashboard/mrroute'
import type { MrRow } from '../src/renderer/src/types'

const mr = (over: Partial<MrRow>): MrRow => ({ key: 'g!1', iid: 1, ticket: 'SOF-1', author: 'me', sessionId: null, ...over }) as MrRow

describe('routeMr', () => {
  it('routes an own MR whose ticket is listed to the ticket', () => {
    expect(routeMr(mr({}), 'me', ['SOF-1'])).toEqual({ page: 'tickets', key: 'SOF-1' })
  })
  it('keeps an own MR without a ticket on the MR page', () => {
    expect(routeMr(mr({ ticket: null }), 'me', ['SOF-1'])).toEqual({ page: 'mrs' })
  })
  it('keeps an own MR whose ticket is not listed on the MR page', () => {
    expect(routeMr(mr({ ticket: 'SOF-2' }), 'me', ['SOF-1'])).toEqual({ page: 'mrs' })
  })
  it('keeps someone else\'s MR on the MR page', () => {
    expect(routeMr(mr({ author: 'other' }), 'me', ['SOF-1'])).toEqual({ page: 'mrs' })
  })
  it('keeps a missing MR on the MR page', () => {
    expect(routeMr(null, 'me', ['SOF-1'])).toEqual({ page: 'mrs' })
  })
})
