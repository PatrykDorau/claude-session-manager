import type { TaskRow } from '../taskview'
import type { InternalReleaseRow, ReleaseCheck } from '../types'

const WAITING_FOR_RELEASE = /waiting\s+for\s+internal\s+release/i

const isCandidate = (row: TaskRow): boolean => row.isFromJira && WAITING_FOR_RELEASE.test(row.status)

const toCandidate = ({ key, summary, status }: TaskRow): { key: string; summary: string; status: string } => ({ key, summary, status })

export const internalReleaseCandidates = (rows: TaskRow[]): { key: string; summary: string; status: string }[] => rows.filter(isCandidate).map(toCandidate)

const isCheckPassed = (c: ReleaseCheck): boolean => c.mr.state === 'merged' && c.pipeline?.status === 'success'

export const isPipelinePassed = (checks: ReleaseCheck[]): boolean => checks.length > 0 && checks.every(isCheckPassed)

export const isPreselected = (row: InternalReleaseRow): boolean => row.transition !== null && isPipelinePassed(row.checks)

const toKey = (row: InternalReleaseRow): string => row.key

export const preselectedKeys = (rows: InternalReleaseRow[]): string[] => rows.filter(isPreselected).map(toKey)
