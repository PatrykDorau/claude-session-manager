import { extractResumeIds } from './processes'

export interface Continuations {
  links: Map<string, string>
  seen: Map<string, { first: string; last: string }>
  active: Map<string, string>
}

const START_TOLERANCE = 10_000

const collapse = (links: Map<string, string>): Map<string, string> => {
  const out = new Map<string, string>()
  for (const from of links.keys()) {
    let to = links.get(from) as string
    const visited = new Set([from])
    while (links.has(to) && !visited.has(to)) {
      visited.add(to)
      to = links.get(to) as string
    }
    if (to !== from) out.set(from, to)
  }
  return out
}

export const findContinuations = (
  procs: { pid: number; commandLine: string; startedAt: number }[],
  files: { pid: number; procStart: number; sessionId: string }[],
  prev: Continuations
): Continuations => {
  if (!procs.length) return prev
  const links = new Map(prev.links)
  const seen = new Map<string, { first: string; last: string }>()
  const backed = new Set<string>()
  for (const f of files) {
    const proc = procs.find((p) => p.pid === f.pid && Math.abs(p.startedAt - f.procStart) < START_TOLERANCE)
    if (!proc) continue
    const key = `${f.pid}:${f.procStart}`
    const before = prev.seen.get(key)
    seen.set(key, { first: before?.first ?? f.sessionId, last: f.sessionId })
    links.delete(f.sessionId)
    for (const old of [...extractResumeIds([proc.commandLine]), before?.first, before?.last])
      if (old && old !== f.sessionId) {
        links.set(old, f.sessionId)
        backed.add(old)
      }
  }
  const collapsed = collapse(links)
  const active = new Map([...collapsed].filter(([from]) => backed.has(from)))
  return { links: collapsed, seen, active }
}

export const launchIdsOf = (id: string, active: Map<string, string>): string[] => [
  ...(active.has(id) ? [] : [id]),
  ...[...active].filter(([, to]) => to === id).map(([from]) => from)
]

export interface CarryState {
  mrSessions: Record<string, string>
  ticketOverride: Record<string, string>
  names: Record<string, string>
  watched: string[]
  pane: Record<string, unknown>
}

const copyKey = <T>(map: Record<string, T>, from: string, to: string): Record<string, T> =>
  from in map && !(to in map) ? { ...map, [to]: map[from] } : map

export const carryOver = <S extends CarryState>(state: S, from: string, to: string): S => ({
  ...state,
  mrSessions: Object.fromEntries(Object.entries(state.mrSessions).map(([k, v]) => [k, v.length >= 8 && from.startsWith(v) ? to : v])),
  ticketOverride: copyKey(state.ticketOverride, from, to),
  names: copyKey(state.names, from, to),
  watched: state.watched.includes(from) && !state.watched.includes(to) ? [...state.watched, to] : state.watched,
  pane: copyKey(state.pane, from, to)
})
