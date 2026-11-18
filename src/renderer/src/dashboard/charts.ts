const sumOf = (values: number[]): number => values.reduce((total, value) => total + value, 0)

const COMPACT_UNITS = ['', 'k', 'M', 'B']

const trimDecimal = (value: number): string => String(Math.round(value * 10) / 10)

export const formatCompact = (n: number): string => {
  if (!Number.isFinite(n)) return '0'
  const sign = n < 0 ? '-' : ''
  let scaled = Math.abs(n)
  let unit = 0
  while (unit < COMPACT_UNITS.length - 1 && Math.round(scaled * 10) / 10 >= 1000) {
    scaled /= 1000
    unit += 1
  }
  return `${sign}${trimDecimal(scaled)}${COMPACT_UNITS[unit]}`
}

export const formatMinutes = (minutes: number): string => {
  const total = Math.max(0, Math.round(minutes))
  const hours = Math.floor(total / 60)
  const rest = total % 60
  if (hours === 0) return `${rest}m`
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

export const tileDelta = (
  today: number,
  earlier: number[]
): { value: number; deltaPct: number | null } => {
  const average = earlier.length === 0 ? 0 : sumOf(earlier) / earlier.length
  return {
    value: today,
    deltaPct: average === 0 ? null : Math.round(((today - average) / average) * 100)
  }
}

export const markerIndexes = (days: string[], applied: { day: string }[]): number[] =>
  days.flatMap((day, index) => (applied.some((entry) => entry.day === day) ? [index] : []))

export const bucketShares = (
  buckets: Record<string, { cost: number }>
): { key: string; share: number }[] => {
  const total = sumOf(Object.values(buckets).map((bucket) => bucket.cost))
  return Object.entries(buckets).map(([key, bucket]) => ({
    key,
    share: total === 0 ? 0 : bucket.cost / total
  }))
}
