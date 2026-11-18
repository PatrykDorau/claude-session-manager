export const AUTO_HANDOFF_TOKENS = 150_000
export const AUTO_HANDOFF_IDLE_MS = 45 * 60_000

export interface HandoffCandidate {
  ticket: string | null
  isLive: boolean
  status: string
  contextTokens: number | null
  lastActive: number
  liveSince: number
}

export const isHandoffDue = (s: HandoffCandidate, handoffAt: number | null, now: number): boolean =>
  !!s.ticket &&
  s.isLive &&
  s.status !== 'working' &&
  s.status !== 'waiting' &&
  (s.contextTokens ?? 0) >= AUTO_HANDOFF_TOKENS &&
  now - s.lastActive >= AUTO_HANDOFF_IDLE_MS &&
  now - s.liveSince >= AUTO_HANDOFF_IDLE_MS &&
  (handoffAt === null || handoffAt < s.lastActive)

export const autoHandoffPrompt = (path: string, ticket: string): string =>
  [
    `Zapisz (albo nadpisz) plik handoff.md w ${path} — maksymalnie ok. 150 linii.`,
    `To przekazanie zadania ${ticket} nowej sesji, która nie zna tej rozmowy. Użyj skilla handoff i jego szablonu:`,
    'Cel, Gałąź i worktree, Następne kroki, Czeka na użytkownika, Decyzje, Zmienione pliki, Zrobione, Pułapki, Zakładki.',
    'Nie rób nic więcej.'
  ].join('\n')

export const autoHandoffArgs = (sessionId: string, prompt: string, addDir: string): string[] => [
  '-p',
  prompt,
  '--resume',
  sessionId,
  '--fork-session',
  '--no-session-persistence',
  '--model',
  'sonnet',
  '--permission-mode',
  'acceptEdits',
  '--add-dir',
  addDir
]
