import type { Session, Status } from './types'

export interface Stats {
  total: number
  open: number
  needsYou: number
  byStatus: { status: Status; label: string; count: number }[]
  topProjects: { project: string; count: number }[]
  byModel: { model: string; count: number }[]
  totalContextTokens: number
  avgContextTokens: number
  perDay: { label: string; count: number }[]
  bySession: { id: string; label: string; tokens: number; model: string }[]
}

function modelShort(model: string | null): string {
  const m = (model || '').match(/opus|sonnet|haiku|fable/i)
  return m ? m[0].toLowerCase() : ''
}

function sessionLabel(s: Session): string {
  if (s.name) return s.name
  return s.ticket ? `${s.projectName} · ${s.ticket}` : s.projectName
}

const STATUS_LABEL: Record<Status, string> = {
  working: 'working',
  waiting: 'needs you',
  checkout: 'check output',
  idle: 'idle',
  closed: 'not active'
}
const STATUS_ORDER: Status[] = ['working', 'waiting', 'checkout', 'idle', 'closed']
const DAY = 86400000
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function startOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function computeStats(sessions: Session[], nowMs: number): Stats {
  const statusCount: Record<string, number> = {}
  const projectMap = new Map<string, number>()
  const modelMap = new Map<string, number>()
  let totalContextTokens = 0

  for (const s of sessions) {
    statusCount[s.status] = (statusCount[s.status] || 0) + 1
    projectMap.set(s.projectName, (projectMap.get(s.projectName) || 0) + 1)
    const key = modelShort(s.model)
    if (key) modelMap.set(key, (modelMap.get(key) || 0) + 1)
    if (s.contextTokens) totalContextTokens += s.contextTokens
  }

  const withTokens = sessions.filter((s) => s.contextTokens && s.contextTokens > 0)
  const bySession = withTokens
    .slice()
    .sort((a, b) => (b.contextTokens || 0) - (a.contextTokens || 0))
    .slice(0, 12)
    .map((s) => ({
      id: s.id,
      label: sessionLabel(s),
      tokens: s.contextTokens || 0,
      model: modelShort(s.model)
    }))

  const perDay: { label: string; count: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const start = startOfDay(nowMs - i * DAY)
    const end = start + DAY
    const count = sessions.filter((s) => s.lastActive >= start && s.lastActive < end).length
    perDay.push({ label: i === 0 ? 'today' : DAY_NAMES[new Date(start).getDay()], count })
  }

  return {
    total: sessions.length,
    open: sessions.filter((s) => s.isLive).length,
    needsYou: statusCount['waiting'] || 0,
    byStatus: STATUS_ORDER.map((st) => ({
      status: st,
      label: STATUS_LABEL[st],
      count: statusCount[st] || 0
    })),
    topProjects: [...projectMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([project, count]) => ({ project, count })),
    byModel: [...modelMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([model, count]) => ({ model, count })),
    totalContextTokens,
    avgContextTokens: withTokens.length ? Math.round(totalContextTokens / withTokens.length) : 0,
    perDay,
    bySession
  }
}
