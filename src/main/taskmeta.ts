import { STAGES, type Stage } from '../renderer/src/types'
import { isAccepting } from './jira'

const monthKey = (month: string): number => {
  const [mm, yyyy] = month.split('-').map(Number)
  return (yyyy || 0) * 100 + (mm || 0)
}

export function findTaskFolder(
  entries: { month: string; names: string[] }[],
  ticket: string
): { month: string; name: string } | null {
  const sorted = [...entries].sort((a, b) => monthKey(b.month) - monthKey(a.month))
  for (const { month, names } of sorted) {
    const name = names.find((n) => n === ticket) ?? names.find((n) => n.startsWith(ticket + '.'))
    if (name) return { month, name }
  }
  return null
}

export function folderStages(names: string[]): Stage[] {
  const found = new Set<Stage>()
  for (const n of names) {
    if (/^repro.*\.webm$/i.test(n)) found.add('repro')
    else if (/^fix.*\.webm$/i.test(n)) found.add('verify')
    else if (n.toLowerCase() === 'test-case.md') found.add('qa')
  }
  return STAGES.filter((s) => found.has(s))
}

export function mrSearchUrl(remote: string, ticket: string): string | null {
  const r = remote.trim()
  const m =
    r.match(/^[\w.-]+@([\w.-]+):(.+?)(?:\.git)?\/?$/) ??
    r.match(/^https?:\/\/(?:[^@/]+@)?([\w.-]+(?::\d+)?)\/(.+?)(?:\.git)?\/?$/)
  if (!m) return null
  return `https://${m[1]}/${m[2]}/-/merge_requests?scope=all&state=all&search=${encodeURIComponent(ticket)}`
}

export function taskFinished(
  ticket: string,
  jiraStatus: string | null,
  accepting: string,
  finishedTickets: string[],
  optOut: string[]
): boolean {
  if (finishedTickets.includes(ticket)) return true
  if (optOut.includes(ticket)) return false
  return isAccepting(jiraStatus, accepting)
}

export function highestStage(stages: Stage[]): Stage | null {
  const set = new Set(stages)
  return [...STAGES].reverse().find((s) => set.has(s)) ?? null
}
