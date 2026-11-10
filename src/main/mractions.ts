import type { DiffRow, MrApprovals, MrDiscussion, MrOverview, MrSnippet, MrState, MrStatus, MrVersionDiff } from '../renderer/src/types'

const REQUEST_TIMEOUT_MS = 15000

const asText = (v: unknown): string => (typeof v === 'string' ? v : '')

export const parseMrState = (json: any): MrState => ({
  state: asText(json?.state),
  mergeStatus: asText(json?.detailed_merge_status),
  isMergeable: json?.detailed_merge_status === 'mergeable',
  hasConflicts: json?.has_conflicts === true,
  behind: typeof json?.diverged_commits_count === 'number' ? json.diverged_commits_count : 0,
  pipeline: asText(json?.head_pipeline?.status) || null,
  canMerge: json?.user?.can_merge === true
})

export const parseApprovals = (json: any, myId: number | null): MrApprovals => {
  const users = Array.isArray(json?.approved_by) ? json.approved_by.map((a: any) => a?.user).filter(Boolean) : []
  return {
    approvedBy: users.map((u: any) => asText(u.name)),
    left: typeof json?.approvals_left === 'number' ? json.approvals_left : 0,
    isApprovedByMe: myId !== null && users.some((u: any) => u.id === myId)
  }
}

const names = (list: unknown): string[] => (Array.isArray(list) ? list.map((u: any) => asText(u?.name)).filter(Boolean) : [])

export const parseMrOverview = (json: any): MrOverview => {
  const p = json?.head_pipeline
  return {
    description: asText(json?.description),
    descriptionHtml: asText(json?.description_html),
    isDraft: json?.draft === true,
    createdAt: asText(json?.created_at),
    author: asText(json?.author?.name),
    assignees: names(json?.assignees),
    reviewers: names(json?.reviewers),
    labels: Array.isArray(json?.labels) ? json.labels.filter((l: unknown) => typeof l === 'string') : [],
    milestone: asText(json?.milestone?.title) || null,
    isSquash: json?.squash === true,
    isSourceRemoved: json?.force_remove_source_branch === true,
    pipeline:
      typeof p?.id === 'number'
        ? { id: p.id, status: asText(p.status), sha: asText(p.sha).slice(0, 8), url: asText(p.web_url), coverage: asText(p.coverage) || null }
        : null
  }
}

const SNIPPET_BEFORE = 4
const SNIPPET_AFTER = 1

type SnippetRow = MrSnippet['rows'][number]

const around = (rows: SnippetRow[], hit: number): MrSnippet => ({
  rows: rows.slice(Math.max(0, hit - SNIPPET_BEFORE), hit + SNIPPET_AFTER + 1).map((r) => ({ ...r, isHit: r === rows[hit] }))
})

export const snippetAround = (text: string, line: number): MrSnippet | null => {
  const all = text.split(/\r?\n/)
  if (line < 1 || line > all.length) return null
  return around(
    all.map((t, i) => ({ no: i + 1, mark: ' ', text: t, isHit: false })),
    line - 1
  )
}

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

export const snippetFromDiff = (diff: string, line: number, side: 'new' | 'old'): MrSnippet | null => {
  let hunk: SnippetRow[] = []
  let oldNo = 0
  let newNo = 0
  let hit = -1
  for (const raw of diff.split(/\r?\n/)) {
    const header = HUNK.exec(raw)
    if (header) {
      if (hit >= 0) break
      hunk = []
      oldNo = Number(header[1])
      newNo = Number(header[2])
      continue
    }
    const mark = raw[0]
    if (mark !== ' ' && mark !== '+' && mark !== '-') continue
    const text = raw.slice(1)
    const isNewSide = side === 'new'
    const no = mark === '-' ? (isNewSide ? null : oldNo) : mark === '+' ? (isNewSide ? newNo : null) : isNewSide ? newNo : oldNo
    const isTarget = isNewSide ? mark !== '-' && newNo === line : mark !== '+' && oldNo === line
    if (isTarget && hit < 0) hit = hunk.length
    hunk.push({ no, mark, text, isHit: false })
    if (mark !== '+') oldNo += 1
    if (mark !== '-') newNo += 1
  }
  return hit >= 0 ? around(hunk, hit) : null
}

