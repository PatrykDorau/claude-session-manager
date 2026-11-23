import { readFlag } from './dashboard'

export type DiffLayout = 'split' | 'unified'

export const readDiffLayout = (): DiffLayout => (readFlag('dash.diffUnified') ? 'unified' : 'split')

export const mapToSideA = (posB: number, chunks: readonly { fromA: number; toA: number; fromB: number; toB: number }[]): number => {
  let startA = 0
  let startB = 0
  for (const c of chunks) {
    if (c.fromB >= posB) break
    startA = c.toA
    startB = c.toB
  }
  return startA + (posB - startB)
}

export const sidesFor = (layout: DiffLayout, isDiff: boolean, base: string, text: string): { left: string | null; right: string } => ({
  left: layout === 'split' && isDiff ? base : null,
  right: text
})
