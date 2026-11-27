export type ClaudePaneTab = 'work' | 'mr' | 'overview' | 'changes' | 'server' | 'ticket'

export type ClaudePaneMode = 'pane' | 'strip' | 'hidden'

export interface ClaudePaneFlags {
  isWorkOpen: boolean
  isMrCollapsed: boolean
  isSideOpen: boolean
}

export const claudePaneMode = (tab: ClaudePaneTab, flags: ClaudePaneFlags): ClaudePaneMode => {
  if (tab === 'work') return flags.isWorkOpen ? 'pane' : 'hidden'
  if (tab === 'server' || tab === 'ticket') return flags.isSideOpen ? 'pane' : 'strip'
  return flags.isMrCollapsed ? 'strip' : 'pane'
}
