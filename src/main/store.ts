import { readFileSync, writeFileSync } from 'node:fs'

export interface State {
  watched: string[]
  names: Record<string, string>
}

export function loadState(file: string): State {
  try {
    const o = JSON.parse(readFileSync(file, 'utf8'))
    return {
      watched: Array.isArray(o.watched) ? o.watched : [],
      names: o.names && typeof o.names === 'object' ? o.names : {}
    }
  } catch {
    return { watched: [], names: {} }
  }
}

export function saveState(file: string, state: State): void {
  try {
    writeFileSync(file, JSON.stringify(state, null, 2), 'utf8')
  } catch {
    return
  }
}

export function applyWatched(state: State, id: string, on: boolean): State {
  const set = new Set(state.watched)
  if (on) set.add(id)
  else set.delete(id)
  return { ...state, watched: [...set] }
}

export function applyName(state: State, id: string, name: string | null): State {
  const names = { ...state.names }
  const trimmed = name?.trim()
  if (trimmed) names[id] = trimmed
  else delete names[id]
  return { ...state, names }
}
