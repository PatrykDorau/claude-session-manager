export interface ServerOptions {
  tenants: string[]
  environments: string[]
}

export interface StvChoice {
  tenant: string
  environment: string
  platform: string
  resolution: string
}

const unique = (list: string[]): string[] => [...new Set(list)].sort()

export const stvOptions = (configDirs: Record<string, string[]>): ServerOptions => {
  const tenants = Object.entries(configDirs)
    .filter(([, files]) => files.some((f) => f.startsWith('.env')))
    .map(([tenant]) => tenant)
  const environments = Object.values(configDirs).flatMap((files) =>
    files.flatMap((f) => /^\.env\.([a-z0-9]+)$/i.exec(f)?.[1] ?? [])
  )
  return { tenants: unique(tenants), environments: unique(environments) }
}

const WEB_ENV_FILE = /^\.env\.([a-z0-9]+)-([a-z0-9]+)$/i

export const webOptions = (rootFiles: string[]): ServerOptions => {
  const matches = rootFiles.flatMap((f) => {
    const m = WEB_ENV_FILE.exec(f)
    return m ? [{ tenant: m[1], environment: m[2] }] : []
  })
  return { tenants: unique(matches.map((m) => m.tenant)), environments: unique(matches.map((m) => m.environment)) }
}

const keyOf = (line: string): string | null => /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1] ?? null

export const mergeEnvLocal = (base: string, tenantEnv: string): string => {
  const overrides = tenantEnv
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => keyOf(line) !== null)
  const overridden = new Set(overrides.map((line) => keyOf(line)))
  const kept = base
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => {
      const key = keyOf(line)
      return key === null ? line.trim() !== '' : !overridden.has(key)
    })
  return `${kept.join('\n')}\n\n${overrides.join('\n')}\n`
}

export const stvCommand = (choice: StvChoice, port: number): string =>
  `TENANT=${choice.tenant} ENVIRONMENT=${choice.environment} PLATFORM=${choice.platform} RESOLUTION=${choice.resolution} npm run serve -- --port ${port}`

export const serverHost = (key: string, tenant: string | null, environment: string | null): string =>
  `${[key, tenant, environment]
    .filter(Boolean)
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}.localhost`

export const chromeArgs = (profileDir: string, debugPort: number, url: string): string[] => [
  `--user-data-dir=${profileDir}`,
  `--remote-debugging-port=${debugPort}`,
  '--disable-web-security',
  url
]
