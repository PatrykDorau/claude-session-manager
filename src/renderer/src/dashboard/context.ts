export const CONTEXT_WARN = 150_000
export const CONTEXT_DANGER = 250_000

export type ContextLevel = 'none' | 'ok' | 'warn' | 'danger'

export const contextLevel = (tokens: number | null): ContextLevel => {
  if (!tokens) return 'none'
  if (tokens >= CONTEXT_DANGER) return 'danger'
  if (tokens >= CONTEXT_WARN) return 'warn'
  return 'ok'
}

export const formatContext = (tokens: number | null): string => {
  if (tokens === null) return ''
  return tokens < 1000 ? String(tokens) : `${Math.round(tokens / 1000)}k`
}

export const handoffPath = (ticket: string, now: Date): string => {
  const month = `${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`
  return `C:\\Users\\ASSET-17300\\Desktop\\Opis zadan\\${month}\\${ticket}\\handoff.md`
}

export const handoffPrompt = (ticket: string, now: Date): string =>
  [
    `Zapisz (albo nadpisz) plik handoff.md w ${handoffPath(ticket, now)} — maksymalnie ok. 150 linii.`,
    `To przekazanie zadania ${ticket} nowej sesji, która nie zna tej rozmowy. Użyj skilla handoff i jego szablonu:`,
    'Cel, Gałąź i worktree, Następne kroki, Czeka na użytkownika, Decyzje, Zmienione pliki, Zrobione, Pułapki, Zakładki.',
    'Nie rób nic więcej.'
  ].join('\n')

export const IDLE_LARGE_TOKENS = 100_000
export const IDLE_LARGE_MS = 30 * 60_000

export const clearStartPrompt = (ticket: string, now: Date): string =>
  `Przeczytaj ${handoffPath(ticket, now)} według skilla handoff. Nie wykonuj kolejnego kroku — odpowiedz krótko, że jesteś gotowy, i czekaj, aż powiem, co robić.`

export const isIdleLarge = (s: { contextTokens: number | null; lastActive: number; status: string }, now: number): boolean =>
  (s.contextTokens ?? 0) >= IDLE_LARGE_TOKENS && now - s.lastActive >= IDLE_LARGE_MS && s.status !== 'working' && s.status !== 'waiting'

export type ClearPhase = 'none' | 'handoff' | 'blocked'

const isTurnOver = (status: string): boolean => status === 'idle' || status === 'checkout'

export const nextClearStep = (phase: ClearPhase, prev: string, status: string): { phase: ClearPhase; isClearNow: boolean } => {
  if (phase === 'none') return { phase, isClearNow: false }
  if (status === 'closed') return { phase: 'none', isClearNow: false }
  if (phase === 'handoff' && prev === 'working' && isTurnOver(status)) return { phase: 'none', isClearNow: true }
  if (phase === 'handoff' && status === 'waiting') return { phase: 'blocked', isClearNow: false }
  if (phase === 'blocked' && status === 'working') return { phase: 'handoff', isClearNow: false }
  if (phase === 'blocked' && status !== 'waiting') return { phase: 'none', isClearNow: false }
  return { phase, isClearNow: false }
}

export const modelTag = (model: string | null): 'O' | 'S' | 'H' | null => {
  const name = (model ?? '').toLowerCase()
  if (name.includes('opus')) return 'O'
  if (name.includes('sonnet')) return 'S'
  if (name.includes('haiku')) return 'H'
  return null
}
