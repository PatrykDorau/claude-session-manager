import { describe, it, expect } from 'vitest'
import { orderRows, moveKey } from '../src/renderer/src/dashboard/order'

type Row = { key: string; isActive: boolean; priority?: string }
const rank = (r: Row): { isActive: boolean; priority: string | undefined } => ({ isActive: r.isActive, priority: r.priority })
const keys = (rows: Row[]): string[] => rows.map((r) => r.key)

describe('orderRows', () => {
  const rows: Row[] = [
    { key: 'A', isActive: false, priority: 'Low' },
    { key: 'B', isActive: false, priority: 'Highest' },
    { key: 'C', isActive: true, priority: 'Low' },
    { key: 'D', isActive: false },
    { key: 'E', isActive: false, priority: 'Medium' }
  ]

  it('puts active rows first, then sorts by priority, keeping ties in input order', () => {
    expect(keys(orderRows(rows, rank, undefined))).toEqual(['C', 'B', 'E', 'A', 'D'])
  })

  it('follows a saved manual order', () => {
    expect(keys(orderRows(rows, rank, ['A', 'D', 'E', 'B', 'C']))).toEqual(['A', 'D', 'E', 'B', 'C'])
  })

  it('puts unknown active rows on top and unknown idle rows at the bottom of a manual order', () => {
    const more: Row[] = [...rows, { key: 'F', isActive: true }, { key: 'G', isActive: false, priority: 'Highest' }]
    expect(keys(orderRows(more, rank, ['A', 'D', 'E', 'B', 'C']))).toEqual(['F', 'A', 'D', 'E', 'B', 'C', 'G'])
  })

  it('ignores manual keys that are no longer in the list', () => {
    expect(keys(orderRows(rows, rank, ['X', 'E', 'A']))).toEqual(['C', 'E', 'A', 'B', 'D'])
  })
})

describe('moveKey', () => {
  it('moves a key before the target', () => {
    expect(moveKey(['A', 'B', 'C', 'D'], 'D', 'B', false)).toEqual(['A', 'D', 'B', 'C'])
  })

  it('moves a key after the target', () => {
    expect(moveKey(['A', 'B', 'C', 'D'], 'A', 'C', true)).toEqual(['B', 'C', 'A', 'D'])
  })

  it('returns the order unchanged when dropping on itself', () => {
    expect(moveKey(['A', 'B'], 'A', 'A', true)).toEqual(['A', 'B'])
  })
})
