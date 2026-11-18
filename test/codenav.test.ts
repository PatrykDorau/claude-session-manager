import { describe, it, expect } from 'vitest'
import { listImports, importAt, wordAt, importLineOf, definitionLine, defaultExportLine, resolveImport, hitKind, isIdentifierQuery, groupHits, peekTarget, memberSites, snippetAt } from '../src/renderer/src/dashboard/codenav'

describe('peekTarget', () => {
  it('names the member under the cursor and skips keywords and blanks', () => {
    const line = 'if (this.player.once) return'
    const at = line.indexOf('player')
    expect(peekTarget(line, at + 2)).toEqual({ name: 'player', isMember: true, from: at, to: at + 'player'.length })
    expect(peekTarget(line, line.indexOf('once') + 1)).toBeNull()
    expect(peekTarget('load(id)', 2)).toEqual({ name: 'load', isMember: false, from: 0, to: 4 })
    expect(peekTarget(line, 1)).toBeNull()
    expect(peekTarget(line, line.indexOf('return') + 1)).toBeNull()
    expect(peekTarget(line, line.indexOf('this') + 1)).toBeNull()
    expect(peekTarget(line, 3)).toBeNull()
  })
})

describe('memberSites', () => {
  it('finds where a component member is declared, assigned and built from', () => {
    const doc = [
      'export default {',
      '  data() {',
      '    return {',
      '      player: null,',
      '    }',
      '  },',
      '  methods: {',
      '    setup(opts) {',
      '      this.player = new Player(opts)',
      '      this.player.once()',
      '    }',
      '  }',
      '}'
    ].join('\n')
    expect(memberSites(doc, 'player')).toEqual({ declarations: [4], assignments: [9], constructedFrom: 'Player' })
    expect(memberSites(doc, 'missing')).toEqual({ declarations: [], assignments: [], constructedFrom: null })
  })

  it('does not take a local variable for the member', () => {
    const doc = ['  async setup() {', '    const player = new Player(el)', '    this.setPlayer(player)', '  }'].join('\n')
    expect(memberSites(doc, 'player')).toEqual({ declarations: [], assignments: [], constructedFrom: null })
  })
})

describe('snippetAt', () => {
  it('stops at the end of the block or at the line limit', () => {
    const text = ['const a = 1', 'function load(id) {', '  if (id) {', '    go(id)', '  }', '}', 'const b = 2'].join('\n')
    expect(snippetAt(text, 2, 12)).toBe(['function load(id) {', '  if (id) {', '    go(id)', '  }', '}'].join('\n'))
    expect(snippetAt(text, 2, 2)).toBe(['function load(id) {', '  if (id) {'].join('\n'))
    expect(snippetAt(text, 1, 12)).toBe('const a = 1')
  })
})

const doc = [
  "import Vue from 'vue'",
  'import {',
  '  PlayerEvent,',
  '  load as loadPlayer',
  "} from '@/app/player'",
  "import * as api from '../api'",
  "import UiButton from './ui-button/index.vue'",
  '',
  'export const run = () => loadPlayer(PlayerEvent.TIME)'
].join('\n')

describe('listImports', () => {
  it('reads default, named, aliased and namespace bindings', () => {
    const imports = listImports(doc)
    expect(imports.map((i) => i.spec)).toEqual(['vue', '@/app/player', '../api', './ui-button/index.vue'])
    expect(imports[1].named).toEqual([
      { imported: 'PlayerEvent', local: 'PlayerEvent' },
      { imported: 'load', local: 'loadPlayer' }
    ])
    expect(imports[2].namespace).toBe('api')
    expect(imports[3].defaultName).toBe('UiButton')
  })
})

describe('importAt', () => {
  it('finds the import whose path is under the cursor', () => {
    expect(importAt(doc, doc.indexOf('app/player'))?.spec).toBe('@/app/player')
    expect(importAt(doc, doc.indexOf('PlayerEvent,'))).toBeNull()
  })
})

describe('wordAt', () => {
  it('returns the identifier around the cursor', () => {
    expect(wordAt(doc, doc.lastIndexOf('loadPlayer') + 3)).toBe('loadPlayer')
    expect(wordAt('a + 12', 5)).toBeNull()
  })
})

describe('importLineOf', () => {
  it('points at the line that imports the name, also inside a multi-line import', () => {
    expect(importLineOf(doc, 'loadPlayer')).toBe(4)
    expect(importLineOf(doc, 'api')).toBe(6)
    expect(importLineOf(doc, 'run')).toBeNull()
  })
})

