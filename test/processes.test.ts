import { describe, it, expect } from 'vitest'
import { extractResumeIds, extractAttachIds, extractAttachPids, extractResumePids, probeCommand, mergedListHas, branchTickets } from '../src/main/processes'

describe('extractResumeIds', () => {
  it('ignores the headless background handoff fork', () => {
    expect(extractResumeIds(['claude -p P --resume 3367d315-46a2-4000-bc43-7e3a5c0a43a5 --fork-session --no-session-persistence'])).toEqual([])
  })

  it('keeps the resumed id of a background worker forked into a new session id', () => {
    expect(
      extractResumeIds([
        'claude.exe --session-id 87a512c2-1713-4ca6-9718-bed38d3fe490 --fork-session --resume 3d74bfe1-49c1-4908-895e-3e68e2c3e123 --name SOFNJJ-2402'
      ])
    ).toEqual(['3d74bfe1-49c1-4908-895e-3e68e2c3e123'])
  })

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

describe('extractAttachIds', () => {
  it('returns the short agent ids of running claude attach processes', () => {
    expect(
      extractAttachIds([
        '"C:\\npm\\claude.exe" attach 01edb0c6',
        '"C:\\npm\\claude.exe" --resume 344dee8f-fd59-47c8-8f4f-155dacb26815',
        'C:\\npm\\claude.exe'
      ])
    ).toEqual(['01edb0c6'])
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

describe('mergedListHas', () => {
  it('finds the branch in a git branch --merged listing', () => {
    expect(mergedListHas('  main\n  fix/SOFKRS-8028\n* master\n', 'fix/SOFKRS-8028')).toBe(true)
  })
  it('returns false when the branch is not listed', () => {
    expect(mergedListHas('main\nmaster\n', 'fix/SOFKRS-8028')).toBe(false)
  })
  it('handles empty output', () => {
    expect(mergedListHas('', 'main')).toBe(false)
  })
})

describe('branchTickets', () => {
  it('keeps only ticket branches, first-seen per ticket, in order', () => {
    const out = branchTickets('fix/SOFKAN-1-a\nmain\nfeat/SOFKAN-2-b\nchore/SOFKAN-1-dupe\n')
    expect(out).toEqual([
      { ticket: 'SOFKAN-1', branch: 'fix/SOFKAN-1-a' },
      { ticket: 'SOFKAN-2', branch: 'feat/SOFKAN-2-b' }
    ])
  })
  it('is empty when no branch carries a ticket', () => {
    expect(branchTickets('main\ndevelop\n')).toEqual([])
  })
})

describe('extractAttachPids', () => {
  it('maps the short agent id of each claude attach process to its pid', () => {
    expect(
      extractAttachPids([
        { pid: 7, commandLine: '"C:/x/claude.exe" attach 01edb0c6' },
        { pid: 8, commandLine: 'claude.exe --resume 1c4cdc80-4419-4cfe-863c-5767abd2762f' }
      ])
    ).toEqual(new Map([['01edb0c6', 7]]))
  })
})

describe('extractResumePids', () => {
  it('finds the interactive claude processes that resume this session', () => {
    const id = '3367d315-46a2-4000-bc43-7e3a5c0a43a5'
    const rows = [
      { pid: 10, commandLine: `claude --resume ${id}` },
      { pid: 11, commandLine: 'claude --resume 11111111-46a2-4000-bc43-7e3a5c0a43a5' },
      { pid: 12, commandLine: `claude attach 3367d315` }
    ]
    expect(extractResumePids(rows, id)).toEqual([10])
  })
})
