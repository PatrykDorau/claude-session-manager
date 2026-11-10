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
let isListening = false

const listen = (): void => {
  if (isListening) return
  isListening = true
  window.api.onPtyData((id, chunk) => pool.get(id)?.term.write(chunk))
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
  term.onData((data) => window.api.writeTerminal(sessionId, data))
  const entry: PooledTerminal = { term, fit, element, isAttached: false, openedAt: 0, users: 1, onExit: new Set() }
  pool.set(sessionId, entry)
  return entry
}

export const showTerminalIn = (entry: PooledTerminal, host: HTMLElement): void => {
  if (entry.element.parentElement === host) return
  host.appendChild(entry.element)
  if (!entry.term.element) {
    entry.term.open(entry.element)
    attachClipboard(entry.term, entry.element)
  }
}

export const releaseTerminal = (sessionId: string): void => {
  const entry = pool.get(sessionId)
  if (!entry) return
  entry.users -= 1
  if (entry.users > 0) return
  if (entry.isAttached) window.api.closeTerminal(sessionId)
  entry.term.dispose()
  entry.element.remove()
  pool.delete(sessionId)
}
