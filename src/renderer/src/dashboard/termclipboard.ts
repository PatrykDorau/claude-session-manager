import type { Terminal } from '@xterm/xterm'

export const attachClipboard = (term: Terminal, host: HTMLElement): void => {
  const paste = (): void => {
    const text = window.api.readClipboard()
    if (text) term.paste(text)
  }
  const copySelection = (): boolean => {
    if (!term.hasSelection()) return false
    window.api.copyText(term.getSelection())
    term.clearSelection()
    return true
  }
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown' || !e.ctrlKey || e.altKey) return true
    const key = e.key.toLowerCase()
    if (key === 'v') {
      e.preventDefault()
      paste()
      return false
    }
    if (key === 'c' && copySelection()) {
      e.preventDefault()
      return false
    }
    return true
  })
  host.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    if (!copySelection()) paste()
  })
}
