import { describe, it, expect, vi } from 'vitest'
import { dirtyTargets, mergeDirty, isAttachedByCache } from '../src/main/dirty'

describe('dirtyTargets', () => {
  it('keeps only wanted folders', () => {
    const known: [string, string][] = [['a', 'C:\\a'], ['b', 'C:\\b']]
    expect(dirtyTargets(known, new Set(['b']), () => true)).toEqual([['b', 'C:\\b']])
  })

  it('drops folders that no longer exist', () => {
    const known: [string, string][] = [['a', 'C:\\a'], ['b', 'C:\\b']]
    expect(dirtyTargets(known, new Set(['a', 'b']), (path) => path === 'C:\\a')).toEqual([['a', 'C:\\a']])
  })
})

describe('mergeDirty', () => {
  it('keeps the last value for a folder not refreshed this round', () => {
    expect(mergeDirty({ a: true, b: false }, { b: true }, () => true)).toEqual({ a: true, b: true })
  })

  it('takes the new value for a refreshed folder', () => {
    expect(mergeDirty({ a: 1 }, { a: 5 }, () => true)).toEqual({ a: 5 })
  })

  it('removes the entry of a deleted folder', () => {
    expect(mergeDirty({ a: 1, b: 2 }, {}, (key) => key !== 'a')).toEqual({ b: 2 })
  })
})

describe('isAttachedByCache', () => {
  it('trusts a cache that says attached, without a query', async () => {
    const fetchFresh = vi.fn(async () => new Map<string, number>())
    const result = await isAttachedByCache(new Map([['abcd1234', 7]]), 'abcd1234', fetchFresh)
    expect(result.isAttached).toBe(true)
    expect(fetchFresh).not.toHaveBeenCalled()
  })

  it('queries once when the cache says not attached, and the fresh result wins', async () => {
    const fresh = new Map([['abcd1234', 9]])
    const fetchFresh = vi.fn(async () => fresh)
    const result = await isAttachedByCache(new Map(), 'abcd1234', fetchFresh)
    expect(fetchFresh).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ isAttached: true, attaches: fresh })
  })

  it('reports not attached when the fresh query agrees', async () => {
    const result = await isAttachedByCache(new Map(), 'abcd1234', async () => new Map())
    expect(result.isAttached).toBe(false)
  })
})
