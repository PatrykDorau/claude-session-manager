import { spawn, type IPty } from 'node-pty'
import { createPtyBatcher } from './ptybatch'

export interface PtyHost {
  open: (sessionId: string, exe: string, args: string[], cwd: string, cols: number, rows: number) => void
  write: (sessionId: string, data: string) => void
  resize: (sessionId: string, cols: number, rows: number) => void
  close: (sessionId: string) => void
  closeAll: () => void
  isOpen: (sessionId: string) => boolean
  lastOutputAt: (sessionId: string) => number | null
  lastInputAt: (sessionId: string) => number | null
  touch: (sessionId: string) => void
  lastUseAt: (sessionId: string) => number | null
  ids: () => string[]
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
  const inputAt = new Map<string, number>()
  const useAt = new Map<string, number>()
  const keyOf = new Map<IPty, string>()

  const sendData = (id: string, data: string): void => send('pty-data', id, data)
  const batcher = createPtyBatcher(sendData)

  const close = (sessionId: string): void => {
    batcher.flush(sessionId)
    const p = ptys.get(sessionId)
    ptys.delete(sessionId)
    outputAt.delete(sessionId)
    inputAt.delete(sessionId)
    useAt.delete(sessionId)
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
    useAt.set(sessionId, Date.now())
    p.onData((chunk) => {
      const key = keyOf.get(p)
      if (!key) return
      outputAt.set(key, Date.now())
      batcher.push(key, chunk)
    })
    p.onExit(({ exitCode }) => {
      const key = keyOf.get(p)
      if (!key || ptys.get(key) !== p) return
      batcher.flush(key)
      ptys.delete(key)
      outputAt.delete(key)
      inputAt.delete(key)
      useAt.delete(key)
      keyOf.delete(p)
      send('pty-exit', key, exitCode)
    })
  }

  const write = (sessionId: string, data: string): void => {
    const p = ptys.get(sessionId)
    if (!p) return
    inputAt.set(sessionId, Date.now())
    useAt.set(sessionId, Date.now())
    p.write(data)
  }

  const touch = (sessionId: string): void => {
    if (ptys.has(sessionId)) useAt.set(sessionId, Date.now())
  }

  const resize = (sessionId: string, cols: number, rows: number): void => {
    touch(sessionId)
    try {
      if (cols > 0 && rows > 0) ptys.get(sessionId)?.resize(cols, rows)
    } catch {
      return
    }
  }

  const closeAll = (): void => [...ptys.keys()].forEach(close)
  const isOpen = (sessionId: string): boolean => ptys.has(sessionId)
  const lastOutputAt = (sessionId: string): number | null => outputAt.get(sessionId) ?? null
  const lastInputAt = (sessionId: string): number | null => inputAt.get(sessionId) ?? null
  const lastUseAt = (sessionId: string): number | null => useAt.get(sessionId) ?? null
  const ids = (): string[] => [...ptys.keys()]

  const rekey = (from: string, to: string): void => {
    const p = ptys.get(from)
    if (!p || ptys.has(to)) return
    batcher.flush(from)
    ptys.delete(from)
    ptys.set(to, p)
    keyOf.set(p, to)
    const at = outputAt.get(from)
    outputAt.delete(from)
    if (at !== undefined) outputAt.set(to, at)
    const inAt = inputAt.get(from)
    inputAt.delete(from)
    if (inAt !== undefined) inputAt.set(to, inAt)
    const usedAt = useAt.get(from)
    useAt.delete(from)
    if (usedAt !== undefined) useAt.set(to, usedAt)
  }

  return { open, write, resize, close, closeAll, isOpen, lastOutputAt, lastInputAt, touch, lastUseAt, ids, rekey }
}
