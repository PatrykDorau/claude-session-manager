import { describe, it, expect } from 'vitest'
import { claudePaneMode } from '../src/renderer/src/dashboard/claudepane'

const flags = { isMrCollapsed: false }

describe('claudePaneMode', () => {
  it('always shows the pane on the Work, Server and Ticket tabs', () => {
    expect(claudePaneMode('work', flags)).toBe('pane')
    expect(claudePaneMode('server', flags)).toBe('pane')
    expect(claudePaneMode('ticket', { isMrCollapsed: true })).toBe('pane')
  })

  it('shows the pane or the strip on the MR tabs', () => {
    expect(claudePaneMode('mr', flags)).toBe('pane')
    expect(claudePaneMode('overview', flags)).toBe('pane')
    expect(claudePaneMode('changes', { isMrCollapsed: true })).toBe('strip')
  })
})
