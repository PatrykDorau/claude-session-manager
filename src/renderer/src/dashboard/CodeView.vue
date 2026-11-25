<script setup lang="ts">
import { ref, computed, shallowRef, watch, onMounted, onBeforeUnmount, onActivated, nextTick } from 'vue'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState, Compartment, RangeSet, type Extension } from '@codemirror/state'
import { keymap, gutter, GutterMarker, Decoration, WidgetType, BlockType, hoverTooltip, type Tooltip } from '@codemirror/view'
import { darkPlus } from './darkplus'
import { javascript } from '@codemirror/lang-javascript'
import { vue } from '@codemirror/lang-vue'
import { json } from '@codemirror/lang-json'
import { css } from '@codemirror/lang-css'
import { sass } from '@codemirror/lang-sass'
import { html } from '@codemirror/lang-html'
import { MergeView, getChunks, unifiedMergeView, uncollapseUnchanged } from '@codemirror/merge'
import type { BranchChanges, ChangedFile, CodeComment, ExplainFile, MrCommentable, MrReviewAction, ReviewDoc, ReviewNote } from '../types'
import { buildTree, languageOf, type Language, type TreeNode } from './code'
import Splitter from './Splitter.vue'
import Icon from './Icon.vue'
import DocView from './DocView.vue'
import MenuButton from './MenuButton.vue'
import type { MenuItem } from '../types'
import { search } from '@codemirror/search'
import { searchPanel } from './searchpanel'
import { barCells, type BarCell, type LineCounts } from './diffstat'
import { changeSignature, isFileViewed, toggleViewed } from './viewed'
import { importAt, wordAt, listImports, importLineOf, definitionLine, defaultExportLine, resolveImport, isIdentifierQuery, groupHits, peekTarget, memberSites, snippetAt } from './codenav'
import { openTab, rememberTab, closeTab, tabScope, TAB_LIMIT, type CodeTab } from './codetabs'
import {
  emptyFileCache,
  readFileCache,
  writeFileCache,
  dropFileCache,
  fileCacheIdentity,
  isFreshFile,
  type CachedFile
} from './codecache'
import { parseVersionLink } from './mrhtml'
import { clampSize, readSize, writeSize, readFlag } from './dashboard'
import { mapToSideA, readDiffLayout, sidesFor, type DiffLayout } from './difflayout'
import ReviewParts from './ReviewParts.vue'
import { isSameHead, staleReason, progressKey, remarkDrafts, remarkedParts, remarksPrompt, restoreProgress, setRemark, type PartProgress } from './reviewparts'

type ReviewFile = ReviewDoc & { updatedAt: number }

const props = defineProps<{
  cwd: string | null
  ticketKey: string
  ticketTitle: string
  canAsk: boolean
  sourceSessionId: string | null
  comments?: CodeComment[]
  branchRef?: { source: string; target: string } | null
  commentable?: MrCommentable | null
  review?: (action: MrReviewAction) => Promise<boolean>
  pushedMr?: { iid: number; source: string; target: string } | null
  mr?: { iid: number; source: string; target: string } | null
  isOthersMr?: boolean
  sendToSession?: (text: string) => boolean
  askReview?: (text: string) => Promise<boolean>
}>()
const emit = defineEmits<{
  ask: [text: string]
  explain: [sessionId: string]
  version: [href: string, path: string | null, line: number | null]
  fileShown: [path: string, folder: string | null, isReadOnly: boolean]
}>()

const EXPLAIN_POLL_MS = 4000
const EXPLAIN_WAIT_MS = 20 * 60 * 1000

