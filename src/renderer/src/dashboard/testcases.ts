const SECTION = /<details>\s*<summary>\s*test case[^<]*<\/summary>([\s\S]*?)<\/details>/i

export const testCasesFromMr = (description: string): string | null => {
  const body = SECTION.exec(description)?.[1]?.trim()
  return body ? body : null
}

const cells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())

const isTableSeparator = (line: string): boolean => /^\s*\|?\s*:?-{3,}/.test(line) && !/[a-z0-9]/i.test(line)

const inline = (text: string): string => text.replace(/\*\*(.+?)\*\*/g, '*$1*').replace(/`([^`]+)`/g, '{{$1}}')

export const markdownToJira = (md: string): string => {
  const lines = md.split(/\r?\n/)
  const out: string[] = []
  lines.forEach((line, i) => {
    if (isTableSeparator(line)) return
    const isTableRow = /^\s*\|.*\|\s*$/.test(line)
    if (isTableRow) {
      const isHeader = isTableSeparator(lines[i + 1] ?? '')
      const row = cells(line).map(inline)
      out.push(isHeader ? `||${row.join('||')}||` : `|${row.join('|')}|`)
      return
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      out.push(`h${heading[1].length}. ${inline(heading[2])}`)
      return
    }
    const bullet = /^(\s*)[-*]\s+(.*)$/.exec(line)
    if (bullet) {
      out.push(`${'*'.repeat(Math.floor(bullet[1].length / 2) + 1)} ${inline(bullet[2])}`)
      return
    }
    const numbered = /^(\s*)\d+\.\s+(.*)$/.exec(line)
    if (numbered) {
      out.push(`${'#'.repeat(Math.floor(numbered[1].length / 2) + 1)} ${inline(numbered[2])}`)
      return
    }
    out.push(inline(line))
  })
  return out.join('\n').trim()
}
