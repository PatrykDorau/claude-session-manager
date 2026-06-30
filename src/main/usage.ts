import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { Gauge, Severity } from '../renderer/src/types'
import type { UsageResult } from '../renderer/src/types'

const LABELS: Record<string, string> = {
  session: 'Session (5h)',
  weekly_all: 'Weekly (all models)'
}

function numeric(v: unknown): v is number {
  return typeof v === 'number' && !Number.isNaN(v)
}

function clampPercent(v: unknown): number {
  return numeric(v) ? Math.max(0, Math.min(100, Math.round(v))) : 0
}

function toEpoch(v: unknown): number | null {
  if (typeof v !== 'string') return null
  const t = Date.parse(v)
  return Number.isNaN(t) ? null : t
}

function toSeverity(v: unknown): Severity {
  return v === 'warning' || v === 'critical' ? v : 'normal'
}

function severityFromPercent(p: number): Severity {
  if (p >= 95) return 'critical'
  if (p >= 80) return 'warning'
  return 'normal'
}

function gaugeFromLimit(key: string, label: string, l: Record<string, unknown>): Gauge {
  return { key, label, percent: clampPercent(l.percent), severity: toSeverity(l.severity), resetsAt: toEpoch(l.resets_at) }
}

function gaugeFromWindow(key: string, label: string, w: Record<string, unknown>): Gauge {
  const percent = clampPercent(w.utilization)
  return { key, label, percent, severity: severityFromPercent(percent), resetsAt: toEpoch(w.resets_at) }
}

export function parseUsageResponse(raw: unknown): Gauge[] {
  const r = (raw ?? {}) as Record<string, any>
  const limits: any[] = Array.isArray(r.limits) ? r.limits : []
  const byKind = (k: string): any => limits.find((l) => l?.kind === k)
  const gauges: Gauge[] = []

  const session = byKind('session')
  if (session) gauges.push(gaugeFromLimit('session', LABELS.session, session))
  else if (numeric(r.five_hour?.utilization)) gauges.push(gaugeFromWindow('session', LABELS.session, r.five_hour))

  const weekly = byKind('weekly_all')
  if (weekly) gauges.push(gaugeFromLimit('weekly_all', LABELS.weekly_all, weekly))
  else if (numeric(r.seven_day?.utilization)) gauges.push(gaugeFromWindow('weekly_all', LABELS.weekly_all, r.seven_day))

  if (numeric(r.seven_day_opus?.utilization)) gauges.push(gaugeFromWindow('weekly_opus', 'Weekly (Opus)', r.seven_day_opus))
  if (numeric(r.seven_day_sonnet?.utilization)) gauges.push(gaugeFromWindow('weekly_sonnet', 'Weekly (Sonnet)', r.seven_day_sonnet))

  return gauges
}

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'

function readToken(): string | null {
  try {
    const j = JSON.parse(readFileSync(join(homedir(), '.claude', '.credentials.json'), 'utf8'))
    const o = j.claudeAiOauth ?? j
    return typeof o.accessToken === 'string' ? o.accessToken : null
  } catch {
    return null
  }
}

export async function fetchUsage(): Promise<UsageResult> {
  const token = readToken()
  if (!token) return { ok: false, error: 'no-credentials', fetchedAt: Date.now() }
  try {
    const res = await fetch(USAGE_URL, {
      headers: { Authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20' }
    })
    if (res.status === 401) return { ok: false, error: 'expired', fetchedAt: Date.now() }
    if (!res.ok) return { ok: false, error: 'network', fetchedAt: Date.now() }
    return { ok: true, gauges: parseUsageResponse(await res.json()), fetchedAt: Date.now() }
  } catch {
    return { ok: false, error: 'network', fetchedAt: Date.now() }
  }
}