const STATE_MARK: Record<ChangedFile['state'], { mark: string; color: string }> = {
  modified: { mark: 'M', color: '#e8b84a' },
  added: { mark: 'A', color: '#3dd68c' },
  deleted: { mark: 'D', color: '#f2706a' },
  renamed: { mark: 'R', color: '#6aa9ff' },
  untracked: { mark: 'U', color: '#3dd68c' }
}
const LANGS: Record<Language, () => Extension> = {
  vue: () => vue(),
  ts: () => javascript({ typescript: true }),
  js: () => javascript(),
  json: () => json(),
  css: () => css(),
  scss: () => sass(),
  html: () => html(),
  text: () => []
}
const surface = EditorView.theme(
  {
    '&': { height: '100%', color: '#cccccc', backgroundColor: 'var(--bg-editor)', fontSize: '13px' },
    '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.7' },
    '.cm-content': { padding: '8px 0' },
    '.cm-gutters': { backgroundColor: 'var(--bg-editor)', border: 'none', color: '#6e7681' },
    '.cm-activeLineGutter': { color: '#cccccc' },
    '.cm-cursor': { borderLeftColor: '#aeafad' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: '#264f78 !important' },
    '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'rgba(255, 255, 255, 0.03)' },
    '.cm-changedLine': { backgroundColor: 'rgba(46, 160, 67, 0.15) !important' },
    '.cm-changedText': { background: 'rgba(46, 160, 67, 0.4) !important', borderRadius: '2px' },
    '.cm-merge-a .cm-changedLine': { backgroundColor: 'rgba(248, 81, 73, 0.15) !important' },
    '.cm-merge-a .cm-changedText': { background: 'rgba(248, 81, 73, 0.4) !important', borderRadius: '2px' },
    '.cm-deletedChunk': { backgroundColor: 'rgba(248, 81, 73, 0.15) !important', paddingLeft: '18px', position: 'relative' },
    '.cm-deletedChunk .cm-deletedLine::before': { content: '"−"', position: 'absolute', left: '5px', color: '#ff7b72', fontWeight: '700' },
    '.cm-deletedChunk .cm-deletedText, .cm-deletedChunk del': { background: 'rgba(248, 81, 73, 0.4)', textDecoration: 'none' },
    '.cm-changeGutter': { width: '14px', paddingLeft: '0' },
    '.cm-changedLineGutter': { background: '#238636' },
    '.cm-changedLineGutter::after': { content: '"+"', display: 'block', textAlign: 'center', color: '#ffffff', fontWeight: '700' },
    '.cm-merge-a .cm-changedLineGutter': { background: '#b62324' },
    '.cm-merge-a .cm-changedLineGutter::after': { content: '"−"', color: '#ffffff' },
    '.cm-deletedLineGutter': { background: 'var(--danger)' },
    '.cm-tooltip.cm-tooltip-hover': { background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)' },
    '.cp-peek': { maxWidth: '640px', maxHeight: '360px', overflow: 'auto', padding: '6px 10px' },
    '.cp-peek-head': { display: 'block', padding: '2px 0', font: '12px var(--font-ui)', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' },
    '.cp-peek-head:hover': { textDecoration: 'underline' },
    '.cp-peek pre': { margin: '2px 0 8px', font: '12px/1.5 var(--font-mono)', color: '#d4d4d4', whiteSpace: 'pre' },
    '.cm-collapsedLines': { color: 'var(--text-3)', background: 'var(--bg-2)', padding: '4px 12px', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: '12px' },
    '.cm-why-gutter': { width: '22px' },
    '.cm-part-line': { boxShadow: 'inset 3px 0 0 #e8b84a', backgroundColor: 'rgba(232, 184, 74, 0.08)' },
    '.cm-searchMatch': { backgroundColor: 'rgba(232, 184, 74, 0.22)', outline: '1px solid rgba(232, 184, 74, 0.75)', borderRadius: '2px' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: '#e8b84a', outline: '1px solid #e8b84a', color: '#141414' },
    '.cm-searchMatch.cm-searchMatch-selected *': { color: '#141414 !important' },
    '.cm-selectionMatch': { backgroundColor: 'rgba(106, 169, 255, 0.18)' },
    '.cm-panels': { backgroundColor: 'var(--bg-1)', color: 'var(--text-2)' },
    '.cm-panels-top': { borderBottom: '1px solid var(--line)' },
    '.cp-search': { display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 10px', fontFamily: 'var(--font-ui)', fontSize: '12.5px' },
    '.cp-search-input': {
      flex: '1 1 160px',
      minWidth: '110px',
      maxWidth: '300px',
      height: '28px',
      padding: '0 10px',
      font: '13px var(--font-mono)',
      color: 'var(--text)',
      background: 'var(--bg-3)',
      border: '1px solid var(--line-2)',
      borderRadius: '7px',
      outline: 'none'
    },
    '.cp-search-input:focus': { borderColor: '#e8b84a' },
    '.cp-replace': { paddingTop: '0' },
    '.cp-search button.cp-search-text': { padding: '0 12px', color: 'var(--text-2)', fontFamily: 'var(--font-ui)' },
    '.cp-search-count': { minWidth: '70px', fontWeight: '600', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' },
    '.cp-search-count.none': { color: 'var(--danger)' },
    '.cp-search button': {
      height: '28px',
      minWidth: '28px',
      padding: '0 8px',
      font: '600 12px var(--font-ui)',
      color: 'var(--text-3)',
      background: 'var(--bg-3)',
      border: '1px solid var(--line-2)',
      borderRadius: '6px',
      cursor: 'pointer'
    },
    '.cp-search button:hover': { color: 'var(--text)', borderColor: 'var(--line-3)' },
    '.cp-search .cp-search-opt': { fontFamily: 'var(--font-mono)' },
    '.cp-search .cp-search-opt.on': { color: '#141414', background: '#e8b84a', borderColor: '#e8b84a' },
    '.cp-search .cp-search-close': { marginLeft: 'auto', background: 'none', border: 'none' }
  },
  { dark: true }
)

const view = ref<'changes' | 'files' | 'flow' | 'search' | 'parts'>('changes')
const filter = ref('')
const searchQuery = ref('')
const searchResults = ref<{ path: string; line: number; text: string }[]>([])
const searchedFor = ref('')
const isSearching = ref(false)
let searchTimer: ReturnType<typeof setTimeout> | null = null
const runSearch = async (): Promise<void> => {
  const query = searchQuery.value.trim()
  if (searchTimer) clearTimeout(searchTimer)
  if (query.length < 2) {
    searchResults.value = []
    searchedFor.value = ''
    return
  }
  isSearching.value = true
  const scope = searchScope.value
  const results = await window.api.searchCode(workCwd.value ?? props.cwd ?? '', query, scope, isIdentifierQuery(query))
  isSearching.value = false
  if (query !== searchQuery.value.trim() || scope !== searchScope.value) return
  searchResults.value = results
  searchedFor.value = query
  isImportsOpen.value = false
  isUsagesOpen.value = !grouped.value?.definitions.length
}
const startSearch = (): void => {
  void runSearch()
}
const scheduleSearch = (): void => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(startSearch, 400)
}
const readScope = (): string => {
  try {
    return localStorage.getItem('dash.searchScope') ?? ''
  } catch {
    return ''
  }
}
const searchScope = ref(readScope())
const setScope = (scope: string): void => {
  searchScope.value = scope
}
const saveScope = (scope: string): void => {
  scheduleSearch()
  try {
    localStorage.setItem('dash.searchScope', scope)
  } catch {
    return
  }
}
watch(searchScope, saveScope)
const isImportsOpen = ref(false)
const isUsagesOpen = ref(false)
const grouped = computed(() => (isIdentifierQuery(searchedFor.value) ? groupHits(searchResults.value, searchedFor.value, files.value) : null))
const openFolder = computed(() => (openPath.value?.includes('/') ? `${openPath.value.split('/').slice(0, -1).join('/')}/` : null))
const files = ref<string[]>([])
const branch = ref<BranchChanges | null>(null)
const openPath = ref<string | null>(null)
const isDirty = ref(false)
const isDiff = ref(true)
const diffBase = ref<'target' | 'commit'>('target')
const error = ref<string | null>(null)
const isSaving = ref(false)
const expanded = ref<Set<string>>(new Set())
const host = ref<HTMLDivElement | null>(null)
const editor = shallowRef<EditorView | null>(null)
const mergeView = shallowRef<MergeView | null>(null)
const layout = ref<DiffLayout>(readDiffLayout())
const explain = ref<ExplainFile | null>(null)
const isExplaining = ref(false)
const pollTimers = new Set<ReturnType<typeof setTimeout>>()
const partsDoc = ref<ReviewFile | null>(null)
const partsProgress = ref<PartProgress>({ head: '', updatedAt: 0, reviewed: [], remarks: {} })
const isSendingRemarks = ref(false)
const activePart = ref<number | null>(null)
const isReviewing = ref(false)
const why = ref<{ text: string; top: number; left: number } | null>(null)
const languageSlot = new Compartment()
const languageSlotA = new Compartment()
const diffSlot = new Compartment()
const whySlot = new Compartment()
const partSlot = new Compartment()
let baseText = ''
let savedText = ''
let fileCache = emptyFileCache<EditorState>()
let loadedIdentity: string | null = null
const clearFileCache = (): void => {
  fileCache = emptyFileCache<EditorState>()
  loadedIdentity = null
}
const peekCache = new Map<string, { path: string; line: number; snippet: string } | null>()

const workCwd = computed(() => (branch.value?.isReadOnly ? props.cwd : (branch.value?.folder ?? props.cwd)))
const isUncommittedOnly = ref(false)
const uncommitted = computed(() => new Set(branch.value?.uncommitted ?? []))
const isUncommitted = (path: string): boolean => uncommitted.value.has(path)
const changes = computed(() => {
  const list = branch.value?.files ?? []
  return isUncommittedOnly.value ? list.filter((f) => isUncommitted(f.path)) : list
})
const folderName = computed(() => (branch.value?.folder && branch.value.folder !== props.cwd ? branch.value.folder.split(/[\\/]/).pop() : null))
const toggleUncommitted = async (): Promise<void> => {
  isUncommittedOnly.value = !isUncommittedOnly.value
  await setDiffMode(isUncommittedOnly.value ? 'commit' : 'target')
}
const isOtherBranch = computed(
  () => !!branch.value && !branch.value.branch.toUpperCase().includes(props.ticketKey.toUpperCase())
)
const isOtherBranchShown = ref(false)
const showOtherBranch = (): void => {
  isOtherBranchShown.value = true
}
const isChangesHidden = computed(() => isOtherBranch.value && !isOtherBranchShown.value)
const tree = computed(() => buildTree(files.value))
const filtered = computed(() => {
  const needle = filter.value.trim().toLowerCase()
  return needle ? files.value.filter((f) => f.toLowerCase().includes(needle)).slice(0, 300) : []
})
const stateOf = (path: string): ChangedFile['state'] | null => changes.value.find((c) => c.path === path)?.state ?? null
const explainedCount = computed(() => explain.value?.doc.changes.length ?? 0)
const flow = computed(() => explain.value?.doc.flow ?? [])
const changesOfStep = (step: number): { file: string; line: number; title: string }[] =>
  (explain.value?.doc.changes ?? []).filter((c) => c.step === step)
const isWhyOpen = ref(true)
const countsOf = (file: ChangedFile): LineCounts => {
  const own = { added: file.added ?? null, removed: file.removed ?? null }
  return isUncommittedOnly.value ? (branch.value?.uncommittedCounts?.[file.path] ?? { added: 0, removed: 0 }) : own
}
const totals = computed(() => {
  const sum = (key: keyof LineCounts): number => changes.value.reduce((n, c) => n + (countsOf(c)[key] ?? 0), 0)
  return { added: sum('added'), removed: sum('removed') }
})
const biggestChange = computed(() => Math.max(1, ...changes.value.map((c) => (countsOf(c).added ?? 0) + (countsOf(c).removed ?? 0))))
const cellsOf = (file: ChangedFile): BarCell[] => barCells(countsOf(file).added, countsOf(file).removed, biggestChange.value)
const openCounts = computed(() => {
  const file = changes.value.find((c) => c.path === openPath.value) ?? branch.value?.files.find((c) => c.path === openPath.value)
  return file ? countsOf(file) : null
})
const viewedKey = computed(() => (branch.value ? `dash.viewed.${branch.value.branch}` : null))
const viewed = ref<Record<string, string>>({})
const loadViewed = (key: string | null): void => {
  try {
    viewed.value = key ? (JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, string>) : {}
  } catch {
    viewed.value = {}
  }
}
watch(viewedKey, loadViewed, { immediate: true })
const signatureOf = (file: ChangedFile): string => changeSignature(file)
const isViewed = (file: ChangedFile): boolean => isFileViewed(viewed.value, file.path, signatureOf(file))
const viewedCount = computed(() => changes.value.filter(isViewed).length)
const flipViewed = (file: ChangedFile): void => {
  viewed.value = toggleViewed(viewed.value, file.path, signatureOf(file))
  try {
    if (viewedKey.value) localStorage.setItem(viewedKey.value, JSON.stringify(viewed.value))
  } catch {
    return
  }
}
const sideWidth = ref(clampSize(readSize('dash.codeSide', 280), 180, 520))
const resizeSide = (delta: number): void => {
  sideWidth.value = clampSize(sideWidth.value + delta, 180, 520)
}
const saveSide = (): void => writeSize('dash.codeSide', sideWidth.value)
const isSideCollapsed = ref(readFlag('dash.codeSideCollapsed'))
const toggleSide = (): void => {
  isSideCollapsed.value = !isSideCollapsed.value
  writeSize('dash.codeSideCollapsed', isSideCollapsed.value)
}
const showView = (next: 'changes' | 'files' | 'flow' | 'search' | 'parts'): void => {
  view.value = next
  if (isSideCollapsed.value) toggleSide()
}
const whyHeight = ref(clampSize(readSize('dash.whyHeight', 200), 70, 640))
const resizeWhy = (delta: number): void => {
  whyHeight.value = clampSize(whyHeight.value + delta, 70, 640)
}
const saveWhy = (): void => writeSize('dash.whyHeight', whyHeight.value)
const changesOfFile = (path: string | null): { line: number; step: number; title: string; why: string }[] =>
  path ? (explain.value?.doc.changes ?? []).filter((c) => c.file === path).sort((a, b) => a.line - b.line) : []
const stepTitle = (step: number): string => flow.value.find((f) => f.step === step)?.title ?? ''
const fileWhys = computed(() =>
  changesOfFile(openPath.value).map((c) => ({
    id: `${c.line}-${c.title}`,
    line: c.line,
    text: [stepTitle(c.step) && `Krok ${c.step}: ${stepTitle(c.step)}`, c.title, c.why].filter(Boolean).join(' — ')
  }))
)
const whyCount = (path: string): number => changesOfFile(path).length
const uncollapseAt = (v: EditorView, from: number): void => {
  v.dispatch({ effects: uncollapseUnchanged.of(from) })
  const left = mergeView.value && mergeView.value.b === v ? mergeView.value.a : null
  const chunks = left ? getChunks(v.state)?.chunks : null
  if (left && chunks) left.dispatch({ effects: uncollapseUnchanged.of(mapToSideA(from, chunks)) })
}
const goToLine = (line: number): void => {
  const v = editor.value
  if (!v) return
  const target = v.state.doc.line(Math.min(Math.max(line, 1), v.state.doc.lines))
  const block = v.lineBlockAt(target.from)
  if (block.type === BlockType.WidgetRange) uncollapseAt(v, block.from)
  v.dispatch({ selection: { anchor: target.from }, effects: EditorView.scrollIntoView(target.from, { y: 'center' }) })
  v.focus()
}

const changeCount = ref(0)
const changeIndex = ref(-1)
const countChanges = (state: EditorState): void => {
  changeCount.value = getChunks(state)?.chunks.length ?? 0
}
const stepChange = (delta: number): void => {
  const v = editor.value
  const chunks = v ? (getChunks(v.state)?.chunks ?? []) : []
  if (!v || !chunks.length) return
  const doc = v.state.doc
  const head = doc.lineAt(v.state.selection.main.head).from
  const starts = chunks.map((c) => doc.lineAt(Math.min(c.fromB, doc.length)).from)
  const after = starts.findIndex((s) => s > head)
  const before = starts.reduce((found, s, i) => (s < head ? i : found), -1)
  const index = delta > 0 ? (after === -1 ? 0 : after) : before === -1 ? starts.length - 1 : before
  changeIndex.value = index
  const block = v.lineBlockAt(starts[index])
  if (block.type === BlockType.WidgetRange) uncollapseAt(v, block.from)
  v.dispatch({ selection: { anchor: starts[index] }, effects: EditorView.scrollIntoView(starts[index], { y: 'center' }) })
  v.focus()
}

class WhyMarker extends GutterMarker {
  constructor(readonly text: string) {
    super()
  }
  eq(other: WhyMarker): boolean {
    return other.text === this.text
  }
  toDOM(): Node {
    const el = document.createElement('span')
    el.className = 'why-dot'
    el.textContent = 'i'
    el.addEventListener('mouseenter', () => {
      const r = el.getBoundingClientRect()
      why.value = { text: this.text, top: r.bottom + 6, left: r.left }
    })
    el.addEventListener('mouseleave', () => (why.value = null))
    return el
  }
}

const whyExtension = (): Extension => {
  const entries = fileWhys.value
  if (!entries.length) return []
  return gutter({
    class: 'cm-why-gutter',
    markers: (v) => {
      const lines = v.state.doc.lines
      return RangeSet.of(
        entries
          .map((h) => ({ from: v.state.doc.line(Math.min(Math.max(h.line, 1), lines)).from, text: h.text }))
          .sort((a, b) => a.from - b.from)
          .map((m) => new WhyMarker(m.text).range(m.from)),
        true
      )
    }
  })
}

const note = ref<{ text: string; line: number; top: number; left: number } | null>(null)
let noteCloseTimer: ReturnType<typeof setTimeout> | null = null
const keepNote = (): void => {
  if (noteCloseTimer) clearTimeout(noteCloseTimer)
  noteCloseTimer = null
}
const closeNoteSoon = (): void => {
  keepNote()
  noteCloseTimer = setTimeout(() => (note.value = null), 250)
}

class NoteMarker extends GutterMarker {
  constructor(
    readonly text: string,
    readonly line: number
  ) {
    super()
  }
  eq(other: NoteMarker): boolean {
    return other.text === this.text && other.line === this.line
  }
  toDOM(): Node {
    const el = document.createElement('span')
    el.className = 'why-dot note-dot'
    el.textContent = 'i'
    el.addEventListener('mouseenter', () => {
      keepNote()
      const r = el.getBoundingClientRect()
      note.value = { text: this.text, line: this.line, top: r.bottom + 4, left: r.left }
    })
    el.addEventListener('mouseleave', closeNoteSoon)
    return el
  }
}

const noteExtension = (notes: ReviewNote[]): Extension =>
  notes.length
    ? gutter({
        class: 'cm-why-gutter',
        markers: (v) =>
          RangeSet.of(
            notes
              .map((n) => ({ from: lineStart(v, n.line), n }))
              .sort((a, b) => a.from - b.from)
              .map((m) => new NoteMarker(m.n.text, m.n.line).range(m.from)),
            true
          )
      })
    : []

const askAboutNote = async (): Promise<void> => {
  const shown = note.value
  const v = editor.value
  if (!shown || !v || !openPath.value) return
  note.value = null
  const code = v.state.doc.line(Math.min(Math.max(shown.line, 1), v.state.doc.lines)).text.trim()
  const prompt = `Rozwiń proszę wyjaśnienie linii ${openPath.value}:${shown.line}\n\`\`\`\n${code}\n\`\`\`\nTwoja notatka: ${shown.text}\nCzego dotyczy ta linia i jak działa w kontekście tej zmiany?`
  if (!props.askReview || !(await props.askReview(prompt))) emit('ask', prompt)
}

const partLine = Decoration.line({ class: 'cm-part-line' })
const partExtension = (): Extension => {
  const part = activePart.value === null ? null : partsDoc.value?.parts[activePart.value]
  const hunks = part ? part.hunks.filter((h) => h.file === openPath.value) : []
  const notes = part ? (part.notes ?? []).filter((n) => n.file === openPath.value) : []
  if (!hunks.length) return noteExtension(notes)
  return [noteExtension(notes), EditorView.decorations.compute(['doc'], (state) => {
    const starts = new Set<number>()
    for (const h of hunks) {
      for (let n = Math.max(h.start, 1); n <= Math.min(h.end, state.doc.lines); n += 1) starts.add(state.doc.line(n).from)
    }
    return Decoration.set([...starts].sort((a, b) => a - b).map((from) => partLine.range(from)))
  })]
}

const isPushed = ref(false)
const pushedRef = computed(() => (isPushed.value && props.pushedMr ? { source: props.pushedMr.source, target: props.pushedMr.target } : null))
const activeRef = computed(() => props.branchRef ?? pushedRef.value)
const isMrSource = computed(() => !!props.branchRef || !!pushedRef.value)
const mrComments = computed(() => (isMrSource.value ? (props.comments ?? []) : []))
const mrCommentable = computed(() => (isMrSource.value ? (props.commentable ?? null) : null))
const mrReview = computed(() => (isMrSource.value ? props.review : undefined))
const reviewMr = computed(() => props.mr ?? (pushedRef.value ? (props.pushedMr ?? null) : null))
const isMrOfOther = computed(() => !!props.branchRef && !!props.isOthersMr)
const currentHead = computed(() => (isMrSource.value ? (props.commentable?.headSha ?? null) : (branch.value?.head ?? null)))
const partsStaleReason = computed(() => (partsDoc.value && branch.value ? staleReason(partsDoc.value, branch.value.files, currentHead.value) : null))
const commentSlot = new Compartment()
const openComments = ref<Set<string>>(new Set())
const fileComments = computed(() => mrComments.value.filter((c) => c.path === openPath.value))
const activeComments = computed(() =>
  mrComments.value.filter((c) => !c.isResolved).sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line)
)
const commentIndex = ref(-1)
const goToFileLine = async (path: string, line: number): Promise<void> => {
  if (openPath.value !== path) await open(path)
  const v = editor.value
  if (!v || openPath.value !== path) return
  const at = lineStart(v, line)
  const block = v.lineBlockAt(at)
  if (block.type === BlockType.WidgetRange) uncollapseAt(v, block.from)
  const here = mrComments.value.filter((c) => c.path === path && c.line === line && !c.isDraft)
  if (here.length) {
    const next = new Set(openComments.value)
    here.forEach((c) => next.add(c.id))
    openComments.value = next
    v.dispatch({ effects: commentSlot.reconfigure(commentExtension()) })
  }
  v.dispatch({ selection: { anchor: at }, effects: EditorView.scrollIntoView(at, { y: 'center' }) })
  v.focus()
}
const stepComment = (delta: number): void => {
  const list = activeComments.value
  if (!list.length) return
  const current = commentIndex.value
  const fromCursor = (): number => {
    const line = editor.value ? editor.value.state.doc.lineAt(editor.value.state.selection.main.head).number : 0
    const here = openPath.value ?? ''
    const after = list.findIndex((c) => c.path > here || (c.path === here && c.line > line))
    if (delta > 0) return after === -1 ? 0 : after
    const before = after === -1 ? list.length - 1 : after - 1
    return before < 0 ? list.length - 1 : before
  }
  const isOnCurrent = current >= 0 && current < list.length && list[current].path === openPath.value
  const next = isOnCurrent ? (current + delta + list.length) % list.length : fromCursor()
  commentIndex.value = next
  void goToFileLine(list[next].path, list[next].line)
}
const reopenAs = async (isPushedNext: boolean): Promise<void> => {
  isPushed.value = isPushedNext
  isUncommittedOnly.value = false
  isDiff.value = true
  diffBase.value = 'target'
  await refresh()
  if (!openPath.value || (await open(openPath.value, true))) return
  destroyEditors()
  openPath.value = null
  isDirty.value = false
}
const showPushed = async (): Promise<boolean> => {
  if (!props.pushedMr) return false
  if (isPushed.value) return true
  if (!confirmDiscard()) return false
  await reopenAs(true)
  return true
}
const showWorktree = (): Promise<void> => reopenAs(false)
const leavePushedWhenGone = (mr: typeof props.pushedMr): void => {
  if (!mr && isPushed.value) void reopenAs(false)
}
watch(() => props.pushedMr, leavePushedWhenGone)
const resetTabs = (): void => {
  tabs.value = []
  clearFileCache()
}
watch(() => tabScope(props.cwd ?? null, activeRef.value?.source ?? null), resetTabs)
defineExpose({ goToFileLine, showPushed })
const commentCount = (path: string): number => mrComments.value.filter((c) => c.path === path && !c.isResolved).length
const lineStart = (v: EditorView, line: number): number => v.state.doc.line(Math.min(Math.max(line, 1), v.state.doc.lines)).from
const lineEnd = (v: EditorView, line: number): number => v.state.doc.line(Math.min(Math.max(line, 1), v.state.doc.lines)).to

