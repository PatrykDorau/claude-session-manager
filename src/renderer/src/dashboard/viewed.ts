export const changeSignature = (file: { added?: number | null; removed?: number | null; contentId?: string | null }): string =>
  `${file.added ?? '-'}:${file.removed ?? '-'}:${file.contentId ?? ''}`

export const isFileViewed = (viewed: Record<string, string>, path: string, signature: string): boolean => viewed[path] === signature

export const toggleViewed = (viewed: Record<string, string>, path: string, signature: string): Record<string, string> => {
  const next = { ...viewed }
  if (next[path] === signature) delete next[path]
  else next[path] = signature
  return next
}
