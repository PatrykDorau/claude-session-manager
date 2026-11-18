export interface ImportStatement {
  spec: string
  specFrom: number
  specTo: number
  start: number
  defaultName: string | null
  named: { imported: string; local: string }[]
  namespace: string | null
}

const IMPORT = /\b(?:import|export)\s+(?:type\s+)?([\w$*{}\s,]*?)\s*from\s*(['"])([^'"\n]+)\2|\bimport\s*\(\s*(['"])([^'"\n]+)\4\s*\)|\bimport\s+(['"])([^'"\n]+)\6/g
const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.vue', '.d.ts', '/index.ts', '/index.tsx', '/index.js', '/index.jsx', '/index.vue']

const parseClause = (clause: string): Pick<ImportStatement, 'defaultName' | 'named' | 'namespace'> => {
  const braces = /\{([^}]*)\}/.exec(clause)
  const named = (braces?.[1] ?? '')
    .split(',')
    .map((part) => part.trim().replace(/^type\s+/, ''))
    .filter(Boolean)
    .map((part) => {
      const [imported, local] = part.split(/\s+as\s+/)
      return { imported: imported.trim(), local: (local ?? imported).trim() }
    })
  const rest = clause.replace(/\{[^}]*\}/, '')
  const namespace = /\*\s*as\s+([\w$]+)/.exec(rest)?.[1] ?? null
  const defaultName = /^\s*([\w$]+)/.exec(rest.replace(/\*\s*as\s+[\w$]+/, ''))?.[1] ?? null
  return { defaultName, named, namespace }
}

export const listImports = (doc: string): ImportStatement[] =>
  [...doc.matchAll(IMPORT)].map((m) => {
    const spec = m[3] ?? m[5] ?? m[7]
    const quote = m[2] ?? m[4] ?? m[6]
    const specFrom = m.index + m[0].lastIndexOf(`${quote}${spec}${quote}`) + 1
    const clause = m[3] !== undefined ? m[1] : ''
    return { spec, specFrom, specTo: specFrom + spec.length, start: m.index, ...parseClause(clause) }
  })

export const importAt = (doc: string, pos: number): ImportStatement | null =>
  listImports(doc).find((i) => pos >= i.specFrom - 1 && pos <= i.specTo + 1) ?? null

export const wordAt = (doc: string, pos: number): string | null => {
  const isWordChar = (ch: string | undefined): boolean => !!ch && /[\w$]/.test(ch)
  let from = pos
  let to = pos
  while (isWordChar(doc[from - 1])) from -= 1
  while (isWordChar(doc[to])) to += 1
  const word = doc.slice(from, to)
  return word && !/^\d/.test(word) ? word : null
}

export const lineOf = (doc: string, offset: number): number => doc.slice(0, offset).split('\n').length

