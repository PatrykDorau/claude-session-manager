<script setup lang="ts">
import {
  ref,
  computed,
  watch,
  nextTick,
  onMounted,
  onBeforeUnmount,
  onActivated,
  onDeactivated,
  type ComponentPublicInstance
} from 'vue'
import type { JiraTicket, MrRow, Session } from '../types'
import { LOG_LIMIT, jobId, type Autonomy, type AutonomyChoice, type Job, type OrchestratorState } from '../../../main/orchestrator'
import { activityFeed, activityTone, attentionCount, autonomyOfChoice, choiceOf, choiceOfAutonomy, mrPickRows, repoChoices, stateLabel, ticketPickRows, type PickRow } from './orchestrator'
import {
  cellKey,
  TICK_MS,
  assignIdentities,
  baselineSeen,
  clearLayouts,
  crCandidates,
  followLayout,
  groupSections,
  identityOf,
  isNewActivity,
  isRecentSession,
  markSeen,
  newNotesCount,
  panelShortcut,
  parsePins,
  pruneAcknowledged,
  readCellLooks,
  readColumns,
  readIdentities,
  readLayout,
  readSeen,
  resolveSession,
  trackWaitingSince,
  trackWorkingSince,
  orderBySince,
  writeCellLooks,
  writeColumns,
  writeIdentities,
  writeLayout,
  writeSeen,
  type CellLook,
  type Identity,
  type LayoutKey,
  type PanelViewKey,
  type SectionKey,
  type SeenMr
} from './commandpanel'
import { groupByStatus, isDoneStatus, lastClosedSession, matchesQuery,mrOfSession, needsYou, panelSessions, pinStarted, pinnedSessions, readPins, resolvePins, startableRows, togglePin, writePins } from './commandpanel'
import {
  ZONE_KEYS,
  groupByTicket,
  holdZones,
  isTurnUnseen,
  markSeen as markTurnSeen,
  pickTab,
  pruneSeen,
  readSeenAt,
  trackTurnEndedAt,
  writeSeenAt,
  zoneOf,
  zoneOfGroup,
  type LiveGroup,
  type ZoneKey
} from './livezones'
import { splitTag } from '../taskview'
import { reviewLabel } from './mrs'
import { readFlag, writeSize } from './dashboard'
import { releaseRetained, retainTerminal } from './terminalpool'
import PriorityIcon from './PriorityIcon.vue'
import StartJobsDialog from './StartJobsDialog.vue'
import ReplyToCrDialog from './ReplyToCrDialog.vue'
import PanelGrid from './PanelGrid.vue'
import FocusOverlay from './FocusOverlay.vue'
import AutonomyMenu from './AutonomyMenu.vue'
import Icon from './Icon.vue'
import TaskTile from './TaskTile.vue'
import SessionSearch from './SessionSearch.vue'
import type { IconName } from './icons'

const props = defineProps<{ tickets: JiraTicket[]; mrs: MrRow[]; myName: string | null; sessions: Session[] }>()
const emit = defineEmits<{
  open: [job: Job]
  'open-task': [session: Session]
  'full-screen': [isOn: boolean]
  dispatcher: []
  'open-mr': [key: string]
}>()

const jobs = ref<Job[]>([])
const isDialogOpen = ref(false)

const pins = ref<string[]>(readPins())
const savePins = (next: string[]): void => {
  pins.value = next
  writePins(next)
}

const isReplyOpen = ref(false)
const countCrs = (): number => crCandidates(props.mrs, props.myName, props.sessions).length
const crCount = computed(countCrs)
const pinReplies = (ids: string[]): void => {
  const isUnpinned = (id: string): boolean => !pins.value.includes(id)
  const fresh = ids.filter(isUnpinned)
  if (fresh.length) savePins([...pins.value, ...fresh])
}
const openReplyMr = (key: string): void => {
  isReplyOpen.value = false
  emit('open-mr', key)
}

const syncPins = (): void => {
  const stored = readPins()
  const next = resolvePins(stored, props.sessions)
  if (next.join() !== stored.join()) savePins(next)
  else if (stored.join() !== pins.value.join()) pins.value = stored
}
watch(() => props.sessions, syncPins, { immediate: true })
onActivated(syncPins)

const live = computed(() => panelSessions(props.sessions))
const grid = computed(() => pinnedSessions(pins.value, props.sessions))
const gridIds = computed(() => new Set(grid.value.map((s) => s.id)))
const COLUMN_CHOICES = [3, 2, 1] as const
const columns = ref<Record<PanelViewKey, 1 | 2 | 3>>({ pinned: readColumns('pinned'), live: readColumns('live') })
const setColumns = (count: 1 | 2 | 3): void => {
  if (view.value === 'activity') return
  columns.value = { ...columns.value, [view.value]: count }
  writeColumns(view.value, count)
}
const layoutEpoch = ref(0)
const resetLayout = async (): Promise<void> => {
  if (view.value === 'activity') return
  const target = view.value
  setColumns(3)
  await nextTick()
  clearLayouts(target)
  layoutEpoch.value += 1
}
let isLayoutFollowed = false
const followLayouts = (): void => {
  if (isLayoutFollowed || !props.sessions.length) return
  isLayoutFollowed = true
  writeLayout('pinned', followLayout(readLayout('pinned'), props.sessions))
  writeLayout('live', followLayout(readLayout('live'), props.sessions))
  writeLayout('live-recent', followLayout(readLayout('live-recent'), props.sessions))
}
const sessionsOf = (): Session[] => props.sessions
watch(sessionsOf, followLayouts, { immediate: true })
const waitingCount = computed(() => live.value.filter(needsAttention).length)
const loose = computed(() => jobs.value.filter((j) => !j.sessionId || !live.value.some((s) => s.id === j.sessionId)))

const jobOf = (s: Session): Job | null => jobs.value.find((j) => j.sessionId === s.id) ?? null
const ticketOf = (s: Session): JiraTicket | null => (s.ticket ? (props.tickets.find((t) => t.key === s.ticket?.toUpperCase()) ?? null) : null)
const reviewOf = (s: Session): MrRow | null => mrOfSession(s, props.mrs)
const mrForTicket = (key: string | undefined): MrRow | null => {
  const list = key ? props.mrs.filter((m) => m.ticket === key) : []
  return list.find((m) => m.author === props.myName) ?? list[0] ?? null
}
const mrOf = (s: Session): MrRow | null => reviewOf(s) ?? mrForTicket(s.ticket?.toUpperCase())
const titleOf = (s: Session): string => reviewOf(s)?.title ?? ticketOf(s)?.summary ?? jobOf(s)?.title ?? s.name ?? s.firstPrompt ?? ''
const labelOf = (s: Session): string => {
  const review = reviewOf(s)
  return review ? `!${review.iid}` : (s.ticket ?? s.name ?? s.id.slice(0, 8))
}
const jiraStatusOf = (s: Session): string | null => ticketOf(s)?.status ?? s.jiraStatus ?? null

const seen = ref<Record<string, SeenMr>>(readSeen())
const saveSeen = (next: Record<string, SeenMr>): void => {
  seen.value = next
  writeSeen(next)
}
const syncSeen = (): void => {
  const next = baselineSeen(props.mrs, seen.value)
  if (next !== seen.value) saveSeen(next)
}
const mrsOf = (): MrRow[] => props.mrs
watch(mrsOf, syncSeen, { immediate: true })
const markSessionSeen = (s: Session): void => {
  const mr = mrOf(s)
  if (mr) saveSeen(markSeen(mr, seen.value))
}
const isNewCr = (s: Session): boolean => {
  const mr = mrOf(s)
  return !!mr && isNewActivity(mr, seen.value, props.myName)
}

