export interface CachedFile<S> {
  text: string
  baseText: string
  state: S | null
}

export interface FileCache<S> {
  identity: string
  entries: Map<string, CachedFile<S>>
}

export const emptyFileCache = <S>(): FileCache<S> => ({ identity: '', entries: new Map() })

type IdentityPart = string | boolean | null | undefined

const orNull = (part: IdentityPart): string | boolean | null => part ?? null

export const fileCacheIdentity = (parts: IdentityPart[]): string =>
  JSON.stringify(parts.map(orNull))

export const readFileCache = <S>(
  cache: FileCache<S>,
  identity: string,
  path: string
): CachedFile<S> | null => (cache.identity === identity ? (cache.entries.get(path) ?? null) : null)

export const writeFileCache = <S>(
  cache: FileCache<S>,
  identity: string,
  path: string,
  file: CachedFile<S>,
  limit: number
): FileCache<S> => {
  const entries = new Map(cache.identity === identity ? cache.entries : [])
  entries.delete(path)
  entries.set(path, file)
  const overflow = [...entries.keys()].slice(0, Math.max(entries.size - limit, 0))
  for (const key of overflow) entries.delete(key)
  return { identity, entries }
}

export const dropFileCache = <S>(cache: FileCache<S>, path: string): FileCache<S> => {
  const entries = new Map(cache.entries)
  entries.delete(path)
  return { identity: cache.identity, entries }
}

export const isFreshFile = <S>(file: CachedFile<S>, diskText: string | null | undefined): boolean =>
  file.text === diskText
