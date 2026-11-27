export interface BlobRef {
  projectPath: string
  ref: string
  path: string
  start: number
  end: number
}

export interface BlobRow {
  no: number
  text: string
  isHit: boolean
}

const CONTEXT_LINES = 3

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const decodeSafe = (text: string): string => {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

export const blobKey = (b: BlobRef): string => `${b.projectPath}@${b.ref}:${b.path}#${b.start}-${b.end}`

export const parseBlobLinks = (body: string, origin: string): BlobRef[] => {
  const pattern = new RegExp(
    `${escapeRegExp(origin)}/([^\\s#?<>"\\\\]+?)/-/blob/([^/\\s#?<>"\\\\]+)/([^\\s#?<>)\\]"\\\\]+)(?:\\?[^\\s#<>)\\]"\\\\]*)?#L(\\d+)(?:-L?(\\d+))?`,
    'g'
  )
  const seen = new Set<string>()
  const refs: BlobRef[] = []
  for (const m of body.matchAll(pattern)) {
    const first = Number(m[4])
    const second = m[5] ? Number(m[5]) : first
    const ref: BlobRef = {
      projectPath: decodeSafe(m[1]),
      ref: decodeSafe(m[2]),
      path: decodeSafe(m[3]),
      start: Math.min(first, second),
      end: Math.max(first, second)
    }
    const key = blobKey(ref)
    if (seen.has(key)) continue
    seen.add(key)
    refs.push(ref)
  }
  return refs
}

export const blobWindow = (text: string, start: number, end: number): BlobRow[] => {
  const lines = text.split(/\r?\n/)
  if (start < 1 || start > lines.length) return []
  const from = Math.max(1, start - CONTEXT_LINES)
  const to = Math.min(lines.length, end + CONTEXT_LINES)
  const rows: BlobRow[] = []
  for (let no = from; no <= to; no++) rows.push({ no, text: lines[no - 1], isHit: no >= start && no <= end })
  return rows
}
