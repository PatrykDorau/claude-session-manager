import { describe, it, expect, vi, afterEach } from 'vitest'
import { blobFilePath, fetchBlobText } from '../src/main/gitlab'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('blobFilePath', () => {
  it('encodes project path, file path and ref', () => {
    expect(blobFilePath('millicom/tigo-fo-smarttv', 'src/a b.ts', 'abc')).toBe(
      '/projects/millicom%2Ftigo-fo-smarttv/repository/files/src%2Fa%20b.ts/raw?ref=abc'
    )
  })
})

describe('fetchBlobText', () => {
  it('fetches once per project, ref and path', async () => {
    const fetchMock = vi.fn(async () => new Response('hello'))
    vi.stubGlobal('fetch', fetchMock)
    const sha = 'a'.repeat(40)
    const args = ['https://gl.example/api/v4', 't', 'g/p', sha, 'cache/once.ts'] as const
    expect(await fetchBlobText(...args)).toBe('hello')
    expect(await fetchBlobText(...args)).toBe('hello')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string> }]
    expect(url).toBe(`https://gl.example/api/v4/projects/g%2Fp/repository/files/cache%2Fonce.ts/raw?ref=${sha}`)
    expect(init.headers['PRIVATE-TOKEN']).toBe('t')
  })

  it('does not cache a ref that is not a commit SHA', async () => {
    const fetchMock = vi.fn(async () => new Response('moving'))
    vi.stubGlobal('fetch', fetchMock)
    const args = ['https://gl.example', 't', 'g/p', 'develop', 'branch.ts'] as const
    expect(await fetchBlobText(...args)).toBe('moving')
    expect(await fetchBlobText(...args)).toBe('moving')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('returns null and does not cache a failed answer', async () => {
    const fetchMock = vi.fn(async () => new Response('no', { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)
    const args = ['https://gl.example', 't', 'g/p', 'sha2', 'missing.ts'] as const
    expect(await fetchBlobText(...args)).toBeNull()
    expect(await fetchBlobText(...args)).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
