export type FlowRole = { stage: string; who: string; model: string; isMain: boolean; agents: string[] }
export type FlowStage = { n: number; title: string; isGated: boolean; roles: FlowRole[] }
export type FlowSize = 'S' | 'M' | 'L'
export type FlowMapStep = {
  n: number
  name: string
  sizes: FlowSize[]
  isHighRiskOnlyForM: boolean
  isGated: boolean
  summary: string
  uses: string[]
}
export type FlowSkill = { stages: FlowStage[]; steps: FlowMapStep[]; sizes: string[][]; risk: string[]; error: string | null }
export type HandoffStage = { n: number | null; stage: string; next: string; firstStep: string }
export type FlowAgent = { name: string; model: string; description: string }
export type FlowBooster = { id: string; name: string; detail: string }

const STAGE_ITEM = /^(\d+)\.\s+\*\*(.+?)\*\*/
const RISK_ITEM = /^-\s+\*\*(critical|high|low)\*\*/
const LEADING_NUMBER = /^\s*(\d+)/
const GATE = /\bgate\s+"?yes|gate said "?yes/i

const linesOf = (text: string): string[] => text.split(/\r?\n/)

const cellsOf = (line: string): string[] =>
  line
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.replace(/`/g, '').trim())

const tableAfter = (lines: string[], header: RegExp): string[][] | null => {
  const start = lines.findIndex((line) => header.test(line))
  if (start < 0) return null
  const rows = [cellsOf(lines[start])]
  for (const line of lines.slice(start + 2)) {
    if (!line.trim().startsWith('|')) break
    rows.push(cellsOf(line))
  }
  return rows
}

const stageTitle = (raw: string): string => raw.trim().replace(/[.:]$/, '')

const roleOf = (cells: string[], agentNames: string[]): FlowRole => {
  const [stage = '', who = '', model = ''] = cells
  return { stage, who, model, isMain: /main session/i.test(who), agents: agentNames.filter((name) => who.includes(name)) }
}

const STEP_NAME = /^(\d+)\.\s*(.*)$/
const SIZE_TOKEN = /^[SML]$/

const stepOf = (cells: string[]): FlowMapStep | null => {
  const [step = '', sizeCell = '', gate = '', summary = '', uses = ''] = cells
  const match = STEP_NAME.exec(step)
  if (!match) return null
  const tokens = sizeCell.split(/\s+/).filter(Boolean)
  const isHighRiskOnlyForM = tokens.includes('M(high)')
  const sizes = tokens.map((token) => (token === 'M(high)' ? 'M' : token)).filter((token): token is FlowSize => SIZE_TOKEN.test(token))
  return {
    n: Number(match[1]),
    name: match[2].trim(),
    sizes,
    isHighRiskOnlyForM,
    isGated: /^yes$/i.test(gate),
    summary,
    uses: uses.split(',').map((use) => use.trim()).filter(Boolean)
  }
}

const stepsOf = (lines: string[]): FlowMapStep[] => {
  const table = tableAfter(lines, /^\|\s*Step\s*\|\s*Sizes\s*\|/i) ?? []
  return table.slice(1).flatMap((cells) => stepOf(cells) ?? [])
}

export const parseWorkflow = (text: string, agentNames: string[] = []): FlowSkill => {
  const lines = linesOf(text)
  const items = lines.flatMap((line) => {
    const match = STAGE_ITEM.exec(line)
    return match ? [{ n: Number(match[1]), title: stageTitle(match[2]), isGated: GATE.test(line) }] : []
  })
  const table = tableAfter(lines, /^\|\s*Stage\s*\|\s*Who\s*\|\s*Model\s*\|/i)
  const sizes = tableAfter(lines, /^\|\s*Size\s*\|/i) ?? []
  const risk = lines.filter((line) => RISK_ITEM.test(line)).map((line) => line.replace(/^-\s+/, '').replace(/\*\*/g, '').trim())
  const steps = stepsOf(lines)
  if (!items.length || !table) return { stages: [], steps, sizes, risk, error: 'Stage table not found' }
  const roles = table.slice(1).map((cells) => roleOf(cells, agentNames))
  const stages = items.map((item) => ({
    ...item,
    roles: roles.filter((role) => Number(LEADING_NUMBER.exec(role.stage)?.[1]) === item.n)
  }))
  return { stages, steps, sizes, risk, error: null }
}

export const parseAgentFile = (text: string): FlowAgent | null => {
  const head = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? ''
  const field = (key: string): string => new RegExp(`^${key}:\\s*(.*)$`, 'm').exec(head)?.[1].trim() ?? ''
  const name = field('name')
  return name ? { name, model: field('model'), description: field('description') } : null
}

type HookEntry = { matcher?: string; hooks?: { command?: string }[] }
type Settings = { hooks?: Record<string, HookEntry[]>; enabledPlugins?: Record<string, boolean> }

const parseSettings = (text: string): Settings => {
  try {
    return JSON.parse(text) as Settings
  } catch {
    return {}
  }
}

export const parseBoosters = (text: string): FlowBooster[] => {
  const settings = parseSettings(text)
  const commands = Object.values(settings.hooks ?? {})
    .flat()
    .flatMap((entry) => (entry.hooks ?? []).map((hook) => ({ matcher: entry.matcher ?? '', command: hook.command ?? '' })))
  const plugins = Object.entries(settings.enabledPlugins ?? {}).filter(([, isOn]) => isOn).map(([id]) => id)
  const boosters: FlowBooster[] = []
  const rtk = commands.find((c) => /\brtk(\.exe)?\b/i.test(c.command))
  if (rtk) boosters.push({ id: 'rtk', name: 'rtk', detail: `Rust Token Killer compresses ${rtk.matcher || 'tool'} output before it enters the context` })
  if (plugins.some((id) => id.startsWith('caveman@'))) boosters.push({ id: 'caveman', name: 'caveman', detail: 'Terse chat replies and agent reports; files for people stay in full sentences' })
  return boosters
}

export const parseHandoffStage = (text: string): HandoffStage => {
  const lines = linesOf(text)
  const stepsAt = lines.findIndex((line) => /^##\s+Następne kroki/i.test(line))
  const section = stepsAt < 0 ? [] : lines.slice(stepsAt + 1)
  const sectionEnd = section.findIndex((line) => /^##\s/.test(line))
  const stepLine = section.slice(0, sectionEnd < 0 ? undefined : sectionEnd).find((line) => /^\s*1\.\s/.test(line))
  const firstStep = stepLine ? stepLine.replace(/^\s*1\.\s+/, '').trim() : ''
  const etap = lines.find((line) => /^\s*etap:/i.test(line))
  if (!etap) return { n: null, stage: '', next: '', firstStep }
  const [stagePart, nextPart = ''] = etap.replace(/^\s*etap:\s*/i, '').split(/;\s*następny:\s*/i)
  const number = LEADING_NUMBER.exec(stagePart)
  return { n: number ? Number(number[1]) : null, stage: stagePart.trim(), next: nextPart.trim(), firstStep }
}
