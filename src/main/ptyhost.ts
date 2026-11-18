import { spawn, type IPty } from 'node-pty'

export interface PtyHost {
  open: (sessionId: string, exe: string, args: string[], cwd: string, cols: number, rows: number) => void
  write: (sessionId: string, data: string) => void
  resize: (sessionId: string, cols: number, rows: number) => void
  close: (sessionId: string) => void
  closeAll: () => void
  isOpen: (sessionId: string) => boolean
  lastOutputAt: (sessionId: string) => number | null
  rekey: (from: string, to: string) => void
}

const ptyEnv = (): Record<string, string> => {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && k !== 'NO_COLOR') env[k] = v
  return env
}

export const createPtyHost = (send: (channel: string, ...args: unknown[]) => void): PtyHost => {
  const ptys = new Map<string, IPty>()
  const outputAt = new Map<string, number>()
  const keyOf = new Map<IPty, string>()

  const close = (sessionId: string): void => {
    const p = ptys.get(sessionId)
    ptys.delete(sessionId)
    outputAt.delete(sessionId)
    if (p) keyOf.delete(p)
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
    keyOf.set(p, sessionId)
    p.onData((chunk) => {
      const key = keyOf.get(p)
      if (!key) return
      outputAt.set(key, Date.now())
      send('pty-data', key, chunk)
    })
    p.onExit(({ exitCode }) => {
      const key = keyOf.get(p)
      if (!key || ptys.get(key) !== p) return
      ptys.delete(key)
      outputAt.delete(key)
      keyOf.delete(p)
      send('pty-exit', key, exitCode)
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

  const rekey = (from: string, to: string): void => {
    const p = ptys.get(from)
    if (!p || ptys.has(to)) return
    ptys.delete(from)
    ptys.set(to, p)
    keyOf.set(p, to)
    const at = outputAt.get(from)
    outputAt.delete(from)
    if (at !== undefined) outputAt.set(to, at)
  }

  return { open, write, resize, close, closeAll, isOpen, lastOutputAt, rekey }
}
