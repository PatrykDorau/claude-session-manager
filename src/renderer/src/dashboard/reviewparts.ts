import type { ReviewDoc, ReviewPart } from '../types'

export interface PartProgress {
  head: string
  updatedAt: number
  reviewed: number[]
  remarks: Record<number, string>
}

export const progressKey = (doc: ReviewDoc): string => `dash.parts.${doc.key}.${doc.branch}`

export const toggleReviewed = (p: PartProgress, index: number): PartProgress => ({
  ...p,
  reviewed: p.reviewed.includes(index) ? p.reviewed.filter((i) => i !== index) : [...p.reviewed, index].sort((a, b) => a - b)
})

export const setRemark = (p: PartProgress, index: number, text: string): PartProgress => {
  const remarks = { ...p.remarks }
  if (text.trim()) remarks[index] = text
  else delete remarks[index]
  return { ...p, remarks }
}

export const isSameHead = (a: string, b: string): boolean => !!a && !!b && (a.startsWith(b) || b.startsWith(a))

export const staleReason = (doc: ReviewDoc, files: { path: string }[], currentHead: string | null): 'moved' | 'files' | null => {
  const paths = new Set(files.map((f) => f.path))
  if (currentHead && !isSameHead(doc.head, currentHead)) return 'moved'
  return doc.parts.some((part) => part.hunks.some((h) => !paths.has(h.file))) ? 'files' : null
}

export const isStale = (doc: ReviewDoc, files: { path: string }[], currentHead: string | null): boolean => staleReason(doc, files, currentHead) !== null

export const remarkedParts = (doc: ReviewDoc, p: PartProgress): { index: number; part: ReviewPart; text: string }[] =>
  doc.parts.flatMap((part, index) => {
    const text = p.remarks[index]?.trim()
    return text ? [{ index, part, text }] : []
  })

export const remarksPrompt = (doc: ReviewDoc, p: PartProgress): string =>
  [
    'Review remarks to address:',
    ...remarkedParts(doc, p).map(({ index, part, text }) => {
      const first = part.hunks[0]
      return `Part ${index + 1} "${part.title}" (${first.file}:${first.start}-${first.end}): ${text}`
    })
  ].join('\n')

export const remarkDrafts = (doc: ReviewDoc, p: PartProgress): { body: string; path: string; line: number }[] =>
  remarkedParts(doc, p).map(({ part, text }) => ({ body: text, path: part.hunks[0].file, line: part.hunks[0].start }))

export const restoreProgress = (doc: ReviewDoc & { updatedAt: number }, raw: string | null): PartProgress => {
  const fresh: PartProgress = { head: doc.head, updatedAt: doc.updatedAt, reviewed: [], remarks: {} }
  try {
    const saved = raw ? (JSON.parse(raw) as Partial<PartProgress>) : null
    if (!saved || saved.head !== doc.head || saved.updatedAt !== doc.updatedAt) return fresh
    return { ...fresh, reviewed: Array.isArray(saved.reviewed) ? saved.reviewed : [], remarks: saved.remarks ?? {} }
  } catch {
    return fresh
  }
}
