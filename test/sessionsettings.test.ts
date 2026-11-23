import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { writeSessionSettings, sessionSettingsArgs, ORCHESTRATED_DENY } from '../src/main/sessionsettings'

describe('orchestrated session settings', () => {
  it('denies MR create and update', () => {
    expect(ORCHESTRATED_DENY).toEqual([
      'Bash(node C:/Users/ASSET-17300/.claude/tools/gitlab.js mr create *)',
      'Bash(node C:/Users/ASSET-17300/.claude/tools/gitlab.js mr update *)'
    ])
  })

  it('writes the token and the deny rules to their own file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cockpit-settings-'))
    try {
      const file = writeSessionSettings(dir, 'glpat-abc', true)
      expect(file).toBe(join(dir, 'orchestrated-settings.json'))
      expect(JSON.parse(readFileSync(file as string, 'utf8'))).toEqual({ env: { GITLAB_TOKEN: 'glpat-abc' }, permissions: { deny: ORCHESTRATED_DENY } })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('writes the deny rules even without a token', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cockpit-settings-'))
    try {
      const file = writeSessionSettings(dir, '', true)
      expect(JSON.parse(readFileSync(file as string, 'utf8'))).toEqual({ permissions: { deny: ORCHESTRATED_DENY } })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('writeSessionSettings', () => {
  it('writes the GitLab token as a session env var', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cockpit-settings-'))
    try {
      const file = writeSessionSettings(dir, 'glpat-abc')
      expect(file).toBe(join(dir, 'session-settings.json'))
      expect(JSON.parse(readFileSync(file as string, 'utf8'))).toEqual({ env: { GITLAB_TOKEN: 'glpat-abc' } })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('writes nothing when no token is set', () => {
    expect(writeSessionSettings(join(tmpdir(), 'never-created'), '')).toBe(null)
  })
})

describe('sessionSettingsArgs', () => {
  it('appends --settings with the file', () => {
    expect(sessionSettingsArgs(['--bg', 'x'], 'C:/s.json')).toEqual(['--bg', 'x', '--settings', 'C:/s.json'])
  })

  it('leaves the args alone without a file', () => {
    expect(sessionSettingsArgs(['--bg'], null)).toEqual(['--bg'])
  })
})
