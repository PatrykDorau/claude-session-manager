import { ElectronAPI } from '@electron-toolkit/preload'
import type { Session } from '../renderer/src/types'

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
    }
  }
}
