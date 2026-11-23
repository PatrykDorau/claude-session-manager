import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseFrontmatter, buildCatalog, isInsideDir, readCatalogItem } from '../src/main/catalog'

describe('parseFrontmatter', () => {
  it('reads meta and body', () => {
    const r = parseFrontmatter('---\nname: review-mr\ndescription: Use when reviewing\n---\n# Title\nbody')
    expect(r.meta).toEqual({ name: 'review-mr', description: 'Use when reviewing' })
    expect(r.body).toBe('# Title\nbody')
  })

  it('returns the whole text when there is no frontmatter', () => {
    const r = parseFrontmatter('# Just a doc\ntext')
    expect(r.meta).toEqual({})
    expect(r.body).toBe('# Just a doc\ntext')
  })

  it('handles CRLF line endings', () => {
    const r = parseFrontmatter('---\r\nname: a\r\ndescription: b c\r\n---\r\nbody\r\nmore')
    expect(r.meta).toEqual({ name: 'a', description: 'b c' })
    expect(r.body).toBe('body\nmore')
  })

  it('strips quotes from multi-word values', () => {
    const r = parseFrontmatter('---\ndescription: "Use when: reviewing an MR"\nargument-hint: \'<KEY>\'\n---\nx')
    expect(r.meta.description).toBe('Use when: reviewing an MR')
    expect(r.meta['argument-hint']).toBe('<KEY>')
  })
})

describe('isInsideDir', () => {
  it('accepts paths under the root and refuses others', () => {
    const root = join(tmpdir(), 'home', '.claude')
    expect(isInsideDir(root, join(root, 'skills', 'a', 'SKILL.md'))).toBe(true)
    expect(isInsideDir(root, join(root, '..', 'secret.md'))).toBe(false)
    expect(isInsideDir(root, join(tmpdir(), 'elsewhere', 'a.md'))).toBe(false)
    expect(isInsideDir(root, join(root, 'skills', '..', '..', 'x.md'))).toBe(false)
    expect(isInsideDir(root, `${root}-evil`)).toBe(false)
    expect(isInsideDir(root, join(root, '..foo', 'a.md'))).toBe(true)
  })
})

describe('buildCatalog', () => {
  let home = ''
  const write = (path: string, text: string): void => {
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, text, 'utf8')
  }

  beforeAll(() => {
    home = mkdtempSync(join(tmpdir(), 'catalog-'))
    const claude = join(home, '.claude')
    write(join(claude, 'skills', 'review-mr', 'SKILL.md'), '---\nname: review-mr\ndescription: Reviews an MR\n---\nbody')
    write(join(claude, 'skills', 'review-mr', 'report-template.md'), 'tpl')
    write(join(claude, 'skills', 'review-mr', 'lens-map.md'), 'lens')
    write(join(claude, 'skills', '_shared', 'cockpit.js'), 'x')
    write(join(claude, 'agents', 'self-reviewer.md'), '---\nname: self-reviewer\ndescription: Reviews branch\n---\nbody')
    const on = join(claude, 'plugins', 'cache', 'on')
    write(join(on, 'skills', 'brainstorm', 'SKILL.md'), '---\nname: brainstorming\ndescription: Think first\n---\nb')
    write(join(on, 'agents', 'helper.md'), '---\ndescription: Helps\n---\nb')
    write(join(on, 'commands', 'go.md'), 'no frontmatter')
    const off = join(claude, 'plugins', 'cache', 'off')
    write(join(off, 'commands', 'loop.md'), '---\ndescription: Loops\n---\nb')
    write(
      join(claude, 'plugins', 'installed_plugins.json'),
      JSON.stringify({
        version: 2,
        plugins: {
          'on@market': [{ scope: 'user', installPath: on, version: '1.2.3' }],
          'off@market': [{ scope: 'user', installPath: off, version: '0.1.0' }],
          'gone@market': [{ scope: 'user', installPath: join(claude, 'plugins', 'cache', 'missing'), version: '9' }]
        }
      })
    )
    write(join(claude, 'settings.json'), JSON.stringify({ enabledPlugins: { 'on@market': true, 'off@market': false } }))
  })

  afterAll(() => rmSync(home, { recursive: true, force: true }))

  it('lists groups in order with kinds and badges', () => {
    const groups = buildCatalog(home)
    expect(groups.map((g) => g.title)).toEqual(['My skills', 'My agents', 'on@market', 'off@market'])
    expect(groups[0].items.map((i) => [i.name, i.kind, i.description])).toEqual([['review-mr', 'skill', 'Reviews an MR']])
    expect(groups[1].items.map((i) => [i.name, i.kind])).toEqual([['self-reviewer', 'agent']])
    expect(groups[2]).toMatchObject({ version: '1.2.3', isEnabled: true })
    expect(groups[2].items.map((i) => [i.name, i.kind]).sort()).toEqual([
      ['brainstorming', 'skill'],
      ['go', 'command'],
      ['helper', 'agent']
    ])
    expect(groups[3]).toMatchObject({ version: '0.1.0', isEnabled: false })
    expect(groups[3].items.map((i) => i.kind)).toEqual(['command'])
  })

  it('reads an item with SKILL.md first and the rest alphabetical', () => {
    const skill = buildCatalog(home)[0].items[0]
    const read = readCatalogItem(home, skill.path)
    expect(read?.meta.name).toBe('review-mr')
    expect(read?.body).toBe('body')
    expect(read?.siblings.map((p) => p.replace(/^.*[\\/]/, ''))).toEqual(['SKILL.md', 'lens-map.md', 'report-template.md'])
  })

  it('refuses a path outside ~/.claude', () => {
    expect(readCatalogItem(home, join(home, 'outside.md'))).toBeNull()
  })
})