describe('definitionLine', () => {
  it('finds exported and local declarations', () => {
    const target = ['const a = 1', '', 'export async function load() {}', 'export const PlayerEvent = {}'].join('\n')
    expect(definitionLine(target, 'load')).toBe(3)
    expect(definitionLine(target, 'PlayerEvent')).toBe(4)
    expect(definitionLine(target, 'missing')).toBeNull()
  })

  it('finds the default export or the script block', () => {
    expect(defaultExportLine(['<template></template>', '<script>', 'export default {}'].join('\n'))).toBe(3)
    expect(defaultExportLine(['<template></template>', '<script setup>'].join('\n'))).toBe(2)
  })
})

describe('resolveImport', () => {
  const files = ['src/javascript/app/player.js', 'src/javascript/api/index.js', 'src/javascript/components/ui-button/index.vue', 'src/javascript/components/home.vue']
  it('resolves relative paths with extensions and index files', () => {
    expect(resolveImport('src/javascript/components/home.vue', '../api', files)).toBe('src/javascript/api/index.js')
    expect(resolveImport('src/javascript/components/home.vue', './ui-button/index.vue', files)).toBe('src/javascript/components/ui-button/index.vue')
  })

  it('resolves an alias by the end of the path and skips packages', () => {
    expect(resolveImport('src/javascript/components/home.vue', '@/app/player', files)).toBe('src/javascript/app/player.js')
    expect(resolveImport('src/javascript/components/home.vue', 'vue', files)).toBeNull()
  })
})

describe('hitKind', () => {
  it('finds declarations, methods and component names', () => {
    expect(hitKind('export const loadPlayer = async () => {', 'loadPlayer')).toBe('definition')
    expect(hitKind('  async loadPlayer(id) {', 'loadPlayer')).toBe('definition')
    expect(hitKind('  loadPlayer: function (id) {', 'loadPlayer')).toBe('definition')
    expect(hitKind('  loadPlayer: (id) => {', 'loadPlayer')).toBe('definition')
    expect(hitKind("  name: 'UiButton',", 'UiButton')).toBe('definition')
  })
  it('finds typed and modified class methods and class-field arrows', () => {
    expect(hitKind('async loadPlayer(id: string): Promise<void> {', 'loadPlayer')).toBe('definition')
    expect(hitKind('private static loadPlayer(id) {', 'loadPlayer')).toBe('definition')
    expect(hitKind('get loadPlayer(): Player {', 'loadPlayer')).toBe('definition')
    expect(hitKind('loadPlayer = async (id: string) => {', 'loadPlayer')).toBe('definition')
    expect(hitKind('private loadPlayer = (id) => {', 'loadPlayer')).toBe('definition')
  })
  it('keeps calls and imports apart from definitions', () => {
    expect(hitKind("import { loadPlayer } from '@/app/player'", 'loadPlayer')).toBe('import')
    expect(hitKind("export { loadPlayer } from './player'", 'loadPlayer')).toBe('import')
    expect(hitKind('  loadPlayer(id)', 'loadPlayer')).toBe('usage')
    expect(hitKind('if (loadPlayer(id)) {', 'loadPlayer')).toBe('usage')
    expect(hitKind('await this.loadPlayer(id)', 'loadPlayer')).toBe('usage')
    expect(hitKind('loadPlayer(id, function () {', 'loadPlayer')).toBe('usage')
  })
})

describe('isIdentifierQuery', () => {
  it('accepts a single name only', () => {
    expect(isIdentifierQuery(' loadPlayer ')).toBe(true)
    expect(isIdentifierQuery('this.player.once')).toBe(false)
    expect(isIdentifierQuery('load player')).toBe(false)
  })
})

describe('groupHits', () => {
  it('puts the component file first and splits the rest', () => {
    const files = ['src/components/ui-button/index.vue', 'src/views/home.vue']
    const hits = [
      { path: 'src/views/home.vue', line: 3, text: "import UiButton from '@/components/ui-button/index.vue'" },
      { path: 'src/views/home.vue', line: 9, text: 'components: { UiButton },' },
      { path: 'src/components/ui-button/index.vue', line: 12, text: "name: 'UiButton'," }
    ]
    const grouped = groupHits(hits, 'UiButton', files)
    expect(grouped.definitions.map((h) => `${h.path}:${h.line}`)).toEqual(['src/components/ui-button/index.vue:1', 'src/components/ui-button/index.vue:12'])
    expect(grouped.imports).toHaveLength(1)
    expect(grouped.usages).toHaveLength(1)
  })
})
