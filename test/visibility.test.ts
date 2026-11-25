import { describe, it, expect, vi, afterEach } from 'vitest'
import { onVisible, whenVisible } from '../src/renderer/src/dashboard/visibility'

const stubDocument = (isHidden: boolean): { target: EventTarget & { hidden: boolean } } => {
  const target = Object.assign(new EventTarget(), { hidden: isHidden })
  vi.stubGlobal('document', target)
  return { target }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('whenVisible', () => {
  it('skips while hidden', () => {
    const run = vi.fn()
    whenVisible(run, () => true)()
    expect(run).not.toHaveBeenCalled()
  })
  it('runs while visible', () => {
    const run = vi.fn()
    whenVisible(run, () => false)()
    expect(run).toHaveBeenCalledTimes(1)
  })
})

describe('onVisible', () => {
  it('fires on becoming visible', () => {
    const { target } = stubDocument(true)
    const run = vi.fn()
    onVisible(run)
    target.dispatchEvent(new Event('visibilitychange'))
    expect(run).not.toHaveBeenCalled()
    target.hidden = false
    target.dispatchEvent(new Event('visibilitychange'))
    expect(run).toHaveBeenCalledTimes(1)
  })
  it('stops firing after unsubscribe', () => {
    const { target } = stubDocument(false)
    const run = vi.fn()
    const stop = onVisible(run)
    stop()
    target.dispatchEvent(new Event('visibilitychange'))
    expect(run).not.toHaveBeenCalled()
  })
})
