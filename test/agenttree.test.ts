import { describe, it, expect } from 'vitest'
import { treeCounts, filterGroups, groupLabel } from '../src/renderer/src/dashboard/agenttree'
import type { AgentGroup, AgentNode, Session } from '../src/renderer/src/types'

const agent = (id: string, state: AgentNode['state']): AgentNode => ({
  id,
  agentType: 'task-implementer',
  description: '',
  model: 'sonnet',
  state,
  toolCalls: 0,
  lastText: '',
  lastAt: 1,
  task: '',
  depth: 1
})
const groups: AgentGroup[] = [
  { sessionId: 's1', agents: [agent('a', 'working'), agent('b', 'finished')] },
  { sessionId: 's2', agents: [agent('c', 'finished')] },
  { sessionId: 's3', agents: [agent('d', 'stuck')] }
]
const session = (id: string, status: Session['status'], extra: Partial<Session> = {}): Session =>
  ({ id, status, ticket: null, name: null, projectName: 'repo', isLive: true, ...extra }) as Session

describe('treeCounts', () => {
  it('counts agents by state and supervisors that need the user', () => {
    expect(treeCounts(groups, [session('s1', 'waiting'), session('s2', 'idle')])).toEqual({
      working: 1,
      needsYou: 1,
      stuck: 1,
      finished: 2
    })
  })
})

describe('filterGroups', () => {
  it('hides finished agents and drops groups left empty', () => {
    expect(filterGroups(groups, { isMovingOnly: false, isFinishedHidden: true }).map((g) => g.sessionId)).toEqual(['s1', 's3'])
    expect(filterGroups(groups, { isMovingOnly: false, isFinishedHidden: true })[0].agents.map((a) => a.id)).toEqual(['a'])
  })
  it('keeps only working agents when asked for moving ones', () => {
    expect(filterGroups(groups, { isMovingOnly: true, isFinishedHidden: false }).map((g) => g.sessionId)).toEqual(['s1'])
  })
})

describe('groupLabel', () => {
  it('prefers the session name, then the ticket, then a short id', () => {
    expect(groupLabel('abcdef123', session('abcdef123', 'idle', { name: 'SOFRMPT-1 explain' }))).toBe('SOFRMPT-1 explain')
    expect(groupLabel('abcdef123', session('abcdef123', 'idle', { ticket: 'SOFRMPT-2' }))).toBe('SOFRMPT-2')
    expect(groupLabel('abcdef123', undefined)).toBe('Session abcdef12')
  })
})
