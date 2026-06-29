const TICKET = /[A-Z][A-Z0-9]+-\d+/

export function extractTicket(
  gitBranch: string | null,
  firstPrompt: string | null
): string | null {
  return gitBranch?.match(TICKET)?.[0] ?? firstPrompt?.match(TICKET)?.[0] ?? null
}
