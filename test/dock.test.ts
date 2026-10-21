import { describe, it, expect } from 'vitest'
import { nearestEdge, dockBounds, pickDisplay } from '../src/main/dock'

const laptop = { x: 0, y: 0, width: 1920, height: 1040 }
const right = { x: 1920, y: 0, width: 1920, height: 1040 }

describe('nearestEdge', () => {
  it('picks the side of the work area the window centre is on', () => {
    expect(nearestEdge({ x: 100, y: 0, width: 360, height: 500 }, laptop)).toBe('left')
    expect(nearestEdge({ x: 1500, y: 0, width: 360, height: 500 }, laptop)).toBe('right')
  })
  it('uses the work area offset on a secondary monitor', () => {
    expect(nearestEdge({ x: 2000, y: 0, width: 360, height: 500 }, right)).toBe('left')
  })
  it('breaks a tie to the right', () => {
    expect(nearestEdge({ x: 780, y: 0, width: 360, height: 500 }, laptop)).toBe('right')
  })
})

describe('dockBounds', () => {
  it('fills the work-area height at the chosen edge', () => {
    expect(dockBounds(right, 'right', 320)).toEqual({ x: 3520, y: 0, width: 320, height: 1040 })
    expect(dockBounds(right, 'left', 320)).toEqual({ x: 1920, y: 0, width: 320, height: 1040 })
  })
  it('clamps the width between 180 and half the work area', () => {
    expect(dockBounds(laptop, 'left', 5000).width).toBe(960)
    expect(dockBounds(laptop, 'left', 50).width).toBe(180)
  })
})

describe('pickDisplay', () => {
  const displays = [
    { id: 1, workArea: laptop },
    { id: 2, workArea: right }
  ]
  it('returns the saved display when it still exists', () => {
    expect(pickDisplay(displays, 2, 1).id).toBe(2)
  })
  it('falls back to the primary display when the saved one is gone', () => {
    expect(pickDisplay(displays, 9, 1).id).toBe(1)
    expect(pickDisplay(displays, null, 1).id).toBe(1)
  })
})
