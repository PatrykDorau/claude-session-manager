import { win32 } from 'node:path'
import { normalizePath } from './lock'
import type { JiraTicket, Session } from '../renderer/src/types'
import type { Proposal } from './factory'

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
    `Jesteś oceniającym w pętli zewnętrznej Claude Cockpit. Pracujesz w ${root}/.claude/factory.`,
    `Do oceny czytaj pliki digests/${day}/*.json, rubric.md i dismissed.json. Poza nimi czytaj tylko pliki docelowe propozycji: ${root}/.claude/CLAUDE.md i pliki w ${root}/.claude/skills/. Nie czytaj surowych transkryptów ani ${root}/.claude/projects.`,
    '1. Oceń każdą sesję według rubric.md (każde kryterium 1–5).',
    '2. Pogrupuj błędy, które powtarzają się w 2 lub więcej sesjach.',
    `3. Napisz raport w Markdown: tabela sesji (sesja, ticket, tokeny, oceny), grupy powtarzających się błędów i trend tokenów.`,
    '   Dodaj sekcję ## Zużycie: 5 sesji z największym tokensRead, tokeny według etapów (pole stages), rozmiar i ryzyko (size, risk) wobec etapów faktycznie uruchomionych (wypisz niezgodności), udział tokenów sesji na Opusie, podejrzane oceny ryzyka (risk low, a są poprawki zachowania od użytkownika albo kilka sesji na tym samym tickecie) i 1–3 wnioski. Zmiana progów decidera rozmiaru to zwykła propozycja dla ~/.claude/CLAUDE.md.',
    `4. Na samym końcu odpowiedzi dodaj jeden blok \`\`\`json z propozycjami: tablicą obiektów { "id", "target", "title", "evidence": string[], "find", "replace" }; id unikalne, np. ${day}-1. target to ~/.claude/CLAUDE.md albo plik w ~/.claude/skills/. Przed dodaniem każdej propozycji przeczytaj plik docelowy i skopiuj z niego pole find dosłownie, tak aby występowało w nim dokładnie raz. Pomiń wszystko, co jest już w dismissed.json. Gdy nie ma propozycji, wypisz [].`,
    `Cała odpowiedź to raport, a po nim blok json. Nie zapisuj żadnych plików — Cockpit zapisze raport w reports/${day}.md i propozycje w proposals/${day}.json.`
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

export const factoryTestArgs = (p: Proposal): string[] => [
  '--bg',
  '--name',
  `factory-${p.id}`,
  `Użyj superpowers:writing-skills: przetestuj tę zmianę (baseline i green) zanim ją zastosujesz: ${JSON.stringify(p, null, 2)}`
]
