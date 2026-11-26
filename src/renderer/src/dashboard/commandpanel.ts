import type { MrRow, Session, Status } from '../types'
import { isJobOver, jobId, type Job } from '../../../main/orchestrator'
import type { PickRow } from './orchestrator'
import { findAddressSession } from './mrs'
import { ICONS, type IconName } from './icons'
import type { ZoneKey } from './livezones'

export const PIN_KEY = 'orch.pinned'
const MAX_HOPS = 10

const RANK: Record<Status, number> = { waiting: 0, checkout: 0, working: 1, idle: 2, closed: 3 }

export const panelSessions = (sessions: Session[]): Session[] =>
  sessions.filter((s) => s.isLive).sort((a, b) => RANK[a.status] - RANK[b.status] || b.lastActive - a.lastActive)

export const RECENT_MS = 24 * 60 * 60 * 1000
const ACTIVE_STATUSES: Status[] = ['working', 'waiting', 'checkout']

export const isRecentSession = (session: Session, now: number): boolean =>
  ACTIVE_STATUSES.includes(session.status) || now - session.lastActive <= RECENT_MS

export const resolveSession = (id: string, sessions: Session[]): Session | null => {
  let current = sessions.find((s) => s.id === id)
  for (let hop = 0; current?.continuedAs && hop < MAX_HOPS; hop += 1) {
    const nextId = current.continuedAs
    current = sessions.find((s) => s.id === nextId)
  }
  return current ?? null
}

export const followPin = (id: string, sessions: Session[]): Session | null => {
  const found = resolveSession(id, sessions)
  return found?.isLive ? found : null
}

export type PanelViewKey = 'pinned' | 'live'

export type LayoutKey =
  | PanelViewKey
  | 'live-recent'
  | `zone.${ZoneKey}`
  | `zone-recent.${ZoneKey}`

export interface TileLayout {
  x: number
  y: number
  w: number
  h: number
}

export type ViewLayout = Record<string, TileLayout>

export const DEFAULT_TILE = { w: 1, h: 4 }

export const layoutKey = (view: LayoutKey): string => `orch.layout.${view}`

export const columnsKey = (view: PanelViewKey): string => `orch.columns.${view}`

export const parseLayout = (text: string): ViewLayout => {
  try {
    const parsed: unknown = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const layout: ViewLayout = {}
    for (const [key, value] of Object.entries(parsed)) {
      const raw = value as Record<string, unknown> | null
      if (!raw || typeof raw !== 'object') continue
      const { x, y, w, h } = raw
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(w) && Number.isFinite(h)) {
        layout[key] = { x, y, w, h } as TileLayout
      }
    }
    return layout
  } catch {
    return {}
  }
}

export const readLayout = (view: LayoutKey): ViewLayout => {
  try {
    return parseLayout(localStorage.getItem(layoutKey(view)) ?? '{}')
  } catch {
    return {}
  }
}

export const writeLayout = (view: LayoutKey, layout: ViewLayout): void => {
  try {
    localStorage.setItem(layoutKey(view), JSON.stringify(layout))
  } catch {
    return
  }
}

export const readColumns = (view: PanelViewKey): 1 | 2 | 3 => {
  try {
    const columns = Number(localStorage.getItem(columnsKey(view)))
    return columns === 1 || columns === 2 || columns === 3 ? columns : 3
  } catch {
    return 3
  }
}

export const writeColumns = (view: PanelViewKey, columns: 1 | 2 | 3): void => {
  try {
    localStorage.setItem(columnsKey(view), String(columns))
  } catch {
    return
  }
}

export const followLayout = (layout: ViewLayout, sessions: Session[]): ViewLayout => {
  const followTile = ([key, tile]: [string, TileLayout]): {
    finalId: string
    isOwn: boolean
    tile: TileLayout
  }[] => {
    if (key.startsWith('ticket:')) return [{ finalId: key, isOwn: true, tile }]
    const finalId = resolveSession(key, sessions)?.id
    return finalId ? [{ finalId, isOwn: finalId === key, tile }] : []
  }
  const followed = Object.entries(layout).flatMap(followTile)
  const result: ViewLayout = {}
  for (const { finalId, isOwn, tile } of followed) if (isOwn) result[finalId] = tile
  for (const { finalId, tile } of followed) if (!(finalId in result)) result[finalId] = tile
  return result
}

export const needsYou = (session: Session): boolean => session.status === 'waiting'

export const parsePins = (text: string): string[] => {
  try {
    const parsed: unknown = JSON.parse(text)
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : []
  } catch {
    return []
  }
}

