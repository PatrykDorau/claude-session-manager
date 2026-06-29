import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadState, saveState, applyWatched, applyName, type State } from '../src/main/store'

const base: State = {
  watched: [],
  names: {},
  settings: {
    jiraBase: 'https://jira.redge.com/browse/',
    alwaysOnTop: true,
    clickAction: 'default',
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
})

describe('store io', () => {
  it('defaults settings when missing and round-trips', () => {
    const dir = mkdtempSync(join(tmpdir(), 'css-'))
    const file = join(dir, 'state.json')
    expect(loadState(file)).toEqual(base)
    const next: State = {
      watched: ['x'],
      names: { x: 'n' },
      settings: {
        jiraBase: 'http://jira.local/',
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
