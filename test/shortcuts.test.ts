import { describe, it, expect } from 'vitest'
import { appShortcut } from '../src/renderer/src/dashboard/shortcuts'

const press = (key: string, mods: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean } = {}) => ({
  key,
  ctrlKey: !!mods.ctrl,
  shiftKey: !!mods.shift,
  altKey: !!mods.alt,
  metaKey: !!mods.meta
})

describe('appShortcut', () => {
  it('maps Ctrl+K to the prompt search', () => {
    expect(appShortcut(press('k', { ctrl: true }))).toBe('prompts')
    expect(appShortcut(press('K', { ctrl: true }))).toBe('prompts')
  })

  it('maps Ctrl+Shift+D to the dispatcher in either case', () => {
    expect(appShortcut(press('D', { ctrl: true, shift: true }))).toBe('dispatcher')
    expect(appShortcut(press('d', { ctrl: true, shift: true }))).toBe('dispatcher')
  })

  it('leaves Ctrl+D to the terminal', () => {
    expect(appShortcut(press('d', { ctrl: true }))).toBeNull()
  })

  it('ignores Ctrl+Shift+K and keys with Alt or Meta', () => {
    expect(appShortcut(press('K', { ctrl: true, shift: true }))).toBeNull()
    expect(appShortcut(press('k', { ctrl: true, alt: true }))).toBeNull()
    expect(appShortcut(press('D', { ctrl: true, shift: true, meta: true }))).toBeNull()
  })

  it('ignores keys without Ctrl', () => {
    expect(appShortcut(press('k'))).toBeNull()
    expect(appShortcut(press('D', { shift: true }))).toBeNull()
  })
})
