import { spawn, type IPty } from 'node-pty'

export interface PtyHost {
  open: (sessionId: string, exe: string, args: string[], cwd: string, cols: number, rows: number) => void
  write: (sessionId: string, data: string) => void
  resize: (sessionId: string, cols: number, rows: number) => void
  close: (sessionId: string) => void
  closeAll: () => void
  isOpen: (sessionId: string) => boolean
  lastOutputAt: (sessionId: string) => number | null
}

const ptyEnv = (): Record<string, string> => {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && k !== 'NO_COLOR') env[k] = v
  return env
}

export const createPtyHost = (send: (channel: string, ...args: unknown[]) => void): PtyHost => {
  const ptys = new Map<string, IPty>()
  const outputAt = new Map<string, number>()

  const close = (sessionId: string): void => {
    const p = ptys.get(sessionId)
    ptys.delete(sessionId)
    outputAt.delete(sessionId)
    try {
      p?.kill()
    } catch {
      return
    }
  }

  const open = (sessionId: string, exe: string, args: string[], cwd: string, cols: number, rows: number): void => {
    close(sessionId)
    const p = spawn(exe, args, { name: 'xterm-256color', cols, rows, cwd, env: ptyEnv() })
    ptys.set(sessionId, p)
    p.onData((chunk) => {
      outputAt.set(sessionId, Date.now())
      send('pty-data', sessionId, chunk)
    })
    p.onExit(({ exitCode }) => {
      if (ptys.get(sessionId) !== p) return
      ptys.delete(sessionId)
      outputAt.delete(sessionId)
      send('pty-exit', sessionId, exitCode)
    })
  }

  const write = (sessionId: string, data: string): void => ptys.get(sessionId)?.write(data)

  const resize = (sessionId: string, cols: number, rows: number): void => {
    try {
      if (cols > 0 && rows > 0) ptys.get(sessionId)?.resize(cols, rows)
    } catch {
      return
    }
  }

  const closeAll = (): void => [...ptys.keys()].forEach(close)
  const isOpen = (sessionId: string): boolean => ptys.has(sessionId)
  const lastOutputAt = (sessionId: string): number | null => outputAt.get(sessionId) ?? null

  return { open, write, resize, close, closeAll, isOpen, lastOutputAt }
}