const SECTION_META: Record<SectionKey, { label: string; icon: IconName }> = {
  working: { label: 'Working now', icon: 'refresh' },
  'needs-input': { label: 'Needs your input', icon: 'bell' },
  'turn-done': { label: 'Turn finished — check output', icon: 'check' },
  'new-cr': { label: 'New CR or MR changes', icon: 'message' },
  idle: { label: 'Idle', icon: 'terminal' }
}
const COLLAPSED_KEY = 'orch.sections.collapsed'
const readCollapsedSections = (): Set<string> => {
  try {
    return new Set(parsePins(localStorage.getItem(COLLAPSED_KEY) ?? '[]'))
  } catch {
    return new Set()
  }
}
const collapsedSections = ref<Set<string>>(readCollapsedSections())
const toggleSection = (key: SectionKey): void => {
  const next = new Set(collapsedSections.value)
  if (!next.delete(key)) next.add(key)
  collapsedSections.value = next
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]))
  } catch {
    return
  }
}
const isFilledGroup = (g: { sessions: Session[] }): boolean => g.sessions.length > 0
const steadyOrder = (g: { key: SectionKey; sessions: Session[] }): { key: SectionKey; sessions: Session[] } => {
  if (g.key === 'working') return { ...g, sessions: orderBySince(g.sessions, workingSince.value) }
  if (g.key === 'needs-input') return { ...g, sessions: orderBySince(g.sessions, waitingSince.value) }
  return g
}
const groupLive = (): { key: SectionKey; sessions: Session[] }[] =>
  groupSections(live.value, mrOf, seen.value, props.myName).filter(isFilledGroup).map(steadyOrder)
const sections = computed(groupLive)
const newNotesOf = (sessions: Session[]): number => {
  const addNotes = (sum: number, s: Session): number => {
    const mr = mrOf(s)
    return sum + (mr ? newNotesCount(mr, seen.value) : 0)
  }
  return sessions.reduce(addNotes, 0)
}

const now = ref(Date.now())
const workingSince = ref<Record<string, number>>({})
const waitingSince = ref<Record<string, number>>({})
const acknowledged = ref<Set<string>>(new Set())
const turnEndedAt = ref<Record<string, number>>({})
const seenAt = ref<Record<string, number>>(readSeenAt())
const engagedId = ref<string | null>(null)
const activeId = ref<string | null>(null)
const commitSeenAt = (next: Record<string, number>): void => {
  if (JSON.stringify(next) === JSON.stringify(seenAt.value)) return
  seenAt.value = next
  writeSeenAt(next)
}
const isUnseenTurn = (s: Session): boolean => isTurnUnseen(s, turnEndedAt.value, seenAt.value)
const needsAttention = (s: Session): boolean => needsYou(s) || isUnseenTurn(s)
const markTurnSeenOf = (s: Session): void => {
  if (isUnseenTurn(s)) commitSeenAt(markTurnSeen(seenAt.value, s.id, Date.now()))
}
const markWatchedTurnsSeen = (previous: Record<string, number>): void => {
  const isNewWatchedTurn = (id: string): boolean =>
    !Object.hasOwn(previous, id) && (id === engagedId.value || id === activeId.value)
  const markWatched = (next: Record<string, number>, id: string): Record<string, number> =>
    markTurnSeen(next, id, Date.now())
  commitSeenAt(Object.keys(turnEndedAt.value).filter(isNewWatchedTurn).reduce(markWatched, seenAt.value))
}
const refreshWorking = (): void => {
  now.value = Date.now()
  workingSince.value = trackWorkingSince(workingSince.value, props.sessions, now.value)
  waitingSince.value = trackWaitingSince(waitingSince.value, props.sessions, now.value)
  acknowledged.value = pruneAcknowledged(acknowledged.value, waitingSince.value)
  const previousTurnEndedAt = turnEndedAt.value
  turnEndedAt.value = trackTurnEndedAt(previousTurnEndedAt, props.sessions)
  markWatchedTurnsSeen(previousTurnEndedAt)
  if (props.sessions.length) commitSeenAt(pruneSeen(seenAt.value, live.value))
}
const waitingSinceOf = (s: Session): number | null => waitingSince.value[s.id] ?? null
const isAcknowledged = (s: Session): boolean => acknowledged.value.has(s.id)
const acknowledge = (s: Session): void => {
  engagedId.value = s.id
  markTurnSeenOf(s)
  if (!acknowledged.value.has(s.id)) acknowledged.value = new Set([...acknowledged.value, s.id])
}
const leave = (s: Session): void => {
  if (engagedId.value === s.id && activeId.value !== s.id) engagedId.value = null
}
watch(sessionsOf, refreshWorking, { immediate: true })
const elapsedOf = (s: Session): string => {
  const minutes = Math.floor((now.value - (workingSince.value[s.id] ?? now.value)) / 60_000)
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}
let tickTimer: ReturnType<typeof setInterval> | null = null
const startTick = (): void => {
  tickTimer = setInterval(refreshWorking, TICK_MS)
}
const stopTick = (): void => {
  if (tickTimer) clearInterval(tickTimer)
}
onMounted(startTick)
onBeforeUnmount(stopTick)

const pin = (s: Session): void => {
  markSessionSeen(s)
  savePins(togglePin(pins.value, s.id))
}
const unpin = (id: string): void => {
  const isSameId = (s: Session): boolean => s.id === id
  const s = props.sessions.find(isSameId)
  if (!window.confirm(`Unpin ${s ? labelOf(s) : 'this session'} from the grid?`)) return
  savePins(pins.value.filter((p) => p !== id))
}
const looks = ref<Record<string, CellLook>>(readCellLooks())
const lookOf = (s: Session): CellLook => looks.value[cellKey(s)] ?? {}
const NEUTRAL_IDENTITY: Identity = { icon: 'circle', color: '#e8e8e8', letter: '' }
const identities = ref<Record<string, Identity>>(readIdentities())
const syncIdentities = (): void => {
  if (!props.sessions.length) return
  const next = assignIdentities(identities.value, props.sessions)
  if (JSON.stringify(next) === JSON.stringify(identities.value)) return
  identities.value = next
  writeIdentities(next)
}
watch(sessionsOf, syncIdentities, { immediate: true })
const identityFor = (s: Session): Identity =>
  identityOf(identities.value[s.id] ?? NEUTRAL_IDENTITY, lookOf(s))
const isPinnedSession = (s: Session): boolean => gridIds.value.has(s.id)
const isAutoResumed = (s: Session): boolean => resumeIds.value.has(s.id)
const setLook = (s: Session, look: CellLook): void => {
  const next = { ...looks.value }
  if (look.color || look.icon || look.title)
    next[cellKey(s)] = JSON.parse(JSON.stringify(look)) as CellLook
  else delete next[cellKey(s)]
  looks.value = next
  writeCellLooks(next)
}
const openTask = (s: Session): void => {
  markSessionSeen(s)
  const job = jobOf(s)
  if (job) emit('open', job)
  else emit('open-task', s)
}
const notice = ref<string | null>(null)
const setAutonomy = async (s: Session, autonomy: AutonomyChoice): Promise<void> => {
  notice.value = (await window.api.setSessionAutonomy(s.id, autonomy)).error
}
const remove = (job: Job): void => {
  void window.api.removeJob(job.id)
}
const stop = (s: Session): void => {
  if (window.confirm(`Stop the session ${labelOf(s)}?`)) void window.api.closeSession(s.id)
}
const sleepNow = async (s: Session): Promise<void> => {
  if (!window.confirm(`Put the session ${labelOf(s)} to sleep? The Claude process stops and the session stays on the list.`)) return
  notice.value = (await window.api.sleepSession(s.id)).error
}

