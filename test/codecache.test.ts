import { describe, it, expect } from 'vitest'
import {
  emptyFileCache,
  readFileCache,
  writeFileCache,
  dropFileCache,
  fileCacheIdentity,
  isFreshFile,
  type CachedFile
} from '../src/renderer/src/dashboard/codecache'

const file = (text: string, state: string | null = null): CachedFile<string> => ({
  text,
  baseText: `base of ${text}`,
  state
})

describe('fileCacheIdentity', () => {
  it('differs when any part of the diff base differs', () => {
    const identity = fileCacheIdentity(['C:/repo', 'abc', true])
    expect(identity).toBe(fileCacheIdentity(['C:/repo', 'abc', true]))
    expect(identity).not.toBe(fileCacheIdentity(['C:/repo', 'abd', true]))
    expect(fileCacheIdentity(['C:/repo', null])).not.toBe(fileCacheIdentity(['C:/repo', 'null']))
  })
})

describe('file cache', () => {
  it('returns what was written for the same identity', () => {
    const cache = writeFileCache(emptyFileCache<string>(), 'id1', 'a.ts', file('a', 'state-a'), 12)
    expect(readFileCache(cache, 'id1', 'a.ts')).toEqual(file('a', 'state-a'))
    expect(readFileCache(cache, 'id1', 'b.ts')).toBeNull()
  })

  it('misses when the identity changed', () => {
    const cache = writeFileCache(emptyFileCache<string>(), 'id1', 'a.ts', file('a'), 12)
    expect(readFileCache(cache, 'id2', 'a.ts')).toBeNull()
  })

  it('forgets the other files when written under a new identity', () => {
    const first = writeFileCache(emptyFileCache<string>(), 'id1', 'a.ts', file('a'), 12)
    const second = writeFileCache(first, 'id2', 'b.ts', file('b'), 12)
    expect(readFileCache(second, 'id1', 'a.ts')).toBeNull()
    expect(readFileCache(second, 'id2', 'a.ts')).toBeNull()
    expect(readFileCache(second, 'id2', 'b.ts')).toEqual(file('b'))
  })

  it('drops the least recently written file above the limit', () => {
    const one = writeFileCache(emptyFileCache<string>(), 'id', 'a.ts', file('a'), 2)
    const two = writeFileCache(one, 'id', 'b.ts', file('b'), 2)
    const again = writeFileCache(two, 'id', 'a.ts', file('a2'), 2)
    const three = writeFileCache(again, 'id', 'c.ts', file('c'), 2)
    expect(readFileCache(three, 'id', 'b.ts')).toBeNull()
    expect(readFileCache(three, 'id', 'a.ts')).toEqual(file('a2'))
    expect(readFileCache(three, 'id', 'c.ts')).toEqual(file('c'))
  })

  it('drops one file and leaves the rest', () => {
    const one = writeFileCache(emptyFileCache<string>(), 'id', 'a.ts', file('a'), 12)
    const two = writeFileCache(one, 'id', 'b.ts', file('b'), 12)
    const dropped = dropFileCache(two, 'a.ts')
    expect(readFileCache(dropped, 'id', 'a.ts')).toBeNull()
    expect(readFileCache(dropped, 'id', 'b.ts')).toEqual(file('b'))
    expect(readFileCache(two, 'id', 'a.ts')).toEqual(file('a'))
  })
})

describe('isFreshFile', () => {
  it('is true only when the text on disk still equals the cached text', () => {
    expect(isFreshFile(file('a'), 'a')).toBe(true)
    expect(isFreshFile(file('a'), 'a edited by Claude')).toBe(false)
    expect(isFreshFile(file('a'), null)).toBe(false)
    expect(isFreshFile(file('a'), undefined)).toBe(false)
  })
})
