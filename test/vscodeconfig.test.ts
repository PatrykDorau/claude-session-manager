import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { parse } from 'jsonc-parser'
import { profileDirFor, profileName, layoutStatus, applyLayoutConfig, RESUME_FILE_NAME, LAYOUT } from '../src/main/vscodeconfig'

const storage = (workspaces: Record<string, string>): string =>
  JSON.stringify({ profileAssociations: { workspaces } })

describe('profileDirFor', () => {
  it('maps a folder to its profile directory', () => {
    const json = storage({ 'file:///c%3A/Users/A/Desktop/Projekty/redcdn-portal-fo': '3f07bd1' })
    expect(profileDirFor('C:\\Users\\A\\Desktop\\Projekty\\redcdn-portal-fo', json, 'U')).toBe(
      join('U', 'profiles', '3f07bd1')
    )
  })
  it('encodes special characters per segment', () => {
    const json = storage({ 'file:///c%3A/P/zwo%28KAN%2CfreeTV%29/krs': 'abc' })
    expect(profileDirFor('C:\\P\\zwo(KAN,freeTV)\\krs', json, 'U')).toBe(join('U', 'profiles', 'abc'))
  })
  it('uses the user dir for the default profile or an unknown folder', () => {
    const json = storage({ 'file:///c%3A/P/x': '__default__profile__' })
    expect(profileDirFor('C:\\P\\x', json, 'U')).toBe('U')
    expect(profileDirFor('C:\\P\\y', json, 'U')).toBe('U')
    expect(profileDirFor('C:\\P\\y', 'not json', 'U')).toBe('U')
  })
})

describe('layoutStatus', () => {
  it('is missing without files and configured after applying', () => {
    expect(layoutStatus(null, null)).toBe('missing')
    const out = applyLayoutConfig(null, null)
    expect(layoutStatus(out.settings, out.keybindings)).toBe('configured')
  })
  it('treats the old side-terminal entry as ours', () => {
    const kb = JSON.stringify([
      { key: 'ctrl+alt+f9', command: 'workbench.action.createTerminalEditorSide' }
    ])
    expect(layoutStatus(null, kb)).toBe('missing')
    const withWhen = JSON.stringify([
      { key: 'ctrl+alt+f9', command: 'workbench.action.createTerminalEditorSide', when: 'terminalProcessSupported' }
    ])
    expect(layoutStatus(null, withWhen)).toBe('missing')
  })
  it('treats an earlier version of our layout binding as ours', () => {
    const kb = JSON.stringify([
      {
        key: 'ctrl+alt+f9',
        command: 'runCommands',
        args: { commands: [{ command: 'vscode.setEditorLayout', args: {} }, 'x'] }
      }
    ])
    expect(layoutStatus(null, kb)).toBe('missing')
  })
  it('reports a conflict for a different user binding', () => {
    const kb = JSON.stringify([{ key: 'ctrl+alt+f9', command: 'editor.action.foo' }])
    expect(layoutStatus(null, kb)).toBe('conflict')
  })
})

