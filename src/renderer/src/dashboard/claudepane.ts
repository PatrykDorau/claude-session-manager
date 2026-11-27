export type ClaudePaneTab = 'work' | 'mr' | 'overview' | 'changes' | 'server' | 'ticket'

export type ClaudePaneMode = 'pane' | 'strip' | 'hidden'

export interface ClaudePaneFlags {
  isMrCollapsed: boolean
}

export const claudePaneMode = (tab: ClaudePaneTab, flags: ClaudePaneFlags): ClaudePaneMode => {
  if (tab === 'work' || tab === 'server' || tab === 'ticket') return 'pane'
  return flags.isMrCollapsed ? 'strip' : 'pane'
}
