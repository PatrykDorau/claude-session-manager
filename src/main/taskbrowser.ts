import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs'
import { mkdir, readdir, copyFile } from 'node:fs/promises'
import { join } from 'node:path'

const FIRST_PORT = 9301

export const pickChromePort = (used: number[]): number => {
  let port = FIRST_PORT
  while (used.includes(port)) port += 1
  return port
}

export const claudeProjectKey = (path: string): string => path.replace(/\\/g, '/')

export const taskChromeProfile = (key: string): string => join('C:\\Chrome dev session', 'tasks', key)

export const PLAYWRIGHT_MCP_VERSION = '0.0.86'

export const playwrightCliPath = (appData: string, isExisting: (p: string) => boolean): string | null => {
  const cli = join(appData, 'npm', 'node_modules', '@playwright', 'mcp', 'cli.js')
  return isExisting(cli) ? cli : null
}

const playwrightServer = (port: number, configPath: string, cliPath: string | null): object => {
  const tail = ['--config', configPath, '--cdp-endpoint', `http://localhost:${port}`]
  return cliPath
    ? { type: 'stdio', command: 'node', args: [cliPath, ...tail], env: {} }
    : { type: 'stdio', command: 'npx', args: ['-y', `@playwright/mcp@${PLAYWRIGHT_MCP_VERSION}`, ...tail], env: {} }
}

export const withTaskMcp = (config: any, folder: string, port: number, configPath: string, cliPath: string | null): any => {
  const key = claudeProjectKey(folder)
  const projects = config?.projects && typeof config.projects === 'object' ? config.projects : {}
  const project = projects[key] && typeof projects[key] === 'object' ? projects[key] : {}
  const servers = project.mcpServers && typeof project.mcpServers === 'object' ? project.mcpServers : {}
  return {
    ...config,
    projects: {
      ...projects,
      [key]: {
        ...project,
        mcpServers: {
          ...servers,
          playwright: playwrightServer(port, configPath, cliPath)
        }
      }
    }
  }
}

export const writeTaskMcp = (claudeJson: string, folder: string, port: number, configPath: string, cliPath: string | null): boolean => {
  try {
    const current = JSON.parse(readFileSync(claudeJson, 'utf8'))
    const next = withTaskMcp(current, folder, port, configPath, cliPath)
    const temp = `${claudeJson}.cockpit-tmp`
    writeFileSync(temp, JSON.stringify(next, null, 2), 'utf8')
    renameSync(temp, claudeJson)
    return true
  } catch {
    return false
  }
}

export const writeTaskMcpFile = (dir: string, key: string, port: number, configPath: string, cliPath: string | null): string | null => {
  try {
    mkdirSync(dir, { recursive: true })
    const file = join(dir, `${key}.json`)
    writeFileSync(file, JSON.stringify({ mcpServers: { playwright: playwrightServer(port, configPath, cliPath) } }, null, 2), 'utf8')
    return file
  } catch {
    return null
  }
}

export const taskMcpArgs = (args: string[], configFile: string | null): string[] => (configFile ? [...args, '--mcp-config', configFile] : args)

const SKIPPED = new Set([
  'tasks',
  'Cache',
  'Code Cache',
  'GPUCache',
  'GrShaderCache',
  'GraphiteDawnCache',
  'ShaderCache',
  'DawnCache',
  'DawnGraphiteCache',
  'CacheStorage',
  'ScriptCache',
  'Crashpad',
  'BrowserMetrics',
  'component_crx_cache',
  'optimization_guide_model_store',
  'OptimizationHints',
  'OnDeviceHeadSuggestModel',
  'Safe Browsing',
  'segmentation_platform',
  'screen_ai',
  'hyphen-data',
  'ZxcvbnData',
  'Subresource Filter',
  'SingletonLock',
  'SingletonCookie',
  'SingletonSocket',
  'lockfile',
  'LOCK'
])

const copyTree = async (from: string, to: string): Promise<void> => {
  await mkdir(to, { recursive: true })
  for (const entry of await readdir(from, { withFileTypes: true })) {
    if (SKIPPED.has(entry.name)) continue
    const source = join(from, entry.name)
    const target = join(to, entry.name)
    try {
      if (entry.isDirectory()) await copyTree(source, target)
      else if (entry.isFile()) await copyFile(source, target)
    } catch {
      continue
    }
  }
}

export const seedProfile = async (base: string, target: string): Promise<boolean> => {
  if (existsSync(target) || !existsSync(base)) return false
  await copyTree(base, target)
  return true
}
