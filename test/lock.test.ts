import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseLockFile, normalizePath } from '../src/main/lock'

describe('normalizePath', () => {
  it('lowercases drive, unifies separators, strips trailing slash', () => {
    expect(normalizePath('C:\\Users\\Me\\Proj\\')).toBe('c:/users/me/proj')
    expect(normalizePath('c:/users/me/proj')).toBe('c:/users/me/proj')
  })
})

describe('parseLockFile', () => {
  it('parses a real lock fixture', () => {
    const raw = readFileSync(join(__dirname, 'fixtures/ide-sample.lock'), 'utf8')
    const lock = parseLockFile(raw)
    expect(lock?.pid).toBe(13164)
    expect(lock?.workspaceFolders[0]).toContain('krs-fo-smarttv')
  })
  it('returns null on malformed json', () => {
    expect(parseLockFile('{not json')).toBe(null)
  })
})
