import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadState, saveState, applyWatched, applyName } from '../src/main/store'

describe('store pure transforms', () => {
  it('applyWatched adds, is idempotent, and removes', () => {
    let s = { watched: [], names: {} }
    s = applyWatched(s, 'a', true)
    expect(s.watched).toEqual(['a'])
    s = applyWatched(s, 'a', true)
    expect(s.watched).toEqual(['a'])
    s = applyWatched(s, 'a', false)
    expect(s.watched).toEqual([])
  })
  it('applyName sets, trims, and clears on empty/null', () => {
    let s = { watched: [], names: {} }
    s = applyName(s, 'a', '  My session  ')
    expect(s.names['a']).toBe('My session')
    s = applyName(s, 'a', null)
    expect(s.names['a']).toBeUndefined()
    s = applyName(s, 'b', '   ')
    expect(s.names['b']).toBeUndefined()
  })
})

describe('store io', () => {
  it('round-trips and defaults when missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'css-'))
    const file = join(dir, 'state.json')
    expect(loadState(file)).toEqual({ watched: [], names: {} })
    saveState(file, { watched: ['x'], names: { x: 'n' } })
    expect(loadState(file)).toEqual({ watched: ['x'], names: { x: 'n' } })
    rmSync(dir, { recursive: true, force: true })
  })
})
