import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { disposed } = vi.hoisted(() => ({ disposed: vi.fn() }))

vi.mock('@xterm/xterm', () => {
  class Terminal {
    cols = 80
    rows = 24
    element: HTMLElement | undefined = undefined
    loadAddon = vi.fn()
    onData = vi.fn()
    open = vi.fn()
    focus = vi.fn()
    write = vi.fn()
    dispose = disposed
  }
  return { Terminal }
})

vi.mock('@xterm/addon-fit', () => {
  class FitAddon {
    fit = vi.fn()
    proposeDimensions = vi.fn()
  }
  return { FitAddon }
})

vi.mock('../src/renderer/src/dashboard/termclipboard', () => ({ attachClipboard: vi.fn() }))

const closeTerminal = vi.fn()

const fakeElement = (): { className: string; remove: () => void } => ({
  className: '',
  remove: vi.fn()
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('document', { createElement: fakeElement })
  vi.stubGlobal('window', {
    api: {
      onPtyData: vi.fn(),
      onPtyRekey: vi.fn(),
      onPtyExit: vi.fn(),
      writeTerminal: vi.fn(),
      resizeTerminal: vi.fn(),
      closeTerminal
    }
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  disposed.mockClear()
  closeTerminal.mockClear()
})

describe('releaseTerminal', () => {
  it('keeps the terminal and its pty when it is acquired again in the same tick', async () => {
    const { acquireTerminal, releaseTerminal } =
      await import('../src/renderer/src/dashboard/terminalpool')
    const first = acquireTerminal('swap')
    first.isAttached = true
    releaseTerminal('swap')
    const second = acquireTerminal('swap')
    vi.runAllTimers()
    expect(second).toBe(first)
    expect(disposed).not.toHaveBeenCalled()
    expect(closeTerminal).not.toHaveBeenCalled()
    releaseTerminal('swap')
    vi.runAllTimers()
  })

  it('disposes the terminal and closes its pty once the last user is gone', async () => {
    const { acquireTerminal, releaseTerminal } =
      await import('../src/renderer/src/dashboard/terminalpool')
    const entry = acquireTerminal('gone')
    entry.isAttached = true
    releaseTerminal('gone')
    expect(disposed).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(disposed).toHaveBeenCalledTimes(1)
    expect(closeTerminal).toHaveBeenCalledWith('gone')
  })
})

describe('retainTerminal', () => {
  it('does nothing for a session without a pooled terminal', async () => {
    const { retainTerminal, releaseRetained } =
      await import('../src/renderer/src/dashboard/terminalpool')
    retainTerminal('none')
    releaseRetained('none')
    vi.runAllTimers()
    expect(disposed).not.toHaveBeenCalled()
    expect(closeTerminal).not.toHaveBeenCalled()
  })

  it('keeps the pty of a retained session after its last user is gone', async () => {
    const { acquireTerminal, releaseTerminal, retainTerminal, releaseRetained } =
      await import('../src/renderer/src/dashboard/terminalpool')
    const entry = acquireTerminal('hidden')
    entry.isAttached = true
    retainTerminal('hidden')
    releaseTerminal('hidden')
    vi.runAllTimers()
    expect(disposed).not.toHaveBeenCalled()
    expect(closeTerminal).not.toHaveBeenCalled()
    releaseRetained('hidden')
    vi.runAllTimers()
    expect(disposed).toHaveBeenCalledTimes(1)
    expect(closeTerminal).toHaveBeenCalledWith('hidden')
  })

  it('keeps a terminal opened after the retain', async () => {
    const { acquireTerminal, releaseTerminal, retainTerminal, releaseRetained } =
      await import('../src/renderer/src/dashboard/terminalpool')
    retainTerminal('later')
    const entry = acquireTerminal('later')
    entry.isAttached = true
    releaseTerminal('later')
    vi.runAllTimers()
    expect(closeTerminal).not.toHaveBeenCalled()
    releaseRetained('later')
    vi.runAllTimers()
    expect(closeTerminal).toHaveBeenCalledWith('later')
  })

  it('leaves a retained terminal that still has users to them', async () => {
    const { acquireTerminal, releaseTerminal, retainTerminal, releaseRetained } =
      await import('../src/renderer/src/dashboard/terminalpool')
    const entry = acquireTerminal('used')
    entry.isAttached = true
    retainTerminal('used')
    releaseRetained('used')
    vi.runAllTimers()
    expect(closeTerminal).not.toHaveBeenCalled()
    releaseTerminal('used')
    vi.runAllTimers()
    expect(closeTerminal).toHaveBeenCalledWith('used')
  })
})
