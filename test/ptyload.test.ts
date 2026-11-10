import { describe, it, expect } from 'vitest'
import { spawn } from 'node-pty'

describe('node-pty', () => {
  it('loads node-pty and runs a command', async () => {
    let out = ''
    const p = spawn('cmd.exe', ['/c', 'echo', 'pty-ok'], { cols: 80, rows: 24 })
    p.onData((d) => (out += d))
    await new Promise<void>((resolve) => p.onExit(() => resolve()))
    expect(out).toContain('pty-ok')
  }, 15000)
})
