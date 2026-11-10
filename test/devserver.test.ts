import { describe, it, expect } from 'vitest'
import { pickPort, serverCommand, bashCandidates, DEFAULT_SERVER_COMMAND } from '../src/main/devserver'

describe('pickPort', () => {
  it('takes the first port from 8080 that is neither used by our servers nor busy', () => {
    expect(pickPort([], () => false)).toBe(8080)
    expect(pickPort([8080, 8081], () => false)).toBe(8082)
    expect(pickPort([8080], (p) => p === 8081)).toBe(8082)
  })
})

describe('serverCommand', () => {
  it('puts the port into the template', () => {
    expect(serverCommand('TENANT=salt npm run serve -- --port {port}', 8081)).toBe('TENANT=salt npm run serve -- --port 8081')
  })
  it('appends the port flag when the template has no placeholder', () => {
    expect(serverCommand('npm run serve', 8082)).toBe('npm run serve -- --port 8082')
  })
  it('defaults to npm run serve with the port', () => {
    expect(serverCommand(DEFAULT_SERVER_COMMAND, 8080)).toBe('npm run serve -- --port 8080')
  })
})

describe('bashCandidates', () => {
  it('lists Git Bash locations under Program Files', () => {
    expect(bashCandidates('C:\\Program Files', 'C:\\Users\\me\\AppData\\Local')).toEqual([
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Users\\me\\AppData\\Local\\Programs\\Git\\bin\\bash.exe'
    ])
  })
})
