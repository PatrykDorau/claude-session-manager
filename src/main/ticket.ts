const TICKET = /[A-Z][A-Z0-9]+-\d+/

export function branchTicket(gitBranch: string | null): string | null {
  return gitBranch?.match(TICKET)?.[0] ?? null
}

export function openingTicket(userTexts: string[]): string | null {
  for (const t of userTexts) {
    const m = t.match(TICKET)
    if (m) return m[0]
  }
  return null
}
