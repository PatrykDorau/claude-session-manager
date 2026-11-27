import { describe, it, expect } from 'vitest'
import { claudePaneMode } from '../src/renderer/src/dashboard/claudepane'

const flags = { isWorkOpen: true, isMrCollapsed: false, isSideOpen: false }

describe('claudePaneMode', () => {
  it('follows the Code / Claude toggle on the Work tab', () => {
    expect(claudePaneMode('work', flags)).toBe('pane')
    expect(claudePaneMode('work', { ...flags, isWorkOpen: false })).toBe('hidden')
  })

  it('shows the pane or the strip on the MR tabs', () => {
    expect(claudePaneMode('mr', flags)).toBe('pane')
    expect(claudePaneMode('overview', flags)).toBe('pane')
    expect(claudePaneMode('changes', { ...flags, isMrCollapsed: true })).toBe('strip')
  })

  it('shows the strip by default on the Server and Ticket tabs', () => {
    expect(claudePaneMode('server', flags)).toBe('strip')
    expect(claudePaneMode('ticket', flags)).toBe('strip')
    expect(claudePaneMode('server', { ...flags, isSideOpen: true })).toBe('pane')
  })
})
