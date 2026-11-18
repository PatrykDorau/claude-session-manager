import { describe, it, expect } from 'vitest'
import { contextLevel, formatContext, handoffPath, handoffPrompt, clearStartPrompt, isIdleLarge, nextClearStep, modelTag } from '../src/renderer/src/dashboard/context'

const date = new Date(2026, 10, 16)
const path = 'C:\\Users\\ASSET-17300\\Desktop\\Opis zadan\\11-2026\\SOFRMPT-1\\handoff.md'

describe('contextLevel', () => {
  it('has no level without tokens', () => {
    expect(contextLevel(null)).toBe('none')
    expect(contextLevel(0)).toBe('none')
  })

  it('splits tokens at the warn and danger thresholds', () => {
    expect(contextLevel(149_999)).toBe('ok')
    expect(contextLevel(150_000)).toBe('warn')
    expect(contextLevel(250_000)).toBe('danger')
  })
})

describe('formatContext', () => {
  it('shows thousands as k and small counts as is', () => {
    expect(formatContext(312_400)).toBe('312k')
    expect(formatContext(900)).toBe('900')
    expect(formatContext(null)).toBe('')
  })
})

describe('handoffPath', () => {
  it('points at handoff.md in the ticket folder of the month', () => {
    expect(handoffPath('SOFRMPT-1', date)).toBe(path)
  })
})

describe('handoffPrompt', () => {
  it('asks for handoff.md at that path with every section', () => {
    const prompt = handoffPrompt('SOFRMPT-1', date)
    expect(prompt).toContain(path)
    expect(prompt).toContain('handoff.md')
    for (const section of ['handoff', 'Cel', 'Gałąź i worktree', 'Następne kroki', 'Decyzje', 'Zmienione pliki', 'Zrobione', 'Pułapki', 'Zakładki']) {
      expect(prompt).toContain(section)
    }
  })
})

describe('clearStartPrompt', () => {
  it('makes the fresh session read the handoff and wait', () => {
    const now = new Date(2026, 10, 16)
    expect(clearStartPrompt('T-1', now)).toBe(
      `Przeczytaj ${handoffPath('T-1', now)} według skilla handoff. Nie wykonuj kolejnego kroku — odpowiedz krótko, że jesteś gotowy, i czekaj, aż powiem, co robić.`
    )
  })
})

describe('isIdleLarge', () => {
  const now = 10_000_000_000
  it('is true for 100k+ idle 30 minutes', () => {
    expect(isIdleLarge({ contextTokens: 100_000, lastActive: now - 30 * 60_000, status: 'idle' }, now)).toBe(true)
  })
  it('is false while working, when recent or small', () => {
    expect(isIdleLarge({ contextTokens: 200_000, lastActive: now - 3_600_000, status: 'working' }, now)).toBe(false)
    expect(isIdleLarge({ contextTokens: 200_000, lastActive: now - 3_600_000, status: 'waiting' }, now)).toBe(false)
    expect(isIdleLarge({ contextTokens: 200_000, lastActive: now - 60_000, status: 'idle' }, now)).toBe(false)
    expect(isIdleLarge({ contextTokens: 99_000, lastActive: now - 3_600_000, status: 'idle' }, now)).toBe(false)
  })
})

describe('nextClearStep', () => {
  it('clears when the handoff turn finished', () => {
    expect(nextClearStep('handoff', 'working', 'idle')).toEqual({ phase: 'none', isClearNow: true })
    expect(nextClearStep('handoff', 'working', 'checkout')).toEqual({ phase: 'none', isClearNow: true })
  })
  it('waits while the handoff turn has not started', () => {
    expect(nextClearStep('handoff', 'idle', 'idle')).toEqual({ phase: 'handoff', isClearNow: false })
  })
  it('blocks when the handoff ends on a question', () => {
    expect(nextClearStep('handoff', 'working', 'waiting')).toEqual({ phase: 'blocked', isClearNow: false })
  })
  it('goes back to waiting for the handoff turn once the answer resumes it', () => {
    expect(nextClearStep('blocked', 'waiting', 'working')).toEqual({ phase: 'handoff', isClearNow: false })
  })
  it('gives up when the question ends without resuming the turn', () => {
    expect(nextClearStep('blocked', 'waiting', 'idle')).toEqual({ phase: 'none', isClearNow: false })
  })
  it('gives up when the session closes', () => {
    expect(nextClearStep('handoff', 'working', 'closed')).toEqual({ phase: 'none', isClearNow: false })
  })
  it('never clears outside the flow', () => {
    expect(nextClearStep('none', 'working', 'idle')).toEqual({ phase: 'none', isClearNow: false })
  })
})

describe('modelTag', () => {
  it('shortens known models', () => {
    expect(modelTag('claude-opus-5-5')).toBe('O')
    expect(modelTag('claude-sonnet-5-5')).toBe('S')
    expect(modelTag('claude-haiku-5-5')).toBe('H')
  })
  it('has no tag for unknown or missing models', () => {
    expect(modelTag('<synthetic>')).toBeNull()
    expect(modelTag(null)).toBeNull()
  })
})
