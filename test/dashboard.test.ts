import { describe, it, expect } from 'vitest'
import { filterRows, rowChip, lastActivity, isQuickExit, clampSize, priorityLook } from '../src/renderer/src/dashboard/dashboard'
import type { TaskRow } from '../src/renderer/src/taskview'
import type { Session, Status } from '../src/renderer/src/types'

const session = (over: Partial<Session>): Session => ({
  id: 'x',
  projectPath: 'C:/P',
  projectName: 'P',
  gitBranch: null,
  ticket: 'A-1',
  firstPrompt: null,
  lastActive: 0,
  isLive: true,
  status: 'idle',
  watched: false,
  name: null,
  model: null,
  contextTokens: null,
  dirty: false,
  stages: [],
  ...over
})

const row = (key: string, summary: string, sessions: Session[] = []): TaskRow => ({
  key,
  summary,
  status: 'In Progress',
  sessions,
  isFromJira: true
})

describe('filterRows', () => {
  const rows = [row('SOFRMPT-3953', 'Channel logo updates'), row('SOFNJJ-2350', 'EPG grid scroll')]
  it('matches the key and the summary case-insensitively', () => {
    expect(filterRows(rows, 'sofnjj', [], false).map((r) => r.key)).toEqual(['SOFNJJ-2350'])
    expect(filterRows(rows, 'CHANNEL', [], false).map((r) => r.key)).toEqual(['SOFRMPT-3953'])
  })
  it('keeps every row for an empty query', () => {
    expect(filterRows(rows, '  ', [], false)).toHaveLength(2)
  })
  it('keeps only starred rows when asked', () => {
    expect(filterRows(rows, '', ['SOFNJJ-2350'], true).map((r) => r.key)).toEqual(['SOFNJJ-2350'])
  })
})

describe('rowChip', () => {
  const chipFor = (status: Status): ReturnType<typeof rowChip> => rowChip(row('A-1', 's', [session({ status })]))
  it('labels the newest live session state', () => {
    expect(chipFor('working')).toEqual({ label: 'working', color: '#58a6ff' })
    expect(chipFor('waiting')).toEqual({ label: 'needs you', color: '#d29922' })
    expect(chipFor('checkout')).toEqual({ label: 'check output', color: '#5ec8ff' })
    expect(chipFor('idle')).toEqual({ label: 'idle', color: '#737373' })
  })
  it('has no chip without a live session', () => {
    expect(rowChip(row('A-1', 's', [session({ isLive: false, status: 'closed' })]))).toBeNull()
    expect(rowChip(row('A-1', 's'))).toBeNull()
  })
})

describe('lastActivity', () => {
  it('returns the newest session activity', () => {
    expect(lastActivity(row('A-1', 's', [session({ lastActive: 5 }), session({ lastActive: 9 })]))).toBe(9)
  })
  it('is null without sessions', () => {
    expect(lastActivity(row('A-1', 's'))).toBeNull()
  })
})

describe('isQuickExit', () => {
  it('treats an attach that ended within 10 s as a failed attach, not a detach to reattach', () => {
    expect(isQuickExit(1000, 4000)).toBe(true)
    expect(isQuickExit(1000, 20000)).toBe(false)
  })
})

describe('clampSize', () => {
  it('keeps a dragged size between its limits', () => {
    expect(clampSize(150, 220, 600)).toBe(220)
    expect(clampSize(900, 220, 600)).toBe(600)
    expect(clampSize(340, 220, 600)).toBe(340)
    expect(clampSize(Number.NaN, 220, 600)).toBe(220)
  })
})

describe('priorityLook', () => {
  it('maps Jira priority names to a level', () => {
    expect(priorityLook('Blocker')?.level).toBe(2)
    expect(priorityLook('Highest')?.level).toBe(2)
    expect(priorityLook('Major')?.level).toBe(1)
    expect(priorityLook('Medium')?.level).toBe(0)
    expect(priorityLook('Minor')?.level).toBe(-1)
    expect(priorityLook('Trivial')?.level).toBe(-2)
  })
  it('returns nothing for an unknown or missing priority', () => {
    expect(priorityLook(undefined)).toBeNull()
    expect(priorityLook('Weird')).toBeNull()
  })
})
