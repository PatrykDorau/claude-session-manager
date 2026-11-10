import { readFileSync, writeFileSync } from 'node:fs'
import type { JiraIssue } from './jira'
import type { Placement } from './pane'
import type { RestoreState } from './restore'

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
  taskJql: string
  startPrompt: string
  quickActions: QuickAction[]
  gitlabBase: string
  gitlabToken: string
  mrProjects: string
  startView: StartView
  mrMention: string
}

export type StartView = 'ask' | 'sidebar' | 'dashboard'

const START_VIEWS: StartView[] = ['ask', 'sidebar', 'dashboard']

export interface QuickAction {
  label: string
  prompt: string
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
  pane: Record<string, Placement>
  restore: RestoreState
  repoByPrefix: Record<string, string>
  starred: string[]
  dashboardBounds: Rect | null
  reviewedMrs: Record<string, string>
  mrSessions: Record<string, string>
  serverCommands: Record<string, string>
  chromePorts: Record<string, number>
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

export const DEFAULT_QUICK_ACTIONS: QuickAction[] = [
  { label: 'Repro in browser', prompt: "Zrób repro w przeglądarce (browser-verify repro) dla tego zadania. Serwer uruchom przez node C:/Users/ASSET-17300/.claude/skills/_shared/cockpit.js server --ticket <klucz zadania>, przeglądarkę przez node C:/Users/ASSET-17300/.claude/skills/_shared/cockpit.js chrome --ticket <klucz zadania> --url <adres serwera>. Nie uruchamiaj Chrome samodzielnie. Logowanie i dojście do ekranu zostaw mnie: poczekaj na moje „gotowe”." },
  { label: 'Amend, push, draft notes', prompt: "To moja wyraźna prośba o commit i push: w worktree tej gałęzi zrób git commit --amend --no-edit z obecnymi zmianami i git push --force-with-lease. Potem przygotuj w MR draft notes (gitlab.js mr draft-note) z odpowiedziami na nierozwiązane wątki: najpierw pokaż mi listę odpowiedzi do potwierdzenia. Niczego nie publikuj." },
  { label: 'TL;DR of the plan', prompt: "Napisz krótkie TL;DR obecnego planu i co zostało do zrobienia." },
  { label: 'Write QA test cases', prompt: "Napisz test case'y dla testerów (browser-verify qa)." }
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
  isDockOnTop: false,
  taskJql: 'assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC',
  startPrompt: 'Przeczytaj zadanie {ticket} z Jiry ({title}) i zacznij od /superpowers:brainstorming',
  quickActions: DEFAULT_QUICK_ACTIONS,
  gitlabBase: 'https://drm-gitlab.redlabs.pl',
  gitlabToken: '',
  mrProjects: 'tigo-fo-web, tigo-fo-smarttv',
  startView: 'ask',
  mrMention: '@telco-frontend'
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

const isObject = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

const loadRestore = (r: unknown): RestoreState => ({
  snapshot: isObject(r) && Array.isArray(r.snapshot) ? r.snapshot : [],
  pendingRemoval: isObject(r) && isObject(r.pendingRemoval) ? r.pendingRemoval : {},
  lastScanAt: isObject(r) && typeof r.lastScanAt === 'number' ? r.lastScanAt : 0
})

const stringList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback)

const stringMap = (v: unknown): Record<string, string> =>
  isObject(v) ? Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => typeof e[1] === 'string')) : {}

const loadQuickActions = (v: unknown): QuickAction[] => {
  const actions = Array.isArray(v)
    ? v.filter((a): a is QuickAction => isObject(a) && typeof a.label === 'string' && typeof a.prompt === 'string')
    : []
  return actions.length && actions.length === (v as unknown[]).length ? actions.map(({ label, prompt }) => ({ label, prompt })) : DEFAULT_QUICK_ACTIONS
}

const MIN_VISIBLE = 100

const overlap = (aStart: number, aSize: number, bStart: number, bSize: number): number =>
  Math.min(aStart + aSize, bStart + bSize) - Math.max(aStart, bStart)

export const visibleBounds = (bounds: Rect | null, displays: Rect[]): Rect | null =>
  bounds &&
  displays.some(
    (d) => overlap(bounds.x, bounds.width, d.x, d.width) >= MIN_VISIBLE && overlap(bounds.y, bounds.height, d.y, d.height) >= MIN_VISIBLE
  )
    ? bounds
    : null

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
  pane: {},
  restore: loadRestore(null),
  repoByPrefix: {},
  starred: [],
  dashboardBounds: null,
  reviewedMrs: {},
  mrSessions: {},
  serverCommands: {},
  chromePorts: {},
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
      pane: isObject(o.pane) ? o.pane : {},
      restore: loadRestore(o.restore),
      repoByPrefix: isObject(o.repoByPrefix)
        ? Object.fromEntries(
            Object.entries(o.repoByPrefix).filter(
              (e): e is [string, string] => typeof e[1] === 'string'
            )
          )
        : {},
      starred: stringList(o.starred),
      dashboardBounds: isRect(o.dashboardBounds) ? o.dashboardBounds : null,
      reviewedMrs: stringMap(o.reviewedMrs),
      mrSessions: stringMap(o.mrSessions),
      serverCommands: stringMap(o.serverCommands),
      chromePorts: isObject(o.chromePorts)
        ? Object.fromEntries(Object.entries(o.chromePorts).filter((e): e is [string, number] => typeof e[1] === 'number'))
        : {},
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
        isDockOnTop: bool(s.isDockOnTop, DEFAULT_SETTINGS.isDockOnTop),
        taskJql: typeof s.taskJql === 'string' ? s.taskJql : DEFAULT_SETTINGS.taskJql,
        startPrompt:
          typeof s.startPrompt === 'string' ? s.startPrompt : DEFAULT_SETTINGS.startPrompt,
        quickActions: loadQuickActions(s.quickActions),
        gitlabBase: typeof s.gitlabBase === 'string' ? s.gitlabBase : DEFAULT_SETTINGS.gitlabBase,
        gitlabToken: typeof s.gitlabToken === 'string' ? s.gitlabToken : DEFAULT_SETTINGS.gitlabToken,
        mrProjects: typeof s.mrProjects === 'string' ? s.mrProjects : DEFAULT_SETTINGS.mrProjects,
        startView: START_VIEWS.includes(s.startView) ? s.startView : DEFAULT_SETTINGS.startView,
        mrMention: typeof s.mrMention === 'string' ? s.mrMention : DEFAULT_SETTINGS.mrMention
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
