import type { Stage } from '../types'
import { STAGE_LABEL } from '../display'

const CHECKED_STAGES: Stage[] = ['repro', 'plan', 'impl', 'verify', 'qa', 'review']

export const CREATE_MR_PROMPT =
  'To moja wyraźna prośba o utworzenie MR: przygotuj tytuł i opis (browser-verify mr) i utwórz draft MR przez gitlab.js mr create dla {ticket}. Nie publikuj niczego poza tym MR.'

export const readiness = (
  reached: Stage[],
  times: { handoffAt: number | null; lastCommitAt: number | null }
): { items: { id: string; label: string; isDone: boolean }[]; done: number; total: number } => {
  const isHandoffDone = times.handoffAt !== null && (times.lastCommitAt === null || times.handoffAt > times.lastCommitAt)
  const items = [
    ...CHECKED_STAGES.map((stage) => ({ id: stage, label: STAGE_LABEL[stage], isDone: reached.includes(stage) })),
    { id: 'handoff', label: 'Handoff up to date', isDone: isHandoffDone }
  ]
  return { items, done: items.filter((i) => i.isDone).length, total: items.length }
}
