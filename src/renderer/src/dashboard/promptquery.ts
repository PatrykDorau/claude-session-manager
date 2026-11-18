import type { PromptEntry } from '../types'

export const searchPrompts = (entries: PromptEntry[], query: string, limit = 50): PromptEntry[] => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const isMatch = (e: PromptEntry): boolean => {
    const haystack = `${e.text} ${e.ticket ?? ''} ${e.project}`.toLowerCase()
    return words.every((w) => haystack.includes(w))
  }
  return (words.length ? entries.filter(isMatch) : entries).slice(0, limit)
}
