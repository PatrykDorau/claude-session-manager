import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export type BridgeHandler = (body: Record<string, unknown>) => Promise<unknown>

const WORKTREE = /[\\/]\.claude[\\/]worktrees[\\/]([A-Z][A-Z0-9]+-\d+)/i
const MAX_BODY = 64 * 1024

export const ticketFromPath = (path: string): string | null => WORKTREE.exec(path)?.[1]?.toUpperCase() ?? null

export const isAuthorized = (headers: IncomingHttpHeaders, token: string): boolean => {
  const given = headers['x-cockpit-token']
  if (typeof given !== 'string' || given.length !== token.length) return false
  return timingSafeEqual(Buffer.from(given), Buffer.from(token))
}

export const startBridge = (infoFile: string, routes: Record<string, BridgeHandler>): Server => {
  const token = randomBytes(24).toString('hex')
  const server = createServer((req, res) => {
    const reply = (status: number, data: unknown): void => {
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(data))
    }
    if (req.method !== 'POST' || !isAuthorized(req.headers, token)) return reply(403, { error: 'forbidden' })
    const route = routes[req.url ?? '']
    if (!route) return reply(404, { error: 'unknown command' })
    let raw = ''
    req.on('data', (chunk: Buffer) => {
      raw += chunk.toString()
      if (raw.length > MAX_BODY) req.destroy()
    })
    req.on('end', async () => {
      try {
        const body = raw ? JSON.parse(raw) : {}
        reply(200, await route(typeof body === 'object' && body ? body : {}))
      } catch (err) {
        reply(500, { error: err instanceof Error ? err.message : String(err) })
      }
    })
  })
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    if (!address || typeof address === 'string') return
    mkdirSync(dirname(infoFile), { recursive: true })
    writeFileSync(infoFile, JSON.stringify({ port: address.port, token, pid: process.pid }), 'utf8')
  })
  return server
}