const toggleComment = (id: string): void => {
  const next = new Set(openComments.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  openComments.value = next
  editor.value?.dispatch({ effects: commentSlot.reconfigure(commentExtension()) })
}

class CommentMarker extends GutterMarker {
  constructor(
    readonly id: string,
    readonly isResolved: boolean
  ) {
    super()
  }
  eq(other: CommentMarker): boolean {
    return other.id === this.id && other.isResolved === this.isResolved
  }
  toDOM(): Node {
    const el = document.createElement('span')
    el.className = this.isResolved ? 'cmt-dot done' : 'cmt-dot'
    el.title = 'Show the comment'
    el.innerHTML =
      '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
    el.addEventListener('mousedown', (e) => {
      e.preventDefault()
      toggleComment(this.id)
    })
    return el
  }
}

class CommentWidget extends WidgetType {
  constructor(
    readonly comment: CodeComment,
    readonly tick: number
  ) {
    super()
  }
  eq(other: CommentWidget): boolean {
    return (
      other.tick === this.tick &&
      other.comment.id === this.comment.id &&
      other.comment.isResolved === this.comment.isResolved &&
      other.comment.notes.map((n) => n.body).join('|') === this.comment.notes.map((n) => n.body).join('|')
    )
  }
  toDOM(): HTMLElement {
    const box = document.createElement('div')
    box.className = this.comment.isDraft ? 'cmt-box pending' : this.comment.isResolved ? 'cmt-box done' : 'cmt-box'
    if (this.comment.isDraft) {
      const tag = document.createElement('span')
      tag.className = 'cmt-pending'
      tag.textContent = 'Pending, publish with Submit review'
      box.append(tag)
    }
    for (const n of this.comment.notes) {
      const note = document.createElement('div')
      note.className = 'cmt-note'
      const who = document.createElement('b')
      who.textContent = n.author
      const body = document.createElement('div')
      body.className = 'cmt-body'
      if (n.html) body.innerHTML = n.html
      else body.textContent = n.body
      note.append(who, body)
      box.append(note)
    }
    const close = document.createElement('button')
    close.className = 'cmt-close'
    close.textContent = 'Hide'
    close.addEventListener('mousedown', (e) => {
      e.preventDefault()
      toggleComment(this.comment.id)
    })
    box.append(close)
    const actions = commentActions(this.comment, box)
    if (actions) box.append(actions)
    box.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('a')
      if (!a || !parseVersionLink(a.href)) return
      e.preventDefault()
      emit('version', a.href, this.comment.path, this.comment.line)
    })
    return box
  }
  ignoreEvent(): boolean {
    return true
  }
}

const isCommenting = computed(
  () => !!mrReview.value && !!mrCommentable.value?.isAllowed && !!mrCommentable.value.headSha && mrCommentable.value.path === openPath.value && !isDirty.value
)
let isSending = false
let renderTick = 0
const redrawComments = (): void => {
  renderTick += 1
  editor.value?.dispatch({ effects: commentSlot.reconfigure(commentExtension()) })
}
const composer = ref<{ path: string; line: number } | null>(null)
let composerText = ''

const sendReview = async (action: MrReviewAction): Promise<boolean> => (mrReview.value ? mrReview.value(action) : false)

const button = (label: string, className: string, run: () => void): HTMLButtonElement => {
  const b = document.createElement('button')
  b.className = className
  b.textContent = label
  b.addEventListener('mousedown', (e) => {
    e.preventDefault()
    run()
  })
  return b
}

const commentActions = (c: CodeComment, box: HTMLElement): HTMLElement | null => {
  if (!mrReview.value) return null
  const row = document.createElement('div')
  row.className = 'cmt-actions'
  if (c.isDraft && c.draftId !== undefined) {
    const id = c.draftId
    row.append(
      button('Edit', 'cmt-link', () => {
        const area = document.createElement('textarea')
        area.className = 'cmt-input'
        area.value = c.notes[0]?.body ?? ''
        const save = button('Save', 'cmt-btn primary', () => {
          void sendReview({ kind: 'draft-edit', id, body: area.value }).then((isDone) => {
            if (isDone) redrawComments()
          })
        })
        const cancel = button('Cancel', 'cmt-btn', redrawComments)
        const bar = document.createElement('div')
        bar.className = 'cmt-actions'
        bar.append(cancel, save)
        box.replaceChildren(area, bar)
        area.focus()
      }),
      button('Delete', 'cmt-link danger', () => void sendReview({ kind: 'draft-delete', id }))
    )
    return row
  }
  if (!c.discussionId) return null
  const discussionId = c.discussionId
  row.append(
    button('Reply', 'cmt-btn', () => {
      const area = document.createElement('textarea')
      area.className = 'cmt-input'
      area.rows = 3
      area.placeholder = 'Reply… Ctrl+Enter adds it to your review.'
      const bar = document.createElement('div')
      bar.className = 'cmt-actions'
      const send = (kind: 'draft-add' | 'reply'): void => {
        if (!area.value.trim()) return
        const action: MrReviewAction = kind === 'reply' ? { kind, discussionId, body: area.value } : { kind, body: area.value, replyTo: discussionId, isResolving: resolveBox.checked }
        void sendReview(action).then((isDone) => {
          if (isDone) redrawComments()
        })
      }
      area.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
          e.preventDefault()
          send('draft-add')
        }
        if (e.key === 'Escape') redrawComments()
      })
      const resolveBox = document.createElement('input')
      resolveBox.type = 'checkbox'
      resolveBox.checked = true
      const resolveLabel = document.createElement('label')
      resolveLabel.title = 'Resolve this thread when the review is submitted'
      resolveLabel.append(resolveBox, 'Resolve thread')
      bar.append(
        resolveLabel,
        button('Cancel', 'cmt-btn', redrawComments),
        button('Reply now', 'cmt-btn', () => send('reply')),
        button('Add to review', 'cmt-btn primary', () => send('draft-add'))
      )
      row.replaceWith(area, bar)
      area.focus()
    })
  )
  if (c.isResolvable) row.append(button(c.isResolved ? 'Unresolve' : 'Resolve', 'cmt-btn', () => void sendReview({ kind: 'resolve', discussionId, isResolved: !c.isResolved })))
  return row
}

const closeComposer = (): void => {
  composer.value = null
  composerText = ''
  editor.value?.dispatch({ effects: commentSlot.reconfigure(commentExtension()) })
}

const submitComposer = async (kind: 'draft-add' | 'line-comment'): Promise<void> => {
  const at = composer.value
  const sha = mrCommentable.value?.headSha
  if (!at || !sha || !composerText.trim() || isSending) return
  isSending = true
  try {
    if (await sendReview({ kind, body: composerText, anchor: { path: at.path, line: at.line, side: 'new', sha } })) closeComposer()
  } finally {
    isSending = false
  }
}

class ComposerWidget extends WidgetType {
  constructor(readonly line: number) {
    super()
  }
  eq(other: ComposerWidget): boolean {
    return other.line === this.line
  }
  toDOM(): HTMLElement {
    const box = document.createElement('div')
    box.className = 'cmt-box composer'
    const area = document.createElement('textarea')
    area.className = 'cmt-input'
    area.rows = 4
    area.placeholder = `Comment on line ${this.line}. Markdown works. Ctrl+Enter adds it to your review.`
    area.value = composerText
    area.addEventListener('input', () => (composerText = area.value))
    area.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault()
        void submitComposer('draft-add')
      }
      if (e.key === 'Escape') closeComposer()
    })
    const bar = document.createElement('div')
    bar.className = 'cmt-actions'
    bar.append(
      button('Cancel', 'cmt-btn', closeComposer),
      button('Comment now', 'cmt-btn', () => void submitComposer('line-comment')),
      button('Add to review', 'cmt-btn primary', () => void submitComposer('draft-add'))
    )
    box.append(area, bar)
    setTimeout(() => area.focus(), 0)
    return box
  }
  ignoreEvent(): boolean {
    return true
  }
}

class AddMarker extends GutterMarker {
  constructor(readonly line: number) {
    super()
  }
  eq(other: AddMarker): boolean {
    return other.line === this.line
  }
  toDOM(): Node {
    const el = document.createElement('span')
    el.className = 'cmt-add'
    el.title = 'Comment on this line'
    el.textContent = '+'
    el.addEventListener('mousedown', (e) => {
      e.preventDefault()
      if (!openPath.value) return
      composer.value = { path: openPath.value, line: this.line }
      composerText = ''
      editor.value?.dispatch({ effects: commentSlot.reconfigure(commentExtension()) })
    })
    return el
  }
}

const commentExtension = (): Extension => {
  const entries = fileComments.value
  const isAdding = isCommenting.value
  const draftAt = composer.value?.path === openPath.value ? composer.value : null
  if (!entries.length && !isAdding) return []
  const commentLines = new Set(entries.map((c) => c.line))
  return [
    gutter({
      class: 'cm-comment-gutter',
      lineMarker: (v, block) => {
        if (!isAdding) return null
        const line = v.state.doc.lineAt(block.from).number
        return commentLines.has(line) ? null : new AddMarker(line)
      },
      markers: (v) =>
        RangeSet.of(
          [...entries]
            .map((c) => ({ from: lineStart(v, c.line), c }))
            .sort((a, b) => a.from - b.from)
            .filter((m, i, list) => i === 0 || list[i - 1].from !== m.from)
            .map((m) => new CommentMarker(m.c.id, m.c.isResolved).range(m.from)),
          true
        )
    }),
    EditorView.decorations.compute(['doc'], (state) => {
      const v = { state } as EditorView
      const open = entries.filter((c) => c.isDraft || openComments.value.has(c.id))
      const widgets = open.map((c) => ({ at: lineEnd(v, c.line), w: new CommentWidget(c, renderTick) as WidgetType }))
      if (draftAt) widgets.push({ at: lineEnd(v, draftAt.line), w: new ComposerWidget(draftAt.line) })
      return Decoration.set(
        widgets.sort((a, b) => a.at - b.at).map((m) => Decoration.widget({ widget: m.w, block: true, side: 1 }).range(m.at)),
        true
      )
    })
  ]
}
watch(
  () => [mrComments.value, mrCommentable.value, isDirty.value],
  () => editor.value?.dispatch({ effects: commentSlot.reconfigure(commentExtension()) })
)

const diffExtension = (): Extension =>
  isDiff.value
    ? unifiedMergeView({ original: baseText, mergeControls: false, collapseUnchanged: { margin: 4, minSize: 8 } })
    : []

