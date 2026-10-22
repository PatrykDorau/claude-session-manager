import { describe, it, expect } from 'vitest'
import { filledSegments, phaseOf, PHASES } from '../src/renderer/src/display'

describe('phaseOf', () => {
  it('groups detailed stages into six phases', () => {
    expect(phaseOf('brainstorm').key).toBe('analysis')
    expect(phaseOf('repro').key).toBe('analysis')
    expect(phaseOf('plan').key).toBe('analysis')
    expect(phaseOf('impl').key).toBe('implementation')
    expect(phaseOf('verify').key).toBe('verification')
    expect(phaseOf('qa').key).toBe('verification')
    expect(phaseOf('review').key).toBe('verification')
    expect(phaseOf('mr').key).toBe('mr')
    expect(phaseOf('testing').key).toBe('testing')
    expect(phaseOf('done').key).toBe('done')
  })
})

describe('filledSegments', () => {
  it('fills every phase up to and including the current one', () => {
    expect(filledSegments('impl')).toEqual([true, true, false, false, false, false])
    expect(filledSegments('repro')).toEqual([true, false, false, false, false, false])
  })
  it('fills nothing without a stage and everything at Done', () => {
    expect(filledSegments(null).every((x) => !x)).toBe(true)
    expect(filledSegments('testing').filter(Boolean)).toHaveLength(5)
    expect(filledSegments('done').every(Boolean)).toBe(true)
  })
})

describe('PHASES', () => {
  it('gives every phase its own colour', () => {
    expect(new Set(PHASES.map((p) => p.color)).size).toBe(PHASES.length)
  })
})
