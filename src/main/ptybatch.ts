export interface PtyBatcher {
  push: (id: string, chunk: string) => void
  flush: (id: string) => void
}

export const createPtyBatcher = (send: (id: string, data: string) => void, frameMs = 16): PtyBatcher => {
  const pending = new Map<string, string>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  const flush = (id: string): void => {
    const timer = timers.get(id)
    if (timer !== undefined) clearTimeout(timer)
    timers.delete(id)
    const data = pending.get(id)
    pending.delete(id)
    if (data !== undefined) send(id, data)
  }

  const push = (id: string, chunk: string): void => {
    pending.set(id, (pending.get(id) ?? '') + chunk)
    if (timers.has(id)) return
    const flushId = (): void => flush(id)
    timers.set(id, setTimeout(flushId, frameMs))
  }

  return { push, flush }
}