const anchorOf = (position: any): MrDiscussion['anchor'] => {
  if (!position) return null
  const isNew = typeof position.new_line === 'number'
  const path = isNew ? asText(position.new_path) : asText(position.old_path)
  const line = isNew ? position.new_line : position.old_line
  const sha = isNew ? asText(position.head_sha) : asText(position.base_sha)
  return path && typeof line === 'number' && sha ? { path, line, sha, side: isNew ? 'new' : 'old' } : null
}

export const parseDiscussions = (json: unknown): MrDiscussion[] =>
  Array.isArray(json)
    ? json.flatMap((d: any): MrDiscussion[] => {
        const raw = Array.isArray(d?.notes) ? d.notes.filter(Boolean) : []
        if (!raw.length) return []
        const first = raw[0]
        const path = asText(first.position?.new_path) || asText(first.position?.old_path)
        const line = first.position?.new_line ?? first.position?.old_line
        return [
          {
            id: asText(d.id),
            isSystem: first.system === true,
            isResolved: first.resolved === true,
            isResolvable: first.resolvable === true,
            where: path ? `${path}${typeof line === 'number' ? `:${line}` : ''}` : null,
            anchor: anchorOf(first.position),
            snippet: null,
            notes: raw.map((n: any) => ({ id: n.id, author: asText(n.author?.name), body: asText(n.body), createdAt: asText(n.created_at) }))
          }
        ]
      })
    : []

