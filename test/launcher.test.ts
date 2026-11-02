import { describe, it, expect } from 'vitest'
import { resumeCommand, createSerialQueue, isFolderOpen } from '../src/main/launcher'

describe('resumeCommand', () => {
  it('names the session after its ticket', () => {
    expect(resumeCommand('abc-123', 'SOFNJJ-2022')).toBe('claude --resume abc-123 --name SOFNJJ-2022')
  })
  it('keeps the plain command without a ticket', () => {
    expect(resumeCommand('abc-123', null)).toBe('claude --resume abc-123')
  })
})

describe('createSerialQueue', () => {
  it('runs jobs in order without overlap', async () => {
    const enqueue = createSerialQueue()
    const order: string[] = []
    let running = 0
    let maxRunning = 0
    const job = (name: string, ms: number) => async (): Promise<string> => {
      running++
      maxRunning = Math.max(maxRunning, running)
      await new Promise((r) => setTimeout(r, ms))
      order.push(name)
      running--
      return name
    }
    const results = await Promise.all([enqueue(job('slow', 30)), enqueue(job('fast', 1))])
    expect(results).toEqual(['slow', 'fast'])
    expect(order).toEqual(['slow', 'fast'])
    expect(maxRunning).toBe(1)
  })
  it('keeps going after a rejected job', async () => {
    const enqueue = createSerialQueue()
    const failed = enqueue(() => Promise.reject(new Error('boom')))
    const next = enqueue(() => Promise.resolve('ok'))
    await expect(failed).rejects.toThrow('boom')
    await expect(next).resolves.toBe('ok')
  })
})

describe('isFolderOpen', () => {
  it('matches a folder open in any VS Code window regardless of case and slashes', () => {
    expect(isFolderOpen('C:\\Projekty\\tigo', ['c:/projekty/tigo', 'C:\\Other'])).toBe(true)
  })
  it('is false when no window has the folder open', () => {
    expect(isFolderOpen('C:\\Projekty\\tigo', ['C:\\Projekty\\tigo-web'])).toBe(false)
  })
})
