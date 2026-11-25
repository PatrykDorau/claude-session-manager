import { describe, it, expect } from 'vitest'
import { createStampedCache } from '../src/main/basecache'

const counter = (value: string): { compute: () => Promise<string>; calls: () => number } => {
  let count = 0
  const compute = async (): Promise<string> => {
    count += 1
    return `${value}${count}`
  }
  const calls = (): number => count
  return { compute, calls }
}

const stampOf = (stamp: string | null): (() => Promise<string | null>) => {
  const readStamp = async (): Promise<string | null> => stamp
  return readStamp
}

describe('createStampedCache', () => {
  it('computes once while the stamp stays the same within the TTL', async () => {
    let clock = 0
    const now = (): number => clock
    const cache = createStampedCache<string>(5000, now)
    const { compute, calls } = counter('base')
    expect(await cache.get('repo', stampOf('sha1'), compute)).toBe('base1')
    clock = 4999
    expect(await cache.get('repo', stampOf('sha1'), compute)).toBe('base1')
    expect(calls()).toBe(1)
  })

  it('recomputes when the stamp changes', async () => {
    const cache = createStampedCache<string>(5000, () => 0)
    const { compute, calls } = counter('base')
    await cache.get('repo', stampOf('sha1'), compute)
    expect(await cache.get('repo', stampOf('sha2'), compute)).toBe('base2')
    expect(calls()).toBe(2)
  })

  it('recomputes after the TTL', async () => {
    let clock = 0
    const now = (): number => clock
    const cache = createStampedCache<string>(5000, now)
    const { compute, calls } = counter('base')
    await cache.get('repo', stampOf('sha1'), compute)
    clock = 5000
    expect(await cache.get('repo', stampOf('sha1'), compute)).toBe('base2')
    expect(calls()).toBe(2)
  })

  it('never reuses a result when the stamp cannot be read', async () => {
    const cache = createStampedCache<string>(5000, () => 0)
    const { compute, calls } = counter('base')
    await cache.get('repo', stampOf(null), compute)
    await cache.get('repo', stampOf(null), compute)
    expect(calls()).toBe(2)
  })

  it('keeps a separate entry per key', async () => {
    const cache = createStampedCache<string>(5000, () => 0)
    const { compute, calls } = counter('base')
    await cache.get('a', stampOf('sha1'), compute)
    expect(await cache.get('b', stampOf('sha1'), compute)).toBe('base2')
    expect(await cache.get('a', stampOf('sha1'), compute)).toBe('base1')
    expect(calls()).toBe(2)
  })

  it('recomputes a dropped key', async () => {
    const cache = createStampedCache<string>(5000, () => 0)
    const { compute, calls } = counter('base')
    await cache.get('repo', stampOf('sha1'), compute)
    cache.drop('repo')
    await cache.get('repo', stampOf('sha1'), compute)
    expect(calls()).toBe(2)
  })
})
