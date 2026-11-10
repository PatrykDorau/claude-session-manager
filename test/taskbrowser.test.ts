import { describe, it, expect } from 'vitest'
import { pickChromePort, claudeProjectKey, withTaskMcp, taskChromeProfile, seedProfile } from '../src/main/taskbrowser'

describe('pickChromePort', () => {
  it('takes the lowest free port from 9301', () => {
    expect(pickChromePort([])).toBe(9301)
    expect(pickChromePort([9301, 9302, 9304])).toBe(9303)
  })
})

describe('claudeProjectKey', () => {
  it('uses forward slashes like Claude Code does', () => {
    expect(claudeProjectKey(String.raw`C:\repo\.claude\worktrees\SOFNJJ-2537`)).toBe('C:/repo/.claude/worktrees/SOFNJJ-2537')
  })
})

describe('taskChromeProfile', () => {
  it('keeps one profile folder per ticket', () => {
    expect(taskChromeProfile('SOFNJJ-2537')).toBe(String.raw`C:\Chrome dev session\tasks\SOFNJJ-2537`)
  })
})

describe('withTaskMcp', () => {
  const server = (port: number): unknown => ({
    type: 'stdio',
    command: 'npx',
    args: ['-y', '@playwright/mcp@latest', '--config', 'C:/cfg.json', '--cdp-endpoint', `http://localhost:${port}`],
    env: {}
  })
  it('adds a folder-only Playwright server that points at the task Chrome', () => {
    const next = withTaskMcp({ projects: {} }, String.raw`C:\repo\wt`, 9302, 'C:/cfg.json')
    expect(next.projects['C:/repo/wt'].mcpServers.playwright).toEqual(server(9302))
  })
  it('keeps everything else in the file and in the project', () => {
    const before = { numStartups: 4, projects: { 'C:/repo/wt': { allowedTools: ['x'], mcpServers: { other: { command: 'a' } } } } }
    const next = withTaskMcp(before, 'C:/repo/wt', 9303, 'C:/cfg.json')
    expect(next.numStartups).toBe(4)
    expect(next.projects['C:/repo/wt'].allowedTools).toEqual(['x'])
    expect(next.projects['C:/repo/wt'].mcpServers.other).toEqual({ command: 'a' })
    expect(next.projects['C:/repo/wt'].mcpServers.playwright).toEqual(server(9303))
  })
})

describe('seedProfile', () => {
  it('copies the base profile without caches and lock files', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const root = mkdtempSync(join(tmpdir(), 'prof-'))
    const base = join(root, 'base')
    mkdirSync(join(base, 'Default', 'Cache'), { recursive: true })
    mkdirSync(join(base, 'Default', 'Network'), { recursive: true })
    writeFileSync(join(base, 'Default', 'Network', 'Cookies'), 'c')
    writeFileSync(join(base, 'Default', 'Cache', 'big'), 'x')
    writeFileSync(join(base, 'SingletonLock'), 'l')
    writeFileSync(join(base, 'Local State'), '{}')
    const target = join(root, 'task')
    expect(await seedProfile(base, target)).toBe(true)
    expect(existsSync(join(target, 'Default', 'Network', 'Cookies'))).toBe(true)
    expect(existsSync(join(target, 'Local State'))).toBe(true)
    expect(existsSync(join(target, 'Default', 'Cache'))).toBe(false)
    expect(existsSync(join(target, 'SingletonLock'))).toBe(false)
    expect(await seedProfile(base, target)).toBe(false)
    rmSync(root, { recursive: true, force: true })
  })
})
