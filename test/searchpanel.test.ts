import { describe, it, expect } from 'vitest'
import { EditorState, EditorSelection } from '@codemirror/state'
import { search, SearchQuery, setSearchQuery } from '@codemirror/search'
import { countMatches } from '../src/renderer/src/dashboard/searchpanel'

const stateWith = (doc: string, query: string, at?: [number, number]): EditorState =>
  EditorState.create({ doc, extensions: [search()] }).update({
    effects: setSearchQuery.of(new SearchQuery({ search: query })),
    ...(at ? { selection: EditorSelection.single(at[0], at[1]) } : {})
  }).state

describe('countMatches', () => {
  it('counts every match and which one is selected', () => {
    expect(countMatches(stateWith('foo bar foo baz foo', 'foo', [8, 11]))).toEqual({ total: 3, current: 2 })
  })
  it('reports zero for no query or no hits', () => {
    expect(countMatches(stateWith('abc', ''))).toEqual({ total: 0, current: 0 })
    expect(countMatches(stateWith('abc', 'zzz'))).toEqual({ total: 0, current: 0 })
  })
})
