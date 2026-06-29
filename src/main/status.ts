import type { Status } from '../renderer/src/types'

export function deriveStatus(input: {
  isLive: boolean
  needsInput: boolean
  active: boolean
  done: boolean
  pendingToolUse: boolean
  mtimeMs: number
  nowMs: number
  workingWindowMs?: number
}): Status {
  if (!input.isLive) return 'closed'
  if (input.needsInput) return 'waiting'
  if (input.active || input.pendingToolUse) return 'working'
  if (input.done) return 'checkout'
  if (input.nowMs - input.mtimeMs <= (input.workingWindowMs ?? 5000)) return 'working'
  return 'idle'
}
