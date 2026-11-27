import { win32 } from 'node:path'
import { createServer } from 'node:net'

export const DEFAULT_SERVER_COMMAND = 'npm run serve -- --port {port}'
const FIRST_PORT = 8080
const LAST_PORT = 8999

export const pickPort = (ours: number[], isBusy: (port: number) => boolean): number => {
  for (let port = FIRST_PORT; port <= LAST_PORT; port++) if (!ours.includes(port) && !isBusy(port)) return port
  return FIRST_PORT
}

export const serverCommand = (template: string, port: number): string =>
  template.includes('{port}') ? template.replaceAll('{port}', String(port)) : `${template.trim()} -- --port ${port}`

export const bashCandidates = (programFiles: string, localAppData: string): string[] => [
  win32.join(programFiles, 'Git', 'bin', 'bash.exe'),
  win32.join(localAppData, 'Programs', 'Git', 'bin', 'bash.exe')
]

const PROBE_HOSTS = ['127.0.0.1', '0.0.0.0', '::1', '::']
const MISSING_ADDRESS_CODES = ['EADDRNOTAVAIL', 'EAFNOSUPPORT']

const isHostPortFree = (port: number, host: string): Promise<boolean> =>
  new Promise((resolve) => {
    const probe = createServer()
    const onError = (err: NodeJS.ErrnoException): void => resolve(MISSING_ADDRESS_CODES.includes(err.code ?? ''))
    probe.once('error', onError)
    probe.once('listening', () => probe.close(() => resolve(true)))
    probe.listen(port, host)
  })

export const isPortFree = async (port: number): Promise<boolean> => {
  for (const host of PROBE_HOSTS) if (!(await isHostPortFree(port, host))) return false
  return true
}
