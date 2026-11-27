import { describe, it, expect } from 'vitest'
import { runningChoice } from '../src/renderer/src/dashboard/serverchoice'

const panelChoice = { tenant: 'krs', environment: 'dev', platform: 'web', resolution: '1280x720' }

describe('runningChoice', () => {
  it('takes the Smart TV choice of the running server, so Stop and Start bring the same server back', () => {
    expect(runningChoice('tigo · uat · tizen · 1920x1080', panelChoice)).toEqual({
      tenant: 'tigo',
      environment: 'uat',
      platform: 'tizen',
      resolution: '1920x1080'
    })
  })

  it('takes tenant and environment of a web server and keeps the rest', () => {
    expect(runningChoice('tigo · uat', panelChoice)).toEqual({ ...panelChoice, tenant: 'tigo', environment: 'uat' })
  })

  it('keeps the panel choice for a custom command', () => {
    expect(runningChoice('custom', panelChoice)).toEqual(panelChoice)
  })
})
