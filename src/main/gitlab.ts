import { branchTicket, findTicket } from './ticket'
import type { MrFile, MrItem, MrReviewState, MrRow } from '../renderer/src/types'

const asText = (v: unknown): string => (typeof v === 'string' ? v : '')
const asNumber = (v: unknown): number | null => (typeof v === 'number' ? v : null)

export const mrKey = (projectId: number, iid: number): string => `${projectId}!${iid}`

const mrItem = (t: any, projectId: number | null, projectPath: string, projectName: string): MrItem[] => {
  const iid = asNumber(t?.iid)
  if (projectId === null || iid === null) return []
  const rawTitle = asText(t.title)
  const draftPrefix = /^\s*(draft|wip)\s*:\s*/i
  const title = rawTitle.replace(draftPrefix, '')
  const isDraft = t.draft === true || t.work_in_progress === true || draftPrefix.test(rawTitle)
  const sourceBranch = asText(t.source_branch)
  return [
    {
      key: mrKey(projectId, iid),
      projectId,
      projectPath,
      projectName,
      iid,
      title,
      author: asText(t.author?.name),
      sourceBranch,
      targetBranch: asText(t.target_branch),
      sha: asText(t.sha),
      url: asText(t.web_url),
      description: asText(t.description),
      updatedAt: asText(t.updated_at),
      ticket: branchTicket(sourceBranch) ?? findTicket(title, []),
      hasOpenThreads: t.blocking_discussions_resolved === false,
      notes: asNumber(t.user_notes_count) ?? 0,
      openThreads: 0,
      approvals: 0,
      isDraft
    }
  ]
}

const toItem = (todo: any): MrItem[] =>
  todo?.target_type === 'MergeRequest'
    ? mrItem(
        todo.target,
        asNumber(todo.target?.project_id) ?? asNumber(todo.project?.id),
        asText(todo.project?.path_with_namespace),
        asText(todo.project?.name)
      )
    : []

const reviewItem = (mr: any): MrItem[] => {
  const projectPath = asText(mr?.references?.full).split('!')[0]
  return mrItem(mr, asNumber(mr?.project_id), projectPath, projectPath.split('/').pop() ?? '')
}

export const parseReviewMrs = (json: unknown): MrItem[] => (Array.isArray(json) ? json.flatMap(reviewItem) : [])

export const mergeMrs = (first: MrItem[], second: MrItem[]): MrItem[] => {
  const keys = new Set(first.map((m) => m.key))
  return [...first, ...second.filter((m) => !keys.has(m.key))]
}

export const parseTodos = (json: unknown): MrItem[] => {
  if (!Array.isArray(json)) return []
  const seen = new Set<string>()
  return json.flatMap(toItem).filter((item) => {
    if (seen.has(item.key)) return false
    seen.add(item.key)
    return true
  })
}

export const isInProjects = (projectPath: string, csv: string): boolean => {
  const wanted = csv
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
  if (!wanted.length) return true
  const name = projectPath.split('/').pop()?.toLowerCase() ?? ''
  return wanted.includes(name)
}

export const reviewState = (sha: string, reviewedSha: string | undefined): MrReviewState => {
  if (reviewedSha === undefined) return 'not-reviewed'
  return reviewedSha === sha ? 'reviewed' : 'new-changes'
}

const REVIEW_ORDER: Record<MrReviewState, number> = { 'new-changes': 0, 'not-reviewed': 1, reviewed: 2 }

export const sortMrs = (rows: MrRow[]): MrRow[] =>
  [...rows].sort((a, b) => REVIEW_ORDER[a.review] - REVIEW_ORDER[b.review] || b.updatedAt.localeCompare(a.updatedAt))

const countLines = (diff: string, sign: '+' | '-'): number => {
  const lines = diff.split('\n')
  const hunk = lines.findIndex((line) => line.startsWith('@@'))
  const body = hunk >= 0 ? lines.slice(hunk + 1) : lines.filter((line) => !line.startsWith(sign.repeat(3)))
  return body.filter((line) => line.startsWith(sign)).length
}

export const parseDiffStats = (json: unknown): MrFile[] =>
  Array.isArray(json)
    ? json.flatMap((d) => {
        const path = asText(d?.new_path)
        const diff = asText(d?.diff)
        return path ? [{ path, added: countLines(diff, '+'), removed: countLines(diff, '-') }] : []
      })
    : []

const REQUEST_TIMEOUT_MS = 15000

export const parseMrSha = (json: unknown): string | null => {
  const sha = (json as { sha?: unknown } | null)?.sha
  return typeof sha === 'string' && sha ? sha : null
}

