<script setup lang="ts">
import { ref, computed, shallowRef, watch, onMounted, onBeforeUnmount, onActivated, nextTick } from 'vue'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState, Compartment, RangeSet, type Extension } from '@codemirror/state'
import { keymap, gutter, GutterMarker, Decoration, WidgetType } from '@codemirror/view'
import { darkPlus } from './darkplus'
import { javascript } from '@codemirror/lang-javascript'
import { vue } from '@codemirror/lang-vue'
import { json } from '@codemirror/lang-json'
import { css } from '@codemirror/lang-css'
import { sass } from '@codemirror/lang-sass'
import { html } from '@codemirror/lang-html'
import { unifiedMergeView } from '@codemirror/merge'
import type { BranchChanges, ChangedFile, CodeComment, ExplainFile } from '../types'
import { buildTree, languageOf, type Language, type TreeNode } from './code'
import Splitter from './Splitter.vue'
import Icon from './Icon.vue'
import DocView from './DocView.vue'
import MenuButton from './MenuButton.vue'
import type { MenuItem } from '../types'
import { search } from '@codemirror/search'
import { searchPanel } from './searchpanel'
import { parseVersionLink } from './mrhtml'
import { clampSize, readSize, writeSize, readFlag } from './dashboard'

const props = defineProps<{
  cwd: string | null
  ticketKey: string
  ticketTitle: string
  canAsk: boolean
  sourceSessionId: string | null
  comments?: CodeComment[]
  branchRef?: { source: string; target: string } | null
}>()
const emit = defineEmits<{ ask: [text: string]; explain: [sessionId: string]; version: [href: string, path: string | null] }>()

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
    '.cm-changedLine': { backgroundColor: 'rgba(61, 214, 140, 0.1) !important' },
    '.cm-changedText': { background: 'rgba(61, 214, 140, 0.28) !important', borderRadius: '2px' },
    '.cm-deletedChunk': { backgroundColor: 'rgba(242, 112, 106, 0.1) !important', paddingLeft: '6px' },
    '.cm-deletedChunk .cm-deletedText, .cm-deletedChunk del': { background: 'rgba(242, 112, 106, 0.28)', textDecoration: 'none' },
    '.cm-changeGutter': { width: '3px', paddingLeft: '0' },
    '.cm-changedLineGutter': { background: 'var(--ok)' },
    '.cm-deletedLineGutter': { background: 'var(--danger)' },
    '.cm-collapsedLines': { color: 'var(--text-3)', background: 'var(--bg-2)', padding: '4px 12px', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: '12px' },
    '.cm-why-gutter': { width: '22px' },
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

const view = ref<'changes' | 'files' | 'flow'>('changes')
const filter = ref('')
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
const explain = ref<ExplainFile | null>(null)
const isExplaining = ref(false)
let pollTimer: ReturnType<typeof setTimeout> | null = null
const why = ref<{ text: string; top: number; left: number } | null>(null)
const languageSlot = new Compartment()
const diffSlot = new Compartment()
const whySlot = new Compartment()
let baseText = ''

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
const showView = (next: 'changes' | 'files' | 'flow'): void => {
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
const goToLine = (line: number): void => {
  const v = editor.value
  if (!v) return
  const target = v.state.doc.line(Math.min(Math.max(line, 1), v.state.doc.lines))
  v.dispatch({ selection: { anchor: target.from }, effects: EditorView.scrollIntoView(target.from, { y: 'center' }) })
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

const commentSlot = new Compartment()
const openComments = ref<Set<string>>(new Set())
const fileComments = computed(() => (props.comments ?? []).filter((c) => c.path === openPath.value))
const commentCount = (path: string): number => (props.comments ?? []).filter((c) => c.path === path && !c.isResolved).length
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
  constructor(readonly comment: CodeComment) {
    super()
  }
  eq(other: CommentWidget): boolean {
    return other.comment.id === this.comment.id
  }
  toDOM(): HTMLElement {
    const box = document.createElement('div')
    box.className = this.comment.isResolved ? 'cmt-box done' : 'cmt-box'
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
    box.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('a')
      if (!a || !parseVersionLink(a.href)) return
      e.preventDefault()
      emit('version', a.href, this.comment.path)
    })
    return box
  }
  ignoreEvent(): boolean {
    return true
  }
}

const commentExtension = (): Extension => {
  const entries = fileComments.value
  if (!entries.length) return []
  return [
    gutter({
      class: 'cm-comment-gutter',
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
      const open = entries.filter((c) => openComments.value.has(c.id))
      return Decoration.set(
        open
          .map((c) => ({ at: lineEnd(v, c.line), c }))
          .sort((a, b) => a.at - b.at)
          .map((m) => Decoration.widget({ widget: new CommentWidget(m.c), block: true, side: 1 }).range(m.at)),
        true
      )
    })
  ]
}
watch(
  () => props.comments,
  () => editor.value?.dispatch({ effects: commentSlot.reconfigure(commentExtension()) })
)

