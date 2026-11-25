import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { attachClipboard } from './termclipboard'

export interface PooledTerminal {
  term: Terminal
  fit: FitAddon
  element: HTMLDivElement
  isAttached: boolean
  isWaitingToAttach: boolean
  openedAt: number
  detachedAt: number
  users: number
  onExit: Set<(code: number) => void>
  onDetach: Set<() => void>
  onAttach: Set<() => void>
}

const runCallback = (cb: () => void): void => cb()

const pool = new Map<string, PooledTerminal>()
const keys = new Map<PooledTerminal, string>()
const renamed = new Map<string, string>()
let isListening = false
const currentKey = (sessionId: string): string => renamed.get(sessionId) ?? sessionId

const listen = (): void => {
  if (isListening) return
  isListening = true
  window.api.onPtyData((id, chunk) => pool.get(id)?.term.write(chunk))
  window.api.onPtyRekey((from, to) => {
    const entry = pool.get(from)
    if (!entry || pool.has(to)) return
    pool.delete(from)
    pool.set(to, entry)
    keys.set(entry, to)
    renamed.set(from, to)
  })
  window.api.onPtyExit((id, code) => {
    const entry = pool.get(id)
    if (!entry) return
    entry.isAttached = false
    entry.onExit.forEach((cb) => cb(code))
  })
  const onDetached = (id: string): void => {
    const entry = pool.get(id)
    if (!entry) return
    entry.isAttached = false
    entry.isWaitingToAttach = true
    entry.detachedAt = Date.now()
    entry.onDetach.forEach(runCallback)
  }
  window.api.onPtyDetached(onDetached)
  const onAttached = (id: string, cols: number, rows: number): void => {
    const entry = pool.get(id)
    if (!entry || entry.isAttached) return
    entry.isAttached = true
    entry.isWaitingToAttach = false
    entry.openedAt = Date.now()
    entry.term.resize(cols, rows)
    entry.onAttach.forEach(runCallback)
  }
  window.api.onPtyAttached(onAttached)
}

const HEARTBEAT_MS = 60_000
let heartbeat: ReturnType<typeof setInterval> | null = null

const isShown = (entry: PooledTerminal): boolean =>
  entry.element.isConnected && entry.element.clientWidth > 0 && entry.element.clientHeight > 0

export const visibleAttachedIds = (): string[] => {
  const isVisibleAttached = ([, entry]: [string, PooledTerminal]): boolean => entry.isAttached && isShown(entry)
  const idOf = ([id]: [string, PooledTerminal]): string => id
  return [...pool].filter(isVisibleAttached).map(idOf)
}

const sendHeartbeat = (): void => {
  if (document.visibilityState !== 'visible') return
  const markSeen = (id: string): void => window.api.markTerminalSeen(id)
  visibleAttachedIds().forEach(markSeen)
}

export const startHeartbeat = (): void => {
  if (heartbeat) return
  heartbeat = setInterval(sendHeartbeat, HEARTBEAT_MS)
  document.addEventListener('visibilitychange', sendHeartbeat)
}

export const acquireTerminal = (sessionId: string): PooledTerminal => {
  listen()
  const found = pool.get(sessionId)
  if (found) {
    found.users += 1
    return found
  }
  const element = document.createElement('div')
  element.className = 'pool-term'
  const term = new Terminal({
    fontFamily: 'Cascadia Code, Cascadia Mono, Consolas, monospace',
    fontSize: 13,
    cursorBlink: true,
    allowProposedApi: true,
    theme: { background: '#1e1e1e', foreground: '#cccccc', cursor: '#3dd68c', selectionBackground: '#264f78' }
  })
  const fit = new FitAddon()
  term.loadAddon(fit)
  const entry: PooledTerminal = { term, fit, element, isAttached: false, isWaitingToAttach: false, openedAt: 0, detachedAt: 0, users: 1, onExit: new Set(), onDetach: new Set(), onAttach: new Set() }
  term.onData((data) => window.api.writeTerminal(keys.get(entry) ?? sessionId, data))
  pool.set(sessionId, entry)
  keys.set(entry, sessionId)
  return entry
}

export const syncPtySize = (entry: PooledTerminal, sessionId: string): void =>
  window.api.resizeTerminal(keys.get(entry) ?? sessionId, entry.term.cols, entry.term.rows)

export const showTerminalIn = (entry: PooledTerminal, host: HTMLElement): void => {
  if (entry.element.parentElement === host) return
  host.appendChild(entry.element)
  if (!entry.term.element) {
    entry.term.open(entry.element)
    attachClipboard(entry.term, entry.element)
  }
}

export const releaseTerminal = (sessionId: string): void => {
  const key = currentKey(sessionId)
  const entry = pool.get(key)
  if (!entry) return
  entry.users -= 1
  if (entry.users > 0) return
  const disposeLater = (): void => disposeIdle(key, entry)
  setTimeout(disposeLater, 0)
}

const retained = new Set<string>()
const isRetained = (key: string): boolean => {
  const isKeyOf = (sessionId: string): boolean => currentKey(sessionId) === key
  return [...retained].some(isKeyOf)
}

export const retainTerminal = (sessionId: string): void => {
  retained.add(sessionId)
}

export const releaseRetained = (sessionId: string): void => {
  if (!retained.delete(sessionId)) return
  const key = currentKey(sessionId)
  const entry = pool.get(key)
  if (!entry || entry.users > 0) return
  const disposeLater = (): void => disposeIdle(key, entry)
  setTimeout(disposeLater, 0)
}

const disposeIdle = (key: string, entry: PooledTerminal): void => {
  if (entry.users > 0 || pool.get(key) !== entry || isRetained(key)) return
  if (entry.isAttached) window.api.closeTerminal(key)
  entry.term.dispose()
  entry.element.remove()
  pool.delete(key)
  keys.delete(entry)
  for (const [from, to] of renamed) if (to === key) renamed.delete(from)
}
