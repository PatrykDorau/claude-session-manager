import type { EditorState } from '@codemirror/state'
import type { EditorView, Panel, ViewUpdate } from '@codemirror/view'
import { SearchQuery, setSearchQuery, getSearchQuery, findNext, findPrevious, closeSearchPanel, replaceNext, replaceAll } from '@codemirror/search'

const MAX_COUNT = 9999

export const countMatches = (state: EditorState): { total: number; current: number } => {
  const query = getSearchQuery(state)
  if (!query.search || !query.valid) return { total: 0, current: 0 }
  const cursor = query.getCursor(state)
  const at = state.selection.main
  let total = 0
  let current = 0
  for (let next = cursor.next(); !next.done && total < MAX_COUNT; next = cursor.next()) {
    total += 1
    if (next.value.from === at.from && next.value.to === at.to) current = total
  }
  return { total, current }
}

const jumpToMatch = (view: EditorView): void => {
  const query = getSearchQuery(view.state)
  if (!query.search || !query.valid) return
  const from = view.state.selection.main.from
  const after = query.getCursor(view.state, from).next()
  const found = after.done ? query.getCursor(view.state).next() : after
  if (found.done) return
  view.dispatch({ selection: { anchor: found.value.from, head: found.value.to }, scrollIntoView: true })
}

const button = (label: string, title: string, run: () => void): HTMLButtonElement => {
  const el = document.createElement('button')
  el.type = 'button'
  el.textContent = label
  el.title = title
  el.addEventListener('mousedown', (e) => e.preventDefault())
  el.addEventListener('click', run)
  return el
}

export const searchPanel = (view: EditorView): Panel => {
  const initial = getSearchQuery(view.state)
  const options = { caseSensitive: initial.caseSensitive, regexp: initial.regexp, wholeWord: initial.wholeWord }
  const dom = document.createElement('div')
  dom.className = 'cp-search-wrap'
  const row = document.createElement('div')
  row.className = 'cp-search'
  const replaceRow = document.createElement('div')
  replaceRow.className = 'cp-search cp-replace'
  replaceRow.hidden = true
  const replaceInput = document.createElement('input')
  replaceInput.className = 'cp-search-input'
  replaceInput.placeholder = 'Replace with'
  replaceInput.spellcheck = false
  replaceInput.value = initial.replace
  const input = document.createElement('input')
  input.className = 'cp-search-input'
  input.placeholder = 'Find in file'
  input.value = initial.search
  input.spellcheck = false
  input.setAttribute('main-field', 'true')
  const count = document.createElement('span')
  count.className = 'cp-search-count'

  const commit = (): void => {
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: input.value, replace: replaceInput.value, ...options })) })
  }
  const toggle = (key: keyof typeof options, label: string, title: string): HTMLButtonElement => {
    const el = button(label, title, () => {
      options[key] = !options[key]
      el.classList.toggle('on', options[key])
      commit()
      jumpToMatch(view)
    })
    el.classList.add('cp-search-opt')
    el.classList.toggle('on', options[key])
    return el
  }
  const refresh = (state: EditorState): void => {
    const { total, current } = countMatches(state)
    const hasQuery = !!getSearchQuery(state).search
    count.textContent = !hasQuery ? '' : total ? `${current || '–'} / ${total >= MAX_COUNT ? `${MAX_COUNT}+` : total}` : 'No results'
    count.classList.toggle('none', hasQuery && !total)
  }

  input.addEventListener('input', () => {
    commit()
    jumpToMatch(view)
  })
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) findPrevious(view)
      else findNext(view)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      closeSearchPanel(view)
      view.focus()
    }
  })

  const prev = button('↑', 'Previous match (Shift+Enter)', () => findPrevious(view))
  const next = button('↓', 'Next match (Enter)', () => findNext(view))
  prev.classList.add('cp-search-nav')
  next.classList.add('cp-search-nav')
  const close = button('✕', 'Close (Esc)', () => {
    closeSearchPanel(view)
    view.focus()
  })
  close.classList.add('cp-search-close')

  const replaceToggle = button('⇄', 'Find and replace', () => {
    replaceRow.hidden = !replaceRow.hidden
    replaceToggle.classList.toggle('on', !replaceRow.hidden)
    if (!replaceRow.hidden) replaceInput.focus()
  })
  replaceToggle.classList.add('cp-search-opt')
  replaceToggle.hidden = view.state.readOnly
  replaceInput.addEventListener('input', commit)
  replaceInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      replaceNext(view)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      closeSearchPanel(view)
      view.focus()
    }
  })
  const replaceOne = button('Replace', 'Replace this match (Enter)', () => replaceNext(view))
  const replaceEvery = button('Replace all', 'Replace every match', () => replaceAll(view))
  replaceOne.classList.add('cp-search-text')
  replaceEvery.classList.add('cp-search-text')
  replaceRow.append(replaceInput, replaceOne, replaceEvery)

  row.append(
    replaceToggle,
    input,
    count,
    prev,
    next,
    toggle('caseSensitive', 'Aa', 'Match case'),
    toggle('wholeWord', 'ab', 'Whole word'),
    toggle('regexp', '.*', 'Regular expression'),
    close
  )
  dom.append(row, replaceRow)
  refresh(view.state)

  return {
    dom,
    top: true,
    mount: () => {
      input.focus()
      input.select()
    },
    update: (u: ViewUpdate) => {
      const query = getSearchQuery(u.state)
      if (query.search !== input.value && !dom.contains(document.activeElement)) input.value = query.search
      if (u.docChanged || u.selectionSet || u.transactions.some((t) => t.effects.some((e) => e.is(setSearchQuery)))) refresh(u.state)
    }
  }
}