export const readPins = (): string[] => {
  try {
    return parsePins(localStorage.getItem(PIN_KEY) ?? '[]')
  } catch {
    return []
  }
}

export const writePins = (pins: string[]): void => {
  try {
    localStorage.setItem(PIN_KEY, JSON.stringify(pins))
  } catch {
    return
  }
}

export const pinnedSessions = (pins: string[], sessions: Session[]): Session[] => {
  const found = pins.map((pin) => resolveSession(pin, sessions)).filter((s): s is Session => !!s)
  return found.filter((s, i) => found.findIndex((o) => o.id === s.id) === i)
}

export const resolvePins = (pins: string[], sessions: Session[]): string[] => {
  const resolved = pins.map((pin) => followPin(pin, sessions)?.id ?? pin)
  return resolved.filter((id, i) => resolved.indexOf(id) === i)
}

export const lastClosedSession = (ticket: string, sessions: Session[]): Session | null =>
  sessions.filter((s) => !s.isLive && s.ticket?.toUpperCase() === ticket.toUpperCase()).sort((a, b) => b.lastActive - a.lastActive)[0] ?? null

export const togglePin =(pins: string[], id: string): string[] => (pins.includes(id) ? pins.filter((p) => p !== id) : [...pins, id])

export const movePin = (pins: string[], fromId: string, toId: string): string[] => {
  const from = pins.indexOf(fromId)
  const to = pins.indexOf(toId)
  if (from < 0 || to < 0 || from === to) return pins
  const next = pins.filter((p) => p !== fromId)
  next.splice(to, 0, fromId)
  return next
}

export interface CellLook {
  color?: string
  icon?: IconName
  title?: string
}

export const IDENTITY_COLORS = [
  '#3dd68c',
  '#6aa9ff',
  '#a371f7',
  '#f778ba',
  '#f0b429',
  '#ff7b72',
  '#39c5cf',
  '#e8e8e8'
] as const

export const IDENTITY_ICONS: IconName[] = [
  'star',
  'square',
  'triangle',
  'diamond',
  'hexagon',
  'heart',
  'bolt',
  'leaf',
  'flame',
  'key',
  'anchor',
  'rocket'
]

export const IDENTITY_LETTERS: readonly string[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']

export interface Identity {
  icon: IconName
  color: string
  letter: string
}

export const IDENTITY_KEY = 'orch.identity'

const isIdentity = (value: unknown): value is Identity => {
  const raw = value as Record<string, unknown> | null
  return (
    !!raw &&
    typeof raw === 'object' &&
    typeof raw.color === 'string' &&
    typeof raw.icon === 'string' &&
    raw.icon in ICONS
  )
}

export const readIdentities = (): Record<string, Identity> => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(IDENTITY_KEY) ?? '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const isIdentityEntry = (entry: [string, unknown]): entry is [string, Identity] =>
      isIdentity(entry[1])
    const toIdentityEntry = ([key, value]: [string, Identity]): [string, Identity] => [
      key,
      {
        icon: value.icon,
        color: value.color,
        letter: typeof value.letter === 'string' ? value.letter : ''
      }
    ]
    return Object.fromEntries(Object.entries(parsed).filter(isIdentityEntry).map(toIdentityEntry))
  } catch {
    return {}
  }
}

export const writeIdentities = (map: Record<string, Identity>): void => {
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(map))
  } catch {
    return
  }
}

const leastUsed = <T extends string>(pool: readonly T[], used: T[]): T => {
  const countOf = (value: T): number => {
    const isSame = (u: T): boolean => u === value
    return used.filter(isSame).length
  }
  const pickLeast = (best: T, value: T): T => (countOf(value) < countOf(best) ? value : best)
  return pool.reduce(pickLeast)
}