const apiFetch = async (base: string, token: string, path: string): Promise<{ json: unknown | null; problem: string | null }> => {
  try {
    const res = await fetch(`${new URL(base).origin}/api/v4${path}`, {
      headers: { 'PRIVATE-TOKEN': token, Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    return res.ok ? { json: await res.json(), problem: null } : { json: null, problem: `HTTP ${res.status}` }
  } catch (err) {
    return { json: null, problem: err instanceof Error ? err.message : 'no answer' }
  }
}

const apiGet = async (base: string, token: string, path: string): Promise<unknown | null> =>
  (await apiFetch(base, token, path)).json

const fetchReviewMrs = async (
  base: string,
  token: string
): Promise<{ items: MrItem[] | null; problem: string | null; me: string | null }> => {
  const me = await apiFetch(base, token, '/user')
  const id = asNumber((me.json as { id?: unknown } | null)?.id)
  const name = asText((me.json as { name?: unknown } | null)?.name) || null
  if (id === null) return { items: null, problem: me.problem ?? 'no user id', me: name }
  const [list, mine] = await Promise.all([
    apiFetch(base, token, `/merge_requests?reviewer_id=${id}&state=opened&scope=all&per_page=100`),
    apiFetch(base, token, `/merge_requests?author_id=${id}&state=opened&scope=all&per_page=100`)
  ])
  const items = list.json === null && mine.json === null ? null : mergeMrs(parseReviewMrs(list.json), parseReviewMrs(mine.json))
  return { items, problem: list.problem ?? mine.problem, me: name }
}

export const countOpenThreads = (json: unknown): number =>
  Array.isArray(json)
    ? json.filter((d: any) => {
        const first = Array.isArray(d?.notes) ? d.notes[0] : null
        return first?.resolvable === true && first?.resolved !== true
      }).length
    : 0

const withThreadCounts = async (base: string, token: string, items: MrItem[], me: string | null): Promise<MrItem[]> =>
  Promise.all(
    items.map(async (item) => {
      if (!me || item.author !== me) return item
      const json = await apiGet(base, token, `/projects/${item.projectId}/merge_requests/${item.iid}/discussions?per_page=100`)
      return json === null ? item : { ...item, openThreads: countOpenThreads(json) }
    })
  )

export const countApprovals = (json: unknown): number => {
  const list = (json as { approved_by?: unknown } | null)?.approved_by
  return Array.isArray(list) ? list.length : 0
}

const approvalCache = new Map<string, { at: string; count: number }>()

export const forgetApprovals = (key?: string): void => {
  if (key) approvalCache.delete(key)
  else approvalCache.clear()
}

const withApprovals = async (base: string, token: string, items: MrItem[]): Promise<MrItem[]> =>
  Promise.all(
    items.map(async (item) => {
      const cached = approvalCache.get(item.key)
      if (cached && cached.at === item.updatedAt) return { ...item, approvals: cached.count }
      const json = await apiGet(base, token, `/projects/${item.projectId}/merge_requests/${item.iid}/approvals`)
      if (json === null) return item
      const count = countApprovals(json)
      approvalCache.set(item.key, { at: item.updatedAt, count })
      return { ...item, approvals: count }
    })
  )

export const mentionPath = (mention: string): string | null =>
  mention.trim()
    ? `/merge_requests?state=opened&scope=all&in=description&search=${encodeURIComponent(mention.trim())}&per_page=100`
    : null

export const fetchMrsToReview = async (
  base: string,
  token: string,
  mention: string
): Promise<{ items: MrItem[] | null; detail: string | null; me: string | null }> => {
  const path = mentionPath(mention)
  const [todos, reviews, mentioned] = await Promise.all([
    apiFetch(base, token, '/todos?type=MergeRequest&state=pending&per_page=100'),
    fetchReviewMrs(base, token),
    path ? apiFetch(base, token, path) : Promise.resolve({ json: null, problem: 'no mention set' })
  ])
  const todoItems = todos.json === null ? null : parseTodos(todos.json)
  const mentionItems = mentioned.json === null ? null : parseReviewMrs(mentioned.json)
  if (todoItems === null && reviews.items === null && mentionItems === null)
    return {
      items: null,
      detail: `to-do list: ${todos.problem}; reviewer merge requests: ${reviews.problem}; ${mention.trim() || 'mention'}: ${mentioned.problem}`,
      me: reviews.me
    }
  const items = mergeMrs(mergeMrs(mentionItems ?? [], todoItems ?? []), reviews.items ?? [])
  return { items, detail: null, me: reviews.me }
}

export const enrichMrs = async (base: string, token: string, items: MrItem[], me: string | null): Promise<MrItem[]> =>
  withApprovals(base, token, await withThreadCounts(base, token, items, me))

export const fetchDiffStats = async (base: string, token: string, projectId: number, iid: number): Promise<MrFile[] | null> => {
  const json = await apiGet(base, token, `/projects/${projectId}/merge_requests/${iid}/diffs?per_page=100`)
  return json === null ? null : parseDiffStats(json)
}

export const fetchMrSha = async (base: string, token: string, projectId: number, iid: number): Promise<string | null> =>
  parseMrSha(await apiGet(base, token, `/projects/${projectId}/merge_requests/${iid}`))
