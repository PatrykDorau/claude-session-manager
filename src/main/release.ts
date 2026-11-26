import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mentionsTicket, request } from './mractions'
import type { JiraTransition } from './jira'
import type { ReleaseCheck, ReleaseDeploy, ReleaseMr, ReleaseResult, ReleaseRow, ReleaseStage } from '../renderer/src/types'

const asList = (json: unknown): any[] => (Array.isArray(json) ? json : [])

const asString = (value: unknown): string => (typeof value === 'string' ? value : '')

const asNullableString = (value: unknown): string | null => (typeof value === 'string' && value ? value : null)

const isReleaseState = (state: unknown): state is 'opened' | 'merged' => state === 'opened' || state === 'merged'

const toReleaseMr = (m: any): ReleaseMr => ({
  iid: Number(m.iid),
  projectId: Number(m.project_id),
  state: m.state,
  title: asString(m.title),
  url: asString(m.web_url),
  targetBranch: asString(m.target_branch),
  mergeSha: asNullableString(m.merge_commit_sha) ?? asNullableString(m.squash_commit_sha),
  mergedAt: asNullableString(m.merged_at)
})

export const parseReleaseMrs = (json: unknown, ticket: string): ReleaseMr[] => {
  const isTicketMr = (m: any): boolean => isReleaseState(m?.state) && mentionsTicket(asString(m.title), ticket)
  return asList(json).filter(isTicketMr).map(toReleaseMr)
}

export const parsePipeline = (json: unknown): { id: number; status: string } | null => {
  const first = asList(json)[0]
  return first ? { id: Number(first.id), status: asString(first.status) } : null
}

const toReleaseDeploy = (d: any): ReleaseDeploy => ({ environment: asString(d.environment?.name), status: asString(d.status) })

export const parseDeploys = (json: unknown, pipelineId: number): ReleaseDeploy[] => {
  const isPipelineDeploy = (d: any): boolean => d?.deployable?.pipeline?.id === pipelineId
  return asList(json).filter(isPipelineDeploy).map(toReleaseDeploy)
}

const checkBlockers = ({ mr, pipeline, deploys }: ReleaseCheck): string[] => {
  const label = `MR !${mr.iid}`
  if (mr.state === 'opened') return [`${label} still open`]
  if (!pipeline) return [`${label}: no pipeline on ${mr.targetBranch} yet`]
  const pipelineBlockers = pipeline.status === 'success' ? [] : [`${label}: pipeline ${pipeline.status}`]
  const isUnsuccessfulDeploy = (d: ReleaseDeploy): boolean => d.status !== 'success'
  const toDeployBlocker = (d: ReleaseDeploy): string => `${label}: deploy to ${d.environment} ${d.status}`
  if (!deploys) return [...pipelineBlockers, `${label}: could not read deployments`]
  const deployBlockers = deploys.filter(isUnsuccessfulDeploy).map(toDeployBlocker)
  return [...pipelineBlockers, ...deployBlockers]
}

export const releaseBlockers = (checks: ReleaseCheck[], hasTestCases: boolean): string[] => {
  if (!checks.length) return ['no merge request']
  const blockers = checks.flatMap(checkBlockers)
  return hasTestCases ? blockers : [...blockers, 'no test cases']
}

export const isReleasable = (row: ReleaseRow): boolean => row.stage !== 'waiting' && row.blockers.length === 0

export const isWaitingForRelease = (status: string): boolean => /waiting\s+for\s+internal\s+release/i.test(status)

export const isInInternalTesting = (status: string): boolean => /^internal\s+testing$/i.test(status)

export const releaseStage = (status: string, blockers: string[]): ReleaseStage => {
  if (isInInternalTesting(status)) return 'unfinished'
  return isWaitingForRelease(status) && !blockers.length ? 'ready' : 'waiting'
}

const isTransitionToInternalTesting = (t: JiraTransition): boolean => isInInternalTesting(t.to)

const isTransitionNamedInternalTesting = (t: JiraTransition): boolean => isInInternalTesting(t.name)

export const internalTestingTransition = (list: JiraTransition[]): JiraTransition | null =>
  list.find(isTransitionToInternalTesting) ?? list.find(isTransitionNamedInternalTesting) ?? null

const convertInline = (text: string): string =>
  text
    .replace(/`([^`]+)`/g, '{{$1}}')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '[$1|$2]')
    .replace(/\*\*(.+?)\*\*/g, '*$1*')

const isTableSeparator = (line: string): boolean => /^\s*\|[\s:|-]+\|\s*$/.test(line) && line.includes('-')

const convertCell = (cell: string): string => convertInline(cell.trim())

const tableCells = (line: string): string[] => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(convertCell)

export const markdownToJira = (md: string): string => {
  const lines = md.split('\n')
  const out: string[] = []
  let isInFence = false
  const convertLine = (line: string, index: number): void => {
    if (/^\s*```/.test(line)) {
      isInFence = !isInFence
      out.push('{code}')
      return
    }
    if (isInFence) {
      out.push(line)
      return
    }
    if (isTableSeparator(line)) return
    if (/^\s*\|/.test(line)) {
      const isHeader = isTableSeparator(lines[index + 1] ?? '')
      const cells = tableCells(line)
      out.push(isHeader ? `|| ${cells.join(' || ')} ||` : `| ${cells.join(' | ')} |`)
      return
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      out.push(`h${heading[1].length}. ${convertInline(heading[2])}`)
      return
    }
    const bullet = line.match(/^(\s*)[-*]\s+(.*)$/)
    if (bullet) {
      out.push(`${'*'.repeat(Math.floor(bullet[1].length / 2) + 1)} ${convertInline(bullet[2])}`)
      return
    }
    const numbered = line.match(/^(\s*)\d+\.\s+(.*)$/)
    if (numbered) {
      out.push(`${'#'.repeat(Math.floor(numbered[1].length / 2) + 1)} ${convertInline(numbered[2])}`)
      return
    }
    out.push(convertInline(line))
  }
  lines.forEach(convertLine)
  return out.join('\n')
}

