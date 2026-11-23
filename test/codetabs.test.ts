import { describe, it, expect } from 'vitest'
import { openTab, rememberTab, closeTab, tabScope, TAB_LIMIT, type CodeTab } from '../src/renderer/src/dashboard/codetabs'

const tab = (path: string, usedAt: number): CodeTab => ({ path, line: 1, topLine: 0, usedAt })

describe('openTab', () => {
  it('keeps one tab per path and bumps its use time', () => {
    const tabs = openTab(openTab([], 'a.ts', 1), 'a.ts', 5)
    expect(tabs).toEqual([{ path: 'a.ts', line: 1, topLine: 0, usedAt: 5 }])
  })

  it('drops the least recently used tab above the limit and keeps the new one', () => {
    const full = Array.from({ length: TAB_LIMIT }, (_, i) => tab(`f${i}.ts`, i === 3 ? 0 : i + 10))
    const tabs = openTab(full, 'new.ts', 100)
    expect(tabs).toHaveLength(TAB_LIMIT)
    expect(tabs.map((t) => t.path)).not.toContain('f3.ts')
    expect(tabs[tabs.length - 1].path).toBe('new.ts')
  })
})

describe('rememberTab', () => {
  it('updates only the given tab', () => {
    const tabs = rememberTab([tab('a.ts', 1), tab('b.ts', 2)], 'b.ts', 40, 900)
    expect(tabs).toEqual([tab('a.ts', 1), { path: 'b.ts', line: 40, topLine: 900, usedAt: 2 }])
  })
})

describe('closeTab', () => {
  const tabs = [tab('a.ts', 1), tab('b.ts', 2), tab('c.ts', 3)]

  it('shows the next tab after closing one in the middle', () => {
    expect(closeTab(tabs, 'b.ts')).toEqual({ tabs: [tab('a.ts', 1), tab('c.ts', 3)], next: 'c.ts' })
  })

  it('shows the previous tab after closing the last one', () => {
    expect(closeTab(tabs, 'c.ts').next).toBe('b.ts')
  })

  it('shows nothing after closing the only tab', () => {
    expect(closeTab([tab('a.ts', 1)], 'a.ts')).toEqual({ tabs: [], next: null })
  })
})

describe('tabScope', () => {
  it('is equal for the same folder and source so the tabs survive a re-render', () => {
    expect(tabScope('C:/repo', 'feat/x')).toBe(tabScope('C:/repo', 'feat/x'))
    expect(tabScope('C:/repo', null)).not.toBe(tabScope('C:/repo', 'feat/x'))
  })
})
