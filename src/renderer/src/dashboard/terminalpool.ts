import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { attachClipboard } from './termclipboard'

export interface PooledTerminal {
  term: Terminal
  fit: FitAddon
  element: HTMLDivElement
  isAttached: boolean
  openedAt: number
  users: number
  onExit: Set<(code: number) => void>
}

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
  const entry: PooledTerminal = { term, fit, element, isAttached: false, openedAt: 0, users: 1, onExit: new Set() }
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
