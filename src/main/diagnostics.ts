export interface Diagnostics {
  version: string
  platform: string
  release: string
  electron: string
  node: string
  claude: string | null
  editor: boolean
  signedIn: 'yes' | 'no' | 'unknown'
  total: number
  live: number
  waiting: number
}

export function formatDiagnostics(d: Diagnostics): string {
  return [
    `Claude Session Switcher v${d.version}`,
    `OS: ${d.platform} ${d.release}`,
    `Electron: ${d.electron}  Node: ${d.node}`,
    `claude: ${d.claude ? `detected (${d.claude})` : 'NOT FOUND on PATH'}`,
    `VS Code: ${d.editor ? 'detected' : 'not found'}`,
    `Signed in: ${d.signedIn}`,
    `Sessions: ${d.total} total · ${d.live} live · ${d.waiting} need you`
  ].join('\n')
}
