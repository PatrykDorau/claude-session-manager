import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const ORCHESTRATED_DENY = [
  'Bash(node C:/Users/ASSET-17300/.claude/tools/gitlab.js mr create *)',
  'Bash(node C:/Users/ASSET-17300/.claude/tools/gitlab.js mr update *)'
]

export const writeSessionSettings = (dir: string, gitlabToken: string, isOrchestrated = false): string | null => {
  if (!gitlabToken && !isOrchestrated) return null
  try {
    mkdirSync(dir, { recursive: true })
    const file = join(dir, isOrchestrated ? 'orchestrated-settings.json' : 'session-settings.json')
    const settings = {
      ...(gitlabToken ? { env: { GITLAB_TOKEN: gitlabToken } } : {}),
      ...(isOrchestrated ? { permissions: { deny: ORCHESTRATED_DENY } } : {})
    }
    writeFileSync(file, JSON.stringify(settings, null, 2), 'utf8')
    return file
  } catch {
    return null
  }
}

export const sessionSettingsArgs = (args: string[], file: string | null): string[] => (file ? [...args, '--settings', file] : args)
