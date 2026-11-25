import { describe, it, expect, vi } from 'vitest'
import { createFileCache, isSameSessions } from '../src/main/filecache'

describe('createFileCache', () => {
  it('loads once for the same size and mtime', async () => {
    const cache = createFileCache<number>()
    const load = vi.fn(async () => 1)
    await cache.get('a', 10, 100, load)
    await cache.get('a', 10, 100, load)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('reloads when mtime changes', async () => {
    const cache = createFileCache<number>()
    const load = vi.fn(async () => 1)
    await cache.get('a', 10, 100, load)
    await cache.get('a', 10, 200, load)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('does not cache a failed load', async () => {
    const cache = createFileCache<number>()
    const load = vi.fn<() => Promise<number>>().mockRejectedValueOnce(new Error('x')).mockResolvedValue(1)
    await expect(cache.get('a', 10, 100, load)).rejects.toThrow('x')
    expect(await cache.get('a', 10, 100, load)).toBe(1)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('prune drops missing files', async () => {
    const cache = createFileCache<number>()
    const load = vi.fn(async () => 1)
    await cache.get('a', 10, 100, load)
    await cache.get('b', 10, 100, load)
    cache.prune(new Set(['a']))
    await cache.get('a', 10, 100, load)
    await cache.get('b', 10, 100, load)
    expect(load).toHaveBeenCalledTimes(3)
  })
})

describe('isSameSessions', () => {
  it('is true for equal lists and false when one status differs', () => {
    const a = [{ id: '1', status: 'working' }]
    expect(isSameSessions(a, [{ id: '1', status: 'working' }])).toBe(true)
    expect(isSameSessions(a, [{ id: '1', status: 'idle' }])).toBe(false)
  })
})