describe('applyLayoutConfig', () => {
  it('keeps comments and entries and is idempotent', () => {
    const once = applyLayoutConfig('// c\n{ "a": 1, }', '[ // k\n ]')
    expect(once.settings).toContain('// c')
    expect(once.keybindings).toContain('// k')
    const settings = parse(once.settings)
    expect(settings.a).toBe(1)
    expect(settings['terminal.integrated.enablePersistentSessions']).toBe(false)
    expect(settings['terminal.integrated.tabs.title']).toBe('${sequence}')
    const keys = (parse(once.keybindings) as { key: string }[]).map((k) => k.key)
    expect(keys.sort()).toEqual(['ctrl+alt+f8', 'ctrl+alt+f9'])
    const twice = applyLayoutConfig(once.settings, once.keybindings)
    expect(twice).toEqual(once)
  })
  it('replaces the old side-terminal entry and keeps other bindings', () => {
    const kb = JSON.stringify([
      { key: 'ctrl+alt+f9', command: 'workbench.action.createTerminalEditorSide' },
      { key: 'ctrl+k', command: 'x' }
    ])
    const list = parse(applyLayoutConfig(null, kb).keybindings) as { key: string; command: string }[]
    expect(list.map((k) => k.key)).toEqual(['ctrl+k', 'ctrl+alt+f9', 'ctrl+alt+f8'])
    expect(list.every((k) => k.key === 'ctrl+k' || k.command === 'runCommands')).toBe(true)
  })
  it('focuses the target group, unlocks it, opens the terminal there and locks it again', () => {
    const list = parse(applyLayoutConfig(null, null).keybindings) as {
      key: string
      args: { commands: (string | { command: string; args?: { location?: { viewColumn: number } } })[] }
    }[]
    const steps = (key: string): (string | number | undefined)[] =>
      (list.find((k) => k.key === key)?.args.commands ?? []).map((c) =>
        typeof c === 'string' ? c : c.command === 'workbench.action.createTerminalEditor' ? c.args?.location?.viewColumn : c.command
      )
    const expected = (focus: string): (string | number)[] => [
      'vscode.setEditorLayout',
      focus,
      'workbench.action.unlockEditorGroup',
      -1,
      'workbench.action.lockEditorGroup',
      'workbench.action.terminal.focus'
    ]
    expect(steps('ctrl+alt+f9')).toEqual(expected('workbench.action.focusThirdEditorGroup'))
    expect(steps('ctrl+alt+f8')).toEqual(expected('workbench.action.focusSecondEditorGroup'))
  })
  it('keeps the right column as one group for the Claude terminals', () => {
    expect(LAYOUT.groups[1]).toEqual({ size: 0.5 })
    expect(LAYOUT.groups[0]).toEqual({ size: 0.5, groups: [{ size: 0.75 }, { size: 0.25 }] })
  })
  it('removes the old F10 binding that split the right column', () => {
    const old = applyLayoutConfig(null, null).keybindings
    const withF10 = JSON.stringify([
      ...(parse(old) as unknown[]),
      { key: 'ctrl+alt+f10', command: 'runCommands', args: { commands: [{ command: 'vscode.setEditorLayout', args: {} }] } }
    ])
    const settings = applyLayoutConfig(null, null).settings
    expect(layoutStatus(settings, withF10)).toBe('missing')
    const list = parse(applyLayoutConfig(settings, withF10).keybindings) as { key: string }[]
    expect(list.map((k) => k.key)).toEqual(['ctrl+alt+f9', 'ctrl+alt+f8'])
  })
  it('reports missing when only the old two-key setup is present', () => {
    const settings = JSON.stringify({ 'terminal.integrated.enablePersistentSessions': false })
    expect(layoutStatus(settings, applyLayoutConfig(null, null).keybindings)).toBe('missing')
  })
})

describe('profileName', () => {
  it('names the default profile and looks up custom ones', () => {
    const json = JSON.stringify({ userDataProfiles: [{ location: '3f07bd1', name: 'vsc1' }] })
    expect(profileName('U', json, 'U')).toBe('Default')
    expect(profileName(join('U', 'profiles', '3f07bd1'), json, 'U')).toBe('vsc1')
    expect(profileName(join('U', 'profiles', 'zzz'), json, 'U')).toBe('zzz')
  })
})

describe('resume terminal', () => {
  it('starts F9/F10 terminals with a shell that runs the pending resume file, F8 with the default shell', () => {
    const list = parse(applyLayoutConfig(null, null).keybindings) as {
      key: string
      args: { commands: (string | { command: string; args?: { config?: { executable: string; args: string[] } } })[] }
    }[]
    const config = (key: string): { executable: string; args: string[] } | undefined =>
      list
        .find((k) => k.key === key)
        ?.args.commands.flatMap((c) => (typeof c === 'string' ? [] : [c.args?.config]))
        .find((v) => v !== undefined)
    for (const key of ['ctrl+alt+f9']) {
      expect(config(key)?.executable).toBe('powershell.exe')
      expect(config(key)?.args.join(' ')).toContain(RESUME_FILE_NAME)
      expect(config(key)).not.toHaveProperty('name')
    }
    expect(config('ctrl+alt+f8')).toBeUndefined()
  })
})