const refresh = async (): Promise<void> => {
  if (!props.cwd) return
  peekCache.clear()
  clearFileCache()
  const ref = activeRef.value
  const changed = ref ? await window.api.listRefChanges(props.cwd, ref.source, ref.target, !!pushedRef.value) : await window.api.listBranchChanges(props.cwd)
  branch.value = changed
  files.value = ref && changed?.isReadOnly ? await window.api.listRefFiles(props.cwd, ref.source) : await window.api.listFiles(changed?.folder ?? props.cwd)
}

const save = async (): Promise<void> => {
  const cwd = workCwd.value
  if (!cwd || !openPath.value || !editor.value || isSaving.value) return
  isSaving.value = true
  const text = editor.value.state.doc.toString()
  const path = openPath.value
  const result = await window.api.writeFile(cwd, path, text)
  isSaving.value = false
  error.value = result.error
  if (result.error) return
  void refresh()
  if (openPath.value !== path || !editor.value) return
  savedText = text
  isDirty.value = editor.value.state.doc.toString() !== text
  emit('fileShown', path, branch.value?.folder ?? null, !!branch.value?.isReadOnly)
}

const destroyEditors = (): void => {
  if (mergeView.value) mergeView.value.destroy()
  else editor.value?.destroy()
  mergeView.value = null
  editor.value = null
}

const confirmDiscard = (): boolean => !isDirty.value || window.confirm(`Discard unsaved changes in ${openPath.value}?`)

const tabs = ref<CodeTab[]>([])
const tabName = (path: string): string => path.split('/').pop() ?? path
const tabScroller = (): HTMLElement | null => mergeView.value?.dom ?? editor.value?.scrollDOM ?? null
const topLineOf = (v: EditorView): number => v.state.doc.lineAt(v.lineBlockAtHeight(tabScroller()?.scrollTop ?? 0).from).number
const restoreTab = (tab: CodeTab): void => {
  const v = editor.value
  if (!v) return
  const doc = v.state.doc
  const cursor = doc.line(Math.min(Math.max(tab.line, 1), doc.lines)).from
  const top = doc.line(Math.min(Math.max(tab.topLine, 1), doc.lines)).from
  v.dispatch({ selection: { anchor: cursor }, effects: EditorView.scrollIntoView(top, { y: 'start' }) })
}
const closeFileTab = async (path: string): Promise<void> => {
  const { next } = closeTab(tabs.value, path)
  if (path === openPath.value && next && !(await open(next))) return
  tabs.value = closeTab(tabs.value, path).tabs
  fileCache = dropFileCache(fileCache, path)
}
type FileRead = { text: string | null; error: string | null }
const currentIdentity = (): string =>
  fileCacheIdentity([
    props.cwd,
    workCwd.value,
    activeRef.value?.source,
    activeRef.value?.target,
    !!branch.value?.isReadOnly,
    branch.value?.base,
    branch.value?.head,
    diffBase.value,
    isDiff.value,
    layout.value
  ])
const stashFile = (path: string, v: EditorView): void => {
  const identity = currentIdentity()
  const file = { text: savedText, baseText, state: mergeView.value ? null : v.state }
  const isReusable = !isDirty.value && loadedIdentity === identity
  fileCache = isReusable
    ? writeFileCache(fileCache, identity, path, file, TAB_LIMIT)
    : dropFileCache(fileCache, path)
}
const readBase = (path: string): Promise<string> => {
  const ref = activeRef.value
  if (!ref || !branch.value?.isReadOnly) {
    return window.api.readHeadFile(workCwd.value as string, path, diffBase.value === 'commit')
  }
  const toBase = (text: string | null): string => text ?? ''
  const cwd = props.cwd as string
  return window.api.readRefFile(cwd, ref.source, ref.target, path, true).then(toBase)
}
const readSides = (path: string): Promise<[FileRead, string]> => {
  const cwd = props.cwd as string
  const ref = activeRef.value
  if (!ref || !branch.value?.isReadOnly) {
    return Promise.all([window.api.readFile(workCwd.value as string, path), readBase(path)])
  }
  const toFile = (text: string | null): FileRead => ({
    text,
    error: text === null ? `${path} is not on ${ref.source}` : null
  })
  return Promise.all([
    window.api.readRefFile(cwd, ref.source, ref.target, path, false).then(toFile),
    readBase(path)
  ])
}
let openCount = 0
const revalidate = async (
  path: string,
  identity: string,
  cached: CachedFile<EditorState>
): Promise<void> => {
  const startedAt = openCount
  const base = await readBase(path)
  if (base === cached.baseText) return
  fileCache = dropFileCache(fileCache, path)
  const v = editor.value
  const isStillShown = openPath.value === path && openCount === startedAt
  if (!isStillShown || isDirty.value || !v || currentIdentity() !== identity) return
  const line = v.state.doc.lineAt(v.state.selection.main.head).number
  tabs.value = rememberTab(tabs.value, path, line, topLineOf(v))
  const isThisTab = (tab: CodeTab): boolean => tab.path === path
  const tab = tabs.value.find(isThisTab)
  if ((await open(path, true)) && tab) restoreTab(tab)
}
const onTabAuxClick = (e: MouseEvent, path: string): void => {
  if (e.button === 1) void closeFileTab(path)
}

const open = async (path: string, isConfirmed = false): Promise<boolean> => {
  if (!props.cwd) return false
  if (!isConfirmed && !confirmDiscard()) return false
  openCount += 1
  const previous = openPath.value
  const current = editor.value
  if (previous && previous !== path && current) {
    tabs.value = rememberTab(tabs.value, previous, current.state.doc.lineAt(current.state.selection.main.head).number, topLineOf(current))
    stashFile(previous, current)
  }
  docText.value = null
  const ref = activeRef.value
  const isRef = !!ref && !!branch.value?.isReadOnly
  const identity = currentIdentity()
  const hit = previous === path ? null : readFileCache(fileCache, identity, path)
  const diskText =
    hit && !isRef ? (await window.api.readFile(workCwd.value as string, path)).text : hit?.text
  const cached = hit && isFreshFile(hit, diskText) ? hit : null
  const [file, base]: [FileRead, string] = cached
    ? [{ text: cached.text, error: null }, cached.baseText]
    : await readSides(path)
  error.value = file.error
  if (file.text === null) return false
  loadedIdentity = identity
  if (!isRef && !file.text && !base && !files.value.includes(path)) error.value = `${path} is not in the worktree or on ${branch.value?.target ?? 'the base'}: it was renamed or deleted`
  baseText = base
  openPath.value = path
  isDirty.value = false
  why.value = null
  const paneExtensions = [
    basicSetup,
    darkPlus,
    surface,
    search({ createPanel: searchPanel, top: true }),
    whySlot.of(whyExtension()),
    partSlot.of(partExtension()),
    commentSlot.of(commentExtension()),
    EditorState.readOnly.of(isRef),
    languageSlot.of(LANGS[languageOf(path)]()),
    keymap.of([{ key: 'Mod-s', run: () => (void save(), true) }]),
    EditorView.domEventHandlers({ mousedown: onCtrlClick }),
    hoverTooltip(peekSource, { hoverTime: 500 }),
    EditorView.updateListener.of((u) => {
      countChanges(u.state)
      if (u.docChanged) isDirty.value = u.state.doc.length !== savedText.length || u.state.doc.toString() !== savedText
    })
  ]
  const sides = sidesFor(layout.value, isDiff.value, base, file.text)
  savedText = file.text
  await nextTick()
  if (sides.left !== null) {
    destroyEditors()
    mergeView.value = new MergeView({
      a: {
        doc: sides.left,
        extensions: [basicSetup, darkPlus, surface, EditorState.readOnly.of(true), EditorView.editable.of(false), languageSlotA.of(LANGS[languageOf(path)]())]
      },
      b: { doc: sides.right, extensions: paneExtensions },
      parent: host.value as HTMLDivElement,
      collapseUnchanged: { margin: 4, minSize: 8 },
      gutter: true
    })
    editor.value = mergeView.value.b
  } else {
    if (mergeView.value) destroyEditors()
    const state =
      cached?.state ??
      EditorState.create({
        doc: sides.right,
        extensions: [...paneExtensions, diffSlot.of(diffExtension())]
      })
    if (editor.value) editor.value.setState(state)
    else editor.value = new EditorView({ state, parent: host.value as HTMLDivElement })
    if (cached?.state) {
      const slots = [
        whySlot.reconfigure(whyExtension()),
        partSlot.reconfigure(partExtension()),
        commentSlot.reconfigure(commentExtension())
      ]
      editor.value.dispatch({ effects: slots })
    }
  }
  changeIndex.value = -1
  countChanges(editor.value.state)
  const known = tabs.value.find((t) => t.path === path)
  tabs.value = openTab(tabs.value, path, Date.now())
  if (known && previous !== path) restoreTab(known)
  emit('fileShown', path, branch.value?.folder ?? null, !!branch.value?.isReadOnly)
  if (cached) void revalidate(path, identity, cached)
  return true
}

const setDiffMode = async (mode: 'off' | 'target' | 'commit'): Promise<void> => {
  const isReopening = layout.value === 'split' && !!openPath.value
  if (isReopening && !confirmDiscard()) return
  isDiff.value = mode !== 'off'
  if (mode !== 'off' && mode !== diffBase.value) {
    diffBase.value = mode
    const path = openPath.value
    if (path && workCwd.value && !branch.value?.isReadOnly) baseText = await window.api.readHeadFile(workCwd.value, path, mode === 'commit')
  }
  if (isReopening) await open(openPath.value as string, true)
  else editor.value?.dispatch({ effects: diffSlot.reconfigure(diffExtension()) })
}
const setLayout = async (next: DiffLayout): Promise<void> => {
  if (next === layout.value || (openPath.value && !confirmDiscard())) return
  layout.value = next
  writeSize('dash.diffUnified', next === 'unified')
  if (openPath.value) await open(openPath.value, true)
}
const diffLabel = computed(() =>
  pushedRef.value && props.pushedMr
    ? `MR !${props.pushedMr.iid}`
    : !isDiff.value ? 'Diff off' : diffBase.value === 'commit' ? 'Diff: uncommitted' : `Diff: ${branch.value?.target ?? 'base'}`
)
const diffItems = computed<MenuItem[]>(() => [
  {
    label: `Whole branch vs ${branch.value?.target ?? 'base'}`,
    hint: 'Everything this branch changes, including what is already in the MR',
    icon: 'diff',
    run: () => void (pushedRef.value ? showWorktree() : setDiffMode('target'))
  },
  ...(props.pushedMr
    ? [{ label: `MR !${props.pushedMr.iid} (pushed)`, hint: 'What GitLab shows, read-only, with MR comments', icon: 'pr' as const, run: () => void showPushed() }]
    : []),
  {
    label: 'Only uncommitted changes',
    hint: 'What changed since the last commit, so not in the MR yet',
    icon: 'save',
    isDisabled: !!branch.value?.isReadOnly,
    run: () => void setDiffMode('commit')
  },
  { label: 'No highlighting', hint: 'Plain file', icon: 'close', run: () => void setDiffMode('off') }
])

const applyExplain = (found: ExplainFile | null): void => {
  explain.value = found
  editor.value?.dispatch({ effects: whySlot.reconfigure(whyExtension()) })
}

const loadExplain = async (): Promise<void> => applyExplain(await window.api.getExplainDoc(props.ticketKey))

const waitForNewer = <T extends { updatedAt: number }>(load: () => Promise<T | null>, since: number, done: (found: T | null) => void): void => {
  const timer = setTimeout(async () => {
    pollTimers.delete(timer)
    const found = await load()
    if (found && found.updatedAt > since) return done(found)
    if (Date.now() - since > EXPLAIN_WAIT_MS) return done(null)
    waitForNewer(load, since, done)
  }, EXPLAIN_POLL_MS)
  pollTimers.add(timer)
}

const readExplain = (): Promise<ExplainFile | null> => window.api.getExplainDoc(props.ticketKey)

const finishExplain = (found: ExplainFile | null): void => {
  isExplaining.value = false
  if (!found) {
    error.value = 'The explanation did not appear. Check the Claude session.'
    return
  }
  applyExplain(found)
  view.value = 'flow'
}

const waitForExplain = (since: number): void => waitForNewer(readExplain, since, finishExplain)

const runExplain = async (): Promise<void> => {
  if (isExplaining.value || !props.cwd) return
  isExplaining.value = true
  error.value = null
  const since = Date.now()
  const result = await window.api.startExplain(props.ticketKey, workCwd.value ?? props.cwd, props.sourceSessionId)
  if (result.error || !result.sessionId) {
    isExplaining.value = false
    error.value = result.error ?? 'The explain session did not start'
    return
  }
  emit('explain', result.sessionId)
  waitForExplain(since)
}

const readReview = (): Promise<ReviewFile | null> => window.api.getReviewDoc(props.ticketKey)

const readStored = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const applyParts = (found: ReviewFile | null): void => {
  partsDoc.value = found
  partsProgress.value = found ? restoreProgress(found, readStored(progressKey(found))) : { head: '', updatedAt: 0, reviewed: [], remarks: {} }
  activePart.value = null
  editor.value?.dispatch({ effects: partSlot.reconfigure(partExtension()) })
}

