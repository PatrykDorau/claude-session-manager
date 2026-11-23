import { win32 } from 'node:path'
import { normalizePath } from './lock'
import type { JiraTicket, Session } from '../renderer/src/types'
import { METRIC_KEYS, type Proposal } from './insights'

const WORKTREE_DIR = /[\\/]\.claude[\\/]worktrees[\\/]/
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`, 'g')

const asText = (v: unknown): string => (typeof v === 'string' ? v : '')

export const parseSearch = (json: unknown): JiraTicket[] => {
  const issues = (json as { issues?: unknown })?.issues
  if (!Array.isArray(issues)) return []
  return issues.flatMap((i) => {
    const key = (i as { key?: unknown })?.key
    if (typeof key !== 'string') return []
    const fields = (i as { fields?: { summary?: unknown; status?: { name?: unknown }; priority?: { name?: unknown }; issuetype?: { name?: unknown } } }).fields
    const priority = asText(fields?.priority?.name)
    const type = asText(fields?.issuetype?.name)
    return [{ key, summary: asText(fields?.summary), status: asText(fields?.status?.name), ...(priority ? { priority } : {}), ...(type ? { type } : {}) }]
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

export const addressArgs = (input: { iid: number; url: string; ticket: string; folder: string | null; repo: string; branch: string; handoff: string | null; model: 'sonnet' | 'opus' }): string[] => {
  const where = input.folder
    ? `Pracuj w ${input.folder}: to worktree z gałęzią ${input.branch}. Nie przełączaj gałęzi w głównym checkoucie.`
    : `Gałąź ${input.branch} nie jest wyciągnięta w żadnym worktree. W ${input.repo} uruchom git worktree add .claude/worktrees/${input.ticket} ${input.branch} i pracuj tylko tam, bez przełączania głównego checkoutu.`
  const start = input.handoff
    ? `Najpierw przeczytaj ${input.handoff}.`
    : 'handoff.md nie istnieje; pracuj z diffu MR i wątków.'
  const request = `Użyj skilla address-mr-comments dla mojego MR !${input.iid} (${input.url}): odnieś się do każdego nierozwiązanego wątku od ludzi, popraw kod tam, gdzie uwaga jest trafna, i przygotuj krótkie odpowiedzi, a wyjaśnienie każdej zapisz osobno tylko dla mnie (nie w draft note). Najpierw pokaż mi wszystko i poczekaj na moje potwierdzenie. Niczego nie publikuj w GitLabie.`
  return ['--bg', '--model', input.model, '--name', `${input.ticket}-cr`, `${where} ${start} ${request}`]
}

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

export const scoreArgs = (day: string, root: string): string[] => {
  const prompt = [
    `Jesteś analitykiem pętli zewnętrznej Claude Cockpit. Pracujesz w ${root}/.claude/insights.`,
    `Czytaj tylko: metrics/${day}.json (metryki dnia), metrics/*.json (ostatnie 14 dni), incidents/${day}.json (fragmenty incydentów), applied.json, dismissed.json, findings/<poprzedni dzień>.json, guide.md. Poza nimi czytaj tylko pliki docelowe propozycji: ${root}/.claude/CLAUDE.md i pliki w ${root}/.claude/skills/. Nie czytaj surowych transkryptów ani ${root}/.claude/projects.`,
    `Klucze metryk: ${METRIC_KEYS.join(', ')}.`,
    '1. Znajdź najważniejsze problemy dnia według guide.md, metryk i incydentów. W finding.sessions i finding.incidents wpisz id z plików. Pole kind: "claude" = do naprawy w skillach/CLAUDE.md, "you" = nawyk użytkownika (wskazówka, bez zmiany pliku).',
    '2. Dla każdej propozycji z applied.json podaj werdykt (improved, no-change, worse, too-early) na podstawie wartości jej metryki z 7 dni przed i po dniu zastosowania.',
    '3. Zaproponuj poprawki w ~/.claude/CLAUDE.md lub ~/.claude/skills/. Przed dodaniem propozycji przeczytaj plik docelowy i skopiuj pole find dosłownie, tak aby występowało w nim dokładnie raz. Pomiń to, co jest w dismissed.json.',
    'Limity: headline 1 zdanie; najwyżej 5 findings; cause do 2 zdań; why i expected po 1 zdaniu; detail w tips do 2 zdań.',
    `Odpowiedz po polsku. Cała odpowiedź to dokładnie jeden blok \`\`\`json w kształcie { "headline": string, "findings": [{ "id", "kind": "claude"|"you", "severity": "high"|"medium"|"low", "title", "cause", "metric", "sessions": string[], "incidents": string[] }], "proposals": [{ "id", "finding", "target", "title", "evidence": string[], "find", "replace", "why", "expected", "metric" }], "tips": [{ "id", "finding", "title", "detail" }], "effects": [{ "proposal", "verdict", "note" }] }. Id propozycji unikalne, np. ${day}-1; finding wskazuje id findingu. Puste listy zapisz jako [].`,
    `Nie zapisuj żadnych plików — Cockpit zapisze wynik w findings/${day}.json.`
  ].join('\n')
  const claudeDir = `//${root.charAt(0).toLowerCase()}${root.slice(2)}/.claude`
  return [
    '-p',
    prompt,
    '--model',
    'sonnet',
    '--permission-mode',
    'dontAsk',
    '--setting-sources',
    'local',
    '--strict-mcp-config',
    '--tools',
    'Read',
    'Glob',
    'Grep',
    '--allowedTools',
    'Read(./**)',
    `Read(${claudeDir}/CLAUDE.md)`,
    `Read(${claudeDir}/skills/**)`,
    '--add-dir',
    `${root}/.claude/skills`
  ]
}

export const insightsTestArgs = (p: Proposal): string[] => [
  '--bg',
  '--name',
  `insights-${p.id}`,
  `Użyj superpowers:writing-skills: przetestuj tę zmianę (baseline i green) zanim ją zastosujesz: ${JSON.stringify(p, null, 2)}`
]

export const warmUpTask = async (steps: {
  waitFolder: () => Promise<boolean>
  link: () => void
  startServer: () => Promise<{ url?: string; error?: string }>
  waitServer: (url: string) => Promise<boolean>
  openChrome: (url: string) => Promise<unknown>
  log: (message: string) => void
}): Promise<void> => {
  try {
    if (!(await steps.waitFolder())) {
      steps.log('the worktree folder did not appear')
      return
    }
    steps.link()
    const server = await steps.startServer()
    if (server.error || !server.url) {
      steps.log(server.error ?? 'the dev server reported no URL')
      return
    }
    if (!(await steps.waitServer(server.url))) {
      steps.log('the dev server did not start answering')
      return
    }
    await steps.openChrome(server.url)
  } catch (e) {
    steps.log(String(e))
  }
}

const VIDEO_EXTENSIONS = ['.webm', '.mp4', '.mov']
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif']

export const mediaFiles = (names: string[]): { name: string; kind: 'video' | 'image' }[] => {
  const kindOf = (name: string): 'video' | 'image' | null => {
    const ext = win32.extname(name).toLowerCase()
    if (VIDEO_EXTENSIONS.includes(ext)) return 'video'
    return IMAGE_EXTENSIONS.includes(ext) ? 'image' : null
  }
  const byName = (a: string, b: string): number => a.localeCompare(b, undefined, { sensitivity: 'base' })
  const pick = (kind: 'video' | 'image'): { name: string; kind: 'video' | 'image' }[] =>
    names.filter((n) => kindOf(n) === kind).sort(byName).map((name) => ({ name, kind }))
  return [...pick('video'), ...pick('image')]
}
