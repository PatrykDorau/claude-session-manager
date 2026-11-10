import { parseSearch } from './tasks'
import type { JiraTicket, TicketDetail } from '../renderer/src/types'

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

export const descriptionText = (json: unknown): string | null => {
  const description = (json as { fields?: { description?: unknown } } | null)?.fields?.description
  return typeof description === 'string' && description.trim() ? description : null
}

export const fetchDescription = async (browseBase: string, token: string, key: string): Promise<string | null> => {
  try {
    const url = `${new URL(browseBase).origin}/rest/api/2/issue/${encodeURIComponent(key)}?fields=description`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
    return res.ok ? descriptionText(await res.json()) : null
  } catch {
    return null
  }
}

export const commentUrl = (browseBase: string, key: string): string =>
  `${new URL(browseBase).origin}/rest/api/2/issue/${encodeURIComponent(key)}/comment`

export const postComment = async (browseBase: string, token: string, key: string, body: string): Promise<boolean> => {
  try {
    const res = await fetch(commentUrl(browseBase, key), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ body })
    })
    return res.ok
  } catch {
    return false
  }
}

const text = (v: unknown): string => (typeof v === 'string' ? v : '')
const nameOf = (v: unknown, field: 'name' | 'displayName'): string =>
  text((v as Record<string, unknown> | null)?.[field])

export const parseTicketDetail = (json: unknown): TicketDetail | null => {
  const o = json as { key?: unknown; fields?: Record<string, any> } | null
  if (!o || typeof o.key !== 'string' || !o.fields) return null
  const f = o.fields
  const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
  return {
    key: o.key,
    summary: text(f.summary),
    description: text(f.description),
    status: nameOf(f.status, 'name'),
    type: nameOf(f.issuetype, 'name'),
    priority: nameOf(f.priority, 'name'),
    reporter: nameOf(f.reporter, 'displayName'),
    assignee: nameOf(f.assignee, 'displayName'),
    labels: list(f.labels).filter((l): l is string => typeof l === 'string'),
    fixVersions: list(f.fixVersions).map((v) => nameOf(v, 'name')).filter(Boolean),
    created: text(f.created),
    updated: text(f.updated),
    attachments: list(f.attachment).map((a: any) => ({ name: text(a?.filename), url: text(a?.content) })),
    comments: list(f.comment?.comments).map((c: any) => ({
      author: nameOf(c?.author, 'displayName'),
      created: text(c?.created),
      body: text(c?.body)
    }))
  }
}

export const fetchTicketDetail = async (browseBase: string, token: string, key: string): Promise<TicketDetail | null> => {
  try {
    const fields = 'summary,description,status,issuetype,priority,reporter,assignee,labels,fixVersions,created,updated,attachment,comment'
    const url = `${new URL(browseBase).origin}/rest/api/2/issue/${encodeURIComponent(key)}?fields=${fields}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
    return res.ok ? parseTicketDetail(await res.json()) : null
  } catch {
    return null
  }
}

export interface JiraTransition {
  id: string
  name: string
  to: string
}

export const transitionsUrl = (browseBase: string, key: string): string =>
  `${new URL(browseBase).origin}/rest/api/2/issue/${encodeURIComponent(key)}/transitions`

export const parseTransitions = (json: unknown): JiraTransition[] => {
  const list = (json as { transitions?: unknown } | null)?.transitions
  if (!Array.isArray(list)) return []
  return list.flatMap((t) => {
    const id = typeof t?.id === 'string' ? t.id : null
    const name = typeof t?.name === 'string' ? t.name : null
    if (!id || !name) return []
    return [{ id, name, to: typeof t.to?.name === 'string' ? t.to.name : name }]
  })
}

const jiraHeaders = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/json',
  'Content-Type': 'application/json'
})

export const fetchTransitions = async (browseBase: string, token: string, key: string): Promise<JiraTransition[] | null> => {
  try {
    const res = await fetch(transitionsUrl(browseBase, key), { headers: jiraHeaders(token) })
    return res.ok ? parseTransitions(await res.json()) : null
  } catch {
    return null
  }
}

export const doTransition = async (browseBase: string, token: string, key: string, id: string): Promise<boolean> => {
  try {
    const res = await fetch(transitionsUrl(browseBase, key), {
      method: 'POST',
      headers: jiraHeaders(token),
      body: JSON.stringify({ transition: { id } })
    })
    return res.ok
  } catch {
    return false
  }
}

export const searchIssues = async (
  browseBase: string,
  token: string,
  jql: string
): Promise<JiraTicket[] | null> => {
  try {
    const url = `${new URL(browseBase).origin}/rest/api/2/search?jql=${encodeURIComponent(jql)}&fields=summary,status,priority&maxResults=200`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    })
    if (!res.ok) return null
    return parseSearch(await res.json())
  } catch {
    return null
  }
}

export const parsePriority = (json: unknown): string | null => {
  const name = (json as { fields?: { priority?: { name?: unknown } } } | null)?.fields?.priority?.name
  return typeof name === 'string' && name ? name : null
}

export const fetchPriority = async (browseBase: string, token: string, key: string): Promise<string | null | undefined> => {
  try {
    const res = await fetch(`${new URL(browseBase).origin}/rest/api/2/issue/${encodeURIComponent(key)}?fields=priority`, {
      headers: jiraHeaders(token)
    })
    if (res.status === 404) return null
    return res.ok ? parsePriority(await res.json()) : undefined
  } catch {
    return undefined
  }
}