const { roots, repoFor } = repoChoices(window.api.getTaskRepos())
const liveTickets = computed(() => new Set(live.value.flatMap((s) => (s.ticket ? [s.ticket.toUpperCase()] : []))))
const liveMrs = computed(() => new Set(props.mrs.filter((m) => live.value.some((s) => mrOfSession(s, [m]))).map((m) => m.key)))
const ticketRows = computed(() =>
  startableRows(ticketPickRows(props.tickets.map((t) => ({ key: t.key, summary: t.summary, type: t.type ?? null })), repoFor, liveTickets.value), jobs.value)
)
const mrRows = computed(() => startableRows(mrPickRows(props.mrs, props.myName, liveMrs.value), jobs.value))
const view = ref<'pinned' | 'live' | 'activity'>('pinned')
const activityJob = ref<string | null>(null)
const feed = computed(() => activityFeed(jobs.value, activityJob.value))
const askCount = computed(() => attentionCount(jobs.value))
const formatTime = (at: number): string => new Date(at).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
const openJobById = (id: string): void => {
  const job = jobs.value.find((j) => j.id === id)
  if (job) emit('open', job)
}
const isNotStartedOpen = ref(false)
const query = ref('')
const doneCsv = window.api.getSettings().jiraDoneStatuses
const shownTicketRows = computed(() =>
  ticketRows.value.filter((r) => !isDoneStatus(ticketRowOf(r)?.status, doneCsv) && matchesQuery(query.value, [r.key, r.title, ticketRowOf(r)?.status]))
)
const ticketGroups = computed(() => groupByStatus(shownTicketRows.value, (r) => ticketRowOf(r)?.status))
const shownMrRows = computed(() =>
  mrRows.value.filter((r) => matchesQuery(query.value, [r.key, r.title, mrRowOf(r)?.projectName, mrRowOf(r)?.author, `!${mrRowOf(r)?.iid}`]))
)
const collapsedGroups = ref<Set<string>>(new Set())
const toggleGroup = (status: string): void => {
  const next = new Set(collapsedGroups.value)
  if (!next.delete(status)) next.add(status)
  collapsedGroups.value = next
}
const repoPicks = ref<Record<string, string>>({})
const autonomyPicks = ref<Record<string, Autonomy>>({})
const repoOf = (r: PickRow): string | null => repoPicks.value[r.key] ?? r.repo
const autonomyOf = (r: PickRow): Autonomy => autonomyPicks.value[r.key] ?? r.autonomy
const ticketRowOf = (r: PickRow): JiraTicket | null => props.tickets.find((t) => t.key === r.key) ?? null
const mrRowOf = (r: PickRow): MrRow | null => props.mrs.find((m) => m.key === r.key) ?? null
const pickAutonomy = (r: PickRow, autonomy: Autonomy): void => {
  autonomyPicks.value = { ...autonomyPicks.value, [r.key]: autonomy }
}

const awaiting = ref<string[]>([])
const pinAwaiting = (): void => {
  const next = pinStarted(pins.value, awaiting.value, jobs.value)
  awaiting.value = next.awaiting
  if (next.pins.length !== pins.value.length) savePins(next.pins)
}
const startRow = async (r: PickRow): Promise<void> => {
  const repo = r.kind === 'ticket' ? repoOf(r) : null
  const result = await window.api.startJobs([{ kind: r.kind, key: r.key, title: r.title, repo, autonomy: autonomyOf(r) }])
  notice.value = result.error
  if (result.error || r.kind === 'watch') return
  awaiting.value = [...awaiting.value, jobId(r.kind, r.key)]
  pinAwaiting()
}

const resumeIds = ref<Set<string>>(new Set())
const resumableOf = (r: PickRow): Session | null => lastClosedSession(r.key, props.sessions)
const resumeRow = (s: Session): void => {
  resumeIds.value = new Set([...resumeIds.value, s.id])
  if (!pins.value.includes(s.id)) savePins([...pins.value, s.id])
  view.value = 'pinned'
}

const applyState = (state: OrchestratorState): void => {
  jobs.value = state.jobs
  pinAwaiting()
}
let stopListening: (() => void) | null = null
const load = async (): Promise<void> => {
  stopListening = window.api.onOrchestrator(applyState)
  applyState(await window.api.getOrchestrator())
}
const unload = (): void => stopListening?.()
onMounted(load)
onBeforeUnmount(unload)

const placeholderId = ref<string | null>(null)
const focusOverlay = ref<InstanceType<typeof FocusOverlay> | null>(null)
const isActiveSession = (s: Session): boolean => s.id === activeId.value
const findActive = (): Session | null => props.sessions.find(isActiveSession) ?? null
const activeSession = computed(findActive)
const tilesInView = (): Session[] =>
  view.value === 'pinned' ? grid.value : view.value === 'live' ? liveTiles.value : []
const viewSessions = computed(tilesInView)
const openFocus = async (s: Session): Promise<void> => {
  if (activeId.value) return
  activeId.value = s.id
  await nextTick()
  placeholderId.value = s.id
  await nextTick()
  focusOverlay.value?.refit()
}
const closeFocus = async (): Promise<void> => {
  placeholderId.value = null
  await nextTick()
  if (engagedId.value === activeId.value) engagedId.value = null
  activeId.value = null
}
const dropGoneFocus = (): void => {
  if (!activeId.value || activeSession.value) return
  placeholderId.value = null
  if (engagedId.value === activeId.value) engagedId.value = null
  activeId.value = null
}
watch(activeSession, dropGoneFocus)
const followFocus = (): void => {
  const finalId = activeId.value ? resolveSession(activeId.value, props.sessions)?.id : undefined
  if (!finalId || finalId === activeId.value) return
  activeId.value = finalId
  if (placeholderId.value) placeholderId.value = finalId
}
watch(sessionsOf, followFocus)
const focusedTile = (): Session | null => {
  const id = document.activeElement?.closest('[gs-id]')?.getAttribute('gs-id')
  const isFocusedTile = (s: Session): boolean => s.id === id || tileIdOf(s) === id
  return viewSessions.value.find(isFocusedTile) ?? viewSessions.value[0] ?? null
}
const toggleFocus = (): void => {
  if (activeId.value) {
    void closeFocus()
    return
  }
  const tile = focusedTile()
  if (tile) void openFocus(tile)
}

const isFullScreen = ref(false)
const setFullScreen = (isOn: boolean): void => {
  if (isFullScreen.value === isOn) return
  isFullScreen.value = isOn
  window.api.setFullScreen(isOn)
  emit('full-screen', isOn)
}
const toggleFullScreen = (): void => setFullScreen(!isFullScreen.value)

const SIDE_COLLAPSED_KEY = 'orch.sideCollapsed'
const LIVE_RECENT_KEY = 'orch.liveRecent'
const isSideCollapsed = ref(readFlag(SIDE_COLLAPSED_KEY))
const refitGrids = async (): Promise<void> => {
  await nextTick()
  pinnedGrid.value?.refit()
  const refitZone = (zoneGrid: InstanceType<typeof PanelGrid>): void => zoneGrid.refit()
  zoneGrids.forEach(refitZone)
}
const toggleSide = (): void => {
  isSideCollapsed.value = !isSideCollapsed.value
  writeSize(SIDE_COLLAPSED_KEY, isSideCollapsed.value)
  void refitGrids()
}
const isLiveRecent = ref(readFlag(LIVE_RECENT_KEY))
const setLiveRecent = (isOn: boolean): void => {
  isLiveRecent.value = isOn
  writeSize(LIVE_RECENT_KEY, isOn)
}
const isRecentNow = (s: Session): boolean => isRecentSession(s, now.value)
const filterLive = (): Session[] => (isLiveRecent.value ? live.value.filter(isRecentNow) : live.value)
const liveShown = computed(filterLive)

