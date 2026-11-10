import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { migrateUserData } from '../src/main/migrate'

const dirs = (): { root: string; oldDir: string; newDir: string } => {
  const root = mkdtempSync(join(tmpdir(), 'mig-'))
  return { root, oldDir: join(root, 'old'), newDir: join(root, 'new') }
}

describe('migrateUserData', () => {
  it('copies the state and the local storage from the old folder', () => {
    const { root, oldDir, newDir } = dirs()
    mkdirSync(join(oldDir, 'Local Storage', 'leveldb'), { recursive: true })
    writeFileSync(join(oldDir, 'state.json'), '{"starred":["A-1"]}')
    writeFileSync(join(oldDir, 'Local Storage', 'leveldb', '000.log'), 'x')
    expect(migrateUserData(oldDir, newDir)).toBe(true)
    expect(readFileSync(join(newDir, 'state.json'), 'utf8')).toBe('{"starred":["A-1"]}')
    expect(existsSync(join(newDir, 'Local Storage', 'leveldb', '000.log'))).toBe(true)
    rmSync(root, { recursive: true, force: true })
  })
  it('never overwrites a state the new folder already has', () => {
    const { root, oldDir, newDir } = dirs()
    mkdirSync(oldDir)
    mkdirSync(newDir)
    writeFileSync(join(oldDir, 'state.json'), 'old')
    writeFileSync(join(newDir, 'state.json'), 'new')
    expect(migrateUserData(oldDir, newDir)).toBe(false)
    expect(readFileSync(join(newDir, 'state.json'), 'utf8')).toBe('new')
    rmSync(root, { recursive: true, force: true })
  })
  it('does nothing without an old state', () => {
    const { root, oldDir, newDir } = dirs()
    expect(migrateUserData(oldDir, newDir)).toBe(false)
    expect(existsSync(newDir)).toBe(false)
    rmSync(root, { recursive: true, force: true })
  })
})
