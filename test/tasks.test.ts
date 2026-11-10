import { describe, it, expect } from 'vitest'
import {
  parseSearch,
  startPrompt,
  parseBgId,
  ticketPrefix,
  repoRoots,
  startArgs,
  claudeExeCandidates,
  attachCommand,
  repoForProject,
  reviewArgs,
  taskContext
} from '../src/main/tasks'
import type { Session } from '../src/renderer/src/types'

describe('attachCommand', () => {
  it('attaches by the 8-character agent id taken from the session id', () => {
    expect(attachCommand('01edb0c6-b2f6-49bd-8faa-9ca6f0f39963')).toBe('claude attach 01edb0c6')
  })
})

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

describe('parseSearch', () => {
  it('reads key, summary and status of each issue', () => {
    const json = {
      issues: [
        { key: 'A-1', fields: { summary: 'Fix', status: { name: 'In Progress' } } },
        { key: 'A-2', fields: { summary: null, status: {} } },
        { nope: true }
      ]
    }
    expect(parseSearch(json)).toEqual([
      { key: 'A-1', summary: 'Fix', status: 'In Progress' },
      { key: 'A-2', summary: '', status: '' }
    ])
  })
  it('returns an empty list for an error body', () => {
    expect(parseSearch({ errorMessages: ['bad jql'] })).toEqual([])
    expect(parseSearch(null)).toEqual([])
  })
})

describe('startPrompt', () => {
  it('fills every placeholder and keeps special characters', () => {
    expect(startPrompt('{ticket}: {title} ({ticket})', 'A-1', 'Fix "x" $y `z`')).toBe(
      'A-1: Fix "x" $y `z` (A-1)'
    )
  })
})

describe('parseBgId', () => {
  it('reads the id from the background banner with colour codes', () => {
    const out = 'Starting background service…\n\u001b[32mbackgrounded · e6ef59a3 · spike\u001b[0m\n  claude agents'
    expect(parseBgId(out)).toBe('e6ef59a3')
  })
  it('returns null when nothing was started', () => {
    expect(parseBgId('Error: not trusted')).toBeNull()
  })
})

describe('ticketPrefix', () => {
  it('takes the project part of the key', () => {
    expect(ticketPrefix('sofnjj-2400')).toBe('SOFNJJ')
  })
})

describe('repoRoots', () => {
  it('maps worktrees to their repo and lists each repo once', () => {
    const list = [
      s({ projectPath: 'C:\\P\\tigo' }),
      s({ projectPath: 'C:\\P\\tigo\\.claude\\worktrees\\A-1' }),
      s({ projectPath: 'C:/P/alpha/.claude/worktrees/B-2' }),
      s({ projectPath: '' })
    ]
    expect(repoRoots(list)).toEqual([
      { path: 'C:/P/alpha', name: 'alpha' },
      { path: 'C:\\P\\tigo', name: 'tigo' }
    ])
  })
})

describe('startArgs', () => {
  it('creates the worktree unless it already exists', () => {
    expect(startArgs('A-1', 'go', false)).toEqual(['--bg', '--worktree', 'A-1', '--name', 'A-1', 'go'])
    expect(startArgs('A-1', 'go', true)).toEqual(['--bg', '--name', 'A-1', 'go'])
  })
})

describe('claudeExeCandidates', () => {
  it('prefers a real exe, then the npm package binary next to claude.cmd, then the native install', () => {
    const where = 'C:\\npm\\claude\r\nC:\\npm\\claude.cmd\r\n'
    expect(claudeExeCandidates(where, 'C:\\Users\\me')).toEqual([
      'C:\\npm\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe',
      'C:\\Users\\me\\.local\\bin\\claude.exe'
    ])
    expect(claudeExeCandidates('C:\\x\\claude.exe\n', 'C:\\Users\\me')[0]).toBe('C:\\x\\claude.exe')
  })
})

describe('repoForProject', () => {
  const roots = [{ path: 'C:/P/telco/tigo-fo-web', name: 'tigo-fo-web' }]
  it('finds the local repo by the last segment of the GitLab project path', () => {
    expect(repoForProject('telco/Tigo-fo-web', roots)).toBe('C:/P/telco/tigo-fo-web')
  })
  it('returns null when no local repo matches', () => {
    expect(repoForProject('telco/other', roots)).toBeNull()
  })
})

describe('reviewArgs', () => {
  it('starts a review in its own MR worktree so the main checkout keeps its branch', () => {
    expect(reviewArgs(42, 'https://g/x/-/merge_requests/42', false)).toEqual([
      '--bg', '--worktree', 'MR-42', '--name', 'MR-42', '/review-mr https://g/x/-/merge_requests/42'
    ])
  })
  it('reuses an existing MR worktree', () => {
    expect(reviewArgs(42, 'u', true)).toEqual(['--bg', '--name', 'MR-42', '/review-mr u'])
  })
})

describe('parseSearch — priority', () => {
  it('reads the priority name when Jira sends it', () => {
    const json = { issues: [{ key: 'A-1', fields: { summary: 'Fix', status: { name: 'To Do' }, priority: { name: 'Major' } } }] }
    expect(parseSearch(json)[0].priority).toBe('Major')
  })
})

describe('taskContext', () => {
  it('tells the session where to work, which base to use and how to get the server', () => {
    const worktree = String.raw`C:\repo\.claude\worktrees\SOFNJJ-2537`
    const text = taskContext('SOFNJJ-2537', worktree, String.raw`C:\repo`, new Date('2026-11-10T10:00:00Z'))
    expect(text).toContain(worktree)
    expect(text).toContain('origin/develop')
    expect(text).toContain('cockpit.js server --ticket SOFNJJ-2537')
    expect(text).toContain(String.raw`Opis zadan\11-2026\SOFNJJ-2537`)
  })
})
