import { describe, it, expect } from 'vitest'
import { stvOptions, webOptions, mergeEnvLocal, stvCommand, serverHost, chromeArgs, isChoiceMismatch, sideScreen } from '../src/main/serverprofile'

describe('stvOptions', () => {
  it('lists tenants and environments from config/<tenant>/.env.<env>', () => {
    expect(stvOptions({ salt: ['.env.dev', '.env.prod', '.env.uat', 'files'], tigo: ['.env', '.env.dev'] })).toEqual({
      tenants: ['salt', 'tigo'],
      environments: ['dev', 'prod', 'uat']
    })
  })
})

describe('webOptions', () => {
  it('lists tenants and environments from .env.<tenant>-<env> files', () => {
    expect(webOptions(['.env', '.env.local', '.env.salt-dev', '.env.salt-prod', '.env.tigo-dev', 'package.json'])).toEqual({
      tenants: ['salt', 'tigo'],
      environments: ['dev', 'prod']
    })
  })
})

describe('mergeEnvLocal', () => {
  it('keeps the base lines and comments, and replaces keys the tenant file sets', () => {
    const base = '# VUE_APP_FO_URL=https://old\nVUE_APP_FO_URL=https://eir\nVUE_APP_DEV_SERVER_HTTPS=false\nVUE_APP_TENANT=eir'
    const tenant = 'VUE_APP_TENANT=salt\nVUE_APP_FO_URL=https://salt-dev\n'
    expect(mergeEnvLocal(base, tenant)).toBe(
      '# VUE_APP_FO_URL=https://old\nVUE_APP_DEV_SERVER_HTTPS=false\n\nVUE_APP_TENANT=salt\nVUE_APP_FO_URL=https://salt-dev\n'
    )
  })
})

describe('stvCommand', () => {
  it('builds the smart TV serve command with the chosen arguments and port', () => {
    expect(stvCommand({ tenant: 'salt', environment: 'dev', platform: 'web', resolution: '1280x720' }, 8081)).toBe(
      'TENANT=salt ENVIRONMENT=dev PLATFORM=web RESOLUTION=1280x720 npm run serve -- --port 8081'
    )
  })
})

describe('serverHost', () => {
  it('gives every server its own *.localhost name so cookies do not mix', () => {
    expect(serverHost('SOFRMPT-3361', 'salt', 'dev')).toBe('sofrmpt-3361-salt-dev.localhost')
    expect(serverHost('MR!42', null, null)).toBe('mr-42.localhost')
  })
})

describe('chromeArgs', () => {
  it('opens the url in the debug Chrome profile', () => {
    expect(chromeArgs('C:\\Chrome dev session', 9222, 'http://a.localhost:8081')).toEqual([
      '--user-data-dir=C:\\Chrome dev session',
      '--remote-debugging-port=9222',
      '--disable-web-security',
      'http://a.localhost:8081'
    ])
  })

  it('names the window after the ticket so the taskbar tells the Chromes apart', () => {
    expect(chromeArgs('C:\\p', 9301, 'http://a.localhost:8081', 'SOFRMPT-3958')).toEqual([
      '--user-data-dir=C:\\p',
      '--remote-debugging-port=9301',
      '--disable-web-security',
      '--window-name=SOFRMPT-3958',
      'http://a.localhost:8081'
    ])
  })
})

describe('isChoiceMismatch', () => {
  it('flags a running server started for another tenant or environment', () => {
    expect(isChoiceMismatch('krs · dev · web · 1080', 'kan', '')).toBe(true)
    expect(isChoiceMismatch('krs · dev · web · 1080', 'krs', 'uat')).toBe(true)
    expect(isChoiceMismatch('krs · dev · web · 1080', 'krs', 'dev')).toBe(false)
    expect(isChoiceMismatch('krs · dev', '', '')).toBe(false)
    expect(isChoiceMismatch('custom', 'kan', 'uat')).toBe(false)
  })
})

describe('chromeArgs on a side screen', () => {
  it('places the window on the given screen area', () => {
    expect(chromeArgs('C:\p', 9301, 'http://x', 'A-1', { x: 1920, y: 0, width: 1280, height: 1000 })).toEqual([
      '--user-data-dir=C:\p',
      '--remote-debugging-port=9301',
      '--disable-web-security',
      '--window-name=A-1',
      '--window-position=1920,0',
      '--window-size=1280,1000',
      'http://x'
    ])
  })
})

describe('sideScreen', () => {
  const primary = { id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1040 } }
  const side = { id: 2, workArea: { x: 1920, y: 0, width: 1280, height: 1000 } }

  it('picks the work area of the first screen that is not the primary one', () => {
    expect(sideScreen([primary, side], 1)).toEqual(side.workArea)
  })

  it('is null with a single screen', () => {
    expect(sideScreen([primary], 1)).toBeNull()
  })
})
