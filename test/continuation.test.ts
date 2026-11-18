import { describe, it, expect } from 'vitest'
import { findContinuations, carryOver } from '../src/main/continuation'

const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const B = 'bbbbbbbb-0000-4000-8000-000000000002'
const C = 'cccccccc-0000-4000-8000-000000000003'
const file = (sessionId: string, pid = 7, procStart = 1): { pid: number; procStart: number; sessionId: string } => ({ pid, procStart, sessionId })
const proc = (commandLine: string, pid = 7, startedAt = 1): { pid: number; commandLine: string; startedAt: number } => ({ pid, commandLine, startedAt })
const empty = { links: new Map<string, string>(), seen: new Map<string, { first: string; last: string }>(), active: new Map<string, string>() }

describe('findContinuations', () => {
  it('links the resumed id to the id the process now runs', () => {
    const out = findContinuations([proc(`claude --bg --resume ${A}`)], [file(B)], empty)
    expect([...out.links]).toEqual([[A, B]])
  })

  it('links a /clear in a process started without --resume', () => {
    const first = findContinuations([proc('claude')], [file(A)], empty)
    expect([...first.links]).toEqual([])
    const second = findContinuations([proc('claude')], [file(B)], first)
    expect([...second.links]).toEqual([[A, B]])
  })

  it('collapses chains to the newest id', () => {
    const first = findContinuations([proc(`claude --resume ${A}`)], [file(B)], empty)
    const second = findContinuations([proc(`claude --resume ${A}`)], [file(C)], first)
    expect(new Map(second.links)).toEqual(new Map([[A, C], [B, C]]))
  })

  it('links every middle id after several clears in one process', () => {
    const first = findContinuations([proc('claude')], [file(A)], empty)
    const second = findContinuations([proc('claude')], [file(B)], first)
    const third = findContinuations([proc('claude')], [file(C)], second)
    expect(new Map(third.links)).toEqual(new Map([[A, C], [B, C]]))
  })

  it('ignores a session file whose process start does not match', () => {
    const out = findContinuations([proc(`claude --resume ${A}`, 7, 999_999_999)], [file(B)], empty)
    expect([...out.links]).toEqual([])
  })

  it('keeps everything when the process list could not be read', () => {
    const first = findContinuations([proc(`claude --resume ${A}`)], [file(B)], empty)
    expect(findContinuations([], [file(B)], first)).toBe(first)
  })

  it('reports as active only links backed by a process this round', () => {
    const first = findContinuations([proc(`claude --resume ${A}`)], [file(B)], empty)
    expect([...first.active]).toEqual([[A, B]])
    const gone = findContinuations([proc('claude', 9)], [file(C, 9)], first)
    expect([...gone.links]).toEqual([[A, B]])
    expect([...gone.active]).toEqual([])
  })

  it('drops a link back to the session itself', () => {
    const first = findContinuations([proc(`claude --resume ${A}`)], [file(B)], empty)
    const back = findContinuations([proc(`claude --resume ${A}`)], [file(A)], first)
    expect(back.links.has(A)).toBe(false)
  })

  it('ignores a reused pid and processes without a session file', () => {
    const first = findContinuations([proc('claude')], [file(A)], empty)
    expect([...findContinuations([proc('claude', 7, 2)], [file(B, 7, 2)], first).links]).toEqual([])
    expect([...findContinuations([proc(`claude --resume ${A}`, 9)], [], empty).links]).toEqual([])
  })

  it('ignores the headless handoff fork', () => {
    const out = findContinuations([proc(`claude -p x --resume ${A} --fork-session`)], [file(B)], empty)
    expect([...out.links]).toEqual([])
  })
})

describe('carryOver', () => {
  const state = {
    mrSessions: { 'g/p!1': A, 'g/p!2': C, 'g/p!3': A.slice(0, 8) },
    ticketOverride: { [A]: 'X-1' },
    names: { [A]: 'X-1 fix' },
    watched: [A],
    pane: { [A]: { window: 1, slot: 0 } }
  }

  it('copies per-session data from the old id to the new one', () => {
    const out = carryOver(state, A, B)
    expect(out.mrSessions).toEqual({ 'g/p!1': B, 'g/p!2': C, 'g/p!3': B })
    expect(out.ticketOverride[B]).toBe('X-1')
    expect(out.names[B]).toBe('X-1 fix')
    expect(out.watched).toEqual([A, B])
    expect(out.pane[B]).toEqual({ window: 1, slot: 0 })
  })

  it('keeps what the new id already has', () => {
    const out = carryOver({ ...state, names: { [A]: 'old', [B]: 'mine' }, watched: [A, B] }, A, B)
    expect(out.names[B]).toBe('mine')
    expect(out.watched).toEqual([A, B])
  })
})