export const assignIdentities = (
  map: Record<string, Identity>,
  sessions: Session[]
): Record<string, Identity> => {
  const followIdentity = ([key, identity]: [string, Identity]): {
    finalId: string
    isOwn: boolean
    identity: Identity
  }[] => {
    const finalId = resolveSession(key, sessions)?.id
    return finalId ? [{ finalId, isOwn: finalId === key, identity }] : []
  }
  const followed = Object.entries(map).flatMap(followIdentity)
  const result: Record<string, Identity> = {}
  for (const { finalId, isOwn, identity } of followed) if (isOwn) result[finalId] = identity
  for (const { finalId, identity } of followed) if (!(finalId in result)) result[finalId] = identity
  const isLiveId = (id: string): boolean => {
    const isLiveMatch = (s: Session): boolean => s.id === id && s.isLive
    return sessions.some(isLiveMatch)
  }
  const isLiveEntry = ([id]: [string, Identity]): boolean => isLiveId(id)
  const identityOfEntry = ([, identity]: [string, Identity]): Identity => identity
  const colorOf = (t: Identity): string => t.color
  const iconOf = (t: Identity): IconName => t.icon
  const letterOf = (t: Identity): string => t.letter
  const isLettered = (letter: string): boolean => letter !== ''
  const taken = Object.entries(result).filter(isLiveEntry).map(identityOfEntry)
  const takenLetters = taken.map(letterOf).filter(isLettered)
  for (const [id, identity] of Object.entries(result)) {
    if (identity.letter) continue
    const letter = leastUsed(IDENTITY_LETTERS, takenLetters)
    result[id] = { ...identity, letter }
    if (isLiveId(id)) takenLetters.push(letter)
  }
  for (const session of panelSessions(sessions)) {
    if (session.id in result) continue
    const identity = {
      color: leastUsed(IDENTITY_COLORS, taken.map(colorOf)),
      icon: leastUsed(IDENTITY_ICONS, taken.map(iconOf)),
      letter: leastUsed(IDENTITY_LETTERS, takenLetters)
    }
    result[session.id] = identity
    taken.push(identity)
    takenLetters.push(identity.letter)
  }
  const seenLetters: string[] = []
  for (const [id, identity] of Object.entries(result)) {
    if (!isLiveId(id)) continue
    if (seenLetters.includes(identity.letter)) {
      result[id] = { ...identity, letter: leastUsed(IDENTITY_LETTERS, seenLetters) }
    }
    seenLetters.push(result[id].letter)
  }
  return result
}

export const identityOf = (identity: Identity, look: CellLook): Identity => ({
  icon: look.icon ?? identity.icon,
  color: look.color ?? identity.color,
  letter: identity.letter
})

export const LOOK_KEY = 'orch.cellLooks'

export const cellKey = (session: Session): string => session.ticket?.toUpperCase() ?? session.id

export const parseCellLooks = (text: string): Record<string, CellLook> => {
  try {
    const parsed: unknown = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const looks: Record<string, CellLook> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (!value || typeof value !== 'object') continue
      const raw = value as Record<string, unknown>
      looks[key] = {
        ...(typeof raw.color === 'string' ? { color: raw.color } : {}),
        ...(typeof raw.icon === 'string' && raw.icon in ICONS
          ? { icon: raw.icon as IconName }
          : {}),
        ...(typeof raw.title === 'string' ? { title: raw.title } : {})
      }
    }
    return looks
  } catch {
    return {}
  }
}