const diffExtension = (): Extension =>
  isDiff.value
    ? unifiedMergeView({ original: baseText, mergeControls: false, collapseUnchanged: { margin: 4, minSize: 8 } })
    : []

const refresh = async (): Promise<void> => {
  if (!props.cwd) return
  const ref = props.branchRef
  const changed = ref ? await window.api.listRefChanges(props.cwd, ref.source, ref.target) : await window.api.listBranchChanges(props.cwd)
  branch.value = changed
  files.value = ref && changed?.isReadOnly ? await window.api.listRefFiles(props.cwd, ref.source) : await window.api.listFiles(changed?.folder ?? props.cwd)
}

const save = async (): Promise<void> => {
  const cwd = workCwd.value
  if (!cwd || !openPath.value || !editor.value || isSaving.value) return
  isSaving.value = true
  const result = await window.api.writeFile(cwd, openPath.value, editor.value.state.doc.toString())
  isSaving.value = false
  error.value = result.error
  if (!result.error) {
    isDirty.value = false
    void refresh()
  }
}

const open = async (path: string): Promise<void> => {
  if (!props.cwd) return
  if (isDirty.value && !window.confirm(`Discard unsaved changes in ${openPath.value}?`)) return
  docText.value = null
  const ref = props.branchRef
  const isRef = !!ref && !!branch.value?.isReadOnly
  const [file, base] = isRef
    ? await Promise.all([
        window.api.readRefFile(props.cwd, ref.source, ref.target, path, false).then((text) => ({ text, error: text === null ? `${path} is not on ${ref.source}` : null })),
        window.api.readRefFile(props.cwd, ref.source, ref.target, path, true).then((text) => text ?? '')
      ])
    : await Promise.all([
        window.api.readFile(workCwd.value as string, path),
        window.api.readHeadFile(workCwd.value as string, path, diffBase.value === 'commit')
      ])
  error.value = file.error
  if (file.text === null) return
  baseText = base
  openPath.value = path
  isDirty.value = false
  why.value = null
  const state = EditorState.create({
    doc: file.text,
    extensions: [
      basicSetup,
      darkPlus,
      surface,
      search({ createPanel: searchPanel, top: true }),
      whySlot.of(whyExtension()),
      commentSlot.of(commentExtension()),
      EditorState.readOnly.of(isRef),
      languageSlot.of(LANGS[languageOf(path)]()),
      diffSlot.of(diffExtension()),
      keymap.of([{ key: 'Mod-s', run: () => (void save(), true) }]),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) isDirty.value = true
      })
    ]
  })
  await nextTick()
  if (editor.value) editor.value.setState(state)
  else editor.value = new EditorView({ state, parent: host.value as HTMLDivElement })
}

