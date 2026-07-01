import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { Session, UsageResult } from '../renderer/src/types'

// Custom APIs for renderer
const api = {
  onSessions: (cb: (s: Session[]) => void): void => {
    ipcRenderer.on('sessions', (_e, s) => cb(s))
  },
  openSession: (s: Session): void => {
    ipcRenderer.send('open-session', s)
  },
  openTicket: (code: string): void => {
    ipcRenderer.send('open-ticket', code)
  },
  copyText: (text: string): void => {
    ipcRenderer.send('copy-text', text)
  },
  setWatched: (id: string, on: boolean): void => {
    ipcRenderer.send('set-watched', id, on)
  },
  setName: (id: string, name: string | null): void => {
    ipcRenderer.send('set-name', id, name)
  },
  removeSession: (id: string, label: string): void => {
    ipcRenderer.send('remove-session', id, label)
  },
  getVersion: (): string => ipcRenderer.sendSync('get-version'),
  getDiagnostics: (): string => ipcRenderer.sendSync('get-diagnostics'),
  onClaudeStatus: (cb: (s: { claude: boolean; editor: boolean }) => void): void => {
    ipcRenderer.on('claude-status', (_e, s) => cb(s))
  },
  onUsage: (cb: (u: UsageResult) => void): void => {
    ipcRenderer.on('usage-update', (_e, u) => cb(u))
  },
  getUsage: (): UsageResult | null => ipcRenderer.sendSync('get-usage'),
  getSettings: (): {
    jiraBase: string
    jiraToken: string
    jiraDoneStatuses: string
    alwaysOnTop: boolean
    clickAction: string
    launchOnStartup: boolean
  } => ipcRenderer.sendSync('get-settings'),
  setSettings: (patch: {
    jiraBase?: string
    jiraToken?: string
    jiraDoneStatuses?: string
    alwaysOnTop?: boolean
    clickAction?: string
    launchOnStartup?: boolean
  }): void => {
    ipcRenderer.send('set-settings', patch)
  },
  setFinished: (id: string, on: boolean): void => {
    ipcRenderer.send('set-finished', id, on)
  },
  syncJira: (): Promise<void> => ipcRenderer.invoke('sync-jira'),
  sessionMenu: (s: Session): void => {
    ipcRenderer.send('session-menu', s)
  },
  switchAccount: (): void => {
    ipcRenderer.send('switch-account')
  },
  minimizeWindow: (): void => {
    ipcRenderer.send('minimize-window')
  },
  onResumeFailed: (cb: (info: { label: string; command: string }) => void): void => {
    ipcRenderer.on('resume-failed', (_e, info) => cb(info))
  },
  installHooks: (): { ok: boolean; error?: string } => ipcRenderer.sendSync('install-hooks'),
  onPlayAlert: (cb: () => void): void => {
    ipcRenderer.on('play-alert', () => cb())
  },
  onMenuState: (cb: (open: boolean) => void): void => {
    ipcRenderer.on('menu-state', (_e, open) => cb(open))
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
