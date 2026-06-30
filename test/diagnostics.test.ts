import { describe, it, expect } from 'vitest'
import { formatDiagnostics } from '../src/main/diagnostics'

describe('formatDiagnostics', () => {
  const base = {
    version: '1.1.1',
    platform: 'win32',
    release: '10.0.26200',
    electron: '30.0.0',
    node: '20.0.0',
    claude: '1.2.3',
    editor: true,
    signedIn: 'yes' as const,
    total: 12,
    live: 5,
    waiting: 2
  }

  it('renders all fields with detection present', () => {
    const out = formatDiagnostics(base)
    expect(out).toContain('Claude Session Switcher v1.1.1')
    expect(out).toContain('OS: win32 10.0.26200')
    expect(out).toContain('claude: detected (1.2.3)')
    expect(out).toContain('VS Code: detected')
    expect(out).toContain('Signed in: yes')
    expect(out).toContain('Sessions: 12 total · 5 live · 2 need you')
  })

  it('flags missing claude and editor', () => {
    const out = formatDiagnostics({ ...base, claude: null, editor: false, signedIn: 'no' })
    expect(out).toContain('claude: NOT FOUND on PATH')
    expect(out).toContain('VS Code: not found')
    expect(out).toContain('Signed in: no')
  })
})
