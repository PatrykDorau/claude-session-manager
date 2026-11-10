import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  loadState,
  saveState,
  applyWatched,
  applyName,
  applyFinished,
  applyTicketOverride,
  applyTicketWatched,
  applyTicketFinished,
  overrideTicket,
  visibleBounds,
  DEFAULT_QUICK_ACTIONS,
  type State
} from '../src/main/store'

const base: State = {
  watched: [],
  names: {},
  finished: [],
  finishOptOut: [],
  ticketOverride: {},
  jira: {},
  watchedTickets: [],
  finishedTickets: [],
  finishOptOutTickets: [],
  dock: { isDocked: false, edge: 'right', width: 320, displayId: null, floating: null },
  pane: {},
  restore: { snapshot: [], pendingRemoval: {}, lastScanAt: 0 },
  repoByPrefix: {},
  starred: [],
  dashboardBounds: null,
  reviewedMrs: {},
  mrSessions: {},
  serverCommands: {},
  chromePorts: {},
  settings: {
    jiraBase: 'https://jira.redge.com/browse/',
    jiraToken: '',
    jiraDoneStatuses: 'Accepted, Done, Closed',
    alwaysOnTop: true,
    clickAction: 'project-cmd',
    launchOnStartup: false,
    ticketPrefixes: '',
    isDockReserving: false,
    isDockOnTop: false,
    taskJql: 'assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC',
    startPrompt: 'Przeczytaj zadanie {ticket} z Jiry ({title}) i zacznij od /superpowers:brainstorming',
    quickActions: DEFAULT_QUICK_ACTIONS,
    gitlabBase: 'https://drm-gitlab.redlabs.pl',
    gitlabToken: '',
    mrProjects: 'tigo-fo-web, tigo-fo-smarttv',
    startView: 'ask',
    mrMention: '@telco-frontend'
  }
}

