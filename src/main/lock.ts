export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

export function parseLockFile(
  content: string
): { pid: number; workspaceFolders: string[]; ideName: string } | null {
  try {
    const o = JSON.parse(content)
    if (typeof o.pid !== 'number' || !Array.isArray(o.workspaceFolders)) return null
    return { pid: o.pid, workspaceFolders: o.workspaceFolders, ideName: o.ideName ?? '' }
  } catch {
    return null
  }
}
