export interface CodeTab {
  path: string
  line: number
  topLine: number
  usedAt: number
}

export const TAB_LIMIT = 12

export const openTab = (tabs: CodeTab[], path: string, now: number): CodeTab[] => {
  if (tabs.some((t) => t.path === path)) return tabs.map((t) => (t.path === path ? { ...t, usedAt: now } : t))
  const next = [...tabs, { path, line: 1, topLine: 0, usedAt: now }]
  if (next.length <= TAB_LIMIT) return next
  const oldest = tabs.reduce((a, b) => (b.usedAt < a.usedAt ? b : a))
  return next.filter((t) => t.path !== oldest.path)
}

export const rememberTab = (tabs: CodeTab[], path: string, line: number, topLine: number): CodeTab[] =>
  tabs.map((t) => (t.path === path ? { ...t, line, topLine } : t))

export const closeTab = (tabs: CodeTab[], path: string): { tabs: CodeTab[]; next: string | null } => {
  const index = tabs.findIndex((t) => t.path === path)
  const rest = tabs.filter((t) => t.path !== path)
  if (index < 0) return { tabs, next: null }
  return { tabs: rest, next: rest[index]?.path ?? rest[index - 1]?.path ?? null }
}

export const tabScope = (cwd: string | null, source: string | null): string => `${cwd ?? ''}|${source ?? ''}`
