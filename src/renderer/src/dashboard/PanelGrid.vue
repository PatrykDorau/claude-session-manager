<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type ComponentPublicInstance } from 'vue'
import { GridStack, type GridItemHTMLElement, type GridStackWidget } from 'gridstack'
import 'gridstack/dist/gridstack.min.css'
import type { Session } from '../types'
import type { Job } from '../../../main/orchestrator'
import {
  DEFAULT_TILE,
  followLayout,
  needsYou,
  readLayout,
  writeLayout,
  type CellLook,
  type Identity,
  type LayoutKey,
  type TileLayout,
  type ViewLayout
} from './commandpanel'
import PanelCell from './PanelCell.vue'
import TileTabs from './TileTabs.vue'

const props = defineProps<{
  view: LayoutKey
  sessions: Session[]
  allSessions: Session[]
  columns: 1 | 2 | 3
  activeId: string | null
  titleOf: (session: Session) => string
  jiraStatusOf: (session: Session) => string | null
  jobOf: (session: Session) => Job | null
  lookOf: (session: Session) => CellLook
  identityOf: (session: Session) => Identity
  isPinned: (session: Session) => boolean
  isAutoResume: (session: Session) => boolean
  waitingSinceOf: (session: Session) => number | null
  isAcknowledged: (session: Session) => boolean
  isTurnUnseenOf: (session: Session) => boolean
  now: number
  tileIdOf?: (session: Session) => string
  tabsOf?: (session: Session) => Session[]
  isCallingOf?: (session: Session) => boolean
}>()
const emit = defineEmits<{
  'select-tab': [session: Session]
  'open-task': [session: Session]
  unpin: [id: string]
  pin: [session: Session]
  look: [session: Session, look: CellLook]
  expand: [session: Session]
  focused: [session: Session]
  left: [session: Session]
}>()

interface CellHandle {
  refit: () => void
  focus: () => boolean
}

const ANIMATION_MS = 350
const REVEAL_MS = 2000
const REVEAL_CLASS = 'is-revealed'
let revealTimer: ReturnType<typeof setTimeout> | null = null
let revealedEl: HTMLElement | null = null
const rootEl = ref<HTMLDivElement | null>(null)
const cells = new Map<string, CellHandle>()
const placed = new Map<string, Partial<TileLayout>>()
let grid: GridStack | null = null
let refitTimer: ReturnType<typeof setTimeout> | null = null

const idOf = (s: Session): string => (props.tileIdOf ? props.tileIdOf(s) : s.id)
const tabsFor = (s: Session): Session[] => (props.tabsOf ? props.tabsOf(s) : [])
const isCalling = (s: Session): boolean => (props.isCallingOf ? props.isCallingOf(s) : needsYou(s))

const tileOf = (id: string): Partial<TileLayout> => {
  const known = placed.get(id)
  if (known) return known
  const tile = followLayout(readLayout(props.view), props.allSessions)[id] ?? DEFAULT_TILE
  placed.set(id, tile)
  return tile
}

const bindCell = (id: string): ((cell: Element | ComponentPublicInstance | null) => void) => {
  const setCell = (cell: Element | ComponentPublicInstance | null): void => {
    if (cell) cells.set(id, cell as unknown as CellHandle)
    else cells.delete(id)
  }
  return setCell
}

const refitCell = (cell: CellHandle): void => cell.refit()
const refitAll = (): void => cells.forEach(refitCell)
const refitCells = (ids: string[] | null): void => {
  const cellsOf = (id: string): CellHandle[] => {
    const cell = cells.get(id)
    return cell ? [cell] : []
  }
  const targets = ids ? ids.flatMap(cellsOf) : [...cells.values()]
  targets.forEach(refitCell)
  if (refitTimer) clearTimeout(refitTimer)
  refitTimer = setTimeout(refitAll, ANIMATION_MS)
}

const toTile = (item: GridStackWidget): TileLayout => ({
  x: item.x ?? 0,
  y: item.y ?? 0,
  w: item.w ?? 1,
  h: item.h ?? 1
})
const saveLayout = (): void => {
  if (!grid) return
  const items = grid.save(false, false, undefined, grid.getColumn()) as GridStackWidget[]
  const current: ViewLayout = {}
  for (const item of items) if (item.id) current[item.id] = toTile(item)
  writeLayout(props.view, {
    ...followLayout(readLayout(props.view), props.allSessions),
    ...current
  })
}