const ZONE_META: Record<ZoneKey, { label: string; icon: IconName }> = {
  'needs-me': { label: 'Needs me', icon: 'bell' },
  working: { label: 'Working', icon: 'play' },
  seen: { label: 'Seen', icon: 'check' },
  idle: { label: 'Idle', icon: 'moon' }
}
const zoneLayoutOf = (key: ZoneKey): LayoutKey => (isLiveRecent.value ? `zone-recent.${key}` : `zone.${key}`)
const zoneOfSession = (s: Session): ZoneKey => zoneOf(s, isUnseenTurn(s), isNewCr(s))
const groupLiveShown = (): LiveGroup[] => groupByTicket(liveShown.value)
const liveGroups = computed(groupLiveShown)
const indexGroups = (): Map<string, LiveGroup> => {
  const entriesOf = (g: LiveGroup): [string, LiveGroup][] => {
    const entryOf = (s: Session): [string, LiveGroup] => [s.id, g]
    return g.sessions.map(entryOf)
  }
  return new Map(liveGroups.value.flatMap(entriesOf))
}
const groupBySession = computed(indexGroups)
const tileIdOf = (s: Session): string => groupBySession.value.get(s.id)?.id ?? s.id
const tabsOf = (s: Session): Session[] => groupBySession.value.get(s.id)?.sessions ?? [s]

const LIVE_TABS_KEY = 'orch.liveTabs'
const readLiveTabs = (): Record<string, string> => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LIVE_TABS_KEY) ?? '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const isStringEntry = (entry: [string, unknown]): entry is [string, string] => typeof entry[1] === 'string'
    return Object.fromEntries(Object.entries(parsed).filter(isStringEntry))
  } catch {
    return {}
  }
}
const selectedTabs = ref<Record<string, string>>(readLiveTabs())
const focusSelectedTab = async (s: Session): Promise<void> => {
  await nextTick()
  const group = groupBySession.value.get(s.id)
  const isFocused = !!group && !!zoneGrids.get(shownZoneOf(group))?.focusTile(group.id)
  if (!isFocused && engagedId.value === s.id && activeId.value !== s.id) engagedId.value = null
}
const selectTab = (s: Session): void => {
  const groupIdOf = (g: LiveGroup): string => g.id
  const liveGroupIds = new Set(groupByTicket(live.value).map(groupIdOf))
  const isLiveGroupEntry = ([groupId]: [string, string]): boolean => liveGroupIds.has(groupId)
  const kept = Object.fromEntries(Object.entries(selectedTabs.value).filter(isLiveGroupEntry))
  selectedTabs.value = { ...kept, [tileIdOf(s)]: s.id }
  engagedId.value = s.id
  markTurnSeenOf(s)
  void focusSelectedTab(s)
  try {
    localStorage.setItem(LIVE_TABS_KEY, JSON.stringify(selectedTabs.value))
  } catch {
    return
  }
}
const selectedOf = (g: LiveGroup): Session => {
  const engagedInGroup = engagedId.value && groupBySession.value.get(engagedId.value) === g ? engagedId.value : undefined
  return pickTab(g, selectedTabs.value[g.id] ?? engagedInGroup, zoneOfSession)
}

const zoneOfLiveGroup = (g: LiveGroup): ZoneKey => zoneOfGroup(g.sessions.map(zoneOfSession))
const freshZones = (): Record<string, ZoneKey> => {
  const entryOf = (g: LiveGroup): [string, ZoneKey] => [g.id, zoneOfLiveGroup(g)]
  return Object.fromEntries(liveGroups.value.map(entryOf))
}
const liveZonesNow = computed(freshZones)
const heldGroupId = (): string | null =>
  engagedId.value ? (groupBySession.value.get(engagedId.value)?.id ?? null) : null
const groupZones = ref<Record<string, ZoneKey>>({})
const updateGroupZones = (): void => {
  const next = holdZones(groupZones.value, liveZonesNow.value, heldGroupId())
  if (JSON.stringify(next) !== JSON.stringify(groupZones.value)) groupZones.value = next
}
watch([liveZonesNow, heldGroupId], updateGroupZones, { immediate: true, flush: 'pre' })
const shownZoneOf = (g: LiveGroup): ZoneKey => groupZones.value[g.id] ?? zoneOfLiveGroup(g)

const ZONES_COLLAPSED_KEY = 'orch.zones.collapsed'
const isZoneKey = (key: string): key is ZoneKey => (ZONE_KEYS as string[]).includes(key)
const readCollapsedZones = (): Set<ZoneKey> => {
  try {
    const stored = localStorage.getItem(ZONES_COLLAPSED_KEY)
    return new Set(stored === null ? ['idle'] : parsePins(stored).filter(isZoneKey))
  } catch {
    return new Set(['idle'])
  }
}
const collapsedZones = ref<Set<ZoneKey>>(readCollapsedZones())
const toggleZone = (key: ZoneKey): void => {
  const next = new Set(collapsedZones.value)
  if (!next.delete(key)) next.add(key)
  collapsedZones.value = next
  try {
    localStorage.setItem(ZONES_COLLAPSED_KEY, JSON.stringify([...next]))
  } catch {
    return
  }
}
const groupZonesForView = (): { key: ZoneKey; tiles: Session[]; count: number }[] => {
  const zoneEntryOf = (key: ZoneKey): { key: ZoneKey; tiles: Session[]; count: number } => {
    const isInZone = (g: LiveGroup): boolean => shownZoneOf(g) === key
    const groups = liveGroups.value.filter(isInZone)
    const addSessions = (sum: number, g: LiveGroup): number => sum + g.sessions.length
    return { key, tiles: groups.map(selectedOf), count: groups.reduce(addSessions, 0) }
  }
  const isFilledZone = (z: { tiles: Session[] }): boolean => z.tiles.length > 0
  return ZONE_KEYS.map(zoneEntryOf).filter(isFilledZone)
}
const liveZones = computed(groupZonesForView)
const listLiveTiles = (): Session[] => {
  const isExpanded = (z: { key: ZoneKey }): boolean => !collapsedZones.value.has(z.key)
  const tilesOfZone = (z: { tiles: Session[] }): Session[] => z.tiles
  return liveZones.value.filter(isExpanded).flatMap(tilesOfZone)
}
const liveTiles = computed(listLiveTiles)
const zoneGrids = new Map<ZoneKey, InstanceType<typeof PanelGrid>>()
const bindZoneGrid = (key: ZoneKey): ((el: Element | ComponentPublicInstance | null) => void) => {
  const setZoneGrid = (el: Element | ComponentPublicInstance | null): void => {
    if (el) zoneGrids.set(key, el as unknown as InstanceType<typeof PanelGrid>)
    else zoneGrids.delete(key)
  }
  return setZoneGrid
}

const hiddenLiveIds = (): string[] => {
  const idOf = (s: Session): string => s.id
  const shownIds = new Set(liveTiles.value.map(idOf))
  const isHidden = (s: Session): boolean => !shownIds.has(s.id)
  return live.value.filter(isHidden).map(idOf)
}
let retainedIds: string[] = []
const syncRetained = (next: string[]): void => {
  const isGone = (id: string): boolean => !next.includes(id)
  retainedIds.filter(isGone).forEach(releaseRetained)
  next.forEach(retainTerminal)
  retainedIds = next
}
watch(hiddenLiveIds, syncRetained, { immediate: true, flush: 'pre' })
const releaseAllRetained = (): void => syncRetained([])
onBeforeUnmount(releaseAllRetained)

