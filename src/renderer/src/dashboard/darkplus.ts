import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

export const darkPlus = syntaxHighlighting(
  HighlightStyle.define([
    { tag: [t.keyword, t.bool, t.null, t.atom, t.self], color: '#569cd6' },
    { tag: [t.controlKeyword, t.moduleKeyword], color: '#c586c0' },
    { tag: [t.string, t.special(t.string), t.regexp], color: '#ce9178' },
    { tag: [t.number, t.unit], color: '#b5cea8' },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#dcdcaa' },
    { tag: [t.typeName, t.className, t.namespace], color: '#4ec9b0' },
    { tag: [t.variableName, t.propertyName, t.attributeName], color: '#9cdcfe' },
    { tag: [t.definition(t.variableName), t.constant(t.variableName)], color: '#4fc1ff' },
    { tag: [t.tagName, t.angleBracket], color: '#569cd6' },
    { tag: [t.comment, t.lineComment, t.blockComment], color: '#6a9955', fontStyle: 'italic' },
    { tag: [t.operator, t.punctuation, t.bracket, t.separator], color: '#d4d4d4' },
    { tag: t.escape, color: '#d7ba7d' },
    { tag: t.heading, color: '#569cd6', fontWeight: 'bold' },
    { tag: t.link, color: '#ce9178', textDecoration: 'underline' },
    { tag: t.invalid, color: '#f44747' }
  ])
)
