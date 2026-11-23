import { describe, it, expect } from 'vitest'
import { mapToSideA, sidesFor } from '../src/renderer/src/dashboard/difflayout'

describe('mapToSideA', () => {
  const chunks = [
    { fromA: 10, toA: 20, fromB: 10, toB: 15 },
    { fromA: 40, toA: 40, fromB: 35, toB: 60 }
  ]
  it('keeps a position before every change', () => {
    expect(mapToSideA(5, chunks)).toBe(5)
  })
  it('shifts a position after a shrinking change', () => {
    expect(mapToSideA(25, chunks)).toBe(30)
  })
  it('shifts a position after an insertion', () => {
    expect(mapToSideA(70, chunks)).toBe(50)
  })
  it('maps the start of a change to its start on side A', () => {
    expect(mapToSideA(35, chunks)).toBe(40)
  })
  it('is the identity without changes', () => {
    expect(mapToSideA(12, [])).toBe(12)
  })
})

describe('sidesFor', () => {
  it('splits old and new', () => {
    expect(sidesFor('split', true, 'old', 'new')).toEqual({ left: 'old', right: 'new' })
  })
  it('gives an added file an empty left side', () => {
    expect(sidesFor('split', true, '', 'new')).toEqual({ left: '', right: 'new' })
  })
  it('has no left side when diff is off', () => {
    expect(sidesFor('split', false, 'old', 'new')).toEqual({ left: null, right: 'new' })
  })
  it('has no left side when unified', () => {
    expect(sidesFor('unified', true, 'old', 'new')).toEqual({ left: null, right: 'new' })
  })
})