const isSearchOpen = ref(false)
const sideEl = ref<HTMLElement | null>(null)
const pinnedGrid = ref<InstanceType<typeof PanelGrid> | null>(null)
const searchTextOf = (s: Session): string[] => [
  s.ticket ?? '',
  titleOf(s),
  lookOf(s).title ?? '',
  s.name ?? '',
  identityFor(s).letter
]
const isSearchBlocked = (): boolean => isDialogOpen.value || isReplyOpen.value || !!activeId.value
const closeSearch = (): void => {
  isSearchOpen.value = false
}
const toggleSearch = (): void => {
  isSearchOpen.value = !isSearchOpen.value && !isSearchBlocked()
}
const expandSectionOf = (id: string): void => {
  const isPicked = (s: Session): boolean => s.id === id
  const hasSession = (g: { sessions: Session[] }): boolean => g.sessions.some(isPicked)
  const key = sections.value.find(hasSession)?.key
  if (key && collapsedSections.value.has(key)) toggleSection(key)
}
const revealSession = (id: string): void => {
  const row = sideEl.value?.querySelector(`[data-session-id="${CSS.escape(id)}"]`)
  row?.scrollIntoView({ block: 'nearest' })
  const group = groupBySession.value.get(id)
  const isFocused =
    view.value === 'pinned'
      ? !!pinnedGrid.value?.reveal(id)
      : !!group && !!zoneGrids.get(shownZoneOf(group))?.reveal(group.id)
  if (isFocused) engagedId.value = id
}
const prepareLiveReveal = async (id: string): Promise<void> => {
  const isPicked = (s: Session): boolean => s.id === id
  if (!liveShown.value.some(isPicked)) setLiveRecent(false)
  const picked = liveShown.value.find(isPicked)
  if (picked) selectTab(picked)
  await nextTick()
  const group = groupBySession.value.get(id)
  const zone = group ? shownZoneOf(group) : null
  if (zone && collapsedZones.value.has(zone)) toggleZone(zone)
  await nextTick()
}
const pickSearch = async (id: string): Promise<void> => {
  closeSearch()
  view.value = gridIds.value.has(id) ? 'pinned' : 'live'
  expandSectionOf(id)
  if (view.value === 'live') await prepareLiveReveal(id)
  else await nextTick()
  const revealPicked = (): void => revealSession(id)
  requestAnimationFrame(revealPicked)
}
const pickSide = async (s: Session, e: MouseEvent): Promise<void> => {
  const isControlClick =
    e.target instanceof Element &&
    !!e.target.closest('.scrim, .menu, [role="menu"], button, select, input, a, label, textarea')
  if (view.value !== 'live' || isControlClick) return
  await prepareLiveReveal(s.id)
  const revealPicked = (): void => revealSession(s.id)
  requestAnimationFrame(revealPicked)
}

const panelEl = ref<HTMLElement | null>(null)
const APP_OVERLAYS = '[role="dialog"], .psbox, .drawer, .modal'
const isFocusOutsidePanel = (): boolean => {
  const focused = document.activeElement
  if (!(focused instanceof HTMLElement) || panelEl.value?.contains(focused)) return false
  const isEditable = focused.matches('input, textarea, select') || focused.isContentEditable
  return isEditable || !!focused.closest(APP_OVERLAYS)
}
const onPanelKey = (e: KeyboardEvent): void => {
  const shortcut = panelShortcut(e)
  if (!shortcut || view.value === 'activity' || isFocusOutsidePanel()) return
  if (shortcut === 'search' ? !isSearchOpen.value && isSearchBlocked() : isSearchOpen.value) return
  e.preventDefault()
  e.stopPropagation()
  if (e.repeat) return
  if (shortcut === 'search') toggleSearch()
  else if (shortcut === 'focus') toggleFocus()
  else toggleFullScreen()
}
const listenPanelKeys = (): void =>
  window.addEventListener('keydown', onPanelKey, { capture: true })
const leavePanel = (): void => {
  window.removeEventListener('keydown', onPanelKey, { capture: true })
  closeSearch()
  setFullScreen(false)
}
onMounted(listenPanelKeys)
onActivated(listenPanelKeys)
onDeactivated(leavePanel)
onBeforeUnmount(leavePanel)
</script>

