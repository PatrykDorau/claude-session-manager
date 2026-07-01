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
  type State
} from '../src/main/store'

const base: State = {
  watched: [],
  names: {},
  finished: [],
  finishOptOut: [],
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
