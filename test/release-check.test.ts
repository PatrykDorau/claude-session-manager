import { describe, it, expect, vi, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkRelease } from '../src/main/release'

const mergedMr = { iid: 12, project_id: 7, state: 'merged', title: 'SOFNJJ-2388 x', web_url: 'u', target_branch: 'develop', merge_commit_sha: 'abc', merged_at: '2026-01-01T10:00:00Z' }
const deploy = { environment: { name: 'test' }, status: 'success', deployable: { pipeline: { id: 99 } } }

const answerFor = (url: string): unknown => {
  if (url.includes('/merge_requests')) return [mergedMr]
  if (url.includes('/pipelines')) return [{ id: 99, status: 'success' }]
  if (url.includes('/deployments')) return [deploy]
  return []
}

describe('checkRelease', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('builds a ready row from one merged MR with a pipeline and a deploy', async () => {
    const urls: string[] = []
    const fetchStub = vi.fn(async (input: string) => {
      urls.push(String(input))
      return { ok: true, status: 200, headers: new Headers(), json: async () => answerFor(String(input)) }
    })
    vi.stubGlobal('fetch', fetchStub)
    const root = mkdtempSync(join(tmpdir(), 'release-check-'))
    mkdirSync(join(root, '2026-01', 'SOFNJJ-2388'), { recursive: true })
    writeFileSync(join(root, '2026-01', 'SOFNJJ-2388', 'test-case.md'), '# Cases')
    const ticket = { key: 'SOFNJJ-2388', summary: 'Sum', status: 'Waiting for internal release' }

    const row = await checkRelease('https://gitlab.example.com', 'tok', ticket, root)

    expect(row).toEqual({
      key: 'SOFNJJ-2388',
      summary: 'Sum',
      status: 'Waiting for internal release',
      stage: 'ready',
      blockers: [],
      hasTestCases: true,
      checks: [
        {
          mr: { iid: 12, projectId: 7, state: 'merged', title: 'SOFNJJ-2388 x', url: 'u', targetBranch: 'develop', mergeSha: 'abc', mergedAt: '2026-01-01T10:00:00Z' },
          pipeline: { id: 99, status: 'success' },
          deploys: [{ environment: 'test', status: 'success' }]
        }
      ]
    })
    expect(urls[0]).toContain('/api/v4/merge_requests?scope=created_by_me&state=all&search=SOFNJJ-2388&in=title&per_page=20')
    expect(urls[1]).toContain('/api/v4/projects/7/pipelines?sha=abc&ref=develop&order_by=id&sort=desc&per_page=1')
    expect(urls[2]).toContain('/api/v4/projects/7/deployments?updated_after=2026-01-01T10%3A00%3A00Z&order_by=updated_at&per_page=100')
  })
})
