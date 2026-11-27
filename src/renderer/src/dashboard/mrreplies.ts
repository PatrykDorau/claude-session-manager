import { ref } from 'vue'
import type { MrDiscussion, MrNote } from '../types'
import { writeSize } from './dashboard'

const SEEN_KEY = 'dash.mrSeenReplies'

const readSeen = (): Record<string, number> => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {}
  } catch {
    return {}
  }
}

export const seenReplies = ref<Record<string, number>>(readSeen())

export const markRepliesSeen = (key: string, id: number | null): void => {
  if (id === null || (seenReplies.value[key] ?? 0) >= id) return
  seenReplies.value = { ...seenReplies.value, [key]: id }
  writeSize(SEEN_KEY, JSON.stringify(seenReplies.value))
}

export const isReplyUnseen = (replyId: number | null, seenId: number | undefined): boolean => replyId !== null && replyId > (seenId ?? 0)

const isMineNote = (n: MrNote): boolean => n.isMine
const isPersonReply = (n: MrNote): boolean => !n.isMine && !n.isBot
const idOf = (n: MrNote): number => n.id

const replyIdsToMe = (thread: MrDiscussion): number[] => {
  if (thread.isSystem) return []
  const first = thread.notes.findIndex(isMineNote)
  return first < 0 ? [] : thread.notes.slice(first + 1).filter(isPersonReply).map(idOf)
}

export const lastThreadReply = (threads: MrDiscussion[]): number | null => {
  const ids = threads.flatMap(replyIdsToMe)
  return ids.length ? Math.max(...ids) : null
}

export const newReplyIds = (threads: MrDiscussion[], seenId: number): Set<number> => {
  const isNewer = (id: number): boolean => id > seenId
  return new Set(threads.flatMap(replyIdsToMe).filter(isNewer))
}

export const isBotThread = (thread: MrDiscussion): boolean => thread.notes[0]?.isBot === true

export const isMyThread = (thread: MrDiscussion): boolean => thread.notes.some(isMineNote)

export const sortThreads = (threads: MrDiscussion[], newIds: Set<number>): MrDiscussion[] => {
  const isNewNote = (n: MrNote): boolean => newIds.has(n.id)
  const rankOf = (thread: MrDiscussion): number => (thread.notes.some(isNewNote) ? 0 : isMyThread(thread) ? 1 : 2)
  const byRank = (a: MrDiscussion, b: MrDiscussion): number => rankOf(a) - rankOf(b)
  return [...threads].sort(byRank)
}
