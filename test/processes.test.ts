import { describe, it, expect } from 'vitest'
import { extractResumeIds, probeCommand } from '../src/main/processes'

describe('extractResumeIds', () => {
  it('pulls a single resume id', () => {
    expect(extractResumeIds(['claude --resume 3367d315-46a2-4000-bc43-7e3a5c0a43a5'])).toEqual([
      '3367d315-46a2-4000-bc43-7e3a5c0a43a5'
    ])
  })
  it('handles the concatenated command-line form (stops at the UUID boundary)', () => {
    expect(
      extractResumeIds([
        '--resume 3367d315-46a2-4000-bc43-7e3a5c0a43a5claude --resume 3367d315-46a2-4000-bc43-7e3a5c0a43a5'
      ])
    ).toEqual(['3367d315-46a2-4000-bc43-7e3a5c0a43a5'])
  })
  it('collects multiple distinct ids across lines', () => {
    expect(
      extractResumeIds([
        'claude --resume 3367d315-46a2-4000-bc43-7e3a5c0a43a5',
        'claude --resume dbabf464-5443-4599-bdeb-ad3eff872743'
      ]).sort()
    ).toEqual(
      ['3367d315-46a2-4000-bc43-7e3a5c0a43a5', 'dbabf464-5443-4599-bdeb-ad3eff872743'].sort()
    )
  })
  it('ignores lines without a resume id', () => {
    expect(extractResumeIds(['claude', 'node foo.js', ''])).toEqual([])
  })
})

describe('probeCommand', () => {
  it('returns trimmed stdout when the command exists', async () => {
    const out = await probeCommand('node', ['--version'])
    expect(out).toMatch(/^v\d+\./)
  })
  it('returns null when the command is missing', async () => {
    expect(await probeCommand('definitely-not-a-real-command-xyz', ['--version'])).toBe(null)
  })
})
