import { readFileSync, writeFileSync } from 'node:fs'

export type ClickAction =
  | 'project-cmd'
  | 'default'
  | 'project'
  | 'terminal'
  | 'standalone'
  | 'focus'

export interface Settings {
  jiraBase: string
  jiraToken: string
  jiraDoneStatuses: string
  alwaysOnTop: boolean
  clickAction: ClickAction
  launchOnStartup: boolean
}

export interface State {
  watched: string[]
  names: Record<string, string>
  finished: string[]
  finishOptOut: string[]
  settings: Settings
}

const CLICK_ACTIONS: ClickAction[] = [
  'project-cmd',
  'default',
  'project',
  'terminal',
  'standalone',
  'focus'
]

const DEFAULT_SETTINGS: Settings = {
  jiraBase: 'https://jira.redge.com/browse/',
  jiraToken: '',
  jiraDoneStatuses: 'Accepted, Done, Closed',
  alwaysOnTop: true,
  clickAction: 'project-cmd',
  launchOnStartup: false
}

export function loadState(file: string): State {
  try {
    const o = JSON.parse(readFileSync(file, 'utf8'))
    const s = o.settings && typeof o.settings === 'object' ? o.settings : {}
    return {
      watched: Array.isArray(o.watched) ? o.watched : [],
      names: o.names && typeof o.names === 'object' ? o.names : {},
      finished: Array.isArray(o.finished) ? o.finished : [],
      finishOptOut: Array.isArray(o.finishOptOut) ? o.finishOptOut : [],
      settings: {
        jiraBase: typeof s.jiraBase === 'string' ? s.jiraBase : DEFAULT_SETTINGS.jiraBase,
        jiraToken: typeof s.jiraToken === 'string' ? s.jiraToken : DEFAULT_SETTINGS.jiraToken,
        jiraDoneStatuses:
          typeof s.jiraDoneStatuses === 'string'
            ? s.jiraDoneStatuses
            : DEFAULT_SETTINGS.jiraDoneStatuses,
        alwaysOnTop:
          typeof s.alwaysOnTop === 'boolean' ? s.alwaysOnTop : DEFAULT_SETTINGS.alwaysOnTop,
        clickAction: CLICK_ACTIONS.includes(s.clickAction)
          ? s.clickAction
          : DEFAULT_SETTINGS.clickAction,
        launchOnStartup:
          typeof s.launchOnStartup === 'boolean'
            ? s.launchOnStartup
            : DEFAULT_SETTINGS.launchOnStartup
      }
    }
  } catch {
    return { watched: [], names: {}, finished: [], finishOptOut: [], settings: { ...DEFAULT_SETTINGS } }
  }
}

export function saveState(file: string, state: State): void {
  try {
    writeFileSync(file, JSON.stringify(state, null, 2), 'utf8')
  } catch {
    return
  }
}

export function applyWatched(state: State, id: string, on: boolean): State {
  const set = new Set(state.watched)
  if (on) set.add(id)
  else set.delete(id)
  return { ...state, watched: [...set] }
}

export function applyName(state: State, id: string, name: string | null): State {
  const names = { ...state.names }
  const trimmed = name?.trim()
  if (trimmed) names[id] = trimmed
  else delete names[id]
  return { ...state, names }
}

export function applyFinished(state: State, id: string, on: boolean): State {
  const finished = new Set(state.finished)
  const optOut = new Set(state.finishOptOut)
  if (on) {
    finished.add(id)
    optOut.delete(id)
  } else {
    finished.delete(id)
    optOut.add(id)
  }
  return { ...state, finished: [...finished], finishOptOut: [...optOut] }
}
