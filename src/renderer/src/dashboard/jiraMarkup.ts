export interface Span {
  text: string
  isBold: boolean
  isItalic: boolean
  isCode: boolean
  href?: string
}

export type Block =
  | { kind: 'heading'; level: number; spans: Span[] }
  | { kind: 'item'; depth: number; spans: Span[] }
  | { kind: 'para'; spans: Span[] }
  | { kind: 'code'; text: string }

const INLINE = /\{\{(.+?)\}\}|\*([^*\s][^*]*?)\*|(?<![\w])_([^_\s][^_]*?)_(?![\w])/g
const HEADING = /^h([1-6])\.\s+(.*)$/
const ITEM = /^([*#-]+)\s+(.*)$/
const CODE_START = /^\{(code|noformat)(:[^}]*)?\}(.*)$/

const plain = (text: string): Span => ({ text, isBold: false, isItalic: false, isCode: false })

const LINK = /\[([^\]|]+)\|(https?:\/\/[^\]\s]+)\]|(https?:\/\/[^\s<>\]]+[^\s<>\].,;:!?)])/g

const linkify = (span: Span): Span[] => {
  if (span.isCode) return [span]
  const out: Span[] = []
  let last = 0
  for (const m of span.text.matchAll(LINK)) {
    const at = m.index ?? 0
    if (at > last) out.push({ ...span, text: span.text.slice(last, at) })
    out.push({ ...span, text: m[1] ?? m[3], href: m[2] ?? m[3] })
    last = at + m[0].length
  }
  if (!out.length) return [span]
  if (last < span.text.length) out.push({ ...span, text: span.text.slice(last) })
  return out
}

export const parseInline = (text: string): Span[] => parseFormatting(text).flatMap(linkify)

const parseFormatting = (text: string): Span[] => {
  const spans: Span[] = []
  let last = 0
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0
    if (at > last) spans.push(plain(text.slice(last, at)))
    spans.push({ text: m[1] ?? m[2] ?? m[3], isBold: m[2] !== undefined, isItalic: m[3] !== undefined, isCode: m[1] !== undefined })
    last = at + m[0].length
  }
  if (last < text.length) spans.push(plain(text.slice(last)))
  return spans
}

const parseCodeBlock = (lines: string[], start: number): { block: Block; next: number } => {
  const opening = CODE_START.exec(lines[start].trim()) as RegExpExecArray
  const tag = `{${opening[1]}}`
  const rest = opening[3]
  if (rest.includes(tag)) return { block: { kind: 'code', text: rest.slice(0, rest.indexOf(tag)) }, next: start + 1 }
  const body = rest ? [rest] : []
  let i = start + 1
  while (i < lines.length && !lines[i].includes(tag)) body.push(lines[i++])
  if (i < lines.length) {
    const tail = lines[i].slice(0, lines[i].indexOf(tag))
    if (tail) body.push(tail)
  }
  return { block: { kind: 'code', text: body.join('\n') }, next: i + 1 }
}

const parseLine = (line: string): Block => {
  const heading = HEADING.exec(line)
  if (heading) return { kind: 'heading', level: Number(heading[1]), spans: parseInline(heading[2]) }
  const item = ITEM.exec(line)
  if (item) return { kind: 'item', depth: item[1].length, spans: parseInline(item[2]) }
  return { kind: 'para', spans: parseInline(line) }
}

export const parseJiraMarkup = (text: string): Block[] => {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()
    if (!line) {
      i += 1
    } else if (CODE_START.test(line)) {
      const { block, next } = parseCodeBlock(lines, i)
      blocks.push(block)
      i = next
    } else {
      blocks.push(parseLine(line))
      i += 1
    }
  }
  return blocks
}
