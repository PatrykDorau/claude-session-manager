import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, relative, resolve, isAbsolute, sep, dirname, basename, extname } from 'node:path'
import type { CatalogGroup, CatalogItem, CatalogRead } from '../renderer/src/types'

const FRONTMATTER = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/
const KEY_LINE = /^([A-Za-z][\w-]*):\s*(.*)$/

const unquote = (value: string): string => value.replace(/^(["'])([\s\S]*)\1$/, '$2')

export const parseFrontmatter = (text: string): { meta: Record<string, string>; body: string } => {
  const normalized = text.replace(/\r\n/g, '\n')
  const match = FRONTMATTER.exec(normalized)
  if (!match) return { meta: {}, body: normalized }
  const meta: Record<string, string> = {}
  let lastKey: string | null = null
  for (const line of match[1].split('\n')) {
    const entry = KEY_LINE.exec(line)
    if (entry) {
      lastKey = entry[1]
      meta[lastKey] = /^[>|][+-]?$/.test(entry[2].trim()) ? '' : unquote(entry[2].trim())
    } else if (lastKey && /^\s+\S/.test(line)) meta[lastKey] = `${meta[lastKey]} ${unquote(line.trim())}`.trim()
  }
  return { meta, body: normalized.slice(match[0].length) }
}

export const isInsideDir = (root: string, path: string): boolean => {
  const rel = relative(resolve(root), resolve(path))
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

const listDir = (dir: string): string[] => {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

const readText = (file: string): string => {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

const readJson = (file: string): Record<string, unknown> => {
  try {
    const parsed: unknown = JSON.parse(readText(file))
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

const isFile = (path: string): boolean => {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

const itemOf = (path: string, kind: CatalogItem['kind'], fallbackName: string): CatalogItem => {
  const { meta } = parseFrontmatter(readText(path))
  return { name: meta.name || fallbackName, description: meta.description ?? '', kind, path }
}

const skillItems = (dir: string): CatalogItem[] =>
  listDir(dir)
    .sort()
    .filter((name) => isFile(join(dir, name, 'SKILL.md')))
    .map((name) => itemOf(join(dir, name, 'SKILL.md'), 'skill', name))

const markdownItems = (dir: string, kind: CatalogItem['kind']): CatalogItem[] =>
  listDir(dir)
    .sort()
    .filter((name) => extname(name) === '.md' && isFile(join(dir, name)))
    .map((name) => itemOf(join(dir, name), kind, basename(name, '.md')))

const pluginGroups = (claudeDir: string): CatalogGroup[] => {
  const plugins = readJson(join(claudeDir, 'plugins', 'installed_plugins.json')).plugins
  const enabled = readJson(join(claudeDir, 'settings.json')).enabledPlugins
  const enabledMap = enabled && typeof enabled === 'object' ? (enabled as Record<string, unknown>) : {}
  if (!plugins || typeof plugins !== 'object') return []
  return Object.entries(plugins as Record<string, unknown>).flatMap(([name, installs]) => {
    const first = Array.isArray(installs) ? (installs[0] as { installPath?: unknown; version?: unknown } | undefined) : undefined
    const installPath = typeof first?.installPath === 'string' ? first.installPath : ''
    if (!installPath || !existsSync(installPath)) return []
    return [
      {
        id: `plugin:${name}`,
        title: name,
        version: typeof first?.version === 'string' ? first.version : null,
        isEnabled: enabledMap[name] === true,
        items: [
          ...skillItems(join(installPath, 'skills')),
          ...markdownItems(join(installPath, 'agents'), 'agent'),
          ...markdownItems(join(installPath, 'commands'), 'command')
        ]
      }
    ]
  })
}

export const buildCatalog = (home: string): CatalogGroup[] => {
  const claudeDir = join(home, '.claude')
  return [
    { id: 'skills', title: 'My skills', version: null, isEnabled: null, items: skillItems(join(claudeDir, 'skills')) },
    { id: 'agents', title: 'My agents', version: null, isEnabled: null, items: markdownItems(join(claudeDir, 'agents'), 'agent') },
    ...pluginGroups(claudeDir)
  ]
}

const skillSiblings = (path: string): string[] => {
  const dir = dirname(path)
  if (!isFile(join(dir, 'SKILL.md'))) return []
  const others = listDir(dir)
    .filter((name) => extname(name) === '.md' && name !== 'SKILL.md' && isFile(join(dir, name)))
    .sort()
  return ['SKILL.md', ...others].map((name) => join(dir, name))
}

export const readCatalogItem = (home: string, path: string): CatalogRead | null => {
  if (extname(path) !== '.md' || !isInsideDir(join(home, '.claude'), path) || !isFile(path)) return null
  const { meta, body } = parseFrontmatter(readText(path))
  return { meta, body, siblings: skillSiblings(path) }
}
