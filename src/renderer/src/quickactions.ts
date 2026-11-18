import type { QuickAction, Stage } from './types'

export type PlaceholderName = 'ticket' | 'title' | 'branch' | 'worktree' | 'mr' | 'mrUrl' | 'server'

export const PLACEHOLDERS: { name: PlaceholderName; label: string }[] = [
  { name: 'ticket', label: 'ticket key' },
  { name: 'title', label: 'ticket or MR title' },
  { name: 'branch', label: "the session's git branch" },
  { name: 'worktree', label: "the session's folder" },
  { name: 'mr', label: 'MR number, e.g. !42' },
  { name: 'mrUrl', label: 'MR link' },
  { name: 'server', label: 'dev server address' }
]

const PLACEHOLDER = /\{(ticket|title|branch|worktree|mr|mrUrl|server)\}/g

export const fillPrompt = (prompt: string, values: Partial<Record<PlaceholderName, string | null>>): string =>
  prompt.replace(PLACEHOLDER, (match, name: PlaceholderName) => values[name] || match)

export const actionsForStage = (actions: QuickAction[], stage: Stage | null): QuickAction[] =>
  actions.filter((a) => !a.stages?.length || (stage !== null && a.stages.includes(stage)))