const loadParts = async (): Promise<void> => {
  const found = await readReview()
  if (found?.updatedAt !== partsDoc.value?.updatedAt) applyParts(found)
}

const updateProgress = (next: PartProgress): void => {
  partsProgress.value = next
  const doc = partsDoc.value
  try {
    if (doc) localStorage.setItem(progressKey(doc), JSON.stringify(next))
  } catch {
    return
  }
}

const finishReviewParts = (found: ReviewFile | null): void => {
  isReviewing.value = false
  if (!found) {
    error.value = 'The review parts did not appear. Check the Claude session.'
    return
  }
  applyParts(found)
  view.value = 'parts'
}

const runReviewParts = async (): Promise<void> => {
  const cwd = workCwd.value ?? props.cwd
  if (isReviewing.value || !cwd) return
  isReviewing.value = true
  error.value = null
  const since = Date.now()
  const result = await window.api.startReviewParts(props.ticketKey, cwd, reviewMr.value)
  if (result.error || !result.sessionId) {
    isReviewing.value = false
    error.value = result.error ?? 'The review session did not start'
    return
  }
  waitForNewer(readReview, since, finishReviewParts)
}

const selectPart = async (index: number): Promise<void> => {
  const first = partsDoc.value?.parts[index]?.hunks[0]
  if (!first) return
  activePart.value = index
  note.value = null
  if (!isMrSource.value && (!isDiff.value || diffBase.value === 'commit')) {
    isUncommittedOnly.value = false
    await setDiffMode('target')
  }
  await goToFileLine(first.file, first.start)
  editor.value?.dispatch({ effects: partSlot.reconfigure(partExtension()) })
  if (openPath.value === first.file && !isPartChanged(index)) error.value = `These lines no longer differ from ${branch.value?.target ?? 'the base'}: the parts are out of date. Use Run again.`
}

const isPartChanged = (index: number): boolean => {
  const v = editor.value
  const chunks = v ? getChunks(v.state)?.chunks : null
  if (!v || !chunks) return true
  const doc = v.state.doc
  const lineOf = (pos: number): number => doc.lineAt(Math.min(pos, doc.length)).number
  const ranges = chunks.map((c) => ({ from: lineOf(c.fromB), to: lineOf(Math.max(c.fromB, c.toB - 1)) }))
  const hunks = (partsDoc.value?.parts[index]?.hunks ?? []).filter((h) => h.file === openPath.value)
  return hunks.some((h) => ranges.some((r) => r.from <= h.end && r.to >= h.start))
}

const sendDrafts = async (doc: ReviewFile): Promise<void> => {
  const sha = props.commentable?.headSha
  const review = props.review
  if (!review || !sha) {
    error.value = 'Commenting on this MR is not available yet. Open a changed file and try again.'
    return
  }
  if (!isSameHead(doc.head, sha)) {
    error.value = 'The MR moved since the parts were generated. Use "Run again" in Parts; your remarks are kept.'
    return
  }
  const drafts = remarkDrafts(doc, partsProgress.value)
  const sent = remarkedParts(doc, partsProgress.value)
  if (!window.confirm(`Add ${drafts.length} draft ${drafts.length === 1 ? 'note' : 'notes'} to the MR? They stay unpublished until you submit the review.`)) return
  for (const [i, d] of drafts.entries()) {
    if (!(await review({ kind: 'draft-add', body: d.body, anchor: { path: d.path, line: d.line, side: 'new', sha } }))) return
    updateProgress(setRemark(partsProgress.value, sent[i].index, ''))
  }
}

const sendRemarks = async (): Promise<void> => {
  const doc = partsDoc.value
  if (!doc || isSendingRemarks.value) return
  if (isMrOfOther.value) {
    isSendingRemarks.value = true
    try {
      await sendDrafts(doc)
    } finally {
      isSendingRemarks.value = false
    }
    return
  }
  if (!props.sendToSession && !props.canAsk) {
    error.value = 'Open the Claude session in the dashboard first, then send the remarks.'
    return
  }
  const prompt = remarksPrompt(doc, partsProgress.value)
  if (props.sendToSession) {
    if (!props.sendToSession(prompt)) {
      error.value = 'Open the main Claude session of this ticket in the dashboard first, then send the remarks.'
      return
    }
  } else emit('ask', prompt)
  updateProgress({ ...partsProgress.value, remarks: {} })
}

const rerunReviewParts = (): void => {
  const unsent = partsDoc.value ? remarkedParts(partsDoc.value, partsProgress.value).length : 0
  const isConfirmed =
    !unsent ||
    window.confirm(`${unsent} unsent ${unsent === 1 ? 'remark' : 'remarks'} will be discarded when the parts are regenerated. Send them first if you want to keep them. Run again anyway?`)
  if (isConfirmed) void runReviewParts()
}

const PEEK_LINES = 12
interface PeekBlock {
  path: string
  line: number
  snippet: string
}
const readText = async (path: string): Promise<string | null> => {
  const ref = activeRef.value
  if (ref && branch.value?.isReadOnly && props.cwd) return window.api.readRefFile(props.cwd, ref.source, ref.target, path, false)
  return workCwd.value ? (await window.api.readFile(workCwd.value, path)).text : null
}
const blockFrom = async (path: string, line: number | null): Promise<PeekBlock | null> => {
  const text = await readText(path)
  const at = line ?? 1
  return text === null ? null : { path, line: at, snippet: snippetAt(text, at, PEEK_LINES) }
}
const definitionBlock = async (name: string, from: string, doc: string): Promise<PeekBlock | null> => {
  const imported = listImports(doc).find((i) => i.defaultName === name || i.namespace === name || i.named.some((n) => n.local === name))
  if (imported) {
    const target = resolveImport(from, imported.spec, files.value)
    const text = target ? await readText(target) : null
    if (!target || text === null) return null
    const original = imported.named.find((n) => n.local === name)?.imported
    const line = (original ? definitionLine(text, original) : defaultExportLine(text)) ?? 1
    return { path: target, line, snippet: snippetAt(text, line, PEEK_LINES) }
  }
  const local = definitionLine(doc, name)
  if (local) return { path: from, line: local, snippet: snippetAt(doc, local, PEEK_LINES) }
  return repoDefinition(name)
}
const repoDefinition = async (name: string): Promise<PeekBlock | null> => {
  if (branch.value?.isReadOnly) return null
  const cached = peekCache.get(name)
  if (cached !== undefined) return cached
  const hits = await window.api.searchCode(workCwd.value ?? props.cwd ?? '', name, '', true)
  const found = groupHits(hits, name, files.value).definitions[0]
  const block = found ? await blockFrom(found.path, found.line) : null
  peekCache.set(name, block)
  return block
}
const memberBlocks = async (name: string, from: string, doc: string): Promise<PeekBlock[]> => {
  const sites = memberSites(doc, name)
  const declared = sites.declarations.slice(0, 2).map((line) => ({ path: from, line, snippet: snippetAt(doc, line, PEEK_LINES) }))
  const lines = doc.split('\n')
  const assigned = sites.assignments.slice(0, 3).map((line) => ({ path: from, line, snippet: lines[line - 1].trim() }))
  const built = sites.constructedFrom ? await definitionBlock(sites.constructedFrom, from, doc) : null
  const found = [...declared, ...assigned, ...(built ? [built] : [])]
  if (found.length) return found
  const elsewhere = await repoDefinition(name)
  return elsewhere ? [elsewhere] : []
}
const peekDom = (blocks: PeekBlock[]): HTMLElement => {
  const dom = document.createElement('div')
  dom.className = 'cp-peek'
  for (const block of blocks) {
    const head = document.createElement('button')
    head.className = 'cp-peek-head'
    head.textContent = `${block.path}:${block.line}`
    head.title = 'Go to definition'
    const goToBlock = (): void => void openStepChange(block.path, block.line)
    head.addEventListener('click', goToBlock)
    const pre = document.createElement('pre')
    pre.textContent = block.snippet
    dom.append(head, pre)
  }
  return dom
}
const peekSource = async (view: EditorView, pos: number): Promise<Tooltip | null> => {
  const doc = view.state.doc.toString()
  const target = peekTarget(doc, pos)
  const from = openPath.value
  if (!target || !from) return null
  const blocks = target.isMember ? await memberBlocks(target.name, from, doc) : [await definitionBlock(target.name, from, doc)].flatMap((b) => (b ? [b] : []))
  const hoveredLine = view.state.doc.lineAt(pos).number
  const shown = blocks.filter((b) => !(b.path === from && b.line === hoveredLine))
  if (!shown.length) return null
  const createPeek = (): { dom: HTMLElement } => ({ dom: peekDom(shown) })
  return { pos: target.from, end: target.to, above: true, create: createPeek }
}

let followedName: string | null = null
const followImportPath = async (from: string, imported: NonNullable<ReturnType<typeof importAt>>): Promise<void> => {
  const target = resolveImport(from, imported.spec, files.value)
  if (!target) {
    error.value = `${imported.spec} is not a file in this repository`
    return
  }
  const named = imported.named.find((n) => n.imported === followedName) ?? (imported.defaultName ? null : imported.named[0])
  if (openPath.value !== target) await open(target)
  if (openPath.value !== target) return
  const text = editor.value?.state.doc.toString() ?? ''
  goToLine((named ? definitionLine(text, named.imported) : defaultExportLine(text)) ?? 1)
}
const followAt = async (view: EditorView, pos: number): Promise<void> => {
  const doc = view.state.doc.toString()
  const imported = importAt(doc, pos)
  if (imported && openPath.value) return followImportPath(openPath.value, imported)
  const word = wordAt(doc, pos)
  if (!word) return
  const importLine = importLineOf(doc, word)
  followedName = importLine ? (listImports(doc).flatMap((i) => i.named).find((n) => n.local === word)?.imported ?? null) : null
  const line = importLine ?? definitionLine(doc, word)
  if (line) goToLine(line)
}
const onCtrlClick = (e: MouseEvent, view: EditorView): boolean => {
  if (!(e.ctrlKey || e.metaKey) || e.button !== 0) return false
  const pos = view.posAtCoords({ x: e.clientX, y: e.clientY })
  if (pos === null) return false
  e.preventDefault()
  void followAt(view, pos)
  return true
}

const openStepChange = async (file: string, line: number): Promise<void> => {
  if (openPath.value !== file) await open(file)
  goToLine(line)
}
const docText = ref<string | null>(null)
const openMd = async (): Promise<void> => {
  docText.value = (await window.api.readExplainMd(props.ticketKey)) ?? 'The explanation file was not found.'
}
const openMdInVscode = (): void => window.api.openExplainMd(props.ticketKey)

const toggleFolder = (node: TreeNode): void => {
  const next = new Set(expanded.value)
  if (next.has(node.path)) next.delete(node.path)
  else next.add(node.path)
  expanded.value = next
}
const flatTree = computed(() => {
  const rows: { node: TreeNode; depth: number }[] = []
  const walk = (nodes: TreeNode[], depth: number): void => {
    for (const node of nodes) {
      rows.push({ node, depth })
      if (node.children && expanded.value.has(node.path)) walk(node.children, depth + 1)
    }
  }
  walk(tree.value, 0)
  return rows
})

const refreshAll = (): void => {
  void refresh()
  if (!isExplaining.value) void loadExplain()
  if (!isReviewing.value) void loadParts()
}

onMounted(refreshAll)
watch(
  () => [props.cwd, props.branchRef?.source, props.pushedMr?.source],
  () => refreshAll()
)
onActivated(refreshAll)
onBeforeUnmount(() => {
  pollTimers.forEach(clearTimeout)
  destroyEditors()
})
</script>

