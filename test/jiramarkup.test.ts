import { describe, it, expect } from 'vitest'
import { parseJiraMarkup, parseInline } from '../src/renderer/src/dashboard/jiraMarkup'

describe('parseJiraMarkup', () => {
  it('turns headings, bullets and paragraphs into blocks', () => {
    expect(parseJiraMarkup('h2. How it should work\n* first\n** nested\nplain text')).toEqual([
      { kind: 'heading', level: 2, spans: [{ text: 'How it should work', isBold: false, isItalic: false, isCode: false }] },
      { kind: 'item', depth: 1, spans: [{ text: 'first', isBold: false, isItalic: false, isCode: false }] },
      { kind: 'item', depth: 2, spans: [{ text: 'nested', isBold: false, isItalic: false, isCode: false }] },
      { kind: 'para', spans: [{ text: 'plain text', isBold: false, isItalic: false, isCode: false }] }
    ])
  })
  it('marks bold, italic and inline code spans', () => {
    expect(parseJiraMarkup('*Overview* uses _token_ and {{flag.enabled}}')[0]).toEqual({
      kind: 'para',
      spans: [
        { text: 'Overview', isBold: true, isItalic: false, isCode: false },
        { text: ' uses ', isBold: false, isItalic: false, isCode: false },
        { text: 'token', isBold: false, isItalic: true, isCode: false },
        { text: ' and ', isBold: false, isItalic: false, isCode: false },
        { text: 'flag.enabled', isBold: false, isItalic: false, isCode: true }
      ]
    })
  })
  it('keeps code and noformat blocks verbatim and drops blank lines', () => {
    expect(parseJiraMarkup('{code:js}\nconst a = 1\n{code}\n\n{noformat}x{noformat}')).toEqual([
      { kind: 'code', text: 'const a = 1' },
      { kind: 'code', text: 'x' }
    ])
  })
})

describe('parseInline — links', () => {
  it('turns Jira links and bare URLs into links', () => {
    const spans = parseInline('see [docs|https://a.pl/x] and https://g.pl/mr/738.')
    expect(spans.filter((s) => s.href).map((s) => [s.text, s.href])).toEqual([
      ['docs', 'https://a.pl/x'],
      ['https://g.pl/mr/738', 'https://g.pl/mr/738']
    ])
    expect(spans.map((s) => s.text).join('')).toBe('see docs and https://g.pl/mr/738.')
  })
})
