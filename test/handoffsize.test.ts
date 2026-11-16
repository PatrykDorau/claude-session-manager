import { describe, expect, it } from 'vitest'
import { parseHandoffSize } from '../src/main/handoffsize'

describe('parseHandoffSize', () => {
  it('reads size and risk from the Rozmiar line', () => {
    expect(parseHandoffSize('# Cel\nx\nRozmiar: M — scope S, risk high — player hook\n')).toEqual({ size: 'M', risk: 'high' })
  })
  it('ignores casing and plain dashes', () => {
    expect(parseHandoffSize('rozmiar: l - scope L, risk critical - focus')).toEqual({ size: 'L', risk: 'critical' })
  })
  it('keeps the size when the risk is missing', () => {
    expect(parseHandoffSize('Rozmiar: S — tiny')).toEqual({ size: 'S', risk: null })
  })
  it('returns null without a Rozmiar line', () => {
    expect(parseHandoffSize('# Cel\nnothing here')).toBeNull()
  })
})
