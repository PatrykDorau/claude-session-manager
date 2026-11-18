import { describe, it, expect } from 'vitest'
import { statusCounts } from '../src/renderer/src/dashboard/statuscounts'
import type { DevServer, Session } from '../src/renderer/src/types'

const s = (status: Session['status'], isLive = true): Session => ({ id: status, isLive, status }) as Session

describe('statusCounts', () => {
  it('counts live sessions by state and running servers', () => {
    const sessions = [s('waiting'), s('waiting'), s('checkout'), s('working'), s('waiting', false)]
    expect(statusCounts(sessions, [{} as DevServer, {} as DevServer])).toEqual({ waiting: 2, finished: 1, working: 1, servers: 2 })
  })
})
