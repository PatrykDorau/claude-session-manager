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
      onUsage: (cb: (u: UsageResult) => void) => void
      getUsage: () => UsageResult | null
      getSettings: () => {
        jiraBase: string
        alwaysOnTop: boolean
        clickAction: string
        launchOnStartup: boolean
      }
      setSettings: (patch: {
        jiraBase?: string
        alwaysOnTop?: boolean
        clickAction?: string
        launchOnStartup?: boolean
      }) => void
      sessionMenu: (s: Session) => void
      switchAccount: () => void
      minimizeWindow: () => void
    }
  }
}
