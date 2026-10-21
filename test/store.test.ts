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
  settings: {
    jiraBase: 'https://jira.redge.com/browse/',
    jiraToken: '',
    jiraDoneStatuses: 'Accepted, Done, Closed',
    alwaysOnTop: true,
    clickAction: 'project-cmd',
    launchOnStartup: false,
    ticketPrefixes: '',
    isDockReserving: false,
    isDockOnTop: false
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
      settings: {
        jiraBase: 'http://jira.local/',
        jiraToken: 'tok',
        jiraDoneStatuses: 'Done',
        alwaysOnTop: false,
        clickAction: 'terminal',
        launchOnStartup: true,
        ticketPrefixes: 'SOF',
        isDockReserving: true,
        isDockOnTop: true
      }
    }
    saveState(file, next)
    expect(loadState(file)).toEqual(next)
    rmSync(dir, { recursive: true, force: true })
  })
})
