import { describe, it, expect } from 'vitest'
import {
  isFinishedStatus,
  closeCandidates,
  parseSessionFile,
  killChain,
  sessionPid,
  type ProcInfo
} from '../src/main/closing'
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

const p = (pid: number, parentPid: number, name: string, startedAt = pid): ProcInfo => ({
  pid,
  parentPid,
  name,
  startedAt
})

describe('isFinishedStatus', () => {
  it('accepts the three statuses in any case', () => {
    expect(['Done', 'internal testing', ' Waiting for internal release '].every(isFinishedStatus)).toBe(true)
  })
  it('rejects other statuses', () => {
    expect(['Accepted', 'Closed', 'To Release', 'User Acceptance Testing', null].some(isFinishedStatus)).toBe(false)
  })
})

describe('closeCandidates', () => {
  it('keeps live, non-background sessions with a finished ticket', () => {
    const list = [
      s({ id: 's1', ticket: 'A-1', isLive: true, status: 'idle', jiraStatus: 'Done' }),
      s({ id: 's2', ticket: 'A-2', isLive: true, status: 'idle', jiraStatus: 'In Progress' }),
      s({ id: 's3', ticket: 'A-1', isLive: false, jiraStatus: 'Done' }),
      s({ id: 's4', ticket: 'A-1', isLive: true, bg: true, jiraStatus: 'Done' }),
      s({ id: 's5', isLive: true, jiraStatus: 'Done' })
    ]
    expect(closeCandidates(list, { 'A-1': 'Fix' }).map((c) => c.id)).toEqual(['s1'])
  })
  it('uses the Jira title, else the first prompt, and carries the status', () => {
    const list = [
      s({ id: 'b', ticket: 'B-2', projectName: 'web', isLive: true, status: 'working', firstPrompt: 'do it', jiraStatus: 'Internal testing' }),
      s({ id: 'a', ticket: 'A-1', projectName: 'tv', isLive: true, status: 'waiting', jiraStatus: 'Done' })
    ]
    expect(closeCandidates(list, { 'A-1': 'Fix player' })).toEqual([
      { id: 'a', ticket: 'A-1', title: 'Fix player', projectName: 'tv', status: 'waiting' },
      { id: 'b', ticket: 'B-2', title: 'do it', projectName: 'web', status: 'working' }
    ])
  })
})

describe('parseSessionFile', () => {
  it('reads pid, sessionId and process start', () => {
    expect(parseSessionFile('{"pid":1652,"sessionId":"abc","procStart":"134376656127043861"}')).toEqual({
      pid: 1652,
      sessionId: 'abc',
      procStart: 134376656127043861
    })
  })
  it('returns null for malformed JSON or missing fields', () => {
    expect(parseSessionFile('{oops')).toBeNull()
    expect(parseSessionFile('{"pid":"1","sessionId":"abc"}')).toBeNull()
    expect(parseSessionFile('{"pid":1}')).toBeNull()
    expect(parseSessionFile('{"pid":1,"sessionId":"abc"}')).toBeNull()
  })
})

describe('killChain', () => {
  it('walks up shells and stops at Code.exe', () => {
    const procs = [p(10, 9, 'claude.exe'), p(9, 8, 'powershell.exe'), p(8, 7, 'pwsh.exe'), p(7, 1, 'Code.exe')]
    expect(killChain(10, procs)).toEqual([10, 9, 8])
  })
  it('returns nothing for a reused pid that is not claude', () => {
    expect(killChain(10, [p(10, 9, 'node.exe'), p(9, 1, 'powershell.exe')])).toEqual([])
  })
  it('returns nothing for an unknown pid', () => {
    expect(killChain(10, [p(9, 1, 'powershell.exe')])).toEqual([])
  })
  it('stops on a parent loop', () => {
    expect(killChain(10, [p(10, 9, 'claude.exe'), p(9, 10, 'cmd.exe')])).toEqual([10, 9])
  })
  it('ignores a parent shell that started after the child (reused pid)', () => {
    expect(killChain(10, [p(10, 9, 'claude.exe', 500), p(9, 1, 'powershell.exe', 600)])).toEqual([10])
  })
})

describe('sessionPid', () => {
  const file = (pid: number, sessionId: string, procStart: number) => ({ pid, sessionId, procStart })
  it('returns the pid whose claude process started when the file says', () => {
    expect(sessionPid([file(10, 'a', 500)], 'a', [p(10, 1, 'claude.exe', 500)])).toBe(10)
  })
  it('rejects a reused pid that started at another time', () => {
    expect(sessionPid([file(10, 'a', 500)], 'a', [p(10, 1, 'claude.exe', 900_000)])).toBeNull()
  })
  it('picks the live file when a stale one claims the same session', () => {
    const files = [file(10, 'a', 500), file(20, 'a', 700)]
    expect(sessionPid(files, 'a', [p(20, 1, 'claude.exe', 700)])).toBe(20)
  })
  it('refuses when two live files claim the same session', () => {
    const files = [file(10, 'a', 500), file(20, 'a', 700)]
    expect(sessionPid(files, 'a', [p(10, 1, 'claude.exe', 500), p(20, 1, 'claude.exe', 700)])).toBeNull()
  })
})