<template>
  <div class="cv">
    <aside v-if="isSideCollapsed" class="mini">
      <button title="Show the navigator" @click="toggleSide"><Icon name="panelLeft" :size="16" /></button>
      <button :class="{ on: view === 'changes' }" :title="`Changed files (${changes.length})`" @click="showView('changes')">
        <Icon name="diff" :size="16" /><span v-if="changes.length" class="mbadge">{{ changes.length }}</span>
      </button>
      <button :class="{ on: view === 'files' }" title="All files" @click="showView('files')"><Icon name="folder" :size="16" /></button>
      <button :class="{ on: view === 'flow' }" :disabled="!flow.length" title="Flow" @click="showView('flow')"><Icon name="flow" :size="16" /></button>
      <button :class="{ on: view === 'parts' }" :disabled="!partsDoc" title="Review in parts" @click="showView('parts')"><Icon name="clipboard" :size="16" /></button>
      <button :class="{ on: view === 'search' }" title="Search the code" @click="showView('search')"><Icon name="search" :size="16" /></button>
      <button title="Refresh" @click="refresh"><Icon name="refresh" :size="16" /></button>
    </aside>
    <aside v-else class="side" :style="{ width: `${sideWidth}px` }">
      <div class="seg">
        <button :class="{ on: view === 'changes' }" title="Changed files" @click="view = 'changes'"><Icon name="diff" :size="14" /><span class="lbl">Changes</span><span class="n">{{ changes.length }}</span></button>
        <button :class="{ on: view === 'files' }" title="All files" @click="view = 'files'"><Icon name="folder" :size="14" /><span class="lbl">Files</span></button>
        <button :class="{ on: view === 'flow' }" :disabled="!flow.length" title="The process this ticket changes, step by step" @click="view = 'flow'"><Icon name="flow" :size="14" /><span class="lbl">Flow</span></button>
        <button :class="{ on: view === 'parts' }" :disabled="!partsDoc" title="Walk the diff part by part" @click="view = 'parts'"><Icon name="clipboard" :size="14" /><span class="lbl">Parts</span></button>
        <button :class="{ on: view === 'search' }" title="Search the code in the whole repository" @click="view = 'search'"><Icon name="search" :size="14" /><span class="lbl">Search</span></button>
        <button class="refresh push" title="Refresh" @click="refresh"><Icon name="refresh" :size="14" /></button>
        <button class="refresh" title="Collapse to icons" @click="toggleSide"><Icon name="panelClose" :size="14" /></button>
      </div>
      <p v-if="!cwd" class="muted">No working folder yet. Start a session for a ticket, or a review for a merge request, to see its code here.</p>
      <div v-else-if="view === 'flow'" class="flow">
        <div class="flowtop">
          <b>{{ explain?.doc.process || 'Flow' }}</b>
          <button v-if="explain" class="mdlink inline" @click="openMd"><Icon name="fileText" :size="12" />Read explanation</button>
        </div>
        <ol>
          <li v-for="f in flow" :key="f.step" :class="{ changed: f.isChanged }">
            <div class="num">{{ f.step }}</div>
            <div class="card">
              <div class="ftitle">{{ f.title }}<span v-if="f.ms !== null" class="ms">{{ f.ms }} ms</span></div>
              <template v-if="f.isChanged">
                <div class="before"><span>Before</span>{{ f.before }}</div>
                <div class="after"><span>After</span>{{ f.after }}</div>
              </template>
              <div v-else class="same">{{ f.after || f.before }}</div>
              <button
                v-for="c in changesOfStep(f.step)"
                :key="`${c.file}:${c.line}`"
                class="fchange"
                :class="{ on: openPath === c.file }"
                :title="c.file"
                @click="openStepChange(c.file, c.line)"
              >
                <code>{{ c.file.split('/').pop() }}:{{ c.line }}</code>
                <span>{{ c.title }}</span>
              </button>
            </div>
          </li>
        </ol>
      </div>
      <ReviewParts
        v-else-if="view === 'parts' && partsDoc"
        :key="partsDoc.updatedAt"
        :doc="partsDoc"
        :progress="partsProgress"
        :is-stale="!!partsStaleReason"
        :stale-reason="partsStaleReason"
        :is-mr-of-other="isMrOfOther"
        :current="activePart"
        :is-sending="isSendingRemarks"
        @select="selectPart"
        @update="updateProgress"
        @send="sendRemarks"
        @rerun="rerunReviewParts"
      />
      <template v-else-if="view === 'changes'">
        <div v-if="branch" class="branch" :class="{ warn: isOtherBranch }">
          <Icon name="branch" :size="13" /><code>{{ branch.branch }}</code><span class="vs">vs</span><code>{{ branch.target }}</code>
          <span v-if="isOtherBranch">This folder is on another ticket's branch, so these are not {{ ticketKey }}'s changes.</span>
          <span v-if="pushedRef" class="ro">Read-only: the MR as pushed to GitLab, with its comments.</span>
          <span v-else-if="branch.isReadOnly" class="ro">Read-only, straight from origin: no local folder has this branch checked out.</span>
          <span v-else-if="folderName" class="ro">Showing the worktree {{ folderName }}, which has this branch checked out, with its uncommitted changes.</span>
          <button v-if="branch.uncommitted?.length" class="unctoggle" :class="{ on: isUncommittedOnly }" title="Only files changed locally and not committed yet; the diff is against the last commit" @click="toggleUncommitted">
            <i />{{ isUncommittedOnly ? 'Showing uncommitted only' : 'Uncommitted' }}<span>{{ branch.uncommitted.length }}</span>
          </button>
        </div>
        <button v-if="isChangesHidden" class="mdlink" @click="showOtherBranch"><Icon name="code" :size="12" />Show this branch's changes anyway</button>
        <template v-else>
        <button
          class="explain"
          :disabled="isExplaining || !changes.length"
          title="Starts a separate Claude session that runs /explain-changes with access to the code, the spec, the plan and this ticket's session. You can talk to it afterwards."
          @click="runExplain"
        >
          <span v-if="isExplaining" class="spin" />
          <Icon v-else name="sparkles" :size="14" />
          {{ isExplaining ? 'The explain session is writing…' : explain ? `Explained ${explainedCount} changes · run again` : 'Explain changes' }}
        </button>
        <button v-if="explain" class="mdlink" @click="openMd"><Icon name="fileText" :size="12" />Read the explanation</button>
        <button
          class="explain"
          :disabled="isReviewing || !changes.length"
          title="Starts a background Claude session that runs /review-in-parts and splits this diff into small parts you walk through one by one."
          @click="rerunReviewParts"
        >
          <span v-if="isReviewing" class="spin" />
          <Icon v-else name="clipboard" :size="14" />
          {{ isReviewing ? 'The review session is splitting the diff…' : partsDoc ? `${partsDoc.parts.length} review parts · run again` : 'Review in parts' }}
        </button>
        <button v-if="partsDoc" class="mdlink" @click="view = 'parts'"><Icon name="clipboard" :size="12" />Walk the parts</button>
        <p v-if="!changes.length" class="muted">{{ isUncommittedOnly ? 'Nothing uncommitted.' : 'No code changes on this branch yet.' }}</p>
        <div v-else class="totals">
          <span>{{ changes.length }} {{ changes.length === 1 ? 'file' : 'files' }}</span>
          <b class="plus">+{{ totals.added }}</b><b class="minus">−{{ totals.removed }}</b>
          <span class="viewedn" :class="{ done: viewedCount === changes.length }">Viewed {{ viewedCount }}/{{ changes.length }}</span>
        </div>
        <div
          v-for="c in changes"
          :key="c.path"
          class="row"
          role="button"
          tabindex="0"
          :class="{ on: openPath === c.path, viewed: isViewed(c) }"
          :title="c.path"
          @click="open(c.path)"
          @keydown.enter.self="open(c.path)"
        >
          <input type="checkbox" class="viewbox" :checked="isViewed(c)" title="Mark as viewed" :aria-label="`Mark ${c.path} as viewed`" @click.stop="flipViewed(c)" />
          <span class="name">{{ c.path.split('/').pop() }}</span>
          <span class="dir">{{ c.path.split('/').slice(0, -1).join('/') }}</span>
          <i v-if="isUncommitted(c.path)" class="uncdot" title="Changed locally, not committed yet" />
          <em v-if="commentCount(c.path)" class="cmtn" title="Unresolved comments"><Icon name="message" :size="11" />{{ commentCount(c.path) }}</em>
          <em v-if="whyCount(c.path)" class="whyn" title="Explained changes"><Icon name="info" :size="11" />{{ whyCount(c.path) }}</em>
          <span class="stat" :title="`${countsOf(c).added ?? '?'} lines added, ${countsOf(c).removed ?? '?'} removed`">
            <template v-if="countsOf(c).added === null && countsOf(c).removed === null">bin</template>
            <template v-else><i v-if="countsOf(c).added" class="plus">+{{ countsOf(c).added }}</i><i v-if="countsOf(c).removed" class="minus">−{{ countsOf(c).removed }}</i></template>
            <span class="bar"><span v-for="(cell, i) in cellsOf(c)" :key="i" :class="cell" /></span>
          </span>
          <b :style="{ color: STATE_MARK[c.state].color }">{{ STATE_MARK[c.state].mark }}</b>
        </div>
        </template>
      </template>
      <template v-else-if="view === 'search'">
        <label class="filter"><Icon name="search" :size="13" /><input v-model="searchQuery" placeholder="Search the code" spellcheck="false" @input="scheduleSearch" @keydown.enter="runSearch" /></label>
        <div class="scope">
          <span>Where</span>
          <input v-model.lazy="searchScope" placeholder="whole repository" spellcheck="false" title="A folder or a git pathspec, e.g. src/javascript/app, *.vue, **/store/**" />
          <button :class="{ on: searchScope === 'src' }" @click="setScope('src')">src</button>
          <button :class="{ on: searchScope === 'components' }" @click="setScope('components')">components</button>
          <button :class="{ on: !!openFolder && searchScope === openFolder }" :disabled="!openFolder" :title="openFolder ?? 'Open a file first'" @click="setScope(openFolder ?? '')">this folder</button>
          <button v-if="searchScope" title="Search the whole repository" @click="setScope('')">×</button>
        </div>
        <p v-if="isSearching" class="muted">Searching…</p>
        <p v-else-if="searchedFor && !searchResults.length" class="muted">No matches for “{{ searchedFor }}”.</p>
        <p v-else-if="searchResults.length && !grouped" class="muted">{{ searchResults.length >= 300 ? 'First 300 matches' : `${searchResults.length} matches` }}</p>
        <template v-if="grouped && searchResults.length">
          <div class="hithead">Definitions ({{ grouped.definitions.length }})</div>
          <p v-if="!grouped.definitions.length" class="muted">No definition found.</p>
          <button
            v-for="m in grouped.definitions"
            :key="`d:${m.path}:${m.line}`"
            class="row hit"
            :class="{ on: openPath === m.path }"
            :title="`${m.path}:${m.line}`"
            @click="openStepChange(m.path, m.line)"
          >
            <span class="hitpath"><span class="name">{{ m.path.split('/').pop() }}:{{ m.line }}</span><span class="dir">{{ m.path.split('/').slice(0, -1).join('/') }}</span></span>
            <code class="hittext">{{ m.text || m.path }}</code>
          </button>
          <button class="hithead toggle" @click="isImportsOpen = !isImportsOpen"><Icon :name="isImportsOpen ? 'chevronDown' : 'chevronRight'" :size="12" />Imports ({{ grouped.imports.length }})</button>
          <template v-if="isImportsOpen">
            <button
              v-for="m in grouped.imports"
              :key="`i:${m.path}:${m.line}`"
              class="row hit"
              :class="{ on: openPath === m.path }"
              :title="`${m.path}:${m.line}`"
              @click="openStepChange(m.path, m.line)"
            >
              <span class="hitpath"><span class="name">{{ m.path.split('/').pop() }}:{{ m.line }}</span><span class="dir">{{ m.path.split('/').slice(0, -1).join('/') }}</span></span>
              <code class="hittext">{{ m.text }}</code>
            </button>
          </template>
          <button class="hithead toggle" @click="isUsagesOpen = !isUsagesOpen"><Icon :name="isUsagesOpen ? 'chevronDown' : 'chevronRight'" :size="12" />Usages ({{ grouped.usages.length }})</button>
          <template v-if="isUsagesOpen">
            <button
              v-for="m in grouped.usages"
              :key="`u:${m.path}:${m.line}`"
              class="row hit"
              :class="{ on: openPath === m.path }"
              :title="`${m.path}:${m.line}`"
              @click="openStepChange(m.path, m.line)"
            >
              <span class="hitpath"><span class="name">{{ m.path.split('/').pop() }}:{{ m.line }}</span><span class="dir">{{ m.path.split('/').slice(0, -1).join('/') }}</span></span>
              <code class="hittext">{{ m.text }}</code>
            </button>
          </template>
          <p v-if="searchResults.length >= 300" class="muted">Only the first 300 matches were read. Narrow the search with “Where”.</p>
        </template>
        <template v-else>
          <button
            v-for="m in searchResults"
            :key="`${m.path}:${m.line}`"
            class="row hit"
            :class="{ on: openPath === m.path }"
            :title="`${m.path}:${m.line}`"
            @click="openStepChange(m.path, m.line)"
          >
            <span class="hitpath"><span class="name">{{ m.path.split('/').pop() }}:{{ m.line }}</span><span class="dir">{{ m.path.split('/').slice(0, -1).join('/') }}</span></span>
            <code class="hittext">{{ m.text }}</code>
          </button>
        </template>
      </template>
      <template v-else>
        <label class="filter"><Icon name="search" :size="13" /><input v-model="filter" placeholder="Find a file" spellcheck="false" /></label>
        <template v-if="filter.trim()">
          <button v-for="f in filtered" :key="f" class="row" :class="{ on: openPath === f }" :title="f" @click="open(f)">
            <span class="name">{{ f.split('/').pop() }}</span>
            <span class="dir">{{ f.split('/').slice(0, -1).join('/') }}</span>
          </button>
        </template>
        <template v-else>
          <button
            v-for="{ node, depth } in flatTree"
            :key="node.path"
            class="row tree"
            :class="{ on: openPath === node.path }"
            :style="{ paddingLeft: `${8 + depth * 12}px` }"
            @click="node.children ? toggleFolder(node) : open(node.path)"
          >
            <span class="twisty"><Icon v-if="node.children" :name="expanded.has(node.path) ? 'chevronDown' : 'chevronRight'" :size="12" /></span>
            <Icon :name="node.children ? 'folder' : 'file'" :size="13" class="ficon" :class="{ folder: node.children }" />
            <span class="name">{{ node.name }}</span>
            <b v-if="!node.children && stateOf(node.path)" :style="{ color: STATE_MARK[stateOf(node.path)!].color }">
              {{ STATE_MARK[stateOf(node.path)!].mark }}
            </b>
          </button>
        </template>
      </template>
    </aside>
    <Splitter v-if="!isSideCollapsed" @resize="resizeSide" @done="saveSide" />

    <section class="main">
      <div v-if="openPath" class="tabbar">
        <span class="path"><Icon name="file" :size="13" /><span class="pdir">{{ openPath.split('/').slice(0, -1).join('/') }}{{ openPath.includes('/') ? '/' : '' }}</span><b>{{ openPath.split('/').pop() }}</b><i v-if="isDirty" class="dirty" title="Unsaved changes" /><span v-if="openCounts && (openCounts.added || openCounts.removed)" class="fstat"><i class="plus">+{{ openCounts.added ?? 0 }}</i><i class="minus">−{{ openCounts.removed ?? 0 }}</i></span></span>
        <span class="grow" />
        <span v-if="error" class="warn">{{ error }}</span>
        <span v-else-if="mrReview && mrCommentable && !mrCommentable.isAllowed" class="nocmt" :title="`Commenting is off: ${mrCommentable.reason ?? ''}`"><Icon name="message" :size="14" /><i class="off" /></span>
        <span v-else-if="mrReview && mrCommentable?.isAllowed" class="nocmt on" title="Hover the narrow column left of the code and click + to comment on a line"><Icon name="message" :size="14" /><i /></span>
        <span v-if="changeCount" class="cnav" title="Jump between the changes in this file">
          <button class="tb icon" title="Previous change" @click="stepChange(-1)"><Icon name="chevronRight" :size="14" class="flip" /></button>
          <span class="cpos">Change {{ changeIndex >= 0 ? changeIndex + 1 : '–' }}/{{ changeCount }}</span>
          <button class="tb icon" title="Next change" @click="stepChange(1)"><Icon name="chevronRight" :size="14" /></button>
        </span>
        <span v-if="activeComments.length" class="cnav" title="Jump between unresolved comments and your pending drafts">
          <button class="tb icon" title="Previous comment" @click="stepComment(-1)"><Icon name="chevronRight" :size="14" class="flip" /></button>
          <span class="cpos">{{ commentIndex >= 0 ? commentIndex + 1 : '–' }}/{{ activeComments.length }}</span>
          <button class="tb icon" title="Next comment" @click="stepComment(1)"><Icon name="chevronRight" :size="14" /></button>
        </span>
        <MenuButton :label="diffLabel" icon="diff" title="What to highlight in the file" :items="diffItems" />
        <button class="tb" :class="{ on: layout === 'split' }" title="Old and new side by side" @click="setLayout('split')"><Icon name="panelLeft" :size="14" /><span class="lbl">Split</span></button>
        <button class="tb" :class="{ on: layout === 'unified' }" title="Old and new in one column" @click="setLayout('unified')"><Icon name="fileText" :size="14" /><span class="lbl">Unified</span></button>
        <button v-if="!branch?.isReadOnly" class="tb primary" :disabled="!isDirty || isSaving" title="Save (Ctrl+S)" @click="save"><Icon name="save" :size="14" /><span class="lbl">{{ isSaving ? 'Saving…' : 'Save' }}</span></button>
      </div>
      <div v-if="tabs.length" class="filetabs">
        <button
          v-for="t in tabs"
          :key="t.path"
          class="filetab"
          :class="{ on: t.path === openPath }"
          :title="t.path"
          @click="t.path !== openPath && open(t.path)"
          @auxclick="onTabAuxClick($event, t.path)"
        >
          {{ tabName(t.path) }}<span class="x" title="Close" @click.stop="closeFileTab(t.path)">×</span>
        </button>
      </div>
      <div v-if="openPath && fileWhys.length" class="whys" :style="isWhyOpen ? { maxHeight: `${whyHeight}px` } : undefined">
        <button class="whyhead" @click="isWhyOpen = !isWhyOpen">
          <Icon name="info" :size="14" class="whyicon" />Why these changes<span class="n">{{ fileWhys.length }}</span>
          <Icon :name="isWhyOpen ? 'chevronDown' : 'chevronRight'" :size="14" class="chev" />
        </button>
        <ul v-if="isWhyOpen">
          <li v-for="w in fileWhys" :key="w.id" @click="goToLine(w.line)">
            <code>L{{ w.line }}</code>
            <span>{{ w.text }}</span>
          </li>
        </ul>
      </div>
      <div v-else-if="openPath && explain" class="whys empty-why">No explanation for this file.</div>
      <Splitter v-if="openPath && fileWhys.length && isWhyOpen" is-vertical @resize="resizeWhy" @done="saveWhy" />
      <div v-show="openPath" ref="host" class="editor" />
      <div v-if="docText !== null" class="docpane">
        <div class="tabbar">
          <span class="path"><Icon name="fileText" :size="13" /><b>wyjasnienie-zmian.md</b></span>
          <span class="grow" />
          <button class="tb" title="Open the file in VS Code" @click="openMdInVscode"><Icon name="external" :size="14" />VS Code</button>
          <button class="tb" @click="docText = null"><Icon name="code" :size="14" />Back to code</button>
        </div>
        <div class="docscroll"><DocView :text="docText" /></div>
      </div>
      <div v-if="!openPath" class="empty">
        <Icon name="code" :size="34" />
        <p>Pick a changed file on the left.</p>
        <p class="muted">"Explain changes" starts a separate explain session (you can talk to it): an ⓘ appears next to every change and the Flow view shows the process step by step. Ctrl+S saves.</p>
      </div>
    </section>

    <div v-if="why" class="whypop" :style="{ top: `${why.top}px`, left: `${why.left}px` }">{{ why.text }}</div>
    <div v-if="note" class="whypop notepop" :style="{ top: `${note.top}px`, left: `${note.left}px` }" @mouseenter="keepNote" @mouseleave="closeNoteSoon">
      <span>{{ note.text }}</span>
      <button class="tb" @click="askAboutNote"><Icon name="message" :size="13" /><span class="lbl">Zapytaj w czacie</span></button>
    </div>
  </div>
