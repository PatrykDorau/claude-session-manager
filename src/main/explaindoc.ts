import type { ExplainChange, ExplainDoc, FlowStep } from '../renderer/src/types'

const text = (v: unknown): string => (typeof v === 'string' ? v : '')
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(isRecord) : [])

const toStep = (s: Record<string, unknown>): FlowStep[] =>
  typeof s.step === 'number'
    ? [
        {
          step: s.step,
          title: text(s.title),
          before: text(s.before),
          after: text(s.after),
          isChanged: s.isChanged === true,
          ms: typeof s.ms === 'number' ? s.ms : null
        }
      ]
    : []

const toChange = (c: Record<string, unknown>): ExplainChange[] =>
  typeof c.file === 'string' && typeof c.line === 'number' && c.line > 0
    ? [
        {
          file: c.file.replace(/\\/g, '/'),
          line: c.line,
          step: typeof c.step === 'number' ? c.step : 0,
          title: text(c.title),
          why: text(c.why)
        }
      ]
    : []

export const parseExplainDoc = (json: unknown): ExplainDoc | null => {
  if (!isRecord(json) || !Array.isArray(json.flow) || !Array.isArray(json.changes)) return null
  return {
    ticket: text(json.ticket),
    branch: text(json.branch),
    base: text(json.base),
    process: text(json.process),
    flow: list(json.flow).flatMap(toStep),
    changes: list(json.changes).flatMap(toChange)
  }
}

export const explainArgs = (key: string, transcript: string | null): string[] => [
  '--bg',
  '--name',
  `${key} explain`,
  `/explain-changes ${key} --dashboard${transcript ? ` --transcript "${transcript}"` : ''}`
]
