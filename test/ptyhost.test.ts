import { describe, it, expect, vi } from 'vitest'

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => ({
    onData: vi.fn(),
    onExit: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn()
  }))
}))

import { createPtyHost } from '../src/main/ptyhost'

describe('ptyhost lastInputAt', () => {
  it('is set by write and cleared by close', () => {
    const host = createPtyHost(vi.fn())
    host.open('a', 'claude', [], '.', 80, 24)
    expect(host.lastInputAt('a')).toBeNull()
    host.write('a', 'x')
    expect(typeof host.lastInputAt('a')).toBe('number')
    host.close('a')
    expect(host.lastInputAt('a')).toBeNull()
  })

  it('write on an unopened id leaves lastInputAt null', () => {
    const host = createPtyHost(vi.fn())
    host.write('missing', 'x')
    expect(host.lastInputAt('missing')).toBeNull()
  })

  it('moves with rekey', () => {
    const host = createPtyHost(vi.fn())
    host.open('a', 'claude', [], '.', 80, 24)
    host.write('a', 'x')
    host.rekey('a', 'b')
    expect(host.lastInputAt('a')).toBeNull()
    expect(typeof host.lastInputAt('b')).toBe('number')
  })
})

describe('ptyhost lastUseAt', () => {
  it('is set by open, touch and resize, and cleared by close', () => {
    const host = createPtyHost(vi.fn())
    expect(host.lastUseAt('a')).toBeNull()
    host.open('a', 'claude', [], '.', 80, 24)
    expect(typeof host.lastUseAt('a')).toBe('number')
    host.close('a')
    expect(host.lastUseAt('a')).toBeNull()
  })

  it('touch on an unopened id leaves lastUseAt null', () => {
    const host = createPtyHost(vi.fn())
    host.touch('missing')
    expect(host.lastUseAt('missing')).toBeNull()
  })

  it('is refreshed by write, resize and touch but leaves lastInputAt to write', () => {
    const host = createPtyHost(vi.fn())
    const spy = vi.spyOn(Date, 'now')
    spy.mockReturnValue(100)
    host.open('a', 'claude', [], '.', 80, 24)
    spy.mockReturnValue(200)
    host.touch('a')
    expect(host.lastUseAt('a')).toBe(200)
    expect(host.lastInputAt('a')).toBeNull()
    spy.mockReturnValue(300)
    host.resize('a', 100, 30)
    expect(host.lastUseAt('a')).toBe(300)
    spy.mockReturnValue(400)
    host.write('a', 'x')
    expect(host.lastUseAt('a')).toBe(400)
    spy.mockRestore()
  })

  it('moves with rekey and lists open ids', () => {
    const host = createPtyHost(vi.fn())
    host.open('a', 'claude', [], '.', 80, 24)
    host.open('c', 'claude', [], '.', 80, 24)
    host.rekey('a', 'b')
    expect(host.lastUseAt('a')).toBeNull()
    expect(typeof host.lastUseAt('b')).toBe('number')
    expect(host.ids().sort()).toEqual(['b', 'c'])
  })
})
