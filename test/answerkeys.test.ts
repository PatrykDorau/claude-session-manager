import { describe, it, expect } from 'vitest'
import { answerKeystrokes } from '../src/main/answerkeys'
import type { PendingPrompt, PromptQuestion } from '../src/renderer/src/types'

const question = (labels: string[], isMultiSelect = false): PromptQuestion => ({
  question: `${labels.join(' or ')}?`,
  header: 'H',
  isMultiSelect,
  options: labels.map((label, i) => ({ key: String(i + 1), label, description: '' }))
})

const prompt = (questions: PromptQuestion[]): PendingPrompt => ({ toolUseId: 't', tool: 'AskUserQuestion', isOpaque: false, text: '', questions })

describe('answerKeystrokes', () => {
  it('answers two single-select questions in order', () => {
    const p = prompt([question(['Red', 'Green', 'Blue']), question(['Small', 'Medium', 'Large'])])
    expect(answerKeystrokes(p, { choices: [['2'], ['3']], text: null })).toEqual(['2', '3', '\r'])
  })

  it('toggles two options of a multiSelect question and submits', () => {
    const p = prompt([question(['Apple', 'Banana', 'Cherry'], true)])
    expect(answerKeystrokes(p, { choices: [['1', '3']], text: null })).toEqual(['1', '3', '\t', '\r'])
  })

  it('types Other text', () => {
    const p = prompt([question(['8080', '3000'])])
    expect(answerKeystrokes(p, { choices: [], text: 'use port 8085' })).toEqual(['3', 'use port 8085', '\r'])
  })

  it('answers a single single-select question with its key alone', () => {
    const p = prompt([question(['Yes', 'No'])])
    expect(answerKeystrokes(p, { choices: [['2']], text: null })).toEqual(['2'])
  })

  it('mixes a multiSelect question with Other text on the next question', () => {
    const p = prompt([question(['Apple', 'Banana', 'Cherry'], true), question(['8080', '3000'])])
    expect(answerKeystrokes(p, { choices: [['2', '3']], text: 'use port 8085' })).toEqual(['2', '3', '\t', '3', 'use port 8085', '\r', '\r'])
  })

  it('refuses an empty choice for a question', () => {
    const p = prompt([question(['Red', 'Green']), question(['Small', 'Large'])])
    expect(answerKeystrokes(p, { choices: [['1'], []], text: null })).toEqual({ error: 'every question needs an answer' })
  })

  it('refuses a key outside the options', () => {
    const p = prompt([question(['Red', 'Green'])])
    expect(answerKeystrokes(p, { choices: [['9']], text: null })).toEqual({ error: 'unknown option 9' })
  })

  it('refuses two keys for a single-select question', () => {
    const p = prompt([question(['Red', 'Green'])])
    expect(answerKeystrokes(p, { choices: [['1', '2']], text: null })).toEqual({ error: 'question 1 takes one option' })
  })
})
