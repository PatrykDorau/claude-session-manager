import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  loadState,
  saveState,
  applyWatched,
  applyName,
  applyFinished,
  applyTicketOverride,
  overrideTicket,
  type State
} from '../src/main/store'

const base: State = {
  watched: [],
  names: {},
  finished: [],
  finishOptOut: [],
  ticketOverride: {},
  settings: {
    jiraBase: 'https://jira.redge.com/browse/',
    jiraToken: '',
    jiraDoneStatuses: 'Accepted, Done, Closed',
    alwaysOnTop: true,
    clickAction: 'project-cmd',
    launchOnStartup: false
  }
}

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
      settings: {
        jiraBase: 'http://jira.local/',
        jiraToken: 'tok',
        jiraDoneStatuses: 'Done',
        alwaysOnTop: false,
        clickAction: 'terminal',
        launchOnStartup: true
      }
    }
    saveState(file, next)
    expect(loadState(file)).toEqual(next)
    rmSync(dir, { recursive: true, force: true })
  })
})