export const importLineOf = (doc: string, name: string): number | null => {
  const found = listImports(doc).find((i) => i.defaultName === name || i.namespace === name || i.named.some((n) => n.local === name))
  if (!found) return null
  const nameAt = doc.slice(found.start, found.specFrom).search(new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`))
  return lineOf(doc, nameAt >= 0 ? found.start + nameAt : found.start)
}

const DEFINITION = (name: string): RegExp =>
  new RegExp(
    `(?:^|\\n)[ \\t]*(?:export\\s+)?(?:default\\s+)?(?:declare\\s+)?(?:async\\s+)?(?:const|let|var|function\\*?|class|interface|type|enum)\\s+${name.replace(/\$/g, '\\$')}\\b`
  )

export const definitionLine = (doc: string, name: string | null): number | null => {
  if (!name) return null
  const found = DEFINITION(name).exec(doc)
  if (!found) return null
  return lineOf(doc, found.index + found[0].length - found[0].trimStart().length)
}

export const defaultExportLine = (doc: string): number | null => {
  const found = /(?:^|\n)[ \t]*export\s+default\b/.exec(doc) ?? /(?:^|\n)<script\b/.exec(doc)
  return found ? lineOf(doc, found.index + (found[0].startsWith('\n') ? 1 : 0)) : null
}

const normalize = (path: string): string => {
  const out: string[] = []
  for (const part of path.split('/')) {
    if (part === '..') out.pop()
    else if (part && part !== '.') out.push(part)
  }
  return out.join('/')
}

export const resolveImport = (fromFile: string, spec: string, files: string[]): string | null => {
  if (spec.startsWith('.')) {
    const known = new Set(files)
    const base = normalize(`${fromFile.split('/').slice(0, -1).join('/')}/${spec}`)
    return EXTENSIONS.map((ext) => `${base}${ext}`).find((path) => known.has(path)) ?? null
  }
  const alias = /^[@~][\w-]*\//.exec(spec)
  if (!alias) return null
  const rest = normalize(spec.slice(alias[0].length))
  const isMatch = (file: string): boolean => EXTENSIONS.some((ext) => file === `${rest}${ext}` || file.endsWith(`/${rest}${ext}`))
  return files.filter(isMatch).sort((a, b) => a.length - b.length)[0] ?? null
}

export type HitKind = 'definition' | 'import' | 'usage'

export interface CodeHit {
  path: string
  line: number
  text: string
}

const CODE_FILE = /\.(vue|[cm]?[jt]sx?)$/

const MODIFIERS = '(?:(?:public|private|protected|static|readonly|override|get|set|async)\\s+)*'

const escapeName = (name: string): string => name.replace(/\$/g, '\\$')

const toKebab = (name: string): string => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

export const isIdentifierQuery = (query: string): boolean => /^[\w$]+$/.test(query.trim())

export const hitKind = (text: string, name: string): HitKind => {
  const line = text.trim()
  const word = escapeName(name)
  const isImport = /^import\b/.test(line) || /^export\b.*\bfrom\s*['"]/.test(line)
  if (isImport && new RegExp(`\\b${word}\\b`).test(line)) return 'import'
  const definitions = [
    new RegExp(`^(?:export\\s+)?(?:default\\s+)?(?:declare\\s+)?(?:async\\s+)?(?:const|let|var|function\\*?|class|interface|type|enum)\\s+${word}\\b`),
    new RegExp(`^${MODIFIERS}${word}\\s*\\((?:[^()]|\\([^()]*\\))*\\)\\s*(?::\\s*[^{=;]+)?\\{`),
    new RegExp(`^${MODIFIERS}${word}\\s*=\\s*(?:async\\s+)?(?:\\([^)]*\\)|[\\w$]+)\\s*(?::\\s*[^=]+)?=>`),
    new RegExp(`^${word}\\s*:\\s*(?:async\\s+)?(?:function\\b|\\([^)]*\\)\\s*=>|[\\w$]+\\s*=>)`),
    new RegExp(`^name\\s*:\\s*(['"])${word}\\1`)
  ]
  return definitions.some((rule) => rule.test(line)) ? 'definition' : 'usage'
}

export const fileDefinitions = (name: string, files: string[]): CodeHit[] => {
  const wanted = new Set([name.toLowerCase(), toKebab(name)])
  const stemOf = (file: string): string => {
    const parts = file.split('/')
    const base = parts[parts.length - 1].replace(/\.[^.]+$/, '')
    return (base === 'index' ? (parts[parts.length - 2] ?? '') : base).toLowerCase()
  }
  return files.filter((file) => CODE_FILE.test(file) && wanted.has(stemOf(file))).map((path) => ({ path, line: 1, text: '' }))
}

export const groupHits = (hits: CodeHit[], name: string, files: string[]): { definitions: CodeHit[]; imports: CodeHit[]; usages: CodeHit[] } => {
  const groups = { definitions: fileDefinitions(name, files), imports: [] as CodeHit[], usages: [] as CodeHit[] }
  const seen = new Set(groups.definitions.map((hit) => `${hit.path}:${hit.line}`))
  for (const hit of hits) {
    const key = `${hit.path}:${hit.line}`
    if (seen.has(key)) continue
    seen.add(key)
    const kind = hitKind(hit.text, name)
    if (kind === 'definition') groups.definitions.push(hit)
    else if (kind === 'import') groups.imports.push(hit)
    else groups.usages.push(hit)
  }
  return groups
}

const KEYWORDS = new Set([
  'if', 'else', 'for', 'while', 'do', 'return', 'const', 'let', 'var', 'function', 'class', 'new', 'this', 'await', 'async',
  'import', 'export', 'from', 'default', 'true', 'false', 'null', 'undefined', 'typeof', 'instanceof', 'in', 'of', 'try',
  'catch', 'finally', 'throw', 'switch', 'case', 'break', 'continue', 'extends', 'super', 'void', 'delete', 'yield', 'as', 'type', 'interface'
])

export const peekTarget = (doc: string, pos: number): { name: string; isMember: boolean; from: number; to: number } | null => {
  const name = wordAt(doc, pos)
  if (!name || KEYWORDS.has(name)) return null
  let from = pos
  while (from > 0 && /[\w$]/.test(doc[from - 1])) from -= 1
  const isMember = doc.slice(Math.max(0, from - 5), from) === 'this.'
  if (!isMember && doc[from - 1] === '.') return null
  return { name, isMember, from, to: from + name.length }
}

export const memberSites = (doc: string, name: string): { declarations: number[]; assignments: number[]; constructedFrom: string | null } => {
  const word = escapeName(name)
  const declared = new RegExp(`^${MODIFIERS}${word}\\s*(?:\\??:|=(?!=)|;)`)
  const assigned = new RegExp(`\\bthis\\.${word}\\s*=(?!=)`)
  const lines = doc.split('\n')
  const declarations: number[] = []
  const assignments: number[] = []
  lines.forEach((text, i) => {
    const line = text.trim()
    const isLocal = /^(?:const|let|var)\s/.test(line)
    if (!isLocal && !line.startsWith('this.') && (declared.test(line) || hitKind(line, name) === 'definition')) declarations.push(i + 1)
    if (assigned.test(line)) assignments.push(i + 1)
  })
  const sources = [...assignments, ...declarations].map((n) => lines[n - 1])
  const callee = (line: string): string | null =>
    /[=:]\s*(?:await\s+)?new\s+([\w$.]+)/.exec(line)?.[1].split('.').pop() ??
    /=\s*(?:await\s+)?([\w$]+)\s*\(/.exec(line)?.[1] ??
    null
  const constructedFrom = sources.map(callee).find((c): c is string => !!c && !KEYWORDS.has(c)) ?? null
  return { declarations, assignments, constructedFrom }
}

export const snippetAt = (text: string, line: number, maxLines: number): string => {
  const lines = text.split('\n').slice(Math.max(0, line - 1))
  const first = lines[0] ?? ''
  if (!first.includes('{') && !/[(=,>]\s*$/.test(first)) return first
  const out: string[] = []
  let depth = 0
  let isOpened = false
  for (const row of lines) {
    out.push(row)
    for (const ch of row) {
      if (ch === '{') {
        depth += 1
        isOpened = true
      } else if (ch === '}') depth -= 1
    }
    if ((isOpened && depth <= 0) || out.length >= maxLines) break
  }
  return out.join('\n')
}
