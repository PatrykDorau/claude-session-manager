import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const writeSessionSettings = (dir: string, gitlabToken: string): string | null => {
  if (!gitlabToken) return null
  try {
    mkdirSync(dir, { recursive: true })
    const file = join(dir, 'session-settings.json')
    writeFileSync(file, JSON.stringify({ env: { GITLAB_TOKEN: gitlabToken } }, null, 2), 'utf8')
    return file
  } catch {
    return null
  }
}

export const sessionSettingsArgs = (args: string[], file: string | null): string[] => (file ? [...args, '--settings', file] : args)
