export function jiraApiUrl(browseBase: string, key: string): string {
  return `${new URL(browseBase).origin}/rest/api/2/issue/${key}?fields=status,summary`
}

export function isAccepting(statusName: string | null, csvList: string): boolean {
  if (!statusName) return false
  const set = csvList
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return set.includes(statusName.toLowerCase())
}

export interface JiraIssue {
  status: string
  summary: string | null
}

export async function fetchIssue(
  browseBase: string,
  token: string,
  key: string
): Promise<JiraIssue | null> {
  try {
    const res = await fetch(jiraApiUrl(browseBase, key), {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    })
    if (!res.ok) return null
    const json = (await res.json()) as { fields?: { status?: { name?: unknown }; summary?: unknown } }
    const name = json?.fields?.status?.name
    const summary = json?.fields?.summary
    return typeof name === 'string'
      ? { status: name, summary: typeof summary === 'string' ? summary : null }
      : null
  } catch {
    return null
  }
}
