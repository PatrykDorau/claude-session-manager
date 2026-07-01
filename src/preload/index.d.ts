import { ElectronAPI } from '@electron-toolkit/preload'
import type { Session, UsageResult } from '../renderer/src/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      onSessions: (cb: (s: Session[]) => void) => void
      openSession: (s: Session) => void
      openTicket: (code: string) => void
      copyText: (text: string) => void
      setWatched: (id: string, on: boolean) => void
      setName: (id: string, name: string | null) => void
      removeSession: (id: string, label: string) => void
      getVersion: () => string
      getDiagnostics: () => string
      onClaudeStatus: (cb: (s: { claude: boolean; editor: boolean }) => void) => void
      onUsage: (cb: (u: UsageResult) => void) => void
      getUsage: () => UsageResult | null
      getSettings: () => {
        jiraBase: string
        jiraToken: string
        jiraDoneStatuses: string
        alwaysOnTop: boolean
        clickAction: string
        launchOnStartup: boolean
      }
      setSettings: (patch: {
        jiraBase?: string
        jiraToken?: string
        jiraDoneStatuses?: string
        alwaysOnTop?: boolean
        clickAction?: string
        launchOnStartup?: boolean
      }) => void
      setFinished: (id: string, on: boolean) => void
      sessionMenu: (s: Session) => void
      switchAccount: () => void
      minimizeWindow: () => void
      onResumeFailed: (cb: (info: { label: string; command: string }) => void) => void
      installHooks: () => { ok: boolean; error?: string }
      onPlayAlert: (cb: () => void) => void
      onMenuState: (cb: (open: boolean) => void) => void
    }
  }
}
