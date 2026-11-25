import { describe, it, expect, vi } from 'vitest'
import { createOnDemandWriter } from '../src/main/ondemandwrite'

const deferred = (): { promise: Promise<boolean>; resolve: (value: boolean) => void } => {
  let resolve: (value: boolean) => void = vi.fn()
  const capture = (r: (value: boolean) => void): void => {
    resolve = r
  }
  const promise = new Promise<boolean>(capture)
  return { promise, resolve }
}

const settle = (): Promise<void> => {
  const wait = (r: () => void): void => {
    setTimeout(r, 0)
  }
  return new Promise<void>(wait)
}
const isAlwaysOpen = (): boolean => true
const isNeverOpen = (): boolean => false

describe('createOnDemandWriter', () => {
  it('writes straight through when the pty is open', () => {
    const write = vi.fn()
    const open = vi.fn()
    const writeOnDemand = createOnDemandWriter({ isOpen: isAlwaysOpen, open, write }).write
    writeOnDemand('a', 'x')
    expect(write).toHaveBeenCalledWith('a', 'x')
    expect(open).not.toHaveBeenCalled()
  })

  it('opens once and writes queued data in order after the open', async () => {
    const write = vi.fn()
    const pending = deferred()
    const openPending = (): Promise<boolean> => pending.promise
    const open = vi.fn(openPending)
    const writeOnDemand = createOnDemandWriter({ isOpen: isNeverOpen, open, write }).write
    writeOnDemand('a', '/compact')
    writeOnDemand('a', '\r')
    expect(open).toHaveBeenCalledTimes(1)
    expect(write).not.toHaveBeenCalled()
    pending.resolve(true)
    await settle()
    expect(write.mock.calls).toEqual([
      ['a', '/compact'],
      ['a', '\r']
    ])
  })

  it('drops queued data when the open fails, and opens again on the next write', async () => {
    const write = vi.fn()
    const openFails = async (): Promise<boolean> => false
    const open = vi.fn(openFails)
    const writeOnDemand = createOnDemandWriter({ isOpen: isNeverOpen, open, write }).write
    writeOnDemand('a', 'x')
    await settle()
    expect(write).not.toHaveBeenCalled()
    writeOnDemand('a', 'y')
    expect(open).toHaveBeenCalledTimes(2)
  })

  it('keeps queues of different sessions apart', async () => {
    const write = vi.fn()
    const first = deferred()
    const second = deferred()
    const openById = (id: string): Promise<boolean> => (id === 'a' ? first.promise : second.promise)
    const open = vi.fn(openById)
    const writeOnDemand = createOnDemandWriter({ isOpen: isNeverOpen, open, write }).write
    writeOnDemand('a', '1')
    writeOnDemand('b', '2')
    second.resolve(true)
    await settle()
    expect(write.mock.calls).toEqual([['b', '2']])
    first.resolve(true)
    await settle()
    expect(write.mock.calls).toEqual([
      ['b', '2'],
      ['a', '1']
    ])
  })

  it('does not open again once the pty is open, and writes straight through', async () => {
    const write = vi.fn()
    let isPtyOpen = false
    const isOpen = (): boolean => isPtyOpen
    const openAndMark = async (): Promise<boolean> => {
      isPtyOpen = true
      return true
    }
    const open = vi.fn(openAndMark)
    const writer = createOnDemandWriter({ isOpen, open, write })
    writer.write('a', '1')
    await settle()
    writer.write('a', '2')
    expect(open).toHaveBeenCalledTimes(1)
    expect(write.mock.calls).toEqual([
      ['a', '1'],
      ['a', '2']
    ])
  })

  it('whenFlushed resolves only after the queued writes went out', async () => {
    const write = vi.fn()
    const pending = deferred()
    const openPending = (): Promise<boolean> => pending.promise
    const writer = createOnDemandWriter({ isOpen: isNeverOpen, open: openPending, write })
    writer.write('a', '/clear\r')
    const isFlushed = vi.fn()
    const markFlushed = (): void => isFlushed()
    const flushed = writer.whenFlushed('a').then(markFlushed)
    await settle()
    expect(isFlushed).not.toHaveBeenCalled()
    pending.resolve(true)
    await flushed
    expect(write).toHaveBeenCalledWith('a', '/clear\r')
    expect(isFlushed).toHaveBeenCalledTimes(1)
    await expect(writer.whenFlushed('b')).resolves.toBeUndefined()
  })
})
