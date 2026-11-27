export type AppShortcut = 'prompts' | 'dispatcher' | null

export const appShortcut = (e: { key: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }): AppShortcut => {
  if (!e.ctrlKey || e.altKey || e.metaKey) return null
  const key = e.key.toLowerCase()
  if (!e.shiftKey && key === 'k') return 'prompts'
  if (e.shiftKey && key === 'd') return 'dispatcher'
  return null
}
