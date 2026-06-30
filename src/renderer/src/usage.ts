import type { Severity } from './types'

const COLORS: Record<Severity, string> = {
  normal: '#8b949e',
  warning: '#e69f00',
  critical: '#d55e00'
}

export function severityColor(s: Severity): string {
  return COLORS[s] ?? COLORS.normal
}

export function formatReset(resetsAt: number | null, now: number): string {
  if (resetsAt == null) return ''
  const d = resetsAt - now
  if (d <= 60_000) return 'now'
  const totalMin = Math.floor(d / 60_000)
  const days = Math.floor(totalMin / 1440)
  const hours = Math.floor((totalMin % 1440) / 60)
  const mins = totalMin % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}