const onDragStop = (_event: Event, el: GridItemHTMLElement): void => {
  saveLayout()
  const id = el.getAttribute('gs-id')
  refitCells(id ? [sessionIdOfTile(id)] : null)
}
const onResizeStop = (): void => {
  saveLayout()
  refitCells(null)
}

const itemOf = (id: string): HTMLElement | null => {
  const isItemOf = (el: Element): boolean => el.getAttribute('gs-id') === id
  return ([...(rootEl.value?.children ?? [])].find(isItemOf) as HTMLElement | undefined) ?? null
}

const keepOrder = (previous: Session[] | undefined): Session[] => {
  const currentOf = (p: Session): Session[] => {
    const isSame = (s: Session): boolean => idOf(s) === idOf(p)
    const found = props.sessions.find(isSame)
    return found ? [found] : []
  }
  const kept = (previous ?? []).flatMap(currentOf)
  const isNotKept = (s: Session): boolean => {
    const isSame = (k: Session): boolean => idOf(k) === idOf(s)
    return !kept.some(isSame)
  }
  return [...kept, ...props.sessions.filter(isNotKept)]
}
const tiles = computed(keepOrder)
const tileIds = (): string[] => tiles.value.map(idOf)
const ids = computed(tileIds)
const removeGone = (next: string[], previous: string[] | undefined): void => {
  if (!previous) return
  const isGone = (p: string): boolean => !next.includes(p)
  for (const id of previous.filter(isGone)) {
    const el = itemOf(id)
    if (grid && el) grid.removeWidget(el, false)
    placed.delete(id)
  }
}
const addNew = (next: string[], previous: string[] | undefined): void => {
  if (!grid || !previous) return
  const isNew = (n: string): boolean => !previous.includes(n)
  for (const id of next.filter(isNew)) {
    const el = itemOf(id)
    if (el) grid.makeWidget(el)
  }
}
watch(ids, removeGone, { flush: 'pre' })
watch(ids, addNew, { flush: 'post' })

const applyColumns = (columns: 1 | 2 | 3): void => {
  if (!grid) return
  grid.column(columns, 'moveScale')
  saveLayout()
  refitCells(null)
}
const columnsOf = (): 1 | 2 | 3 => props.columns
watch(columnsOf, applyColumns)

const tileIdOfSession = (sessionId: string): string => {
  const isSession = (s: Session): boolean => s.id === sessionId
  const tile = tiles.value.find(isSession)
  return tile ? idOf(tile) : sessionId
}
const swapSlot = (next: string | null, previous: string | null): void => {
  if (!grid) return
  for (const id of [previous, next]) {
    const el = id ? itemOf(tileIdOfSession(id)) : null
    if (el) grid.refreshDragHandles(el)
  }
  if (previous) refitCells([previous])
}
const activeIdOf = (): string | null => props.activeId
watch(activeIdOf, swapSlot, { flush: 'post' })

const selectedByTile = (): Record<string, string> => {
  const entryOf = (s: Session): [string, string] => [idOf(s), s.id]
  return Object.fromEntries(tiles.value.map(entryOf))
}
const rebindSwitchedTabs = (next: Record<string, string>, previous: Record<string, string> | undefined): void => {
  if (!grid || !previous) return
  const isSwitched = (tileId: string): boolean => Object.hasOwn(previous, tileId) && previous[tileId] !== next[tileId]
  for (const tileId of Object.keys(next).filter(isSwitched)) {
    const el = itemOf(tileId)
    if (el) grid.refreshDragHandles(el)
  }
}
watch(selectedByTile, rebindSwitchedTabs, { flush: 'post' })

