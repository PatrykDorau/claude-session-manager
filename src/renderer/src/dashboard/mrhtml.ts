import { marked } from 'marked'
import DOMPurify from 'dompurify'

const UPLOAD = /\/uploads\/([0-9a-f]{32})\/([^?#"']+)/
const VIDEO = /\.(webm|mp4|mov|ogg|m4v)(?:$|[?#])/i

export const toUploadApiUrl = (url: string, origin: string, projectId: number): string | null => {
  const isGitlab = url.startsWith('/') || url.startsWith(origin)
  const match = isGitlab ? url.match(UPLOAD) : null
  return match ? `${origin}/api/v4/projects/${projectId}/uploads/${match[1]}/${match[2]}` : null
}

export const isVideoUrl = (url: string): boolean => VIDEO.test(url)

const absolute = (url: string, origin: string): string => (url.startsWith('/') && !url.startsWith('//') ? `${origin}${url}` : url)

const fixMedia = (root: HTMLElement, origin: string, projectId: number): void => {
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-src]'))) {
    el.setAttribute('src', el.getAttribute('data-src') ?? '')
    el.removeAttribute('data-src')
  }
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('img, video, source'))) {
    const src = el.getAttribute('src') ?? ''
    const next = toUploadApiUrl(src, origin, projectId) ?? absolute(src, origin)
    if (el.tagName === 'IMG' && isVideoUrl(src)) {
      const video = document.createElement('video')
      video.setAttribute('src', next)
      video.setAttribute('controls', '')
      video.setAttribute('preload', 'metadata')
      el.replaceWith(video)
    } else el.setAttribute('src', next)
  }
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('video'))) {
    el.setAttribute('controls', '')
    el.setAttribute('preload', 'metadata')
  }
  for (const a of Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
    const href = a.getAttribute('href') ?? ''
    a.setAttribute('href', toUploadApiUrl(href, origin, projectId) ?? absolute(href, origin))
    a.setAttribute('target', '_blank')
    a.setAttribute('rel', 'noreferrer')
  }
}

export const renderGitlabHtml = (html: string, origin: string, projectId: number): string => {
  const clean = DOMPurify.sanitize(html, {
    ADD_TAGS: ['video', 'source', 'details', 'summary'],
    ADD_ATTR: ['controls', 'data-src', 'target'],
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe']
  })
  const box = document.createElement('div')
  box.innerHTML = clean
  fixMedia(box, origin, projectId)
  return box.innerHTML
}

export const renderMarkdown = (text: string, origin: string, projectId: number): string =>
  renderGitlabHtml(marked.parse(text, { gfm: true, breaks: true, async: false }) as string, origin, projectId)

export const toUploadWebUrl = (url: string): string => url.replace(/\/api\/v4\/projects\/(\d+)\/uploads\//, '/-/project/$1/uploads/')

export const parseVersionLink = (href: string): { diffId: number; startSha: string } | null => {
  if (!/\/merge_requests\/\d+\/diffs\?/.test(href)) return null
  const diffId = /[?&]diff_id=(\d+)/.exec(href)?.[1]
  const startSha = /[?&]start_sha=([0-9a-f]+)/.exec(href)?.[1]
  return diffId && startSha ? { diffId: Number(diffId), startSha } : null
}
