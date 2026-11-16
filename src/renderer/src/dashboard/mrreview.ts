import type { DiffRow, MrDraftNote } from '../types'

const isGeneral = (d: MrDraftNote): boolean => !d.anchor && !d.replyTo

export const sortDrafts = (list: MrDraftNote[]): MrDraftNote[] =>
  [...list].sort((a, b) => {
    if (!a.anchor || !b.anchor) return (a.anchor ? 0 : 1) - (b.anchor ? 0 : 1)
    return a.anchor.path.localeCompare(b.anchor.path) || a.anchor.line - b.anchor.line
  })

export const draftsForThread = (list: MrDraftNote[], discussionId: string): MrDraftNote[] => list.filter((d) => d.replyTo === discussionId)

export const generalDrafts = (list: MrDraftNote[]): MrDraftNote[] => list.filter(isGeneral)

export const rowsAround = (rows: DiffRow[], line: number, radius = 6): DiffRow[] | null => {
  const hit = rows.findIndex((r) => r.new === line) >= 0 ? rows.findIndex((r) => r.new === line) : rows.findIndex((r) => r.old === line)
  if (hit < 0) return null
  return rows.slice(Math.max(0, hit - radius), hit + radius + 1).filter((r) => r.kind !== 'hunk')
}
