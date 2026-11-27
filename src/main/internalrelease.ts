import type { JiraTransition } from './jira'
import { isWaitingForRelease, type ReleaseDeps } from './release'
import { isPipelinePassed } from '../renderer/src/dashboard/internalrelease'
import type { InternalReleaseRow, ReleaseCheck, ReleaseResult } from '../renderer/src/types'

export type InternalReleaseDeps = Pick<ReleaseDeps, 'status' | 'transitions' | 'transition' | 'unassign'>

export const isInInternalRelease = (status: string): boolean => /^internal\s+release$/i.test(status)

const isTransitionToInternalRelease = (t: JiraTransition): boolean => isInInternalRelease(t.to)

const isTransitionNamedInternalRelease = (t: JiraTransition): boolean => isInInternalRelease(t.name)

export const internalReleaseTransition = (list: JiraTransition[]): JiraTransition | null =>
  list.find(isTransitionToInternalRelease) ?? list.find(isTransitionNamedInternalRelease) ?? null

export const internalReleaseRow = (
  ticket: { key: string; summary: string; status: string },
  checks: ReleaseCheck[],
  transitions: JiraTransition[] | null
): InternalReleaseRow => ({ ...ticket, checks, transition: internalReleaseTransition(transitions ?? [])?.to ?? null })

export const internalReleaseBlocker = (key: string, status: string | null, checks: ReleaseCheck[]): string | null => {
  if (status === null) return `Not ready: could not read ${key} from Jira`
  if (!isWaitingForRelease(status)) return `Not ready: status is ${status}, not Waiting for internal release`
  return isPipelinePassed(checks) ? null : 'Not ready: pipeline has not passed'
}

const moveToInternalRelease = async (key: string, deps: InternalReleaseDeps, done: string[]): Promise<string | null> => {
  const status = await deps.status(key)
  if (status && isInInternalRelease(status)) return null
  const transition = internalReleaseTransition((await deps.transitions(key)) ?? [])
  if (!transition) return `Cannot move ${key} to Internal release from ${status ?? 'unknown'}`
  if (!(await deps.transition(key, transition.id))) return `Jira did not accept moving ${key} to Internal release`
  done.push('Internal release')
  return null
}

export const internalReleaseTicket = async (key: string, deps: InternalReleaseDeps): Promise<ReleaseResult> => {
  const done: string[] = []
  const moveError = await moveToInternalRelease(key, deps, done)
  if (moveError) return { key, error: moveError, done }
  if (!(await deps.unassign(key))) return { key, error: 'Jira did not accept removing the assignee', done }
  done.push('unassigned')
  return { key, error: null, done }
}