const request = async (
  base: string,
  token: string,
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  body?: unknown
): Promise<{ json: any; problem: string | null }> => {
  try {
    const res = await fetch(`${new URL(base).origin}/api/v4${path}`, {
      method,
      headers: { 'PRIVATE-TOKEN': token, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    const json = await res.json().catch(() => null)
    if (res.ok) return { json, problem: null }
    const message = asText(json?.message) || asText(json?.error) || (json?.message ? JSON.stringify(json.message) : '')
    return { json: null, problem: `HTTP ${res.status}${message ? `: ${message}` : ''}` }
  } catch (err) {
    return { json: null, problem: err instanceof Error ? err.message : 'no answer' }
  }
}

const mrPath = (projectId: number, iid: number): string => `/projects/${projectId}/merge_requests/${iid}`

const fileCache = new Map<string, string | null>()

const fetchFileText = async (base: string, token: string, projectId: number, path: string, sha: string): Promise<string | null> => {
  const key = `${projectId}:${sha}:${path}`
  if (fileCache.has(key)) return fileCache.get(key) ?? null
  try {
    const res = await fetch(
      `${new URL(base).origin}/api/v4/projects/${projectId}/repository/files/${encodeURIComponent(path)}/raw?ref=${encodeURIComponent(sha)}`,
      { headers: { 'PRIVATE-TOKEN': token }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }
    )
    const text = res.ok ? await res.text() : null
    fileCache.set(key, text)
    return text
  } catch {
    return null
  }
}

const withSnippets = async (
  base: string,
  token: string,
  projectId: number,
  list: MrDiscussion[],
  diffs: Map<string, string>
): Promise<MrDiscussion[]> =>
  Promise.all(
    list.map(async (d) => {
      if (!d.anchor) return d
      const diff = diffs.get(d.anchor.path)
      const fromDiff = diff ? snippetFromDiff(diff, d.anchor.line, d.anchor.side) : null
      if (fromDiff) return { ...d, snippet: fromDiff }
      const text = await fetchFileText(base, token, projectId, d.anchor.path, d.anchor.sha)
      return text === null ? d : { ...d, snippet: snippetAround(text, d.anchor.line) }
    })
  )

const diffsByPath = (json: unknown): Map<string, string> =>
  new Map(
    (Array.isArray(json) ? json : []).flatMap((d: any) => {
      const diff = asText(d?.diff)
      return diff ? [[asText(d.new_path), diff] as const, [asText(d.old_path), diff] as const] : []
    })
  )

let myIdCache: number | null = null

export const fetchMrStatus = async (base: string, token: string, projectId: number, iid: number): Promise<MrStatus> => {
  if (myIdCache === null) {
    const me = await request(base, token, 'GET', '/user')
    myIdCache = typeof me.json?.id === 'number' ? me.json.id : null
  }
  const [mr, approvals, discussions, diffs] = await Promise.all([
    request(base, token, 'GET', `${mrPath(projectId, iid)}?include_diverged_commits_count=true&render_html=true`),
    request(base, token, 'GET', `${mrPath(projectId, iid)}/approvals`),
    request(base, token, 'GET', `${mrPath(projectId, iid)}/discussions?per_page=100`),
    request(base, token, 'GET', `${mrPath(projectId, iid)}/diffs?per_page=100`)
  ])
  return {
    state: mr.json ? parseMrState(mr.json) : null,
    overview: mr.json ? parseMrOverview(mr.json) : null,
    approvals: approvals.json ? parseApprovals(approvals.json, myIdCache) : null,
    discussions: discussions.json ? await withSnippets(base, token, projectId, parseDiscussions(discussions.json), diffsByPath(diffs.json)) : null,
    problem: mr.problem ?? approvals.problem ?? discussions.problem
  }
}

export const diffRows = (diff: string): DiffRow[] => {
  const rows: DiffRow[] = []
  let oldNo = 0
  let newNo = 0
  for (const raw of diff.split(/\r?\n/)) {
    const header = HUNK.exec(raw)
    if (header) {
      oldNo = Number(header[1])
      newNo = Number(header[2])
      rows.push({ kind: 'hunk', old: null, new: null, text: raw })
      continue
    }
    const mark = raw[0]
    if (mark === ' ') rows.push({ kind: ' ', old: oldNo++, new: newNo++, text: raw.slice(1) })
    else if (mark === '-') rows.push({ kind: '-', old: oldNo++, new: null, text: raw.slice(1) })
    else if (mark === '+') rows.push({ kind: '+', old: null, new: newNo++, text: raw.slice(1) })
  }
  return rows
}

export const fetchVersionDiff = async (
  base: string,
  token: string,
  projectId: number,
  iid: number,
  diffId: number,
  startSha: string,
  path: string | null
): Promise<MrVersionDiff> => {
  const version = await request(base, token, 'GET', `${mrPath(projectId, iid)}/versions/${diffId}`)
  const head = asText(version.json?.head_commit_sha)
  if (!head) return { files: [], problem: version.problem ?? 'GitLab did not return this version' }
  const compare = await request(
    base,
    token,
    'GET',
    `/projects/${projectId}/repository/compare?from=${encodeURIComponent(startSha)}&to=${encodeURIComponent(head)}&straight=true`
  )
  const all = (Array.isArray(compare.json?.diffs) ? compare.json.diffs : []).map((d: any) => ({
    path: asText(d?.new_path) || asText(d?.old_path),
    rows: diffRows(asText(d?.diff))
  }))
  const matching = path ? all.filter((f: { path: string }) => f.path === path) : []
  return { files: matching.length ? matching : all, problem: compare.problem }
}

export type MrAction = 'approve' | 'unapprove' | 'merge' | 'rebase'

const ACTIONS: Record<MrAction, { method: 'POST' | 'PUT'; suffix: string }> = {
  approve: { method: 'POST', suffix: '/approve' },
  unapprove: { method: 'POST', suffix: '/unapprove' },
  merge: { method: 'PUT', suffix: '/merge' },
  rebase: { method: 'PUT', suffix: '/rebase' }
}

export interface MergeOptions {
  isSquash: boolean
  isSourceRemoved: boolean
}

export const runMrAction = async (
  base: string,
  token: string,
  projectId: number,
  iid: number,
  action: MrAction,
  options: MergeOptions | null
): Promise<string | null> =>
  (
    await request(
      base,
      token,
      ACTIONS[action].method,
      `${mrPath(projectId, iid)}${ACTIONS[action].suffix}`,
      action === 'merge' && options ? { squash: options.isSquash, should_remove_source_branch: options.isSourceRemoved } : undefined
    )
  ).problem

export const postMrReply = async (base: string, token: string, projectId: number, iid: number, discussionId: string, body: string): Promise<string | null> =>
  (await request(base, token, 'POST', `${mrPath(projectId, iid)}/discussions/${encodeURIComponent(discussionId)}/notes`, { body })).problem

export const postMrComment = async (base: string, token: string, projectId: number, iid: number, body: string): Promise<string | null> =>
  (await request(base, token, 'POST', `${mrPath(projectId, iid)}/discussions`, { body })).problem