const readDirs = (path: string): string[] => {
  try {
    return readdirSync(path)
  } catch {
    return []
  }
}

const byNewest = (a: { mtime: number }, b: { mtime: number }): number => b.mtime - a.mtime

export const findTestCases = (root: string, key: string): string | null => {
  const toTestCaseFile = (month: string): { file: string; mtime: number }[] => {
    const file = join(root, month, key, 'test-case.md')
    try {
      return [{ file, mtime: statSync(file).mtimeMs }]
    } catch {
      return []
    }
  }
  const newest = readDirs(root).flatMap(toTestCaseFile).sort(byNewest)[0]
  if (!newest) return null
  try {
    return readFileSync(newest.file, 'utf8')
  } catch {
    return null
  }
}

const fetchPipeline = async (base: string, token: string, mr: ReleaseMr): Promise<{ id: number; status: string } | null> => {
  const path = `/projects/${mr.projectId}/pipelines?sha=${encodeURIComponent(mr.mergeSha ?? '')}&ref=${encodeURIComponent(mr.targetBranch)}&order_by=id&sort=desc&per_page=1`
  const { json, problem } = await request(base, token, 'GET', path)
  return problem ? null : parsePipeline(json)
}

const fetchDeploys = async (base: string, token: string, mr: ReleaseMr, pipelineId: number): Promise<ReleaseDeploy[] | null> => {
  const path = `/projects/${mr.projectId}/deployments?updated_after=${encodeURIComponent(mr.mergedAt ?? '')}&order_by=updated_at&per_page=100`
  const { json, problem } = await request(base, token, 'GET', path)
  return problem ? null : parseDeploys(json, pipelineId)
}

const checkMr = async (base: string, token: string, mr: ReleaseMr): Promise<ReleaseCheck> => {
  if (mr.state !== 'merged' || !mr.mergeSha) return { mr, pipeline: null, deploys: [] }
  const pipeline = await fetchPipeline(base, token, mr)
  return { mr, pipeline, deploys: pipeline ? await fetchDeploys(base, token, mr, pipeline.id) : [] }
}

export const checkRelease = async (
  base: string,
  token: string,
  ticket: { key: string; summary: string; status: string },
  root: string
): Promise<ReleaseRow> => {
  const path = `/merge_requests?scope=created_by_me&state=all&search=${encodeURIComponent(ticket.key)}&in=title&per_page=20`
  const { json } = await request(base, token, 'GET', path)
  const mrs = parseReleaseMrs(json, ticket.key)
  const checks: ReleaseCheck[] = []
  for (const mr of mrs) checks.push(await checkMr(base, token, mr))
  const hasTestCases = findTestCases(root, ticket.key) !== null
  const blockers = releaseBlockers(checks, hasTestCases)
  return { key: ticket.key, summary: ticket.summary, status: ticket.status, stage: releaseStage(ticket.status, blockers), blockers, checks, hasTestCases }
}

export interface ReleaseDeps {
  status: (key: string) => Promise<string | null>
  transitions: (key: string) => Promise<JiraTransition[] | null>
  transition: (key: string, id: string) => Promise<boolean>
  comments: (key: string) => Promise<string[] | null>
  comment: (key: string, body: string) => Promise<boolean>
  unassign: (key: string) => Promise<boolean>
  testCases: (key: string) => string | null
}

export const isCommentPosted = (comments: string[], body: string): boolean => {
  const trimLine = (line: string): string => line.trim()
  const firstLine = body.split('\n').map(trimLine).find(Boolean)
  const isMatch = (comment: string): boolean => comment.includes(firstLine ?? '')
  return !!firstLine && comments.some(isMatch)
}

const moveToInternalTesting = async (key: string, deps: ReleaseDeps, done: string[]): Promise<string | null> => {
  const status = await deps.status(key)
  if (status && isInInternalTesting(status)) return null
  const transition = internalTestingTransition((await deps.transitions(key)) ?? [])
  if (!transition) return `Cannot move ${key} to Internal testing from ${status ?? 'unknown'}`
  if (!(await deps.transition(key, transition.id))) return `Jira did not accept moving ${key} to Internal testing`
  done.push('Internal testing')
  return null
}

const postTestCases = async (key: string, deps: ReleaseDeps): Promise<string | null> => {
  const testCases = deps.testCases(key)
  if (testCases === null) return `No test-case.md for ${key}`
  const body = markdownToJira(testCases)
  const comments = await deps.comments(key)
  if (!comments) return `Could not read the comments of ${key}`
  if (isCommentPosted(comments, body)) return null
  return (await deps.comment(key, body)) ? null : 'Jira did not accept the test-case comment'
}

const removeAssignee = async (key: string, deps: ReleaseDeps): Promise<string | null> =>
  (await deps.unassign(key)) ? null : 'Jira did not accept removing the assignee'

export const releaseTicket = async (key: string, deps: ReleaseDeps): Promise<ReleaseResult> => {
  const done: string[] = []
  const moveError = await moveToInternalTesting(key, deps, done)
  if (moveError) return { key, error: moveError, done }
  const postError = await postTestCases(key, deps)
  if (postError) return { key, error: postError, done }
  done.push('test cases')
  const removeError = await removeAssignee(key, deps)
  if (removeError) return { key, error: removeError, done }
  done.push('unassigned')
  return { key, error: null, done }
}