describe('ticket-level state', () => {
  it('applyTicketWatched adds and removes a ticket', () => {
    const on = applyTicketWatched(base, 'X-1', true)
    expect(on.watchedTickets).toEqual(['X-1'])
    expect(applyTicketWatched(on, 'X-1', false).watchedTickets).toEqual([])
  })
  it('applyTicketFinished toggles finished and opt-out oppositely', () => {
    const on = applyTicketFinished(base, 'X-1', true)
    expect(on.finishedTickets).toEqual(['X-1'])
    const off = applyTicketFinished(on, 'X-1', false)
    expect(off.finishedTickets).toEqual([])
    expect(off.finishOptOutTickets).toEqual(['X-1'])
  })
  it('defaults the new fields when an old state file lacks them', () => {
    const dir = mkdtempSync(join(tmpdir(), 'css-'))
    const file = join(dir, 'state.json')
    writeFileSync(file, JSON.stringify({ watched: ['a'], settings: { jiraToken: 't' }, dock: { edge: 'up', width: 'x' } }))
    const s = loadState(file)
    expect(s.jira).toEqual({})
    expect(s.watchedTickets).toEqual([])
    expect(s.dock).toEqual(base.dock)
    expect(s.settings.isDockReserving).toBe(false)
    expect(s.settings.ticketPrefixes).toBe('')
    expect(s.pane).toEqual({})
    expect(s.restore).toEqual({ snapshot: [], pendingRemoval: {}, lastScanAt: 0 })
    expect(s.repoByPrefix).toEqual({})
    expect(s.settings.taskJql).toBe(base.settings.taskJql)
    expect(s.settings.startPrompt).toBe(base.settings.startPrompt)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('store pure transforms', () => {
  it('applyWatched adds, is idempotent, and removes', () => {
    let s: State = { ...base }
    s = applyWatched(s, 'a', true)
    expect(s.watched).toEqual(['a'])
    s = applyWatched(s, 'a', true)
    expect(s.watched).toEqual(['a'])
    s = applyWatched(s, 'a', false)
    expect(s.watched).toEqual([])
  })
  it('applyName sets, trims, and clears on empty/null', () => {
    let s: State = { ...base }
    s = applyName(s, 'a', '  My session  ')
    expect(s.names['a']).toBe('My session')
    s = applyName(s, 'a', null)
    expect(s.names['a']).toBeUndefined()
    s = applyName(s, 'b', '   ')
    expect(s.names['b']).toBeUndefined()
  })
  it('applyFinished toggles finished and optOut oppositely', () => {
    let s: State = { ...base }
    s = applyFinished(s, 'a', true)
    expect(s.finished).toEqual(['a'])
    expect(s.finishOptOut).toEqual([])
    s = applyFinished(s, 'a', false)
    expect(s.finished).toEqual([])
    expect(s.finishOptOut).toEqual(['a'])
    s = applyFinished(s, 'a', true)
    expect(s.finished).toEqual(['a'])
    expect(s.finishOptOut).toEqual([])
  })
  it('applyTicketOverride pins, marks not-a-task, and resets on null', () => {
    let s: State = { ...base }
    s = applyTicketOverride(s, 'a', 'SOFKAN-1')
    expect(s.ticketOverride).toEqual({ a: 'SOFKAN-1' })
    s = applyTicketOverride(s, 'b', '')
    expect(s.ticketOverride).toEqual({ a: 'SOFKAN-1', b: '' })
    s = applyTicketOverride(s, 'a', null)
    expect(s.ticketOverride).toEqual({ b: '' })
  })
  it('overrideTicket resolves auto vs pin vs not-a-task', () => {
    expect(overrideTicket('SOFKAN-1', undefined)).toBe('SOFKAN-1')
    expect(overrideTicket(null, undefined)).toBe(null)
    expect(overrideTicket('SOFKAN-1', '')).toBe(null)
    expect(overrideTicket(null, 'SOFKAN-9')).toBe('SOFKAN-9')
    expect(overrideTicket('SOFKAN-1', 'SOFKAN-9')).toBe('SOFKAN-9')
  })
})

describe('store io', () => {
  it('defaults settings when missing and round-trips', () => {
    const dir = mkdtempSync(join(tmpdir(), 'css-'))
    const file = join(dir, 'state.json')
    expect(loadState(file)).toEqual(base)
    const next: State = {
      watched: ['x'],
      names: { x: 'n' },
      finished: ['f'],
      finishOptOut: ['o'],
      ticketOverride: { z: 'SOFKAN-1' },
      jira: { 'SOFKAN-1': { status: 'Done', summary: 'Tytuł' } },
      watchedTickets: ['SOFKAN-1'],
      finishedTickets: ['SOFKAN-2'],
      finishOptOutTickets: ['SOFKAN-3'],
      dock: { isDocked: true, edge: 'left', width: 300, displayId: 7, floating: { x: 1, y: 2, width: 3, height: 4 } },
      pane: { x: { pane: 'bottom', folder: 'C:/P' } },
      restore: { snapshot: [{ id: 'x', projectPath: 'C:/P', lastLiveAt: 5 }], pendingRemoval: { x: 4 }, lastScanAt: 5 },
      repoByPrefix: { SOFNJJ: 'C:/P/tigo' },
      starred: ['SOFNJJ-1'],
      dashboardBounds: { x: 10, y: 20, width: 1400, height: 860 },
      reviewedMrs: { '7!1': 'abc' },
      mrSessions: { '7!1': 'sid' },
      serverCommands: { repo: 'npm run serve -- --port {port}' },
      chromePorts: { 'A-1': 9301 },
      settings: {
        jiraBase: 'http://jira.local/',
        jiraToken: 'tok',
        jiraDoneStatuses: 'Done',
        alwaysOnTop: false,
        clickAction: 'terminal',
        launchOnStartup: true,
        ticketPrefixes: 'SOF',
        isDockReserving: true,
        isDockOnTop: true,
        taskJql: 'project = X',
        startPrompt: 'go {ticket}',
        quickActions: [{ label: 'Go', prompt: 'go on' }],
        gitlabBase: 'https://g.local',
        gitlabToken: 'gt',
        mrProjects: 'a, b',
        startView: 'dashboard',
        mrMention: '@team'
      }
    }
    saveState(file, next)
    expect(loadState(file)).toEqual(next)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('dashboard state', () => {
  const load = (o: unknown): State => {
    const dir = mkdtempSync(join(tmpdir(), 'css-'))
    const file = join(dir, 'state.json')
    writeFileSync(file, JSON.stringify(o))
    const s = loadState(file)
    rmSync(dir, { recursive: true, force: true })
    return s
  }
  it('defaults starred, dashboard bounds and quick actions when missing', () => {
    const s = load({})
    expect(s.starred).toEqual([])
    expect(s.dashboardBounds).toBeNull()
    expect(s.settings.quickActions).toEqual(DEFAULT_QUICK_ACTIONS)
    expect(DEFAULT_QUICK_ACTIONS.map((a) => a.label)).toEqual(['Repro in browser', 'Amend, push, draft notes', 'TL;DR of the plan', 'Write QA test cases'])
  })
  it('drops non-string starred keys', () => {
    expect(load({ starred: ['A-1', 3] }).starred).toEqual(['A-1'])
  })
  it('falls back to the default quick actions when the saved list is invalid or empty', () => {
    expect(load({ settings: { quickActions: [{ label: 'x' }] } }).settings.quickActions).toEqual(DEFAULT_QUICK_ACTIONS)
    expect(load({ settings: { quickActions: [] } }).settings.quickActions).toEqual(DEFAULT_QUICK_ACTIONS)
  })
  it('keeps valid quick actions and dashboard bounds', () => {
    const s = load({ settings: { quickActions: [{ label: 'a', prompt: 'b' }] }, dashboardBounds: { x: 1, y: 2, width: 3, height: 4 } })
    expect(s.settings.quickActions).toEqual([{ label: 'a', prompt: 'b' }])
    expect(s.dashboardBounds).toEqual({ x: 1, y: 2, width: 3, height: 4 })
  })
})

describe('visibleBounds', () => {
  const screen = [{ x: 0, y: 0, width: 1920, height: 1040 }]
  it('drops bounds that are off every display', () => {
    expect(visibleBounds({ x: 5000, y: 0, width: 800, height: 600 }, screen)).toBeNull()
  })
  it('keeps bounds on a display', () => {
    expect(visibleBounds({ x: 100, y: 100, width: 800, height: 600 }, screen)).toEqual({ x: 100, y: 100, width: 800, height: 600 })
  })
  it('passes null through', () => {
    expect(visibleBounds(null, screen)).toBeNull()
  })
})

describe('gitlab settings and review state', () => {
  const load = (o: unknown): State => {
    const dir = mkdtempSync(join(tmpdir(), 'css-'))
    const file = join(dir, 'state.json')
    writeFileSync(file, JSON.stringify(o))
    const s = loadState(file)
    rmSync(dir, { recursive: true, force: true })
    return s
  }
  it('defaults the GitLab settings and the review maps', () => {
    const s = load({})
    expect(s.settings.gitlabBase).toBe('https://drm-gitlab.redlabs.pl')
    expect(s.settings.gitlabToken).toBe('')
    expect(s.settings.mrProjects).toBe('tigo-fo-web, tigo-fo-smarttv')
    expect(s.reviewedMrs).toEqual({})
    expect(s.mrSessions).toEqual({})
  })
  it('drops review entries whose value is not a string', () => {
    const s = load({ reviewedMrs: { '7!1': 'abc', '7!2': 3 }, mrSessions: { '7!1': 'id', x: null } })
    expect(s.reviewedMrs).toEqual({ '7!1': 'abc' })
    expect(s.mrSessions).toEqual({ '7!1': 'id' })
  })
})

describe('start view setting', () => {
  const load = (o: unknown): State => {
    const dir = mkdtempSync(join(tmpdir(), 'css-'))
    const file = join(dir, 'state.json')
    writeFileSync(file, JSON.stringify(o))
    const s = loadState(file)
    rmSync(dir, { recursive: true, force: true })
    return s
  }
  it('asks on launch by default', () => {
    expect(load({}).settings.startView).toBe('ask')
    expect(load({}).settings.mrMention).toBe('@telco-frontend')
  })
  it('keeps a remembered window choice', () => {
    expect(load({ settings: { startView: 'dashboard' } }).settings.startView).toBe('dashboard')
    expect(load({ settings: { startView: 'sidebar' } }).settings.startView).toBe('sidebar')
  })
  it('falls back to asking for an unknown value', () => {
    expect(load({ settings: { startView: 'big' } }).settings.startView).toBe('ask')
  })
})

describe('dev server commands', () => {
  it('keeps one remembered command per repo and drops non-strings', () => {
    const dir = mkdtempSync(join(tmpdir(), 'css-'))
    const file = join(dir, 'state.json')
    writeFileSync(file, JSON.stringify({ serverCommands: { 'tigo-fo-smarttv': 'TENANT=salt npm run serve -- --port {port}', x: 1 } }))
    expect(loadState(file).serverCommands).toEqual({ 'tigo-fo-smarttv': 'TENANT=salt npm run serve -- --port {port}' })
    writeFileSync(file, '{}')
    expect(loadState(file).serverCommands).toEqual({})
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('chrome ports per ticket', () => {
  it('keeps numeric ports and drops anything else', () => {
    const dir = mkdtempSync(join(tmpdir(), 'css-'))
    const file = join(dir, 'state.json')
    writeFileSync(file, JSON.stringify({ chromePorts: { 'A-1': 9301, 'B-2': '9302', 'C-3': null } }))
    expect(loadState(file).chromePorts).toEqual({ 'A-1': 9301 })
    writeFileSync(file, '{}')
    expect(loadState(file).chromePorts).toEqual({})
    rmSync(dir, { recursive: true, force: true })
  })
})
