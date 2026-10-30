import { describe, it, expect } from 'vitest'
import { updateSnapshot, restorable, restoreQueue, forgetSessions, type RestoreState } from '../src/main/restore'

const empty: RestoreState = { snapshot: [], pendingRemoval: {}, lastScanAt: 0 }
const a = { id: 'a', projectPath: 'C:\\A' }
const b = { id: 'b', projectPath: 'C:\\B' }
const T = 1_000_000

const scans = (state: RestoreState, steps: [typeof a[], boolean, number][]): RestoreState =>
  steps.reduce((s, [live, isOpen, now]) => updateSnapshot(s, live, isOpen, now), state)

describe('updateSnapshot', () => {
  it('adds a live session with the scan time', () => {
    const out = updateSnapshot(empty, [a], true, T)
    expect(out.snapshot).toEqual([{ ...a, lastLiveAt: T }])
    expect(out.lastScanAt).toBe(T)
  })
  it('removes a session closed on purpose after 10 s while VS Code stays open', () => {
    const start = scans(empty, [[[a, b], true, T]])
    const early = scans(start, [[[b], true, T + 2000], [[b], true, T + 4000]])
    expect(early.snapshot.map((e) => e.id).sort()).toEqual(['a', 'b'])
    const late = scans(early, [[[b], true, T + 8000], [[b], true, T + 12000]])
    expect(late.snapshot.map((e) => e.id)).toEqual(['b'])
  })
  it('keeps every session when VS Code closes window by window', () => {
    const out = scans(empty, [
      [[a, b], true, T],
      [[b], true, T + 2000],
      [[b], true, T + 4000],
      [[], false, T + 6000],
      [[], false, T + 20000]
    ])
    expect(out.snapshot.map((e) => e.id).sort()).toEqual(['a', 'b'])
    expect(out.pendingRemoval).toEqual({})
  })
  it('keeps the other sessions when one is reopened by hand after a reboot', () => {
    const before = scans(empty, [[[a, b], true, T]])
    const after = scans(before, [
      [[], false, T + 3_600_000],
      [[a], true, T + 3_602_000],
      [[a], true, T + 3_620_000]
    ])
    expect(restorable(after.snapshot, ['a'], T + 3_620_000).map((e) => e.id)).toEqual(['b'])
  })
  it('does not treat sessions from before an app restart as closed on purpose', () => {
    const before = scans(empty, [[[a, b], true, T]])
    const after = scans(before, [
      [[a], true, T + 600_000],
      [[a], true, T + 620_000]
    ])
    expect(after.snapshot.map((e) => e.id).sort()).toEqual(['a', 'b'])
  })
})

describe('restorable', () => {
  it('skips live sessions and entries older than 3 days', () => {
    const day = 24 * 3600 * 1000
    const snapshot = [
      { ...a, lastLiveAt: T },
      { ...b, lastLiveAt: T - 4 * day },
      { id: 'c', projectPath: 'C:\\C', lastLiveAt: T - 2 * day }
    ]
    expect(restorable(snapshot, ['a'], T).map((e) => e.id)).toEqual(['c'])
  })
})

describe('restoreQueue', () => {
  it('groups by project and drops sessions the app no longer knows', () => {
    const snapshot = [
      { id: 'b1', projectPath: 'C:\\B', lastLiveAt: T },
      { id: 'a1', projectPath: 'C:\\A', lastLiveAt: T },
      { id: 'gone', projectPath: 'C:\\A', lastLiveAt: T },
      { id: 'b2', projectPath: 'C:\\B', lastLiveAt: T },
      { id: 'a2', projectPath: 'c:/a', lastLiveAt: T }
    ]
    const known = ['b1', 'a1', 'b2', 'a2']
    expect(restoreQueue(snapshot, [], known, T).map((e) => e.id)).toEqual(['a1', 'a2', 'b1', 'b2'])
  })
})

describe('forgetSessions', () => {
  it('drops closed ids from snapshot and pending', () => {
    const state: RestoreState = {
      snapshot: [
        { ...a, lastLiveAt: T },
        { ...b, lastLiveAt: T }
      ],
      pendingRemoval: { a: T },
      lastScanAt: T
    }
    const out = forgetSessions(state, ['a'])
    expect(out.snapshot.map((e) => e.id)).toEqual(['b'])
    expect(out.pendingRemoval).toEqual({})
    expect(out.lastScanAt).toBe(T)
    expect(restorable(out.snapshot, [], T).map((e) => e.id)).toEqual(['b'])
  })
})