</template>

<style scoped>
.cv {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  background: var(--bg-editor);
}
.side {
  flex: none;
  overflow-y: auto;
  padding: 8px 8px 16px;
  background: var(--bg-1);
  border-right: 1px solid var(--line);
}
.seg {
  position: sticky;
  top: -8px;
  z-index: 2;
  display: flex;
  gap: 2px;
  margin: -8px -8px 10px;
  padding: 8px;
  background: var(--bg-1);
  border-bottom: 1px solid var(--line);
}
.seg button {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 0;
  height: 28px;
  padding: 0 6px;
  font: 500 12.5px var(--font-ui);
  color: var(--text-4);
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.seg button:hover:not(:disabled) {
  color: var(--text-2);
  background: var(--bg-2);
}
.seg button.on {
  color: var(--text);
  background: var(--bg-3);
}
.seg .n {
  padding: 0 6px;
  font-size: 11px;
  line-height: 16px;
  color: var(--text-3);
  background: var(--bg-4);
  border-radius: 8px;
}
.seg .refresh {
  flex: none;
  width: 28px;
  padding: 0;
}
.side {
  container-type: inline-size;
}
.seg .push {
  margin-left: auto;
}
@container (max-width: 420px) {
  .seg .lbl {
    display: none;
  }
  .seg button {
    flex: none;
    padding: 0 7px;
  }
}
.row.hit {
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
  height: auto;
  padding-top: 4px;
  padding-bottom: 4px;
}
.scope {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-bottom: 8px;
  font-size: 11.5px;
  color: var(--text-4);
}
.scope input {
  flex: 1 1 120px;
  min-width: 0;
  height: 24px;
  padding: 0 7px;
  font: 12px var(--font-ui);
  color: var(--text);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 6px;
  outline: none;
}
.scope input:focus {
  border-color: var(--accent);
}
.scope button {
  height: 24px;
  padding: 0 8px;
  font: 11.5px var(--font-ui);
  color: var(--text-3);
  background: none;
  border: 1px solid var(--line-2);
  border-radius: 6px;
  cursor: pointer;
}
.scope button.on {
  color: var(--text);
  background: var(--bg-3);
  border-color: var(--accent);
}
.scope button:disabled {
  opacity: 0.4;
  cursor: default;
}
.hithead {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 8px 0 2px;
  padding: 0 8px;
  font: 600 11px var(--font-ui);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-4);
  background: none;
  border: none;
}
.hithead.toggle {
  width: 100%;
  cursor: pointer;
}
.hithead.toggle:hover {
  color: var(--text-2);
}
.hitpath {
  display: flex;
  gap: 7px;
  min-width: 0;
}
.hittext {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11.5px;
  color: var(--text-3);
}
@container (max-width: 240px) {
  .seg .n {
    display: none;
  }
}
.seg button:disabled {
  opacity: 0.35;
  cursor: default;
}
.branch {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0 4px 10px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-4);
}
.branch code {
  font: 12px var(--font-mono);
  color: var(--text-2);
}
.branch .ro {
  flex-basis: 100%;
  padding: 5px 8px;
  font-size: 11.5px;
  color: var(--info);
  background: var(--info-soft);
  border-radius: 6px;
}
.branch .vs {
  color: var(--text-5);
}
.branch.warn > span:last-child {
  flex-basis: 100%;
  padding: 6px 8px;
  color: var(--warn);
  background: var(--warn-soft);
  border-radius: 6px;
}
.explain {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 32px;
  margin-bottom: 6px;
  font: 500 12.5px var(--font-ui);
  color: var(--info);
  background: var(--info-soft);
  border: 1px solid rgba(106, 169, 255, 0.25);
  border-radius: 7px;
  cursor: pointer;
}
.explain:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--info);
}
.explain:disabled {
  opacity: 0.6;
  cursor: default;
}
.spin {
  width: 11px;
  height: 11px;
  border: 2px solid rgba(106, 169, 255, 0.25);
  border-top-color: var(--info);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.filter {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 30px;
  margin-bottom: 6px;
  padding: 0 9px;
  color: var(--text-4);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 7px;
}
.filter:focus-within {
  border-color: var(--accent);
}
.filter input {
  flex: 1;
  min-width: 0;
  padding: 0;
  font: 12.5px var(--font-ui);
  color: var(--text);
  background: none;
  border: none;
  outline: none;
}
.row {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  height: 28px;
  padding: 0 8px;
  font: 12.5px var(--font-ui);
  color: var(--text-2);
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
}
.row:hover {
  background: var(--bg-2);
}
.row.on {
  color: var(--text);
  background: var(--bg-3);
  box-shadow: inset 2px 0 0 var(--accent);
}
.row.viewed .name,
.row.viewed .dir {
  opacity: 0.45;
}
.viewbox {
  flex: none;
  width: 13px;
  height: 13px;
  margin: 0;
  accent-color: var(--accent);
  cursor: pointer;
}
.plus {
  font-style: normal;
  font-weight: 600;
  color: #3ee07f;
}
.minus {
  font-style: normal;
  font-weight: 600;
  color: #ff7b72;
}
.totals {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 2px 0 6px;
  padding: 0 8px;
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.viewedn {
  margin-left: auto;
}
.viewedn.done {
  color: #3ee07f;
}
.stat {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  color: var(--text-4);
}
.bar {
  display: inline-flex;
  gap: 1px;
}
.bar span {
  width: 6px;
  height: 8px;
  border-radius: 1px;
  background: var(--bg-4);
}
.bar span.a {
  background: #3ee07f;
}
.bar span.r {
  background: #ff7b72;
}
.fstat {
  display: inline-flex;
  gap: 6px;
  margin-left: 10px;
  font-family: var(--font-ui);
  font-size: 12px;
}
.ficon {
  color: var(--text-4);
}
.ficon.folder {
  color: var(--text-3);
}
.name {
  white-space: nowrap;
}
.dir {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11.5px;
  color: var(--text-4);
}
.row b {
  margin-left: auto;
  font: 600 11px var(--font-mono);
}
.twisty {
  display: grid;
  place-items: center;
  width: 12px;
  color: var(--text-4);
}
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-editor);
}
.main {
  position: relative;
}
.docpane {
  position: absolute;
  inset: 0;
  z-index: 400;
  display: flex;
  flex-direction: column;
  background: var(--bg-1);
}
.docscroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.tabbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 40px;
  padding: 0 8px 0 14px;
  box-sizing: border-box;
  background: var(--bg-1);
  border-bottom: 1px solid var(--line);
}
.path {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  font: 12.5px var(--font-mono);
  color: var(--text-4);
}
.pdir {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.path b {
  flex: none;
  margin-left: -7px;
  font-weight: 600;
  color: var(--text);
}
.dirty {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--warn);
}
.grow {
  flex: 1;
}
.tb {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  font: 500 12.5px var(--font-ui);
  color: var(--text-2);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 7px;
  cursor: pointer;
}
.tb:hover:not(:disabled) {
  color: var(--text);
  background: var(--bg-4);
  border-color: var(--line-3);
}
.tb.on {
  color: var(--accent);
  background: var(--accent-soft);
  border-color: rgba(61, 214, 140, 0.35);
}
.tb.primary {
  font-weight: 600;
  color: var(--on-accent);
  background: var(--accent);
  border-color: var(--accent);
}
.tb.primary:hover:not(:disabled) {
  color: var(--on-accent);
  background: var(--accent-hover);
}
.tb:disabled {
  opacity: 0.4;
  cursor: default;
}
.whyn {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0 6px;
  font: 600 11px var(--font-ui);
  font-style: normal;
  line-height: 17px;
  color: var(--info);
  background: var(--info-soft);
  border-radius: 9px;
}
.unctoggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 9px;
  font: 600 11.5px var(--font-ui);
  color: var(--warn);
  background: none;
  border: 1px solid rgba(232, 184, 74, 0.45);
  border-radius: 12px;
  cursor: pointer;
}
.unctoggle i,
.uncdot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--warn);
}
.unctoggle span {
  color: var(--text-3);
}
.unctoggle.on {
  color: var(--bg-0);
  background: var(--warn);
}
.unctoggle.on i {
  background: var(--bg-0);
}
.unctoggle.on span {
  color: var(--bg-0);
}
.cmtn {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0 6px;
  font: 600 11px var(--font-ui);
  font-style: normal;
  line-height: 17px;
  color: var(--warn);
  background: var(--warn-soft);
  border-radius: 9px;
}
.editor :deep(.cm-comment-gutter) {
  width: 20px;
}
.editor :deep(.cmt-dot) {
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  margin-top: 1px;
  color: var(--warn);
  border-radius: 4px;
  cursor: pointer;
}
.editor :deep(.cmt-dot:hover) {
  background: var(--warn-soft);
}
.editor :deep(.cmt-dot.done) {
  color: var(--text-4);
}
.editor :deep(.cmt-box) {
  position: relative;
  margin: 4px 12px 6px 8px;
  padding: 8px 12px;
  font: 13px/1.5 var(--font-ui);
  color: var(--text);
  white-space: pre-wrap;
  background: var(--bg-2);
  border: 1px solid var(--line-2);
  border-left: 3px solid var(--warn);
  border-radius: 7px;
}
.editor :deep(.cmt-box.done) {
  border-left-color: var(--line-3);
}
.editor :deep(.cmt-note + .cmt-note) {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--line);
}
.editor :deep(.cmt-note b) {
  display: block;
  font-size: 12px;
  color: var(--text-3);
}
.editor :deep(.cmt-box) {
  white-space: normal;
}
.editor :deep(.cmt-body p) {
  margin: 2px 0 6px;
}
.editor :deep(.cmt-body a) {
  color: var(--info);
  text-decoration: none;
}
.editor :deep(.cmt-body a:hover) {
  text-decoration: underline;
}
.editor :deep(.cmt-body code) {
  padding: 1px 4px;
  font: 12px var(--font-mono);
  background: var(--bg-3);
  border-radius: 4px;
}
.editor :deep(.cmt-body pre) {
  overflow-x: auto;
  padding: 6px 8px;
  background: var(--bg-editor);
  border-radius: 6px;
}
.nocmt {
  position: relative;
  flex: none;
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  color: var(--text-4);
  cursor: help;
}
.nocmt i {
  position: absolute;
  right: 2px;
  bottom: 3px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
}
.nocmt i.off {
  background: var(--text-5);
}
.nocmt.on {
  color: var(--accent);
}
.cnav {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.cpos {
  min-width: 30px;
  font: 500 12px var(--font-ui);
  text-align: center;
  color: var(--text-3);
}
.tb.icon {
  width: 26px;
  padding: 0;
  justify-content: center;
}
.flip {
  transform: rotate(180deg);
}
.tabbar {
  container-type: inline-size;
}
@container (max-width: 620px) {
  .tb .lbl {
    display: none;
  }
}
.editor :deep(.cmt-add) {
  display: inline-grid;
  place-items: center;
  width: 16px;
  height: 16px;
  margin-top: 2px;
  font: 600 13px/1 var(--font-ui);
  color: #fff;
  background: var(--accent);
  border-radius: 4px;
  opacity: 0;
  cursor: pointer;
}
.editor :deep(.cm-comment-gutter .cm-gutterElement:hover .cmt-add) {
  opacity: 1;
}
.editor :deep(.cmt-box.pending) {
  border-left: 3px dashed var(--accent);
}
.editor :deep(.cmt-box.composer) {
  border-left-color: var(--accent);
}
.editor :deep(.cmt-pending) {
  display: inline-block;
  margin-bottom: 4px;
  padding: 0 6px;
  font-size: 11px;
  color: var(--accent);
  border: 1px dashed var(--accent);
  border-radius: 4px;
}
.editor :deep(.cmt-input) {
  box-sizing: border-box;
  width: 100%;
  padding: 7px 9px;
  font: 13px/1.5 var(--font-ui);
  color: var(--text);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 6px;
  outline: none;
  resize: vertical;
}
.editor :deep(.cmt-input:focus) {
  border-color: var(--accent);
}
.editor :deep(.cmt-actions) {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 6px;
}
.editor :deep(.cmt-btn) {
  height: 26px;
  padding: 0 10px;
  font: 500 12px var(--font-ui);
  color: var(--text-2);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 6px;
  cursor: pointer;
}
.editor :deep(.cmt-btn.primary) {
  color: #0d1a12;
  background: var(--accent);
  border-color: var(--accent);
}
.editor :deep(.cmt-link) {
  padding: 0;
  font: 12px var(--font-ui);
  color: var(--text-4);
  background: none;
  border: none;
  cursor: pointer;
}
.editor :deep(.cmt-link:hover) {
  color: var(--text);
}
.editor :deep(.cmt-link.danger:hover) {
  color: #f2706a;
}
.editor :deep(.cmt-close) {
  position: absolute;
  top: 6px;
  right: 8px;
  padding: 0 6px;
  font: 11.5px var(--font-ui);
  color: var(--text-4);
  background: none;
  border: none;
  cursor: pointer;
}
.whys {
  flex: none;
  display: flex;
  flex-direction: column;
  max-height: calc(100% - 120px);
  background: var(--bg-1);
  border-bottom: 1px solid var(--line);
}
.whys ul {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.mini {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 44px;
  padding: 8px 0;
  background: var(--bg-1);
  border-right: 1px solid var(--line);
}
.mini button {
  position: relative;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  color: var(--text-4);
  background: none;
  border: none;
  border-radius: 7px;
  cursor: pointer;
}
.mini button:first-child {
  margin-bottom: 6px;
}
.mini button:hover:not(:disabled) {
  color: var(--text);
  background: var(--bg-3);
}
.mini button.on {
  color: var(--text);
  background: var(--bg-3);
}
.mini button:disabled {
  opacity: 0.35;
  cursor: default;
}
.mbadge {
  position: absolute;
  right: -2px;
  bottom: 0;
  min-width: 15px;
  padding: 0 3px;
  box-sizing: border-box;
  font: 600 9.5px/14px var(--font-ui);
  color: var(--text-2);
  background: var(--bg-4);
  border: 1px solid var(--bg-1);
  border-radius: 8px;
}
.empty-why {
  padding: 8px 14px;
  font-size: 12px;
  color: var(--text-4);
}
.whyhead {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 34px;
  padding: 0 14px;
  font: 600 12.5px var(--font-ui);
  color: var(--text-2);
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
}
.whyhead:hover {
  color: var(--text);
}
.whyicon {
  color: var(--info);
}
.whyhead .n {
  padding: 0 6px;
  font-size: 11px;
  line-height: 16px;
  color: var(--info);
  background: var(--info-soft);
  border-radius: 8px;
}
.whyhead .chev {
  margin-left: auto;
  color: var(--text-4);
}
.whys ul {
  list-style: none;
  margin: 0;
  padding: 0 8px 8px;
}
.whys li {
  display: flex;
  gap: 12px;
  padding: 7px 8px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-2);
  border-radius: 6px;
  cursor: pointer;
}
.whys li:hover {
  color: var(--text);
  background: var(--bg-2);
}
.whys li code {
  flex: none;
  min-width: 40px;
  font: 12px/1.55 var(--font-mono);
  color: var(--info);
}
.mdlink {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  width: 100%;
  margin: 0 0 10px;
  padding: 3px 0;
  font: 12px var(--font-ui);
  color: var(--text-3);
  background: none;
  border: none;
  cursor: pointer;
}
.mdlink:hover {
  color: var(--info);
}
.flow {
  padding: 2px 2px 20px;
}
.flowtop {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 2px 4px 12px;
  font-size: 13px;
  color: var(--text);
}
.mdlink.inline {
  width: auto;
  margin: 0 0 0 auto;
}
.flow ol {
  list-style: none;
  margin: 0;
  padding: 0;
}
.flow li {
  position: relative;
  display: flex;
  gap: 10px;
  padding-bottom: 10px;
}
.flow li:not(:last-child)::before {
  content: '';
  position: absolute;
  left: 11px;
  top: 26px;
  bottom: 0;
  width: 2px;
  background: var(--line);
}
.num {
  flex: none;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  font: 600 11px var(--font-ui);
  color: var(--text-3);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 50%;
}
.changed .num {
  color: var(--on-accent);
  background: var(--ok);
  border-color: var(--ok);
}
.card {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 9px;
}
.changed .card {
  border-color: var(--ok-line);
}
.ftitle {
  display: flex;
  align-items: center;
  gap: 8px;
  font: 600 12.5px var(--font-ui);
  line-height: 1.35;
  color: var(--text);
}
.ms {
  margin-left: auto;
  font: 11px var(--font-mono);
  color: var(--warn);
}
.same {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-3);
}
.before,
.after {
  margin-top: 6px;
  padding: 6px 8px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-2);
  border-radius: 6px;
}
.before {
  background: rgba(242, 112, 106, 0.1);
  border-left: 3px solid var(--danger);
}
.after {
  background: rgba(61, 214, 140, 0.12);
  border-left: 3px solid var(--ok);
}
.before span,
.after span {
  display: block;
  font: 600 10px var(--font-ui);
  color: var(--text-3);
}
.fchange {
  display: flex;
  flex-direction: column;
  gap: 1px;
  width: 100%;
  margin-top: 6px;
  padding: 5px 6px;
  font: 12px var(--font-ui);
  color: var(--text-2);
  background: var(--bg-0);
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
}
.fchange:hover {
  border-color: var(--line-2);
}
.fchange.on {
  border-color: var(--info);
}
.fchange code {
  font: 11px var(--font-mono);
  color: var(--info);
}
.filetabs {
  flex: none;
  display: flex;
  gap: 2px;
  overflow-x: auto;
  padding: 4px 8px 0;
  background: var(--bg-1);
  border-bottom: 1px solid var(--line);
}
.filetab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px 4px 10px;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  background: none;
  color: var(--text-3);
  font: 12px var(--font-ui);
  white-space: nowrap;
  cursor: pointer;
}
.filetab.on {
  background: var(--bg-editor);
  border-color: var(--line);
  color: var(--text-1);
}
.filetab .x {
  padding: 0 3px;
  border-radius: 4px;
  opacity: 0.6;
}
.filetab .x:hover {
  opacity: 1;
  background: var(--bg-3, rgba(255, 255, 255, 0.08));
}
.editor {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.editor :deep(.cm-mergeView) {
  height: 100%;
  overflow: auto;
}
.editor :deep(.cm-mergeView .cm-editor) {
  height: auto;
}
.editor :deep(.why-dot) {
  display: inline-grid;
  place-items: center;
  width: 15px;
  height: 15px;
  margin-top: 3px;
  font: 700 10px var(--font-ui);
  color: var(--info);
  background: var(--info-soft);
  border: 1px solid rgba(106, 169, 255, 0.45);
  border-radius: 50%;
  box-sizing: border-box;
  cursor: help;
}
.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 24px;
  color: var(--text-5);
  text-align: center;
}
.empty p {
  max-width: 440px;
  margin: 6px 0 0;
  color: var(--text-2);
}
.empty p.muted {
  color: var(--text-4);
  line-height: 1.55;
}
.muted {
  margin: 6px 4px;
  font-size: 12px;
  color: var(--text-4);
}
.warn {
  font-size: 12px;
  color: var(--warn);
}
.whypop {
  position: fixed;
  z-index: 40;
  max-width: 380px;
  padding: 10px 12px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-left: 3px solid var(--info);
  border-radius: 8px;
  box-shadow: var(--shadow);
  pointer-events: none;
}
.notepop {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  border-left-color: #e8b84a;
  pointer-events: auto;
}
.editor :deep(.note-dot) {
  color: #e8b84a;
  background: rgba(232, 184, 74, 0.14);
  border-color: rgba(232, 184, 74, 0.5);
}
</style>
