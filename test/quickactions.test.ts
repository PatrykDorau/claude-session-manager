import { describe, it, expect } from 'vitest'
import { fillPrompt, actionsForStage } from '../src/renderer/src/quickactions'
import type { QuickAction } from '../src/renderer/src/types'

describe('fillPrompt', () => {
  it('fills known values and keeps missing ones visible', () => {
    expect(fillPrompt('Fix {ticket} on {server}', { ticket: 'A-1', server: null })).toBe('Fix A-1 on {server}')
    expect(fillPrompt('{ticket} {ticket}', { ticket: 'A-1' })).toBe('A-1 A-1')
  })
  it('leaves other braces alone', () => {
    expect(fillPrompt('{"a":1} {x}', { ticket: 'A-1' })).toBe('{"a":1} {x}')
  })
  it('does not fill placeholders that come from a value', () => {
    expect(fillPrompt('{title}', { title: 'see {ticket}', ticket: 'A-1' })).toBe('see {ticket}')
  })
})

describe('actionsForStage', () => {
  const a: QuickAction = { label: 'a', prompt: 'a' }
  const b: QuickAction = { label: 'b', prompt: 'b', stages: [] }
  const c: QuickAction = { label: 'c', prompt: 'c', stages: ['qa'] }
  it('shows unrestricted actions everywhere and restricted ones only in their stages', () => {
    expect(actionsForStage([a, b, c], 'qa')).toEqual([a, b, c])
    expect(actionsForStage([a, b, c], 'impl')).toEqual([a, b])
    expect(actionsForStage([a, b, c], null)).toEqual([a, b])
  })
})
