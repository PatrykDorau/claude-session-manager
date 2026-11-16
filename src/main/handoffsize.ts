export type HandoffSize = { size: 'S' | 'M' | 'L'; risk: 'low' | 'high' | 'critical' | null }

const SIZE_LINE = /^\s*rozmiar:\s*([sml])\b(.*)$/im
const RISK = /risk\s+(low|high|critical)\b/i

export const parseHandoffSize = (text: string): HandoffSize | null => {
  const match = SIZE_LINE.exec(text)
  if (!match) return null
  const risk = RISK.exec(match[2])?.[1].toLowerCase() as HandoffSize['risk'] | undefined
  return { size: match[1].toUpperCase() as HandoffSize['size'], risk: risk ?? null }
}
