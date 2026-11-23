import type { ReviewDoc, ReviewHunk, ReviewNote, ReviewPart } from '../renderer/src/types'

const text = (v: unknown): string => (typeof v === 'string' ? v : '')
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(isRecord) : [])

const toHunk = (h: Record<string, unknown>): ReviewHunk[] =>
  typeof h.file === 'string' && h.file !== '' && typeof h.start === 'number' && typeof h.end === 'number' && h.start <= h.end
    ? [{ file: h.file.replace(/\\/g, '/'), start: h.start, end: h.end }]
    : []

const toNote = (n: Record<string, unknown>): ReviewNote[] =>
  typeof n.file === 'string' && n.file !== '' && typeof n.line === 'number' && n.line >= 1 && typeof n.text === 'string' && n.text !== ''
    ? [{ file: n.file.replace(/\\/g, '/'), line: n.line, text: n.text }]
    : []

const toPart = (p: Record<string, unknown>): ReviewPart[] => {
  const hunks = list(p.hunks).flatMap(toHunk)
  return hunks.length ? [{ title: text(p.title), why: text(p.why), check: text(p.check), hunks, notes: list(p.notes).flatMap(toNote) }] : []
}

export const parseReviewDoc = (json: unknown): ReviewDoc | null => {
  if (!isRecord(json) || !Array.isArray(json.parts)) return null
  return {
    key: text(json.key),
    source: json.source === 'mr' ? 'mr' : 'branch',
    mrIid: isRecord(json.mr) && typeof json.mr.iid === 'number' ? json.mr.iid : null,
    branch: text(json.branch),
    base: text(json.base),
    head: text(json.head),
    parts: list(json.parts).flatMap(toPart)
  }
}

export const reviewName = (key: string): string => `${key} review`

export const reviewArgs = (key: string, mr: { iid: number; source: string; target: string } | null): string[] => [
  '--bg',
  '--name',
  reviewName(key),
  `/review-in-parts ${key} --dashboard${mr ? ` --mr ${mr.iid}` : ''}`
]
