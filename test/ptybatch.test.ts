import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPtyBatcher } from '../src/main/ptybatch'

describe('createPtyBatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('joins chunks of one frame in order', () => {
    const send = vi.fn()
    const batcher = createPtyBatcher(send)
    batcher.push('a', 'a')
    batcher.push('a', 'b')
    expect(send).not.toHaveBeenCalled()
    vi.advanceTimersByTime(16)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('a', 'ab')
  })

  it('keeps terminals apart', () => {
    const send = vi.fn()
    const batcher = createPtyBatcher(send)
    batcher.push('a', 'x')
    batcher.push('b', 'y')
    vi.advanceTimersByTime(16)
    expect(send).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenCalledWith('a', 'x')
    expect(send).toHaveBeenCalledWith('b', 'y')
  })

  it('flush sends pending output at once and cancels the timer', () => {
    const send = vi.fn()
    const batcher = createPtyBatcher(send)
    batcher.push('a', 'x')
    batcher.flush('a')
    expect(send).toHaveBeenCalledWith('a', 'x')
    vi.advanceTimersByTime(16)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('flush on an id with nothing pending sends nothing', () => {
    const send = vi.fn()
    const batcher = createPtyBatcher(send)
    batcher.flush('a')
    expect(send).not.toHaveBeenCalled()
  })

  it('starts a new frame after a send', () => {
    const send = vi.fn()
    const batcher = createPtyBatcher(send)
    batcher.push('a', '1')
    vi.advanceTimersByTime(16)
    batcher.push('a', '2')
    vi.advanceTimersByTime(16)
    expect(send).toHaveBeenNthCalledWith(2, 'a', '2')
  })
})
