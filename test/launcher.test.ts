import { describe, it, expect } from 'vitest'
import { resumeCommand } from '../src/main/launcher'

describe('resumeCommand', () => {
  it('names the session after its ticket', () => {
    expect(resumeCommand('abc-123', 'SOFNJJ-2022')).toBe('claude --resume abc-123 --name SOFNJJ-2022')
  })
  it('keeps the plain command without a ticket', () => {
    expect(resumeCommand('abc-123', null)).toBe('claude --resume abc-123')
  })
})
