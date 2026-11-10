import type { AgentGroup, AgentState, ModelTier, Session } from '../types'

export interface TreeCounts {
  working: number
  needsYou: number
  stuck: number
  finished: number
}

export const STATE_LOOK: Record<AgentState, { label: string; color: string }> = {
  working: { label: 'working', color: '#6aa9ff' },
  stuck: { label: 'stuck', color: '#e8b84a' },
  interrupted: { label: 'interrupted', color: '#f2706a' },
  finished: { label: 'finished', color: '#3dd68c' }
}

export const MODEL_LOOK: Record<ModelTier, { label: string; color: string }> = {
  opus: { label: 'Opus', color: '#c586c0' },
  sonnet: { label: 'Sonnet', color: '#6aa9ff' },
  haiku: { label: 'Haiku', color: '#4ec9b0' },
  other: { label: 'Model ?', color: '#9d9d9d' }
}

export const treeCounts = (groups: AgentGroup[], sessions: Session[]): TreeCounts => {
  const agents = groups.flatMap((g) => g.agents)
  const ids = new Set(groups.map((g) => g.sessionId))
  return {
    working: agents.filter((a) => a.state === 'working').length,
    needsYou: sessions.filter((s) => ids.has(s.id) && s.status === 'waiting').length,
    stuck: agents.filter((a) => a.state === 'stuck').length,
    finished: agents.filter((a) => a.state === 'finished').length
  }
}

export const filterGroups = (groups: AgentGroup[], filter: { isMovingOnly: boolean; isFinishedHidden: boolean }): AgentGroup[] =>
  groups
    .map((g) => ({
      ...g,
      agents: g.agents.filter(
        (a) => (!filter.isMovingOnly || a.state === 'working') && (!filter.isFinishedHidden || a.state !== 'finished')
      )
    }))
    .filter((g) => g.agents.length)

export const groupLabel = (sessionId: string, session: Session | undefined): string =>
  session?.name ?? session?.ticket ?? `Session ${sessionId.slice(0, 8)}`
