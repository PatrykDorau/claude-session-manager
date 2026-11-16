export type FlowRole = { stage: string; who: string; model: string; isMain: boolean; agents: string[] }
export type FlowStage = { n: number; title: string; isGated: boolean; roles: FlowRole[] }
export type FlowSkill = { stages: FlowStage[]; sizes: string[][]; risk: string[]; error: string | null }
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

export const parseWorkflow = (text: string, agentNames: string[] = []): FlowSkill => {
  const lines = linesOf(text)
  const items = lines.flatMap((line) => {
    const match = STAGE_ITEM.exec(line)
    return match ? [{ n: Number(match[1]), title: stageTitle(match[2]), isGated: GATE.test(line) }] : []
  })
  const table = tableAfter(lines, /^\|\s*Stage\s*\|\s*Who\s*\|\s*Model\s*\|/i)
  const sizes = tableAfter(lines, /^\|\s*Size\s*\|/i) ?? []
  const risk = lines.filter((line) => RISK_ITEM.test(line)).map((line) => line.replace(/^-\s+/, '').replace(/\*\*/g, '').trim())
  if (!items.length || !table) return { stages: [], sizes, risk, error: 'Stage table not found' }
  const roles = table.slice(1).map((cells) => roleOf(cells, agentNames))
  const stages = items.map((item) => ({
    ...item,
    roles: roles.filter((role) => Number(LEADING_NUMBER.exec(role.stage)?.[1]) === item.n)
  }))
  return { stages, sizes, risk, error: null }
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