const setDiffMode = async (mode: 'off' | 'target' | 'commit'): Promise<void> => {
  isDiff.value = mode !== 'off'
  if (mode !== 'off' && mode !== diffBase.value) {
    diffBase.value = mode
    const path = openPath.value
    if (path && workCwd.value && !branch.value?.isReadOnly) baseText = await window.api.readHeadFile(workCwd.value, path, mode === 'commit')
  }
  editor.value?.dispatch({ effects: diffSlot.reconfigure(diffExtension()) })
}
const diffLabel = computed(() => (!isDiff.value ? 'Diff off' : diffBase.value === 'commit' ? 'Diff: uncommitted' : `Diff: ${branch.value?.target ?? 'base'}`))
const diffItems = computed<MenuItem[]>(() => [
  {
    label: `Whole branch vs ${branch.value?.target ?? 'base'}`,
    hint: 'Everything this branch changes, including what is already in the MR',
    icon: 'diff',
    run: () => void setDiffMode('target')
  },
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

const waitForExplain = (since: number): void => {
  pollTimer = setTimeout(async () => {
    const found = await window.api.getExplainDoc(props.ticketKey)
    if (found && found.updatedAt > since) {
      applyExplain(found)
      isExplaining.value = false
      view.value = 'flow'
      return
    }
    if (Date.now() - since > EXPLAIN_WAIT_MS) {
      isExplaining.value = false
      error.value = 'The explanation did not appear. Check the Claude session.'
      return
    }
    waitForExplain(since)
  }, EXPLAIN_POLL_MS)
}

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

const openStepChange = async (file: string, line: number): Promise<void> => {
  if (openPath.value !== file) await open(file)
  goToLine(line)
}
const docText = ref<string | null>(null)
const openMd = async (): Promise<void> => {
  docText.value = (await window.api.readExplainMd(props.ticketKey)) ?? 'The explanation file was not found.'
}
const openMdInVscode = (): void => window.api.openExplainMd(props.ticketKey)

const askAboutSelection = (): void => {
  const v = editor.value
  if (!v || !openPath.value) return
  const range = v.state.selection.main
  const from = v.state.doc.lineAt(range.from).number
  const to = v.state.doc.lineAt(range.to).number
  const code = range.empty ? '' : v.state.sliceDoc(range.from, range.to)
  const where = from === to ? `${openPath.value}:${from}` : `${openPath.value}:${from}-${to}`
  emit('ask', code ? `W ${where}:\n\`\`\`\n${code}\n\`\`\`\n` : `W ${where}: `)
}

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
}

onMounted(refreshAll)
watch(
  () => [props.cwd, props.branchRef?.source],
  () => refreshAll()
)
onActivated(refreshAll)
onBeforeUnmount(() => {
  if (pollTimer) clearTimeout(pollTimer)
  editor.value?.destroy()
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
      <button title="Refresh" @click="refresh"><Icon name="refresh" :size="16" /></button>
    </aside>
    <aside v-else class="side" :style="{ width: `${sideWidth}px` }">
      <div class="seg">
        <button :class="{ on: view === 'changes' }" title="Changed files" @click="view = 'changes'"><Icon name="diff" :size="14" /><span class="lbl">Changes</span><span class="n">{{ changes.length }}</span></button>
        <button :class="{ on: view === 'files' }" title="All files" @click="view = 'files'"><Icon name="folder" :size="14" /><span class="lbl">Files</span></button>
        <button :class="{ on: view === 'flow' }" :disabled="!flow.length" title="The process this ticket changes, step by step" @click="view = 'flow'"><Icon name="flow" :size="14" /><span class="lbl">Flow</span></button>
        <button class="refresh" title="Refresh" @click="refresh"><Icon name="refresh" :size="14" /></button>
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
      <template v-else-if="view === 'changes'">
        <div v-if="branch" class="branch" :class="{ warn: isOtherBranch }">
          <Icon name="branch" :size="13" /><code>{{ branch.branch }}</code><span class="vs">vs</span><code>{{ branch.target }}</code>
          <span v-if="isOtherBranch">This folder is on another ticket's branch, so these are not {{ ticketKey }}'s changes.</span>
          <span v-if="branch.isReadOnly" class="ro">Read-only, straight from origin: no local folder has this branch checked out.</span>
          <span v-else-if="folderName" class="ro">Showing the worktree {{ folderName }}, which has this branch checked out, with its uncommitted changes.</span>
          <button v-if="branch.uncommitted?.length" class="unctoggle" :class="{ on: isUncommittedOnly }" title="Only files changed locally and not committed yet; the diff is against the last commit" @click="toggleUncommitted">
            <i />{{ isUncommittedOnly ? 'Showing uncommitted only' : 'Uncommitted' }}<span>{{ branch.uncommitted.length }}</span>
          </button>
        </div>
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
        <p v-if="!changes.length" class="muted">{{ isUncommittedOnly ? 'Nothing uncommitted.' : 'No code changes on this branch yet.' }}</p>
        <button
          v-for="c in changes"
          :key="c.path"
          class="row"
          :class="{ on: openPath === c.path }"
          :title="c.path"
          @click="open(c.path)"
        >
          <Icon name="file" :size="13" class="ficon" />
          <span class="name">{{ c.path.split('/').pop() }}</span>
          <span class="dir">{{ c.path.split('/').slice(0, -1).join('/') }}</span>
          <i v-if="isUncommitted(c.path)" class="uncdot" title="Changed locally, not committed yet" />
          <em v-if="commentCount(c.path)" class="cmtn" title="Unresolved comments"><Icon name="message" :size="11" />{{ commentCount(c.path) }}</em>
          <em v-if="whyCount(c.path)" class="whyn" title="Explained changes"><Icon name="info" :size="11" />{{ whyCount(c.path) }}</em>
          <b :style="{ color: STATE_MARK[c.state].color }">{{ STATE_MARK[c.state].mark }}</b>
        </button>
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
        <span class="path"><Icon name="file" :size="13" /><span class="pdir">{{ openPath.split('/').slice(0, -1).join('/') }}{{ openPath.includes('/') ? '/' : '' }}</span><b>{{ openPath.split('/').pop() }}</b><i v-if="isDirty" class="dirty" title="Unsaved changes" /></span>
        <span class="grow" />
        <span v-if="error" class="warn">{{ error }}</span>
        <button class="tb" :disabled="!canAsk" :title="canAsk ? 'Paste the selected lines into the Claude session, then type your question' : 'Open the Claude session in the dashboard first'" @click="askAboutSelection">
          <Icon name="message" :size="14" />Ask Claude
        </button>
        <MenuButton :label="diffLabel" icon="diff" title="What to highlight in the file" :items="diffItems" />
        <button v-if="!branch?.isReadOnly" class="tb primary" :disabled="!isDirty || isSaving" title="Save (Ctrl+S)" @click="save"><Icon name="save" :size="14" />{{ isSaving ? 'Saving…' : 'Save' }}</button>
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
@container (max-width: 370px) {
  .seg .lbl {
    display: none;
  }
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
.editor {
  flex: 1;
  min-height: 0;
  overflow: hidden;
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
</style>
