import type { MrDiscussion, MrDraftNote } from '../types'
import { draftsForThread } from './mrreview'

export type ThreadFilter = 'open' | 'resolved' | 'all'

const isNotSystem = (thread: MrDiscussion): boolean => !thread.isSystem

const isResolvedThread = (thread: MrDiscussion): boolean => thread.isResolvable && thread.isResolved

const isAnyThread = (): boolean => true

const makeOpenPredicate = (drafts: MrDraftNote[]): ((thread: MrDiscussion) => boolean) => {
  const isOpenThread = (thread: MrDiscussion): boolean =>
    !thread.isResolvable || !thread.isResolved || draftsForThread(drafts, thread.id).length > 0
  return isOpenThread
}

const makeFilterPredicate = (
  drafts: MrDraftNote[],
  filter: ThreadFilter,
  isSystemShown: boolean,
  keptIds: string[]
): ((thread: MrDiscussion) => boolean) => {
  const isMatching = filter === 'open' ? makeOpenPredicate(drafts) : filter === 'resolved' ? isResolvedThread : isAnyThread
  const isKept = (thread: MrDiscussion): boolean => (thread.isSystem ? isSystemShown : keptIds.includes(thread.id) || isMatching(thread))
  return isKept
}

export const filterThreads = (
  threads: MrDiscussion[],
  drafts: MrDraftNote[],
  filter: ThreadFilter,
  isSystemShown: boolean,
  keptIds: string[] = []
): MrDiscussion[] => threads.filter(makeFilterPredicate(drafts, filter, isSystemShown, keptIds))

export const threadCounts = (threads: MrDiscussion[], drafts: MrDraftNote[]): { open: number; resolved: number } => {
  const visible = threads.filter(isNotSystem)
  return {
    open: visible.filter(makeOpenPredicate(drafts)).length,
    resolved: visible.filter(isResolvedThread).length
  }
}

export const noteLink = (mrUrl: string, noteId: number): string => `${mrUrl}#note_${noteId}`
