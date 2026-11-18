import type { InsightsContextBucket, InsightsMetricKey } from '../../types'
import { formatCompact } from '../charts'

export type ChartSeries = { key: string; label: string; color: string }

export const CHART_TEXT = '#9ca3af'
export const CHART_TEXT_STRONG = '#e5e7eb'
export const CHART_SPLIT = 'rgba(255,255,255,0.06)'
export const CHART_FONT = "'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif"
export const MARKER_COLOR = '#fbbf24'
export const TICKET_COLOR = '#38bdf8'

const MODEL_COLORS: [string, string][] = [
  ['opus', '#a78bfa'],
  ['sonnet', '#38bdf8'],
  ['haiku', '#fbbf24']
]
const OTHER_COLOR = '#94a3b8'
const STAGE_COLORS: Record<string, string> = {
  main: '#a78bfa',
  implement: '#38bdf8',
  review: '#34d399',
  'repro/verify': '#fbbf24',
  analyze: '#f472b6',
  qa: '#2dd4bf',
  other: '#64748b'
}

export const BUCKETS: (ChartSeries & { key: InsightsContextBucket })[] = [
  { key: 'lt100k', label: '< 100k', color: '#34d399' },
  { key: '100to200k', label: '100–200k', color: '#a3e635' },
  { key: '200to300k', label: '200–300k', color: '#fbbf24' },
  { key: 'gt300k', label: '> 300k', color: '#f87171' }
]
export const HIGH_BUCKETS: InsightsContextBucket[] = ['200to300k', 'gt300k']

export const PROBLEMS: (ChartSeries & { key: InsightsMetricKey })[] = [
  { key: 'corrections', label: 'Corrections', color: '#fbbf24' },
  { key: 'toolErrors', label: 'Tool errors', color: '#f87171' },
  { key: 'ruleBreaks', label: 'Rule breaks', color: '#a78bfa' }
]

export const METRIC_LABELS: Record<InsightsMetricKey, string> = {
  costUnits: 'Cost units',
  avgContext: 'Avg context',
  costAbove200k: 'Cost above 200k',
  corrections: 'Corrections',
  toolErrors: 'Tool errors',
  ruleBreaks: 'Rule breaks',
  repeatedCommands: 'Repeated commands',
  noTests: 'No tests',
  sessions: 'Sessions'
}

export const modelColor = (model: string): string => {
  const id = model.toLowerCase()
  return MODEL_COLORS.find(([name]) => id.includes(name))?.[1] ?? OTHER_COLOR
}

export const stageColor = (stage: string): string => STAGE_COLORS[stage] ?? STAGE_COLORS.other

export const shortModel = (model: string): string => model.replace(/^claude-/, '')

export const formatMetric = (_metric: InsightsMetricKey, value: number): string =>
  formatCompact(value)

export const withAlpha = (hex: string, alpha: number): string => {
  const value = parseInt(hex.slice(1), 16)
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`
}
