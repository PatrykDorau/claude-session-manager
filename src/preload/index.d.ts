import { ElectronAPI } from '@electron-toolkit/preload'
import type { Session, TaskMeta, UsageResult } from '../renderer/src/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      onSessions: (cb: (s: Session[]) => void) => void
      onTasks: (cb: (t: Record<string, TaskMeta>) => void) => void
      openTaskFolder: (ticket: string) => void
      openMr: (ticket: string) => void
      setTaskWatched: (ticket: string, on: boolean) => void
      setTaskFinished: (ticket: string, on: boolean) => void
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
        ticketPrefixes: string
        isDockReserving: boolean
        isDockOnTop: boolean
      }
      setSettings: (patch: {
        jiraBase?: string
        jiraToken?: string
        jiraDoneStatuses?: string
        alwaysOnTop?: boolean
        clickAction?: string
        launchOnStartup?: boolean
        ticketPrefixes?: string
        isDockReserving?: boolean
        isDockOnTop?: boolean
      }) => void
      setFinished: (id: string, on: boolean) => void
      syncJira: () => Promise<void>
      listBranchTickets: (projectPath: string) => Promise<{ ticket: string; branch: string }[]>
      verifyTicket: (
        input: string
      ) => Promise<{ configured: boolean; status: string | null; code: string | null }>
      setTicket: (id: string, value: string | null) => void
      onOpenTicketPicker: (cb: (s: Session) => void) => void
      sessionMenu: (s: Session) => void
      switchAccount: () => void
      minimizeWindow: () => void
      onResumeFailed: (cb: (info: { label: string; command: string }) => void) => void
      installHooks: () => { ok: boolean; error?: string }
      onPlayAlert: (cb: () => void) => void
      toggleDock: () => void
      getDockState: () => { isDocked: boolean; edge: 'left' | 'right' }
      onDockState: (cb: (s: { isDocked: boolean; edge: 'left' | 'right' }) => void) => void
      onMenuState: (cb: (open: boolean) => void) => void
    }
  }
}
