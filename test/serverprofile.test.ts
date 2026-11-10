import { describe, it, expect } from 'vitest'
import { stvOptions, webOptions, mergeEnvLocal, stvCommand, serverHost, chromeArgs } from '../src/main/serverprofile'

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
})