export const readCellLooks = (): Record<string, CellLook> => {
  try {
    return parseCellLooks(localStorage.getItem(LOOK_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export const writeCellLooks = (looks: Record<string, CellLook>): void => {
  try {
    localStorage.setItem(LOOK_KEY, JSON.stringify(looks))
  } catch {
    return
  }
}

export const gridColumns =(count: number): number => (count <= 1 ? 1 : count <= 4 ? 2 : 3)

export const startableRows = (rows: PickRow[], jobs: Job[]): PickRow[] =>
  rows.filter((r) => !r.isLive && !jobs.some((j) => j.id === jobId(r.kind, r.key) && !isJobOver(j)))

export const isDoneStatus = (status: string | null | undefined, doneCsv: string): boolean =>
  !!status && doneCsv.split(',').some((s) => s.trim().toLowerCase() === status.trim().toLowerCase())

export const matchesQuery = (query: string, texts: (string | null | undefined)[]): boolean => {
  const haystack = texts.join(' ').toLowerCase()
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((word) => haystack.includes(word))
}

export const groupByStatus = <T>(rows: T[], statusOf: (row: T) => string | null | undefined): { status: string; rows: T[] }[] => {
  const groups = new Map<string, T[]>()
  const rest: T[] = []
  for (const row of rows) {
    const status = statusOf(row)
    if (!status) rest.push(row)
    else groups.set(status, [...(groups.get(status) ?? []), row])
  }
  const list = [...groups].map(([status, items]) => ({ status, rows: items }))
  return rest.length ? [...list, { status: 'Other', rows: rest }] : list
}

export const pinStarted =(pins: string[], awaiting: string[], jobs: Job[]): { pins: string[]; awaiting: string[] } => {
  const started = awaiting.flatMap((id) => jobs.find((j) => j.id === id && j.sessionId)?.sessionId ?? [])
  const isStillAwaiting = (id: string): boolean => {
    const found = jobs.find((j) => j.id === id)
    return !!found && !found.sessionId && !isJobOver(found)
  }
  return { pins: [...pins, ...started.filter((id) => !pins.includes(id))], awaiting: awaiting.filter(isStillAwaiting) }
}

export const mrOfSession =(session: Session, mrs: MrRow[]): MrRow | null =>
  mrs.find((m) => !!m.sessionId && (session.id === m.sessionId || session.id.startsWith(m.sessionId))) ?? null

export interface CrCandidate {
  mr: MrRow
  isChecked: boolean
  isRunning: boolean
  isMineLast: boolean
}

export const crCandidates = (
  mrs: MrRow[],
  myName: string | null,
  sessions: Session[]
): CrCandidate[] => {
  const isMyOpenThread = (m: MrRow): boolean =>
    m.author === myName && m.state === 'opened' && m.openThreads > 0
  const byWaiting = (a: MrRow, b: MrRow): number =>
    (b.waitingThreads ?? 0) - (a.waitingThreads ?? 0) || b.updatedAt.localeCompare(a.updatedAt)
  const toCandidate = (mr: MrRow): CrCandidate => {
    const session = findAddressSession(sessions, { ticket: mr.ticket, iid: mr.iid })
    const isRunning = !!session?.isLive
    const isMineLast = mr.waitingThreads === 0
    return { mr, isChecked: !isRunning && !isMineLast, isRunning, isMineLast }
  }
  return myName ? mrs.filter(isMyOpenThread).sort(byWaiting).map(toCandidate) : []
}

export type SectionKey = 'working' | 'needs-input' | 'turn-done' | 'new-cr' | 'idle'

export interface SeenMr {
  othersNotes: number | null
  sha: string
}

export const SEEN_KEY = 'orch.seen'
export const TICK_MS = 30_000

const parseSeen = (text: string): Record<string, SeenMr> => {
  try {
    const parsed: unknown = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const seen: Record<string, SeenMr> = {}
    for (const [key, value] of Object.entries(parsed)) {
      const raw = value as Record<string, unknown> | null
      const isNotesValid = typeof raw?.othersNotes === 'number' || raw?.othersNotes === null
      if (raw && isNotesValid && typeof raw.sha === 'string') {
        seen[key] = { othersNotes: raw.othersNotes as number | null, sha: raw.sha }
      }
    }
    return seen
  } catch {
    return {}
  }
}

export const readSeen = (): Record<string, SeenMr> => {
  try {
    return parseSeen(localStorage.getItem(SEEN_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export const writeSeen = (seen: Record<string, SeenMr>): void => {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen))
  } catch {
    return
  }
}

export const currentOthersNotes = (mr: MrRow): number | null => mr.othersNotes

const seenOfMr = (mr: MrRow): SeenMr => ({ othersNotes: currentOthersNotes(mr), sha: mr.sha })

const addedNotes = (mr: MrRow, known: SeenMr | undefined): number => {
  const current = currentOthersNotes(mr)
  const previous = known?.othersNotes ?? null
  return current === null || previous === null ? 0 : current - previous
}

export const newNotesCount = (mr: MrRow, seen: Record<string, SeenMr>): number =>
  Math.max(0, addedNotes(mr, seen[mr.key]))

export const isNewActivity = (
  mr: MrRow,
  seen: Record<string, SeenMr>,
  myName: string | null
): boolean => {
  const known = seen[mr.key]
  if (!known) return false
  return addedNotes(mr, known) > 0 || (mr.sha !== known.sha && mr.author !== myName)
}

export const baselineSeen = (
  mrs: MrRow[],
  seen: Record<string, SeenMr>
): Record<string, SeenMr> => {
  const isNotesArrived = (m: MrRow): boolean =>
    seen[m.key]?.othersNotes === null && currentOthersNotes(m) !== null
  const isOutdated = (m: MrRow): boolean => !seen[m.key] || isNotesArrived(m)
  const toEntry = (m: MrRow): [string, SeenMr] => [
    m.key,
    seen[m.key] ? { ...seen[m.key], othersNotes: currentOthersNotes(m) } : seenOfMr(m)
  ]
  const outdated = mrs.filter(isOutdated)
  return outdated.length ? { ...seen, ...Object.fromEntries(outdated.map(toEntry)) } : seen
}

export const markSeen = (mr: MrRow, seen: Record<string, SeenMr>): Record<string, SeenMr> => ({
  ...seen,
  [mr.key]: seenOfMr(mr)
})

export const sectionOf = (
  session: Session,
  mr: MrRow | null,
  seen: Record<string, SeenMr>,
  myName: string | null
): SectionKey => {
  if (session.status === 'working') return 'working'
  if (session.status === 'waiting') return 'needs-input'
  if (session.status === 'checkout') return 'turn-done'
  return mr && isNewActivity(mr, seen, myName) ? 'new-cr' : 'idle'
}

const SECTION_KEYS: SectionKey[] = ['working', 'needs-input', 'turn-done', 'new-cr', 'idle']

export type StageTone = 'working' | 'input' | 'done' | 'idle' | 'closed'

export interface Stage {
  label: string
  icon: IconName
  tone: StageTone
}

const STAGES: Record<Status, Stage> = {
  working: { label: 'Working', icon: 'refresh', tone: 'working' },
  waiting: { label: 'Needs input', icon: 'bell', tone: 'input' },
  checkout: { label: 'Check output', icon: 'check', tone: 'done' },
  idle: { label: 'Idle', icon: 'terminal', tone: 'idle' },
  closed: { label: 'Closed', icon: 'stop', tone: 'closed' }
}

export const stageOf = (session: Session | null): Stage =>
  session?.isLive ? STAGES[session.status] : STAGES.closed

export const matchSessions = (
  query: string,
  sessions: Session[],
  textOf: (s: Session) => string[]
): Session[] => {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  const lowerOf = (t: string): string => t.toLowerCase()
  const lowerTexts = (s: Session): string[] => textOf(s).map(lowerOf)
  const isContained = (t: string): boolean => t.includes(needle)
  const isSame = (t: string): boolean => t === needle
  const isMatch = (s: Session): boolean => lowerTexts(s).some(isContained)
  const isExact = (s: Session): boolean => lowerTexts(s).some(isSame)
  const isInexact = (s: Session): boolean => !isExact(s)
  const matched = sessions.filter(isMatch)
  return [...matched.filter(isExact), ...matched.filter(isInexact)]
}

export const groupSections = (
  sessions: Session[],
  mrOf: (s: Session) => MrRow | null,
  seen: Record<string, SeenMr>,
  myName: string | null
): { key: SectionKey; sessions: Session[] }[] => {
  const place = (s: Session): { s: Session; key: SectionKey } => ({
    s,
    key: sectionOf(s, mrOf(s), seen, myName)
  })
  const placed = panelSessions(sessions).map(place)
  const sessionOfPlaced = (p: { s: Session }): Session => p.s
  const toSection = (key: SectionKey): { key: SectionKey; sessions: Session[] } => {
    const isInSection = (p: { key: SectionKey }): boolean => p.key === key
    return { key, sessions: placed.filter(isInSection).map(sessionOfPlaced) }
  }
  return SECTION_KEYS.map(toSection)
}

export const trackWorkingSince = (
  previous: Record<string, number>,
  sessions: Session[],
  now: number
): Record<string, number> => {
  const isWorking = (s: Session): boolean => s.status === 'working'
  const sinceOf = (s: Session): [string, number] => [s.id, previous[s.id] ?? now]
  return Object.fromEntries(sessions.filter(isWorking).map(sinceOf))
}

export const orderBySince = (sessions: Session[], since: Record<string, number>): Session[] => {
  const sinceOf = (s: Session): number => since[s.id] ?? Number.POSITIVE_INFINITY
  const bySince = (a: Session, b: Session): number => sinceOf(a) - sinceOf(b) || a.id.localeCompare(b.id)
  return [...sessions].sort(bySince)
}

export const trackWaitingSince = (
  previous: Record<string, number>,
  sessions: Session[],
  now: number
): Record<string, number> => {
  const isWaiting = (s: Session): boolean => s.status === 'waiting'
  const sinceOf = (s: Session): [string, number] => [s.id, previous[s.id] ?? now]
  return Object.fromEntries(sessions.filter(isWaiting).map(sinceOf))
}

export const pruneAcknowledged = (
  acknowledged: Set<string>,
  waitingSince: Record<string, number>
): Set<string> => {
  const isStillWaiting = (id: string): boolean => id in waitingSince
  return new Set([...acknowledged].filter(isStillWaiting))
}

export const formatWait = (ms: number): string => {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return '<1 min'
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

export type PanelShortcut = 'focus' | 'full-screen' | 'search' | null

const PANEL_KEYS: Record<string, PanelShortcut> = { e: 'focus', f: 'full-screen' }

export const panelShortcut = (e: {
  key: string
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  metaKey: boolean
}): PanelShortcut => {
  if (!e.ctrlKey || e.altKey || e.metaKey) return null
  if (!e.shiftKey) return e.key.toLowerCase() === 'f' ? 'search' : null
  return PANEL_KEYS[e.key.toLowerCase()] ?? null
}