<template>
  <main ref="panelEl" class="panel">
    <header v-if="!isFullScreen" class="head">
      <button
        class="head-btn ghost icon"
        :title="isSideCollapsed ? 'Show the task list' : 'Hide the task list'"
        @click="toggleSide"
      >
        <Icon :name="isSideCollapsed ? 'panelLeft' : 'panelClose'" :size="14" />
      </button>
      <h2>Command panel</h2>
      <span class="tabs">
        <button :class="{ on: view === 'pinned' }" @click="view = 'pinned'">Pinned<span class="count">{{ grid.length }}</span></button>
        <button :class="{ on: view === 'live' }" @click="view = 'live'">Live<span class="count">{{ liveShown.length }}</span></button>
        <button :class="{ on: view === 'activity' }" @click="view = 'activity'">Activity<span class="count">{{ askCount }}</span></button>
      </span>
      <span v-if="view !== 'activity'" class="tabs" title="Columns">
        <button
          v-for="n in COLUMN_CHOICES"
          :key="n"
          :class="{ on: columns[view] === n }"
          :title="`${n} ${n === 1 ? 'column' : 'columns'}`"
          @click="setColumns(n)"
        >
          {{ n }}
        </button>
      </span>
      <button
        v-if="view !== 'activity'"
        class="head-btn ghost"
        title="Lay the tiles out again: 3 columns, 2 rows per screen"
        @click="resetLayout"
      >
        Reset layout
      </button>
      <button
        v-if="view === 'live'"
        class="head-btn ghost"
        :class="{ on: isLiveRecent }"
        title="Show only sessions active in the last 24 hours"
        @click="setLiveRecent(!isLiveRecent)"
      >
        24 h
      </button>
      <button class="head-btn ghost" title="Full screen (Ctrl+Shift+F)" @click="toggleFullScreen">
        Full screen
      </button>
      <span v-if="waitingCount" class="stat warn">{{ waitingCount }} need you</span>
      <span class="grow" />
      <button v-if="crCount" class="head-btn cr" @click="isReplyOpen = true">
        <Icon name="message" :size="13" />Reply to CR<span class="badge">{{ crCount }}</span>
      </button>
      <button class="head-btn ghost" title="Start the dispatcher session or open it (Ctrl+Shift+D)" @click="emit('dispatcher')">
        <Icon name="message" :size="13" />Dispatcher
      </button>
      <button class="head-btn primary" @click="isDialogOpen = true"><Icon name="plus" :size="13" />Start jobs…</button>
    </header>
    <div class="body">
      <aside v-if="!isFullScreen && !isSideCollapsed" ref="sideEl" class="side">
        <p v-if="notice" class="note warn">{{ notice }}</p>
        <p v-if="!live.length" class="note">No live sessions.</p>
        <template v-for="g in sections" :key="g.key">
          <h3 class="section" :class="g.key" @click="toggleSection(g.key)">
            <span class="fold-mark">{{ collapsedSections.has(g.key) ? '▸' : '▾' }}</span>
            <span v-if="g.key === 'working'" class="pulse" />
            <Icon :name="SECTION_META[g.key].icon" :size="12" />
            {{ SECTION_META[g.key].label }}
            <span class="count">{{ g.sessions.length }}</span>
            <span v-if="g.key === 'new-cr' && newNotesOf(g.sessions)" class="count"
              >+{{ newNotesOf(g.sessions) }} notes</span
            >
          </h3>
          <template v-if="!collapsedSections.has(g.key)">
            <TaskTile
              v-for="s in g.sessions"
              :key="s.id"
              :data-session-id="s.id"
              class="ident"
              :class="[`in-${g.key}`, { asks: needsYou(s), pinned: gridIds.has(s.id), 'is-seen': g.key === 'turn-done' && !isUnseenTurn(s), 'is-pickable': view === 'live' }]"
              :style="{ '--id-color': identityFor(s).color }"
              :ticket-key="labelOf(s)"
              :summary="titleOf(s)"
              :priority="ticketOf(s)?.priority ?? null"
              :mr="mrOf(s)"
              :session="s"
              :identity="identityFor(s)"
              :is-pinned="gridIds.has(s.id)"
              mr-title="Open the task"
              @open-mr="openTask(s)"
              @click="pickSide(s, $event)"
            >
              <template #ticket-key>
                <button class="key" :title="`Open ${labelOf(s)}`" @click="openTask(s)">
                  {{ labelOf(s) }}
                </button>
              </template>
              <template #marks>
                <span v-if="isNewCr(s)" class="chip cr">new CR</span>
                <span v-if="g.key === 'working'" class="elapsed" title="Working for">{{
                  elapsedOf(s)
                }}</span>
              </template>
              <template #chips>
              <div v-if="reviewOf(s) || jiraStatusOf(s) || s.contextTokens" class="chips">
                <span v-if="reviewOf(s)" class="chip kind">review</span>
                <span v-if="reviewOf(s)" class="chip">{{ reviewOf(s)?.projectName }}</span>
                <span v-if="reviewOf(s)?.author" class="chip dim">{{ reviewOf(s)?.author }}</span>
                <span v-if="jiraStatusOf(s)" class="chip status">{{ jiraStatusOf(s) }}</span>
                <span v-if="s.contextTokens" class="chip dim" title="Context"
                  >{{ Math.round(s.contextTokens / 1000) }}k</span
                >
              </div>
              </template>
              <template #actions>
              <div class="actions">
                <button
                  class="act"
                  :class="{ on: gridIds.has(s.id) }"
                  :title="gridIds.has(s.id) ? 'Unpin from the grid' : 'Pin to the grid'"
                  @click="gridIds.has(s.id) ? unpin(s.id) : pin(s)"
                >
                  <Icon name="dashboard" :size="12" />{{ gridIds.has(s.id) ? 'Pinned' : 'Pin' }}
                </button>
                <AutonomyMenu
                  is-compact
                  :value="choiceOf(jobOf(s))"
                  :is-disabled="!jobOf(s) && !s.ticket"
                  disabled-hint="Only a session with a ticket can be orchestrated"
                  @change="(a) => setAutonomy(s, a)"
                />
                <span class="grow" />
                <button class="act" title="Put the session to sleep" @click="sleepNow(s)">
                  <Icon name="moon" :size="12" />
                </button>
                <button class="act danger" title="Stop the session" @click="stop(s)">
                  <Icon name="stop" :size="12" />
                </button>
              </div>
              </template>
            </TaskTile>
          </template>
        </template>
        <template v-if="loose.length">
          <h3>Jobs</h3>
          <div v-for="j in loose" :key="j.id" class="job" :class="j.state" @click="emit('open', j)">
            <span class="key">{{ j.key }}</span>
            <span class="state">{{ stateLabel(j.state, j.kind) }}</span>
            <span class="grow" />
            <button class="link" @click.stop="remove(j)">Remove</button>
          </div>
        </template>
        <h3 class="fold" @click="isNotStartedOpen = !isNotStartedOpen">{{ isNotStartedOpen ? '▾' : '▸' }} Not started ({{ shownTicketRows.length + shownMrRows.length }})</h3>
        <template v-if="isNotStartedOpen">
          <input v-model="query" class="search" type="search" placeholder="Search key, title, status, project…" />
          <template v-for="g in ticketGroups" :key="g.status">
          <h4 class="fold" @click="toggleGroup(g.status)">{{ collapsedGroups.has(g.status) ? '▸' : '▾' }} {{ g.status }} <span>{{ g.rows.length }}</span></h4>
          <template v-if="!collapsedGroups.has(g.status)">
          <div v-for="r in g.rows" :key="`t:${r.key}`" class="row idle">
            <div class="line">
              <PriorityIcon :name="ticketRowOf(r)?.priority" />
              <span class="key plain">{{ r.key }}</span>
              <span v-if="ticketRowOf(r)?.type" class="chip dim">{{ ticketRowOf(r)?.type }}</span>
            </div>
            <div class="sub" :title="r.title">{{ splitTag(r.title).text || r.title }}</div>
            <div class="chips">
              <span v-if="splitTag(r.title).tag" class="chip">{{ splitTag(r.title).tag }}</span>
              <span v-if="ticketRowOf(r)?.status" class="chip status">{{ ticketRowOf(r)?.status }}</span>
              <template v-if="mrForTicket(r.key)">
                <span class="chip"><Icon name="pr" :size="10" />!{{ mrForTicket(r.key)?.iid }}<template v-if="mrForTicket(r.key)?.isDraft"> draft</template></span>
                <span v-if="(mrForTicket(r.key)?.openThreads ?? 0) > 0" class="chip attn" title="Unresolved threads">
                  <Icon name="message" :size="10" />{{ mrForTicket(r.key)?.openThreads }}
                </span>
                <span class="chip" :class="{ ok: (mrForTicket(r.key)?.approvals ?? 0) >= 2 }" title="Approvals"><Icon name="check" :size="10" />{{ mrForTicket(r.key)?.approvals ?? 0 }}</span>
              </template>
            </div>
            <div class="actions">
              <select class="repo" :value="repoOf(r) ?? ''" title="Repository" @change="repoPicks = { ...repoPicks, [r.key]: ($event.target as HTMLSelectElement).value }">
                <option v-for="p in roots" :key="p.path" :value="p.path">{{ p.name }}</option>
              </select>
              <AutonomyMenu is-compact :value="choiceOfAutonomy(autonomyOf(r))"@change="(a) => pickAutonomy(r, autonomyOfChoice(a))" />
              <span class="grow" />
              <button v-if="resumableOf(r)" class="act start" title="Resume the last session of this task and pin it" @click="resumeRow(resumableOf(r)!)"><Icon name="refresh" :size="12" />Resume</button>
              <button class="act start" :disabled="!repoOf(r)"title="Start the task and pin its session" @click="startRow(r)"><Icon name="play" :size="12" />Start</button>
            </div>
          </div>
          </template>
          </template>
          <h4 v-if="shownMrRows.length" class="fold" @click="toggleGroup('mrs')">{{ collapsedGroups.has('mrs') ? '▸' : '▾' }} Merge requests <span>{{ shownMrRows.length }}</span></h4>
          <template v-if="!collapsedGroups.has('mrs')">
          <div v-for="r in shownMrRows" :key="`m:${r.key}`" class="row idle">
            <div class="line">
              <span class="chip kind">{{ r.kind === 'watch' ? 'mine' : 'review' }}</span>
              <span class="key plain">!{{ mrRowOf(r)?.iid }}</span>
              <span v-if="mrRowOf(r)?.isDraft" class="chip dim">draft</span>
            </div>
            <div class="sub" :title="r.title">{{ r.title }}</div>
            <div class="chips">
              <span class="chip">{{ mrRowOf(r)?.projectName }}</span>
              <span v-if="mrRowOf(r)?.author" class="chip dim">{{ mrRowOf(r)?.author }}</span>
              <span v-if="mrRowOf(r)" class="chip" :style="{ color: reviewLabel(mrRowOf(r)!.review).color, borderColor: reviewLabel(mrRowOf(r)!.review).color }">{{ reviewLabel(mrRowOf(r)!.review).label }}</span>
              <span v-if="(mrRowOf(r)?.openThreads ?? 0) > 0" class="chip attn" title="Unresolved threads">
                <Icon name="message" :size="10" />{{ mrRowOf(r)?.openThreads }}
              </span>
              <span class="chip" :class="{ ok: (mrRowOf(r)?.approvals ?? 0) >= 2 }" title="Approvals"><Icon name="check" :size="10" />{{ mrRowOf(r)?.approvals ?? 0 }}</span>
            </div>
            <div class="actions">
              <span class="grow" />
              <button class="act start" :title="r.kind === 'watch' ? 'Watch new comments' : 'Start a review session and pin it'" @click="startRow(r)">
                <Icon name="play" :size="12" />{{ r.kind === 'watch' ? 'Watch' : 'Review' }}
              </button>
            </div>
          </div>
          </template>
          <p v-if="!shownTicketRows.length && !shownMrRows.length" class="note">Nothing matches.</p>
        </template>
      </aside>
      <section v-if="view === 'activity'" class="activity">
        <div class="filter">
          <select v-model="activityJob">
            <option :value="null">All jobs</option>
            <option v-for="j in jobs" :key="j.id" :value="j.id">{{ j.key }} · {{ stateLabel(j.state, j.kind) }} · {{ j.autonomy }}</option>
          </select>
          <span class="note">The orchestrator keeps the last {{ LOG_LIMIT }} events per job.</span>
        </div>
        <p v-if="!feed.length" class="note">Nothing yet. Start or adopt a job to see what the orchestrator does.</p>
        <div v-for="(e, i) in feed" :key="`${e.jobId}:${e.at}:${i}`" class="event" :class="activityTone(e.text)">
          <time>{{ formatTime(e.at) }}</time>
          <button class="key" @click="openJobById(e.jobId)">{{ e.key }}</button>
          <span class="kind">{{ e.kind }}</span>
          <span class="text">{{ e.text }}</span>
        </div>
      </section>
      <section v-show="view !== 'activity'" class="grids">
        <button
          v-if="isFullScreen"
          class="link exit-full"
          title="Exit full screen (Ctrl+Shift+F)"
          @click="toggleFullScreen"
        >
          Exit full screen (Ctrl+Shift+F)
        </button>
        <div v-show="view === 'pinned'" class="grid">
          <PanelGrid
            ref="pinnedGrid"
            :key="`pinned-${layoutEpoch}`"
            view="pinned"
            :sessions="grid"
            :all-sessions="sessions"
            :columns="columns.pinned"
            :active-id="view === 'pinned' ? placeholderId : null"
            :title-of="titleOf"
            :jira-status-of="jiraStatusOf"
            :job-of="jobOf"
            :look-of="lookOf"
            :identity-of="identityFor"
            :is-pinned="isPinnedSession"
            :is-auto-resume="isAutoResumed"
            :waiting-since-of="waitingSinceOf"
            :is-acknowledged="isAcknowledged"
            :is-turn-unseen-of="isUnseenTurn"
            :now="now"
            @focused="acknowledge"
            @left="leave"
            @open-task="openTask"
            @unpin="unpin"
            @pin="pin"
            @look="setLook"
            @expand="openFocus"
          />
          <div v-if="!grid.length" class="empty">
            <Icon name="dashboard" :size="28" />
            <p>Pin sessions from the list to watch and drive them here side by side.</p>
          </div>
        </div>
        <div v-show="view === 'live'" class="grid">
          <template v-for="z in liveZones" :key="z.key">
            <button
              class="zone"
              :class="z.key"
              :aria-expanded="!collapsedZones.has(z.key)"
              @click="toggleZone(z.key)"
            >
              <span class="fold-mark">{{ collapsedZones.has(z.key) ? '▸' : '▾' }}</span>
              <Icon :name="ZONE_META[z.key].icon" :size="12" />
              {{ ZONE_META[z.key].label }}
              <span class="count">{{ z.count }}</span>
            </button>
            <PanelGrid
              v-if="!collapsedZones.has(z.key)"
              :key="`${zoneLayoutOf(z.key)}-${layoutEpoch}`"
              :ref="bindZoneGrid(z.key)"
              :view="zoneLayoutOf(z.key)"
              :sessions="z.tiles"
              :all-sessions="sessions"
              :columns="columns.live"
              :active-id="view === 'live' ? placeholderId : null"
              :title-of="titleOf"
              :jira-status-of="jiraStatusOf"
              :job-of="jobOf"
              :look-of="lookOf"
              :identity-of="identityFor"
              :is-pinned="isPinnedSession"
              :is-auto-resume="isAutoResumed"
              :waiting-since-of="waitingSinceOf"
              :is-acknowledged="isAcknowledged"
              :is-turn-unseen-of="isUnseenTurn"
              :now="now"
              :tile-id-of="tileIdOf"
              :tabs-of="tabsOf"
              :is-calling-of="needsAttention"
              @select-tab="selectTab"
              @focused="acknowledge"
              @left="leave"
              @open-task="openTask"
              @unpin="unpin"
              @pin="pin"
              @look="setLook"
              @expand="openFocus"
            />
          </template>
          <div v-if="!liveShown.length" class="empty">
            <Icon name="dashboard" :size="28" />
            <p>{{ live.length ? 'No sessions active in the last 24 hours.' : 'No live sessions.' }}</p>
          </div>
        </div>
        <SessionSearch
          v-if="isSearchOpen"
          :sessions="live"
          :identity-of="identityFor"
          :text-of="searchTextOf"
          :label-of="labelOf"
          :title-of="titleOf"
          @pick="pickSearch"
          @close="closeSearch"
        />
      </section>
    </div>
    <FocusOverlay
      v-if="activeSession"
      ref="focusOverlay"
      :session="activeSession"
      :title="titleOf(activeSession)"
      :jira-status="jiraStatusOf(activeSession)"
      :job="jobOf(activeSession)"
      :look="lookOf(activeSession)"
      :identity="identityFor(activeSession)"
      :is-pinned="isPinnedSession(activeSession)"
      :is-auto-resume="isAutoResumed(activeSession)"
      :waiting-since="waitingSinceOf(activeSession)"
      :is-acknowledged="isAcknowledged(activeSession)"
      :is-turn-unseen="isUnseenTurn(activeSession)"
      :now="now"
      @focused="acknowledge"
      @close="closeFocus"
      @open-task="openTask"
      @unpin="unpin"
      @pin="pin"
      @look="setLook"
    />
    <StartJobsDialog v-if="isDialogOpen" :tickets="tickets" :mrs="mrs" :my-name="myName" :sessions="sessions" @close="isDialogOpen = false" />
    <ReplyToCrDialog
      v-if="isReplyOpen"
      :mrs="mrs"
      :my-name="myName"
      :sessions="sessions"
      :identity-of="identityFor"
      @close="isReplyOpen = false"
      @started="pinReplies"
      @open-mr="openReplyMr"
    />
  </main>
