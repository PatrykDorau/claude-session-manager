import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs'
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

export const withTaskMcp = (config: any, folder: string, port: number, configPath: string): any => {
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
          playwright: {
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@playwright/mcp@latest', '--config', configPath, '--cdp-endpoint', `http://localhost:${port}`],
            env: {}
          }
        }
      }
    }
  }
}

export const writeTaskMcp = (claudeJson: string, folder: string, port: number, configPath: string): boolean => {
  try {
    const current = JSON.parse(readFileSync(claudeJson, 'utf8'))
    const next = withTaskMcp(current, folder, port, configPath)
    const temp = `${claudeJson}.cockpit-tmp`
    writeFileSync(temp, JSON.stringify(next, null, 2), 'utf8')
    renameSync(temp, claudeJson)
    return true
  } catch {
    return false
  }
}

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
