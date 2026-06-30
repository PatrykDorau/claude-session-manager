import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const HOOK_SCRIPT = `const fs = require('fs')
const os = require('os')
const path = require('path')

const marker = process.argv[2]
const action = process.argv[3]
let data = ''
process.stdin.on('data', (c) => (data += c))
process.stdin.on('end', () => {
  let o
  try {
    o = JSON.parse(data)
  } catch {
    return
  }
  const id = o.session_id
  if (!id || !marker) return
  if (marker === 'needs-input' && action === 'set') {
    const msg = String(o.message || '').toLowerCase()
    if (!msg.includes('permission')) return
  }
  const dir = path.join(os.homedir(), '.claude', marker)
  const file = path.join(dir, id)
  try {
    if (action === 'set') {
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(file, '1')
    } else {
      fs.rmSync(file, { force: true })
    }
  } catch {
    return
  }
})
`

const OURS: Record<string, string[]> = {
  Notification: ['needs-input set'],
  UserPromptSubmit: ['active set', 'needs-input clear', 'done clear'],
  Stop: ['active clear', 'needs-input clear', 'done set'],
  PostToolUse: ['needs-input clear']
}

export function installHooks(): { ok: boolean; error?: string } {
  try {
    const claude = join(homedir(), '.claude')
    const scriptPath = join(claude, 'needs-input-hook.js')
    writeFileSync(scriptPath, HOOK_SCRIPT)

    const settingsPath = join(claude, 'settings.json')
    let settings: Record<string, unknown> = {}
    if (existsSync(settingsPath)) {
      try {
        settings = JSON.parse(readFileSync(settingsPath, 'utf8'))
      } catch {
        return { ok: false, error: 'Could not parse ~/.claude/settings.json — left it untouched.' }
      }
      copyFileSync(settingsPath, settingsPath + '.bak')
    }

    const node = `node "${scriptPath.replace(/\\/g, '/')}"`
    const cmd = (args: string): { type: string; command: string } => ({
      type: 'command',
      command: `${node} ${args}`
    })
    const hooks: Record<string, { matcher?: string; hooks?: { command?: string }[] }[]> =
      settings.hooks && typeof settings.hooks === 'object'
        ? (settings.hooks as Record<string, { matcher?: string; hooks?: { command?: string }[] }[]>)
        : {}

    for (const [event, argsList] of Object.entries(OURS)) {
      const groups = Array.isArray(hooks[event]) ? hooks[event] : []
      const cleaned = groups
        .map((g) => ({
          ...g,
          hooks: Array.isArray(g.hooks)
            ? g.hooks.filter((h) => !String(h?.command ?? '').includes('needs-input-hook.js'))
            : []
        }))
        .filter((g) => (g.hooks?.length ?? 0) > 0)
      cleaned.push({ hooks: argsList.map(cmd) })
      hooks[event] = cleaned
    }
    settings.hooks = hooks
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}
