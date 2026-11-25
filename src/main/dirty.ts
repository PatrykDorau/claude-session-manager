export const dirtyTargets = (
  known: [string, string][],
  wanted: Set<string>,
  isExisting: (path: string) => boolean
): [string, string][] => {
  const isTarget = ([key, path]: [string, string]): boolean => wanted.has(key) && isExisting(path)
  return known.filter(isTarget)
}

export const mergeDirty = <T>(
  prev: Record<string, T>,
  next: Record<string, T>,
  isExistingKey: (key: string) => boolean
): Record<string, T> => {
  const isKept = ([key]: [string, T]): boolean => isExistingKey(key)
  return Object.fromEntries(Object.entries({ ...prev, ...next }).filter(isKept))
}

export const isAttachedByCache = async (
  cached: Map<string, number>,
  shortId: string,
  fetchFresh: () => Promise<Map<string, number>>
): Promise<{ isAttached: boolean; attaches: Map<string, number> }> => {
  if (cached.has(shortId)) return { isAttached: true, attaches: cached }
  const attaches = await fetchFresh()
  return { isAttached: attaches.has(shortId), attaches }
}
