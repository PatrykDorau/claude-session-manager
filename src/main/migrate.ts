import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const CARRIED = ['state.json', 'Local Storage']

export const migrateUserData = (oldDir: string, newDir: string): boolean => {
  if (!existsSync(join(oldDir, 'state.json')) || existsSync(join(newDir, 'state.json'))) return false
  mkdirSync(newDir, { recursive: true })
  for (const entry of CARRIED) {
    const from = join(oldDir, entry)
    if (existsSync(from)) cpSync(from, join(newDir, entry), { recursive: true })
  }
  return true
}
