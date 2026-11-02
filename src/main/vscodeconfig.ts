import { basename, join } from 'node:path'
import { applyEdits, modify, parse, type FormattingOptions } from 'jsonc-parser'

export type LayoutStatus = 'configured' | 'missing' | 'conflict'

interface Binding {
  key: string
  command: string
  args?: unknown
  when?: string
}

const SETTINGS: Record<string, unknown> = {
  'terminal.integrated.enablePersistentSessions': false,
  'terminal.integrated.tabs.title': '${sequence}'
}
const LEGACY: Binding = { key: 'ctrl+alt+f9', command: 'workbench.action.createTerminalEditorSide' }

export const LAYOUT = {
  orientation: 0,
  groups: [
    { size: 0.5, groups: [{ size: 0.75 }, { size: 0.25 }] },
    { size: 0.5, groups: [{ size: 0.5 }, { size: 0.5 }] }
  ]
}

export const RESUME_FILE_NAME = 'switcher-resume.txt'

const RESUME_SCRIPT = `$f = Join-Path $env:USERPROFILE '.claude\\${RESUME_FILE_NAME}'; if (Test-Path $f) { $c = Get-Content -Raw $f; Remove-Item $f; Invoke-Expression $c }`

const RESUME_SHELL = {
  executable: 'powershell.exe',
  args: ['-NoLogo', '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', RESUME_SCRIPT]
}

const ACTIVE_GROUP = -1

const layoutBinding = (key: string, focusGroup: string, isResume: boolean): Binding => ({
  key,
  command: 'runCommands',
  args: {
    commands: [
      { command: 'vscode.setEditorLayout', args: LAYOUT },
      focusGroup,
      'workbench.action.unlockEditorGroup',
      {
        command: 'workbench.action.createTerminalEditor',
        args: isResume
          ? { location: { viewColumn: ACTIVE_GROUP }, config: RESUME_SHELL }
          : { location: { viewColumn: ACTIVE_GROUP } }
      },
      'workbench.action.lockEditorGroup',
      'workbench.action.terminal.focus'
    ]
  },
  when: 'terminalProcessSupported'
})

export const KEYBINDINGS: Binding[] = [
  layoutBinding('ctrl+alt+f9', 'workbench.action.focusThirdEditorGroup', true),
  layoutBinding('ctrl+alt+f10', 'workbench.action.focusFourthEditorGroup', true),
  layoutBinding('ctrl+alt+f8', 'workbench.action.focusSecondEditorGroup', false)
]

const OUR_KEYS = KEYBINDINGS.map((b) => b.key)

const sameBinding = (a: Binding, b: Binding): boolean =>
  a.key === b.key &&
  a.command === b.command &&
  JSON.stringify(a.args ?? null) === JSON.stringify(b.args ?? null) &&
  (a.when ?? null) === (b.when ?? null)

const isEarlierLayout = (b: Binding): boolean =>
  b.command === 'runCommands' && JSON.stringify(b.args ?? null).includes('"vscode.setEditorLayout"')

const isOurs = (b: Binding): boolean =>
  (b.key === LEGACY.key && b.command === LEGACY.command) ||
  isEarlierLayout(b) ||
  KEYBINDINGS.some((k) => sameBinding(b, k))

const toBindings = (text: string | null): Binding[] => {
  const list = text ? parse(text) : []
  return Array.isArray(list) ? list : []
}

const toSettings = (text: string | null): Record<string, unknown> => {
  const obj = text ? parse(text) : {}
  return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {}
}

const encodeSegment = (segment: string): string =>
  encodeURIComponent(segment).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)

const folderUri = (folder: string): string => {
  const [drive, ...rest] = folder.replace(/\\/g, '/').replace(/\/+$/, '').split('/')
  const segments = [encodeSegment(drive), ...rest.map(encodeSegment)]
  return `file:///${segments.join('/')}`.toLowerCase()
}

export function profileDirFor(folder: string, storageJson: string, userDir: string): string {
  let workspaces: Record<string, string> = {}
  try {
    workspaces = JSON.parse(storageJson)?.profileAssociations?.workspaces ?? {}
  } catch {
    return userDir
  }
  const uri = folderUri(folder)
  const match = Object.entries(workspaces).find(([k]) => k.toLowerCase() === uri)
  const id = match?.[1]
  return !id || id === '__default__profile__' ? userDir : join(userDir, 'profiles', id)
}

export function profileName(profileDir: string, storageJson: string, userDir: string): string {
  if (profileDir === userDir) return 'Default'
  const id = basename(profileDir)
  try {
    const profiles: { location: string; name: string }[] =
      JSON.parse(storageJson)?.userDataProfiles ?? []
    return profiles.find((p) => p.location === id)?.name ?? id
  } catch {
    return id
  }
}

export function layoutStatus(
  settingsText: string | null,
  keybindingsText: string | null
): LayoutStatus {
  const bindings = toBindings(keybindingsText).filter((b) => OUR_KEYS.includes(b?.key))
  if (bindings.some((b) => !isOurs(b))) return 'conflict'
  const current = toSettings(settingsText)
  const isSettingsApplied = Object.entries(SETTINGS).every(([k, v]) => current[k] === v)
  const isBound = KEYBINDINGS.every((k) => bindings.some((b) => sameBinding(b, k)))
  return isSettingsApplied && isBound ? 'configured' : 'missing'
}

const formattingOf = (text: string): FormattingOptions => {
  const indent = /^([ \t]+)\S/m.exec(text)?.[1]
  return indent?.startsWith('\t')
    ? { insertSpaces: false, tabSize: 1 }
    : { insertSpaces: true, tabSize: indent?.length ?? 2 }
}

const edit = (text: string, path: (string | number)[], value: unknown): string =>
  applyEdits(text, modify(text, path, value, { formattingOptions: formattingOf(text) }))

export function applyLayoutConfig(
  settingsText: string | null,
  keybindingsText: string | null
): { settings: string; keybindings: string } {
  let settings = settingsText ?? '{}'
  for (const [k, v] of Object.entries(SETTINGS))
    if (toSettings(settings)[k] !== v) settings = edit(settings, [k], v)
  let keybindings = keybindingsText ?? '[]'
  const list = toBindings(keybindings)
  const isBound =
    KEYBINDINGS.every((k) => list.some((b) => sameBinding(b, k))) &&
    list.filter((b) => OUR_KEYS.includes(b?.key)).length === KEYBINDINGS.length
  if (!isBound) {
    const stale = list.flatMap((b, i) => (OUR_KEYS.includes(b?.key) ? [i] : [])).reverse()
    for (const i of stale) keybindings = edit(keybindings, [i], undefined)
    for (const k of KEYBINDINGS) keybindings = edit(keybindings, [-1], k)
  }
  return { settings, keybindings }
}
