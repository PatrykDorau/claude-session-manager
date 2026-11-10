import { win32 } from 'node:path'
import { normalizePath } from './lock'
import type { JiraTicket, Session } from '../renderer/src/types'

const WORKTREE_DIR = /[\\/]\.claude[\\/]worktrees[\\/]/
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`, 'g')

const asText = (v: unknown): string => (typeof v === 'string' ? v : '')

export const parseSearch = (json: unknown): JiraTicket[] => {
  const issues = (json as { issues?: unknown })?.issues
  if (!Array.isArray(issues)) return []
  return issues.flatMap((i) => {
    const key = (i as { key?: unknown })?.key
    if (typeof key !== 'string') return []
    const fields = (i as { fields?: { summary?: unknown; status?: { name?: unknown }; priority?: { name?: unknown } } }).fields
    const priority = asText(fields?.priority?.name)
    return [{ key, summary: asText(fields?.summary), status: asText(fields?.status?.name), ...(priority ? { priority } : {}) }]
  })
}

export const startPrompt = (template: string, ticket: string, title: string): string =>
  template.replaceAll('{ticket}', ticket).replaceAll('{title}', title)

export const parseBgId = (out: string): string | null =>
  /backgrounded\s*·\s*([0-9a-f]+)\s*·/i.exec(out.replace(ANSI, ''))?.[1] ?? null

export const ticketPrefix = (key: string): string => key.split('-')[0].toUpperCase()

export const repoRoots = (sessions: Session[]): { path: string; name: string }[] => {
  const roots = new Map<string, string>()
  for (const s of sessions.filter((x) => x.projectPath)) {
    const match = WORKTREE_DIR.exec(s.projectPath)
    const root = match ? s.projectPath.slice(0, match.index) : s.projectPath
    if (!roots.has(normalizePath(root))) roots.set(normalizePath(root), root)
  }
  return [...roots.values()]
    .map((path) => ({ path, name: path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? path }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export const startArgs = (key: string, prompt: string, isExistingWorktree: boolean): string[] =>
  isExistingWorktree
    ? ['--bg', '--name', key, prompt]
    : ['--bg', '--worktree', key, '--name', key, prompt]

export const attachCommand = (sessionId: string): string => `claude attach ${sessionId.slice(0, 8)}`

export const claudeExeCandidates =(whereOut: string, home: string): string[] => {
  const lines = whereOut.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const exes = lines.filter((l) => l.toLowerCase().endsWith('.exe'))
  const fromCmd = lines
    .filter((l) => l.toLowerCase().endsWith('.cmd'))
    .map((l) => win32.join(win32.dirname(l), 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'))
  return [...exes, ...fromCmd, win32.join(home, '.local', 'bin', 'claude.exe')]
}

export const repoForProject = (projectPath: string, roots: { path: string; name: string }[]): string | null => {
  const name = projectPath.split('/').pop()?.toLowerCase() ?? ''
  return roots.find((r) => r.name.toLowerCase() === name)?.path ?? null
}

export const reviewArgs = (iid: number, url: string, isExistingWorktree: boolean): string[] =>
  startArgs(`MR-${iid}`, `/review-mr ${url}`, isExistingWorktree)

const COCKPIT = 'node C:/Users/ASSET-17300/.claude/skills/_shared/cockpit.js'

export const taskContext = (key: string, worktree: string, repo: string, now: Date): string => {
  const month = `${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`
  return [
    'Kontekst z Claude Cockpit:',
    `- Pracujesz w worktree ${worktree}. To jedyny folder tego zadania: tu tworzysz gałąź, edytujesz, uruchamiasz testy i serwer. Nie przełączaj gałęzi ani nie edytuj głównego checkoutu ${repo}.`,
    '- Gałąź twórz od origin/develop, chyba że zadanie w Jirze mówi inaczej. Nie pytaj o bazę.',
    `- Serwer i Chrome do repro i verify: ${COCKPIT} server --ticket ${key}, potem ${COCKPIT} chrome --ticket ${key} --url <url> (to zadanie ma własny Chrome; Twój Playwright MCP jest już na niego ustawiony). Nie proś mnie o ich uruchomienie.`,
    `- Wideo, kroki i test case'y zapisuj w C:\\Users\\ASSET-17300\\Desktop\\Opis zadan\\${month}\\${key}.`
  ].join('\n')
}
