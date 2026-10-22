import type { Stage, Status } from './types'

export function statusColor(status: Status, isColorblind: boolean): string {
  switch (status) {
    case 'waiting':
      return isColorblind ? '#d55e00' : '#f0883e'
    case 'working':
      return isColorblind ? '#009e73' : '#3fb950'
    case 'checkout':
      return isColorblind ? '#56b4e9' : '#58a6ff'
    case 'idle':
      return isColorblind ? '#f0e442' : '#d29922'
    default:
      return '#8b949e'
  }
}

export function statusLabel(status: Status): string {
  switch (status) {
    case 'waiting':
      return 'needs you'
    case 'working':
      return 'working'
    case 'checkout':
      return 'check output'
    case 'idle':
      return 'idle'
    default:
      return 'not active'
  }
}

export function cleanPrompt(text: string): string {
  return text
    .replace(/<command-[a-z-]+>/gi, '')
    .replace(/<\/command-[a-z-]+>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function ago(ms: number): string {
  const d = Math.max(0, Date.now() - ms)
  const m = Math.floor(d / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`
}

export const STAGE_LABEL: Record<Stage, string> = {
  brainstorm: 'Brainstorm',
  repro: 'Repro',
  plan: 'Plan',
  impl: 'Implementation',
  verify: 'Verify',
  qa: 'QA',
  review: 'Review',
  mr: 'MR',
  testing: 'Internal testing',
  done: 'Done'
}

export interface Phase {
  key: string
  label: string
  color: string
  stages: Stage[]
}

export const PHASES: Phase[] = [
  { key: 'analysis', label: 'Analysis', color: '#a371f7', stages: ['brainstorm', 'repro', 'plan'] },
  { key: 'implementation', label: 'Implementation', color: '#f0883e', stages: ['impl'] },
  {
    key: 'verification',
    label: 'Verification',
    color: '#e3b341',
    stages: ['verify', 'qa', 'review']
  },
  { key: 'mr', label: 'MR', color: '#a8c94a', stages: ['mr'] },
  { key: 'testing', label: 'Testing', color: '#56d364', stages: ['testing'] },
  { key: 'done', label: 'Done', color: '#2ea043', stages: ['done'] }
]

export const REJECTED_COLOR = '#f85149'

export function phaseOf(stage: Stage): Phase {
  return PHASES.find((p) => p.stages.includes(stage)) ?? PHASES[0]
}

export function filledSegments(stage: Stage | null): boolean[] {
  const current = stage ? PHASES.indexOf(phaseOf(stage)) : -1
  return PHASES.map((_, i) => i <= current)
}
