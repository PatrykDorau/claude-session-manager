import { readFileSync, writeFileSync } from 'node:fs'
import type { JiraIssue } from './jira'

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
  ticketPrefixes: string
  isDockReserving: boolean
  isDockOnTop: boolean
}

export type DockEdge = 'left' | 'right'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface DockState {
  isDocked: boolean
  edge: DockEdge
  width: number
  displayId: number | null
  floating: Rect | null
}

export interface State {
  watched: string[]
  names: Record<string, string>
  finished: string[]
  finishOptOut: string[]
  ticketOverride: Record<string, string>
  jira: Record<string, JiraIssue>
  watchedTickets: string[]
  finishedTickets: string[]
  finishOptOutTickets: string[]
  dock: DockState
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
  launchOnStartup: false,
  ticketPrefixes: '',
  isDockReserving: false,
  isDockOnTop: false
}

const DEFAULT_DOCK: DockState = {
  isDocked: false,
  edge: 'right',
  width: 320,
  displayId: null,
  floating: null
}

const isRect = (r: any): r is Rect =>
  !!r && ['x', 'y', 'width', 'height'].every((k) => typeof r[k] === 'number')

const loadDock = (d: any): DockState => {
  if (!d || typeof d !== 'object') return { ...DEFAULT_DOCK }
  return {
    isDocked: typeof d.isDocked === 'boolean' ? d.isDocked : DEFAULT_DOCK.isDocked,
    edge: d.edge === 'left' || d.edge === 'right' ? d.edge : DEFAULT_DOCK.edge,
    width: typeof d.width === 'number' ? d.width : DEFAULT_DOCK.width,
    displayId: typeof d.displayId === 'number' ? d.displayId : null,
    floating: isRect(d.floating) ? d.floating : null
  }
}

const stringList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback)

export const DEFAULT_STATE = (): State => ({
  watched: [],
  names: {},
  finished: [],
  finishOptOut: [],
  ticketOverride: {},
  jira: {},
  watchedTickets: [],
  finishedTickets: [],
  finishOptOutTickets: [],
  dock: { ...DEFAULT_DOCK },
  settings: { ...DEFAULT_SETTINGS }
})

export function loadState(file: string): State {
  try {
    const o = JSON.parse(readFileSync(file, 'utf8'))
    const s = o.settings && typeof o.settings === 'object' ? o.settings : {}
    return {
      watched: Array.isArray(o.watched) ? o.watched : [],
      names: o.names && typeof o.names === 'object' ? o.names : {},
      finished: Array.isArray(o.finished) ? o.finished : [],
      finishOptOut: Array.isArray(o.finishOptOut) ? o.finishOptOut : [],
      ticketOverride:
        o.ticketOverride && typeof o.ticketOverride === 'object' ? o.ticketOverride : {},
      jira: o.jira && typeof o.jira === 'object' ? o.jira : {},
      watchedTickets: stringList(o.watchedTickets),
      finishedTickets: stringList(o.finishedTickets),
      finishOptOutTickets: stringList(o.finishOptOutTickets),
      dock: loadDock(o.dock),
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
            : DEFAULT_SETTINGS.launchOnStartup,
        ticketPrefixes:
          typeof s.ticketPrefixes === 'string' ? s.ticketPrefixes : DEFAULT_SETTINGS.ticketPrefixes,
        isDockReserving: bool(s.isDockReserving, DEFAULT_SETTINGS.isDockReserving),
        isDockOnTop: bool(s.isDockOnTop, DEFAULT_SETTINGS.isDockOnTop)
      }
    }
  } catch {
    return DEFAULT_STATE()
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

export function applyTicketOverride(state: State, id: string, value: string | null): State {
  const ticketOverride = { ...state.ticketOverride }
  if (value === null) delete ticketOverride[id]
  else ticketOverride[id] = value
  return { ...state, ticketOverride }
}

export function overrideTicket(auto: string | null, override: string | undefined): string | null {
  if (override === undefined) return auto
  if (override === '') return null
  return override
}

export function applyTicketWatched(state: State, ticket: string, on: boolean): State {
  const set = new Set(state.watchedTickets)
  if (on) set.add(ticket)
  else set.delete(ticket)
  return { ...state, watchedTickets: [...set] }
}

export function applyTicketFinished(state: State, ticket: string, on: boolean): State {
  const finished = new Set(state.finishedTickets)
  const optOut = new Set(state.finishOptOutTickets)
  if (on) {
    finished.add(ticket)
    optOut.delete(ticket)
  } else {
    finished.delete(ticket)
    optOut.add(ticket)
  }
  return { ...state, finishedTickets: [...finished], finishOptOutTickets: [...optOut] }
}
