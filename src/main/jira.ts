export function jiraApiUrl(browseBase: string, key: string): string {
  return `${new URL(browseBase).origin}/rest/api/2/issue/${key}?fields=status`
}

export function isAccepting(statusName: string | null, csvList: string): boolean {
  if (!statusName) return false
  const set = csvList
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return set.includes(statusName.toLowerCase())
}

export async function fetchIssueStatus(
  browseBase: string,
  token: string,
  key: string
): Promise<string | null> {
  try {
    const res = await fetch(jiraApiUrl(browseBase, key), {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    })
    if (!res.ok) return null
    const json = (await res.json()) as { fields?: { status?: { name?: unknown } } }
    const name = json?.fields?.status?.name
    return typeof name === 'string' ? name : null
  } catch {
    return null
  }
}
