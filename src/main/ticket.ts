const TICKET = /[A-Z][A-Z0-9]+-\d+/
const TICKET_ALL = /\b[A-Z][A-Z0-9]+-\d+\b/g
const NOT_TICKETS = ['UTF', 'SHA', 'ISO', 'RFC', 'CVE', 'ES', 'HTTP', 'TLS', 'MD']

export function branchTicket(gitBranch: string | null): string | null {
  return gitBranch?.match(TICKET)?.[0] ?? null
}

export function findTicket(text: string | null, prefixes: string[]): string | null {
  for (const hit of text?.matchAll(TICKET_ALL) ?? []) {
    const m = hit[0]
    const before = text?.[(hit.index ?? 0) - 1]
    const after = text?.[(hit.index ?? 0) + m.length]
    const isPathSegment = before === '\\' || (before === '/' && (after === '/' || after === '\\'))
    if (isPathSegment) continue
    const prefix = m.slice(0, m.lastIndexOf('-'))
    const isAllowed = prefixes.length
      ? prefixes.some((p) => prefix.startsWith(p))
      : !NOT_TICKETS.includes(prefix)
    if (isAllowed) return m
  }
  return null
}

export function parsePrefixes(csv: string): string[] {
  return csv
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
}
