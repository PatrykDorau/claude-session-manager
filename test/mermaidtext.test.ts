import { describe, it, expect } from 'vitest'
import { escapeListLabels } from '../src/renderer/src/dashboard/mermaidtext'

describe('escapeListLabels', () => {
  it('keeps numbered and bulleted labels from turning into markdown lists', () => {
    expect(escapeListLabels('S1["1. OK na Watch<br/>load()"] --> S2[- krok]')).toBe('S1["1. OK na Watch<br/>load()"] --> S2[- krok]')
  })

  it('leaves arrows, numbers inside text and other syntax alone', () => {
    const source = 'flowchart TD\n  A["Wersja 1.5 działa"] --> B\n  A -.-> C\n  classDef problem fill:#5a1e1e'
    expect(escapeListLabels(source)).toBe(source)
  })
})
