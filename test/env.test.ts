import { describe, it, expect } from 'vitest'
import { clearInheritedSessionMarker } from '../src/main/env'

describe('clearInheritedSessionMarker', () => {
  it('removes the Claude Code child-session marker and keeps everything else', () => {
    const env: NodeJS.ProcessEnv = { CLAUDE_CODE_CHILD_SESSION: '1', PATH: 'C:/bin', USERPROFILE: 'C:/u' }
    clearInheritedSessionMarker(env)
    expect(env).toEqual({ PATH: 'C:/bin', USERPROFILE: 'C:/u' })
  })
  it('is a no-op when the marker is absent', () => {
    const env: NodeJS.ProcessEnv = { PATH: 'C:/bin' }
    clearInheritedSessionMarker(env)
    expect(env).toEqual({ PATH: 'C:/bin' })
  })
})