</template>

<style scoped>
.panel {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-1);
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--line);
}
.head h2 {
  margin: 0;
  font: 600 14px var(--font-ui);
  color: var(--text);
}
.stat {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 12px;
  font: 12px var(--font-ui);
  color: var(--text-3);
  background: var(--bg-3);
  border-radius: 14px;
}
.stat.warn {
  color: var(--bg-1);
  background: var(--warn);
}
.grow {
  flex: 1;
}
.body {
  flex: 1;
  min-height: 0;
  display: flex;
}
.side {
  flex: none;
  width: 290px;
  padding: 10px;
  overflow-y: auto;
  border-right: 1px solid var(--line);
}
.side h3 {
  margin: 14px 0 6px;
  font: 600 11px var(--font-ui);
  color: var(--text-4);
  text-transform: uppercase;
}
.note {
  color: var(--text-4);
  font-size: 12px;
}
.note.warn {
  color: var(--warn);
}
.row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 6px;
  padding: 8px 9px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.ident.asks {
  border-color: var(--warn);
  animation: ask-call 1.6s ease-in-out infinite;
}
@keyframes ask-call {
  50% {
    box-shadow: 0 0 12px 3px color-mix(in srgb, var(--warn) 80%, transparent);
  }
}
@media (prefers-reduced-motion: reduce) {
  .ident.asks {
    animation: none;
  }
}
.side h3.section {
  display: flex;
  align-items: center;
  gap: 5px;
  padding-left: 6px;
  border-left: 3px solid currentColor;
  cursor: pointer;
  user-select: none;
}
.section.working {
  color: var(--ok);
}
.section.needs-input {
  color: var(--warn);
}
.section.turn-done {
  color: var(--text-2);
}
.section.new-cr {
  color: var(--cr);
}
.section .count {
  padding: 0 6px;
  font-weight: 400;
  color: var(--text-3);
  background: var(--bg-3);
  border-radius: 8px;
}
.pulse {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--ok);
  animation: pulse 1.4s ease-in-out infinite;
}
@keyframes pulse {
  50% {
    opacity: 0.3;
  }
}
.ident {
  --edge: var(--id-color);
}
.ident .chips,
.ident .actions {
  margin-top: 6px;
}
.ident.is-pickable {
  cursor: pointer;
}
.ident.in-idle,
.ident.is-seen {
  color: var(--text-3);
}
.chip.cr {
  color: var(--cr);
  border-color: color-mix(in srgb, var(--cr) 50%, transparent);
}
.elapsed {
  font-size: 11px;
  color: var(--ok);
}
.line {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
.key {
  flex: none;
  padding: 0;
  font: 600 12px var(--font-mono);
  color: var(--text);
  background: none;
  border: 0;
  cursor: pointer;
}
.key:hover {
  color: var(--accent);
}
.status {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-4);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 17px;
  padding: 0 6px;
  font-size: 10.5px;
  color: var(--text-3);
  border: 1px solid var(--line-2);
  border-radius: 9px;
}
.chip.dim {
  color: var(--text-4);
}
.chip.status {
  color: #6aa9ff;
  border-color: color-mix(in srgb, #6aa9ff 45%, transparent);
}
.chip.attn {
  color: var(--warn);
  border-color: var(--warn);
}
.chip.ok {
  color: #3dd68c;
  border-color: color-mix(in srgb, #3dd68c 50%, transparent);
}
.chip.kind {
  color: #a371f7;
  border-color: color-mix(in srgb, #a371f7 50%, transparent);
}
.sub {
  overflow: hidden;
  font-size: 11.5px;
  color: var(--text-3);
  white-space: nowrap;
  text-overflow: ellipsis;
}
.actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
}
.act {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  margin: 0;
  padding: 0 7px;
  font: 11px/1 var(--font-ui);
  color: var(--text-3);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 5px;
  cursor: pointer;
}
.act:hover {
  color: var(--text);
  border-color: var(--accent);
}
.act.on {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 50%, transparent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}
.act.start {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 50%, transparent);
}
.act:disabled {
  opacity: 0.45;
  cursor: default;
}
.row.idle {
  background: var(--bg-1);
}
.key.plain {
  cursor: default;
}
.fold {
  cursor: pointer;
  user-select: none;
}
.side h4 {
  margin: 10px 0 5px;
  font: 600 11.5px var(--font-ui);
  color: var(--text-3);
}
.side h4 span {
  margin-left: 4px;
  color: var(--text-4);
  font-weight: 400;
}
.actions {
  flex-wrap: wrap;
}
.tabs {
  display: inline-flex;
  margin-left: 8px;
  overflow: hidden;
  border: 1px solid var(--line-2);
  border-radius: 6px;
}
.tabs button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 12px;
  font: 12px var(--font-ui);
  color: var(--text-3);
  background: none;
  border: none;
  border-left: 1px solid var(--line-2);
  cursor: pointer;
}
.tabs button:first-child {
  border-left: none;
}
.tabs button.on {
  color: var(--text);
  background: var(--bg-4);
}
.tabs .count {
  padding: 0 6px;
  font-size: 10.5px;
  color: var(--text-2);
  background: var(--bg-3);
  border-radius: 8px;
}
.tabs button.on .count {
  background: var(--bg-1);
}
.badge {
  padding: 0 5px;
  font-size: 10.5px;
  color: var(--bg-1);
  background: var(--warn);
  border-radius: 8px;
}
.activity {
  flex: 1;
  min-width: 0;
  padding: 10px 14px;
  overflow-y: auto;
}
.filter {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.filter select {
  height: 26px;
  font: 12px var(--font-ui);
  color: var(--text);
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  border-radius: 6px;
}
.event {
  display: grid;
  grid-template-columns: 130px 120px 60px 1fr;
  align-items: baseline;
  gap: 8px;
  padding: 5px 8px;
  font-size: 12px;
  border-left: 3px solid var(--line-2);
  border-bottom: 1px solid var(--line);
}
.event time {
  font: 11px var(--font-mono);
  color: var(--text-4);
}
.event .kind {
  font-size: 11px;
  color: var(--text-4);
}
.event .text {
  color: var(--text-2);
  overflow-wrap: anywhere;
}
.event.auto {
  border-left-color: var(--accent);
}
.event.ask {
  border-left-color: var(--warn);
}
.event.ask .text {
  color: var(--warn);
}
.event.fail {
  border-left-color: var(--danger);
}
.event.fail .text {
  color: var(--danger);
}
.search {
  box-sizing: border-box;
  width: 100%;
  height: 26px;
  margin-bottom: 4px;
  padding: 0 8px;
  font: 12px var(--font-ui);
  color: var(--text);
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  border-radius: 6px;
}
.search:focus {
  outline: none;
  border-color: var(--accent);
}
.repo {
  box-sizing: border-box;
  height: 22px;
  max-width: 120px;
  font: 11px var(--font-ui);
  color: var(--text-2);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 5px;
}
.act.danger:hover {
  color: var(--danger);
  border-color: var(--danger);
}
.link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  font: 11px var(--font-ui);
  color: var(--text-3);
  background: none;
  border: 1px solid var(--line-2);
  border-radius: 6px;
  cursor: pointer;
}
.link:hover {
  color: var(--text);
  border-color: var(--accent);
}
.job {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  padding: 5px 8px;
  font-size: 12px;
  border: 1px solid var(--line);
  border-radius: 6px;
  cursor: pointer;
}
.job:hover {
  background: var(--bg-3);
}
.state {
  color: var(--text-3);
}
.job.failed .state {
  color: var(--warn);
}
.grids {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.exit-full {
  position: absolute;
  right: 14px;
  bottom: 10px;
  z-index: 50;
  background: var(--bg-3);
}
.grid {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 4px;
  overflow-y: auto;
}
.grid > .grid-stack {
  flex: none;
}
.zone {
  flex: none;
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 8px 4px 4px;
  padding: 2px 0 2px 6px;
  font: 600 11px var(--font-ui);
  color: var(--text-3);
  text-transform: uppercase;
  text-align: left;
  background: none;
  border: 0;
  border-left: 3px solid currentColor;
  cursor: pointer;
  user-select: none;
}
.zone.needs-me {
  color: var(--warn);
}
.zone.working {
  color: var(--ok);
}
.zone.seen {
  color: var(--text-2);
}
.zone .count {
  padding: 0 6px;
  font-weight: 400;
  color: var(--text-3);
  background: var(--bg-3);
  border-radius: 8px;
}
.empty {
  flex: 1;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 8px;
  color: var(--text-4);
  font-size: 12.5px;
}
.head-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 12px;
  font: 600 12px var(--font-ui);
  border-radius: 6px;
  cursor: pointer;
}
.head-btn.primary {
  color: var(--on-accent);
  background: var(--accent);
  border: 1px solid var(--accent);
}
.head-btn.ghost {
  font-weight: 400;
  color: var(--text-3);
  background: none;
  border: 1px solid var(--line-2);
}
.head-btn.ghost:hover {
  color: var(--text);
  border-color: var(--accent);
}
.head-btn.ghost.on {
  color: var(--text);
  background: var(--bg-4);
  border-color: var(--accent);
}
.head-btn.icon {
  padding: 0 7px;
}
.head-btn.cr {
  color: var(--cr);
  background: none;
  border: 1px solid var(--cr);
}
.head-btn.cr .badge {
  color: var(--bg-1);
  background: var(--cr);
}
</style>
