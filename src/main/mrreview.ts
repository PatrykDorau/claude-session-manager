import type { DiffRow, MrCommentable, MrDiffRefs, MrLineAnchor, MrLinePosition, MrReviewAction } from '../renderer/src/types'
import { diffRows } from './mractions'

const HUNK_START = /^@@ -(\d+)(?:,\d+)? \+(\d+)/

interface Hunk {
  rows: DiffRow[]
  oldEnd: number
  newEnd: number
  net: number
}

const hunksOf = (diff: string): Hunk[] => {
  const hunks: Hunk[] = []
  for (const row of diffRows(diff)) {
    if (row.kind === 'hunk') {
      const header = HUNK_START.exec(row.text)
      hunks.push({ rows: [], oldEnd: Number(header?.[1] ?? 1) - 1, newEnd: Number(header?.[2] ?? 1) - 1, net: 0 })
      continue
    }
    const hunk = hunks[hunks.length - 1]
    if (!hunk) continue
    hunk.rows.push(row)
    if (row.old !== null) hunk.oldEnd = row.old
    if (row.new !== null) hunk.newEnd = row.new
    if (row.kind === '+') hunk.net += 1
    if (row.kind === '-') hunk.net -= 1
  }
  return hunks
}

export const positionForLine = (
  refs: MrDiffRefs,
  file: { oldPath: string; newPath: string; diff: string },
  line: number,
  side: 'new' | 'old'
): MrLinePosition | null => {
  if (!Number.isInteger(line) || line < 1) return null
  const base: MrLinePosition = {
    position_type: 'text',
    base_sha: refs.baseSha,
    start_sha: refs.startSha,
    head_sha: refs.headSha,
    old_path: file.oldPath,
    new_path: file.newPath
  }
  const hunks = hunksOf(file.diff)
  const isNew = side === 'new'
  const row = hunks.flatMap((h) => h.rows).find((r) => (isNew ? r.new : r.old) === line)
  if (row) {
    return {
      ...base,
      ...(row.new !== null ? { new_line: row.new } : {}),
      ...(row.old !== null ? { old_line: row.old } : {})
    }
  }
  const shift = hunks.filter((h) => (isNew ? h.newEnd : h.oldEnd) < line).reduce((sum, h) => sum + h.net, 0)
  return isNew ? { ...base, new_line: line, old_line: line - shift } : { ...base, new_line: line + shift, old_line: line }
}

const DRAFT_PREFIX = /^\s*(?:(?:draft:|wip:|\[draft\]|\(draft\))\s*)+/i

export const withDraftTitle = (title: string, isDraft: boolean): string => {
  const plain = title.replace(DRAFT_PREFIX, '')
  return isDraft ? `Draft: ${plain}` : plain
}

export const commentableState = (input: {
  headSha: string | null
  shownSha: string | null
  isFileDirty: boolean
  isLatestVersion: boolean
}): MrCommentable => {
  const refuse = (reason: string): MrCommentable => ({ isAllowed: false, reason })
  if (!input.headSha) return refuse('Waiting for the merge request to load.')
  if (!input.isLatestVersion) return refuse('Comments can only be added on the latest version.')
  if (input.shownSha !== input.headSha) return refuse('The code shown is not the pushed MR head. Press Refresh, or push your local commits first.')
  if (input.isFileDirty) return refuse('This file has uncommitted changes, so line numbers may not match the MR.')
  return { isAllowed: true, reason: null }
}

export const reviewConfirm = (action: MrReviewAction, iid: number): { question: string; button: string } | null => {
  switch (action.kind) {
    case 'draft-add':
    case 'draft-edit':
    case 'draft-resolve':
      return null
    case 'draft-delete':
      return { question: `Delete this pending draft note on !${iid}?`, button: 'Delete' }
    case 'submit-review':
      return { question: `Submit your review with ${action.count} draft notes on !${iid}?`, button: 'Submit review' }
    case 'line-comment':
      return { question: `Post this comment on !${iid} now?`, button: 'Post comment' }
    case 'resolve':
      return action.isResolved
        ? { question: `Resolve this thread on !${iid}?`, button: 'Resolve' }
        : { question: `Reopen this thread on !${iid}?`, button: 'Unresolve' }
    case 'reply':
      return { question: `Post this reply on !${iid}?`, button: 'Post reply' }
    case 'note-edit':
      return { question: `Save your edited comment on !${iid}?`, button: 'Save' }
    case 'note-delete':
      return { question: `Delete your comment on !${iid}?`, button: 'Delete' }
    case 'set-draft':
      return action.isDraft ? { question: `Mark !${iid} as draft?`, button: 'Mark as draft' } : { question: `Mark !${iid} as ready?`, button: 'Mark as ready' }
    case 'edit-text':
      return { question: `Save the title and description of !${iid}?`, button: 'Save' }
  }
}

export const anchorPosition = (
  refs: MrDiffRefs | null,
  file: { oldPath: string; newPath: string; diff: string; isTruncated: boolean } | null,
  anchor: MrLineAnchor
): { position: MrLinePosition } | { error: string } => {
  if (!refs) return { error: 'Could not read the merge request head from GitLab.' }
  if (refs.headSha !== anchor.sha) return { error: 'The merge request changed since you opened this file. Press Refresh and comment again.' }
  if (!file) return { error: `Could not load the diff of ${anchor.path} from GitLab, so the line cannot be placed safely.` }
  if (file.isTruncated && !file.diff) return { error: `GitLab does not show the diff of ${anchor.path} (too large), so the line cannot be placed safely.` }
  const position = positionForLine(refs, file, anchor.line, anchor.side)
  return position ? { position } : { error: 'This line is not part of the merge request diff' }
}

const SAFE_EXPLANATION = /^[\w.-]+\.md$/

export const explanationFiles = (json: unknown): Record<string, string> => {
  if (!Array.isArray(json)) return {}
  const entries = json.flatMap((entry) => {
    const id = entry && typeof entry === 'object' ? (entry as Record<string, unknown>).discussionId : null
    const file = entry && typeof entry === 'object' ? (entry as Record<string, unknown>).explanation : null
    return typeof id === 'string' && id && typeof file === 'string' && SAFE_EXPLANATION.test(file) && !file.includes('..') ? [[id, file] as const] : []
  })
  return Object.fromEntries(entries)
}
