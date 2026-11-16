import { describe, it, expect } from 'vitest'
import { testCasesFromMr, markdownToJira } from '../src/renderer/src/dashboard/testcases'

const description = [
  'Naprawia fokus ([SOFX-1](https://jira/browse/SOFX-1))',
  '',
  '<details>',
  '<summary>Co i dlaczego</summary>',
  '',
  'Powód',
  '',
  '</details>',
  '',
  '<details>',
  "<summary>Test case'y</summary>",
  '',
  '| Priorytet | TC |',
  '|---|---|',
  '| Critical | TC1 |',
  '',
  '### TC1 — Usunięcie kanału',
  '- **Priorytet:** Critical',
  '- **Kroki:** 1. Wejdź 2. Naciśnij OK',
  '- **Oczekiwany wynik:** Fokus zostaje',
  '',
  '</details>'
].join('\n')

describe('testCasesFromMr', () => {
  it('takes only the test case section of the MR description', () => {
    const md = testCasesFromMr(description)
    expect(md).toContain('### TC1 — Usunięcie kanału')
    expect(md).not.toContain('Powód')
    expect(md).not.toContain('<summary>')
  })
  it('returns null when the description has no test cases', () => {
    expect(testCasesFromMr('Just a description')).toBeNull()
  })
})

describe('markdownToJira', () => {
  it('turns headings, bold, bullets and tables into Jira markup', () => {
    expect(markdownToJira(testCasesFromMr(description) ?? '')).toBe(
      [
        '||Priorytet||TC||',
        '|Critical|TC1|',
        '',
        'h3. TC1 — Usunięcie kanału',
        '* *Priorytet:* Critical',
        '* *Kroki:* 1. Wejdź 2. Naciśnij OK',
        '* *Oczekiwany wynik:* Fokus zostaje'
      ].join('\n')
    )
  })
  it('turns numbered steps into a Jira numbered list', () => {
    expect(markdownToJira('1. Wejdź\n2. Naciśnij OK')).toBe('# Wejdź\n# Naciśnij OK')
  })
})