const startGrid = (): void => {
  if (!rootEl.value) return
  grid = GridStack.init(
    {
      column: props.columns,
      mode: 'top',
      cellHeight: 60,
      handle: '.bar .row1',
      resizable: { handles: 'se' },
      margin: 4
    },
    rootEl.value
  )
  grid?.on('change', saveLayout)
  grid?.on('added', saveLayout)
  grid?.on('dragstop', onDragStop)
  grid?.on('resizestop', onResizeStop)
}
const clearReveal = (): void => {
  if (revealTimer) clearTimeout(revealTimer)
  revealedEl?.classList.remove(REVEAL_CLASS)
  revealedEl = null
}
const sessionIdOfTile = (tileId: string): string => {
  const isTile = (s: Session): boolean => idOf(s) === tileId
  return tiles.value.find(isTile)?.id ?? tileId
}
const reveal = (tileId: string): boolean => {
  const tile = itemOf(tileId)?.querySelector<HTMLElement>('.tile')
  if (!tile) return false
  clearReveal()
  tile.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  const isCellFocused = !!cells.get(sessionIdOfTile(tileId))?.focus()
  if (!isCellFocused) tile.focus({ preventScroll: true })
  void tile.offsetWidth
  tile.classList.add(REVEAL_CLASS)
  revealedEl = tile
  revealTimer = setTimeout(clearReveal, REVEAL_MS)
  return isCellFocused
}
const focusTile = (tileId: string): boolean => !!cells.get(sessionIdOfTile(tileId))?.focus()
const refit = (): void => refitCells(null)
defineExpose({ reveal, refit, focusTile })

const stopGrid = (): void => {
  clearReveal()
  if (refitTimer) clearTimeout(refitTimer)
  grid?.destroy(false)
  grid = null
}
onMounted(startGrid)
onBeforeUnmount(stopGrid)

const openTask = (session: Session): void => emit('open-task', session)
const unpin = (id: string): void => emit('unpin', id)
const pin = (session: Session): void => emit('pin', session)
const setLook = (session: Session, look: CellLook): void => emit('look', session, look)
const expand = (session: Session): void => emit('expand', session)
const focused = (session: Session): void => emit('focused', session)
const left = (session: Session): void => emit('left', session)
const selectTab = (session: Session): void => emit('select-tab', session)
</script>

<template>
  <div ref="rootEl" class="grid-stack">
    <div
      v-for="s in tiles"
      :key="idOf(s)"
      class="grid-stack-item"
      :gs-id="idOf(s)"
      :gs-x="tileOf(idOf(s)).x"
      :gs-y="tileOf(idOf(s)).y"
      :gs-w="tileOf(idOf(s)).w"
      :gs-h="tileOf(idOf(s)).h"
    >
      <div class="grid-stack-item-content tile" tabindex="-1">
        <TileTabs
          v-if="tabsFor(s).length >= 2"
          :tabs="tabsFor(s)"
          :selected-id="s.id"
          :identity-of="identityOf"
          :title-of="titleOf"
          :is-calling-of="isCalling"
          @select="selectTab"
        />
        <PanelCell
          v-if="s.id !== activeId"
          :key="s.id"
          :ref="bindCell(s.id)"
          :session="s"
          :title="titleOf(s)"
          :jira-status="jiraStatusOf(s)"
          :job="jobOf(s)"
          :look="lookOf(s)"
          :identity="identityOf(s)"
          :is-pinned="isPinned(s)"
          :is-auto-resume="isAutoResume(s)"
          :waiting-since="waitingSinceOf(s)"
          :is-acknowledged="isAcknowledged(s)"
          :is-turn-unseen="isTurnUnseenOf(s)"
          :now="now"
          @focused="focused"
          @left="left"
          @open-task="openTask"
          @unpin="unpin"
          @pin="pin"
          @look="setLook"
          @expand="expand"
        />
        <div v-else class="slot" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.grid-stack > .grid-stack-item > .tile {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.tile > * {
  flex: 1;
  min-width: 0;
  min-height: 0;
}
.tile > .tabs {
  flex: none;
}
.grid-stack > .grid-stack-item > .tile:focus {
  outline: none;
}
.grid-stack > .grid-stack-item > .tile.is-revealed {
  border-radius: 8px;
  outline: 3px solid var(--accent);
  outline-offset: 2px;
  animation: reveal-pulse 0.6s ease-in-out 2;
}
@keyframes reveal-pulse {
  50% {
    transform: scale(1.03);
  }
}
.slot {
  border: 1px dashed var(--line-2);
  border-radius: 8px;
}
.grid-stack :deep(.grid-stack-placeholder > .placeholder-content) {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  border: 1px dashed var(--accent);
  border-radius: 8px;
}
</style>
