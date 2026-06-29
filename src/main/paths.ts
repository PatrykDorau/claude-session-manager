import { homedir } from 'node:os'
import { join } from 'node:path'

export function claudeRoot(): string {
  return join(homedir(), '.claude')
}
export function projectsDir(): string {
  return join(claudeRoot(), 'projects')
}
export function ideDir(): string {
  return join(claudeRoot(), 'ide')
}
export function needsInputDir(): string {
  return join(claudeRoot(), 'needs-input')
}
export function activeDir(): string {
  return join(claudeRoot(), 'active')
}
export function doneDir(): string {
  return join(claudeRoot(), 'done')
}
