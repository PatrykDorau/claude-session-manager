import type { PendingPrompt, PromptQuestion } from '../renderer/src/types'

export interface PromptAnswer {
  choices: string[][]
  text: string | null
}

const ENTER = '\r'
const NEXT_TAB = '\t'

const isOptionOf = (q: PromptQuestion, key: string): boolean => {
  const isSameKey = (o: { key: string }): boolean => o.key === key
  return q.options.some(isSameKey)
}

const questionKeys = (q: PromptQuestion, n: number, keys: string[], text: string | null): string[] | { error: string } => {
  if (text !== null) {
    if (q.isMultiSelect) return { error: `question ${n} takes no text` }
    return [String(q.options.length + 1), text, ENTER]
  }
  if (keys.length === 0) return { error: 'every question needs an answer' }
  const isUnknown = (k: string): boolean => !isOptionOf(q, k)
  const unknown = keys.find(isUnknown)
  if (unknown !== undefined) return { error: `unknown option ${unknown}` }
  if (!q.isMultiSelect && keys.length > 1) return { error: `question ${n} takes one option` }
  return q.isMultiSelect ? [...keys, NEXT_TAB] : keys
}

const isMultiSelectQuestion = (q: PromptQuestion): boolean => q.isMultiSelect

export const answerKeystrokes = (prompt: PendingPrompt, answer: PromptAnswer): string[] | { error: string } => {
  const isUnanswered = (_: PromptQuestion, i: number): boolean => (answer.choices[i] ?? []).length === 0
  const textIndex = answer.text === null ? -1 : prompt.questions.findIndex(isUnanswered)
  if (answer.text !== null && textIndex === -1) return { error: 'no question left for the text' }
  const out: string[] = []
  for (const [i, q] of prompt.questions.entries()) {
    const keys = questionKeys(q, i + 1, answer.choices[i] ?? [], i === textIndex ? answer.text : null)
    if ('error' in keys) return keys
    out.push(...keys)
  }
  const isReviewed = prompt.questions.length > 1 || prompt.questions.some(isMultiSelectQuestion)
  return isReviewed ? [...out, ENTER] : out
}
