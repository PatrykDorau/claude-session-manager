import type { InboxReason, PendingTool, Status } from '../renderer/src/types'

export const inboxReason = (
  status: Status,
  tail: { pendingTool: PendingTool | null; isOpaqueRequest: boolean; isQuestion: boolean }
): InboxReason | null => {
  if (status === 'checkout') return 'finished'
  if (status !== 'waiting') return null
  return tail.isQuestion ? 'question' : 'permission'
}

export const isAnswerCurrent = (now: { status: Status; toolUseId: string | null }, expected: string): boolean =>
  now.status === 'waiting' && !!now.toolUseId && now.toolUseId === expected

export const isFinishedNotifiable = (sessionId: string, view: { isFocused: boolean; viewingId: string | null }): boolean =>
  !(view.isFocused && view.viewingId === sessionId)

const TURN_STATES: Status[] = ['working', 'waiting', 'idle']

export const finishedTransitions = (
  previous: Map<string, Status>,
  sessions: { id: string; isLive: boolean; status: Status }[]
): { finished: string[]; next: Map<string, Status> } => {
  const next = new Map(previous)
  const finished: string[] = []
  for (const s of sessions) {
    if (!s.isLive) continue
    const before = previous.get(s.id)
    if (s.status === 'checkout' && before && TURN_STATES.includes(before)) finished.push(s.id)
    next.set(s.id, s.status)
  }
  return { finished, next }
}
