export interface OnDemandWriterDeps {
  isOpen: (id: string) => boolean
  open: (id: string) => Promise<boolean>
  write: (id: string, data: string) => void
}

export interface OnDemandWriter {
  write: (id: string, data: string) => void
  whenFlushed: (id: string) => Promise<void>
}

export const createOnDemandWriter = ({ isOpen, open, write }: OnDemandWriterDeps): OnDemandWriter => {
  const queued = new Map<string, string[]>()
  const flushes = new Map<string, Promise<void>>()
  const isNotReady = (): boolean => false

  const flush = async (id: string): Promise<void> => {
    const isReady = await open(id).catch(isNotReady)
    const items = queued.get(id) ?? []
    queued.delete(id)
    flushes.delete(id)
    if (!isReady) return
    const writeItem = (data: string): void => write(id, data)
    items.forEach(writeItem)
  }

  const writeOnDemand = (id: string, data: string): void => {
    const items = queued.get(id)
    if (items) {
      items.push(data)
      return
    }
    if (isOpen(id)) {
      write(id, data)
      return
    }
    queued.set(id, [data])
    flushes.set(id, flush(id))
  }

  const whenFlushed = (id: string): Promise<void> => flushes.get(id) ?? Promise.resolve()

  return { write: writeOnDemand, whenFlushed }
}
