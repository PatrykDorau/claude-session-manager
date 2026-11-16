import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchAllPages, createDraftNote, setDiscussionResolved, deleteNote, updateMr, publishDraftNotes, fetchVersionDiff } from '../src/main/mractions'

const BASE = 'https://gitlab.example'
type Call = { url: string; init: RequestInit }

const stub = (answers: { status?: number; json: unknown; next?: string }[]): Call[] => {
  const calls: Call[] = []
  let i = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      const a = answers[Math.min(i++, answers.length - 1)]
      return new Response(a.json === null ? null : JSON.stringify(a.json), {
        status: a.status ?? 200,
        headers: { 'x-next-page': a.next ?? '' }
      })
    })
  )
  return calls
}

afterEach(() => vi.unstubAllGlobals())

describe('fetchAllPages', () => {
  it('follows x-next-page and joins the pages', async () => {
    const calls = stub([
      { json: Array.from({ length: 100 }, (_, i) => i), next: '2' },
      { json: Array.from({ length: 50 }, (_, i) => i) }
    ])
    const result = await fetchAllPages(BASE, 't', '/projects/1/merge_requests/4/draft_notes')
    expect(result.json).toHaveLength(150)
    expect(calls[1].url).toContain('page=2')
    expect(calls[0].url).toContain('per_page=100')
  })
})

describe('review calls', () => {
  it('posts a draft note with a position and no reply key', async () => {
    const calls = stub([{ json: { id: 1 } }])
    const position = { position_type: 'text' as const, base_sha: 'b', start_sha: 's', head_sha: 'h', old_path: 'f', new_path: 'f', new_line: 3 }
    expect(await createDraftNote(BASE, 't', 1, 4, { body: 'hi', position })).toBeNull()
    expect(calls[0].url).toBe(`${BASE}/api/v4/projects/1/merge_requests/4/draft_notes`)
    expect(calls[0].init.method).toBe('POST')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ note: 'hi', position })
  })
  it('reopens a thread with resolved=false', async () => {
    const calls = stub([{ json: {} }])
    await setDiscussionResolved(BASE, 't', 1, 4, 'abc', false)
    expect(calls[0].url).toBe(`${BASE}/api/v4/projects/1/merge_requests/4/discussions/abc?resolved=false`)
    expect(calls[0].init.method).toBe('PUT')
  })
  it('deletes a note with DELETE and accepts an empty 204', async () => {
    const calls = stub([{ status: 204, json: null }])
    expect(await deleteNote(BASE, 't', 1, 4, 'abc', 9)).toBeNull()
    expect(calls[0].init.method).toBe('DELETE')
    expect(calls[0].url).toBe(`${BASE}/api/v4/projects/1/merge_requests/4/discussions/abc/notes/9`)
  })
  it('updates only the given MR fields', async () => {
    const calls = stub([{ json: {} }])
    await updateMr(BASE, 't', 1, 4, { title: 'Draft: x' })
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ title: 'Draft: x' })
  })
  it('publishes all drafts', async () => {
    const calls = stub([{ status: 204, json: null }])
    expect(await publishDraftNotes(BASE, 't', 1, 4)).toBeNull()
    expect(calls[0].url).toBe(`${BASE}/api/v4/projects/1/merge_requests/4/draft_notes/bulk_publish`)
  })
  it('returns the GitLab message on an error', async () => {
    stub([{ status: 400, json: { message: 'line_code invalid' } }])
    expect(await createDraftNote(BASE, 't', 1, 4, { body: 'x' })).toBe('HTTP 400: line_code invalid')
  })
})

describe('fetchVersionDiff', () => {
  it('falls back to the version diffs when the token cannot compare commits', async () => {
    stub([
      { json: { head_commit_sha: 'h2', diffs: [{ new_path: 'a.ts', old_path: 'a.ts', diff: '@@ -1 +1 @@\n-x\n+y' }] } },
      { status: 403, json: { message: 'insufficient_granular_scope' } }
    ])
    const result = await fetchVersionDiff(BASE, 't', 1, 4, 7, 'h1', 'a.ts')
    expect(result.files.map((f) => f.path)).toEqual(['a.ts'])
    expect(result.files[0].rows.some((r) => r.kind === '+')).toBe(true)
    expect(result.problem).toBe('Showing this whole version against the target branch, because the token cannot compare commits.')
  })
})
