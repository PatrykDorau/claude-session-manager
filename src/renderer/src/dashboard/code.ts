export type Language = 'vue' | 'ts' | 'js' | 'json' | 'css' | 'scss' | 'html' | 'text'

export interface TreeNode {
  name: string
  path: string
  children: TreeNode[] | null
}

const EXTENSIONS: Record<string, Language> = {
  vue: 'vue',
  ts: 'ts',
  tsx: 'ts',
  mts: 'ts',
  cts: 'ts',
  js: 'js',
  jsx: 'js',
  mjs: 'js',
  cjs: 'js',
  json: 'json',
  css: 'css',
  scss: 'scss',
  sass: 'scss',
  html: 'html'
}

export const languageOf = (path: string): Language => EXTENSIONS[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'text'

const sortNodes = (nodes: TreeNode[]): TreeNode[] =>
  nodes
    .sort((a, b) => Number(!a.children) - Number(!b.children) || a.name.localeCompare(b.name))
    .map((n) => (n.children ? { ...n, children: sortNodes(n.children) } : n))

export const buildTree = (paths: string[]): TreeNode[] => {
  const root: TreeNode[] = []
  for (const path of paths) {
    const parts = path.split('/')
    let level = root
    parts.forEach((name, i) => {
      const nodePath = parts.slice(0, i + 1).join('/')
      const isFile = i === parts.length - 1
      let node = level.find((n) => n.name === name && !!n.children === !isFile)
      if (!node) {
        node = { name, path: nodePath, children: isFile ? null : [] }
        level.push(node)
      }
      if (node.children) level = node.children
    })
  }
  return sortNodes(root)
}
