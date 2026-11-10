import { describe, it, expect } from 'vitest'
import { toUploadApiUrl, toUploadWebUrl, isVideoUrl, parseVersionLink } from '../src/renderer/src/dashboard/mrhtml'

describe('toUploadApiUrl', () => {
  const origin = 'https://drm-gitlab.redlabs.pl'
  it('turns project upload links into the uploads API', () => {
    const secret = 'a'.repeat(32)
    expect(toUploadApiUrl(`/uploads/${secret}/repro.webm`, origin, 7)).toBe(`${origin}/api/v4/projects/7/uploads/${secret}/repro.webm`)
    expect(toUploadApiUrl(`/-/project/7/uploads/${secret}/fix%20cut.webm`, origin, 7)).toBe(`${origin}/api/v4/projects/7/uploads/${secret}/fix%20cut.webm`)
    expect(toUploadApiUrl(`${origin}/millicom/tigo/uploads/${secret}/a.png`, origin, 7)).toBe(`${origin}/api/v4/projects/7/uploads/${secret}/a.png`)
  })
  it('leaves other links alone', () => {
    expect(toUploadApiUrl('https://example.com/a.png', origin, 7)).toBeNull()
  })
})

describe('isVideoUrl', () => {
  it('spots video files', () => {
    expect(isVideoUrl('/x/repro.webm')).toBe(true)
    expect(isVideoUrl('/x/a.MP4?x=1')).toBe(true)
    expect(isVideoUrl('/x/a.png')).toBe(false)
  })
})

describe('toUploadWebUrl', () => {
  it('turns an uploads API link back into the GitLab page link', () => {
    const secret = 'b'.repeat(32)
    expect(toUploadWebUrl(`https://g.pl/api/v4/projects/7/uploads/${secret}/fix.webm`)).toBe(`https://g.pl/-/project/7/uploads/${secret}/fix.webm`)
    expect(toUploadWebUrl('https://g.pl/x.png')).toBe('https://g.pl/x.png')
  })
})

describe('parseVersionLink', () => {
  it('reads the version id and start commit from a "changed this line" link', () => {
    expect(
      parseVersionLink('https://g.pl/millicom/tigo-fo-smarttv/-/merge_requests/515/diffs?diff_id=998177&start_sha=8cb8c83ae733d4c1#17865de')
    ).toEqual({ diffId: 998177, startSha: '8cb8c83ae733d4c1' })
  })
  it('ignores other links', () => {
    expect(parseVersionLink('https://g.pl/x/-/merge_requests/515')).toBeNull()
    expect(parseVersionLink('https://sonarqube.redge-tech.com/project/issues?id=1')).toBeNull()
  })
})
