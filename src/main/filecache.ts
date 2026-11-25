interface Entry<T> {
  size: number
  mtimeMs: number
  value: T
}

export const createFileCache = <T>() => {
  const entries = new Map<string, Entry<T>>()

  const get = async (file: string, size: number, mtimeMs: number, load: () => Promise<T>): Promise<T> => {
    const cached = entries.get(file)
    if (cached && cached.size === size && cached.mtimeMs === mtimeMs) return cached.value
    const value = await load()
    entries.set(file, { size, mtimeMs, value })
    return value
  }

  const prune = (files: Set<string>): void => {
    for (const file of [...entries.keys()]) if (!files.has(file)) entries.delete(file)
  }

  return { get, prune }
}

export const isSameSessions = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)
