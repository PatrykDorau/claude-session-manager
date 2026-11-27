import type { TaskRow } from '../taskview'
import type { ReleaseRow } from '../types'

const WAITING_FOR_RELEASE = /waiting\s+for\s+internal\s+release/i
const INTERNAL_TESTING = /^internal\s+testing$/i

const isCandidateStatus = (status: string): boolean => WAITING_FOR_RELEASE.test(status) || INTERNAL_TESTING.test(status)

const isCandidate = (row: TaskRow): boolean => row.isFromJira && isCandidateStatus(row.status)

const toCandidate = ({ key, summary, status }: TaskRow): { key: string; summary: string; status: string } => ({ key, summary, status })

export const releaseCandidates = (rows: TaskRow[]): { key: string; summary: string; status: string }[] => rows.filter(isCandidate).map(toCandidate)

export const isReleasableRow = (row: ReleaseRow): boolean => row.stage !== 'waiting' && row.blockers.length === 0
