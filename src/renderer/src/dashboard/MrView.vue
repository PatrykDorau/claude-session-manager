<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, onActivated, onDeactivated } from 'vue'
import { followId } from './follow'
import type { CodeComment, DevServer, DiffRow, MenuItem, MrCommentable, MrDraftNote, MrFile, MrReviewAction, MrRow, MrStatus, MrVersionDiff, QuickAction, Session, Stage, TerminalMode } from '../types'
import { sortDrafts, draftsForThread, generalDrafts, rowsAround } from './mrreview'
import { plainSession } from '../cards'
import { reviewLabel, findReviewSession, findWorkSession, findAddressSession, mergeHint } from './mrs'
import { renderGitlabHtml, renderMarkdown, toUploadWebUrl, isVideoUrl, parseVersionLink } from './mrhtml'
import Icon from './Icon.vue'
import MenuButton from './MenuButton.vue'
import { ago } from '../display'
import ClaudeTerminal from './ClaudeTerminal.vue'
import CodeView from './CodeView.vue'
import Splitter from './Splitter.vue'
import ContextChip from './ContextChip.vue'
import { clampSize, readSize, writeSize, readFlag } from './dashboard'
import QuickActions from './QuickActions.vue'
import ServerPanel from './ServerPanel.vue'

const props = defineProps<{ row: MrRow; sessions: Session[]; isGone: boolean; myName?: string | null; servers?: DevServer[]; taskStage?: Stage | null }>()
const emitViewing = defineEmits<{ viewing: [id: string | null] }>()

const REVIEW_ACTIONS: QuickAction[] = [
  {
    label: 'Save findings as draft notes',
    prompt:
      'Zapisz potwierdzone uwagi z review jako draft notes w tym MR (gitlab.js mr draft-note). Najpierw pokaż mi listę do potwierdzenia.'
  }
]

const tab = ref<'overview' | 'changes' | 'server'>('overview')
const isCodeOpen = ref(!readFlag('dash.mrCodeHidden'))
const isClaudeOpen = ref(!readFlag('dash.mrClaudeHidden'))
const isBothOpen = computed(() => isCodeOpen.value && isClaudeOpen.value)
const savePanes = (): void => {
  writeSize('dash.mrCodeHidden', !isCodeOpen.value)
  writeSize('dash.mrClaudeHidden', !isClaudeOpen.value)
}
const toggleCode = (): void => {
  isCodeOpen.value = !isCodeOpen.value
  if (!isCodeOpen.value) isClaudeOpen.value = true
  savePanes()
}
const toggleClaude = (): void => {
  isClaudeOpen.value = !isClaudeOpen.value
  if (!isClaudeOpen.value) isCodeOpen.value = true
  savePanes()
}
const panes = ref<HTMLDivElement | null>(null)
const codeWidth = ref(readSize('dash.mrCodeWidth', 760))
const resizeCode = (delta: number): void => {
  const total = panes.value?.clientWidth ?? 1400
  codeWidth.value = clampSize(codeWidth.value + delta, 320, total - 360)
}
const saveCodeWidth = (): void => writeSize('dash.mrCodeWidth', codeWidth.value)
const isOverviewClaudeOpen = ref(readFlag('dash.mrOverviewClaude'))
const toggleOverviewClaude = (): void => {
  isOverviewClaudeOpen.value = !isOverviewClaudeOpen.value
  writeSize('dash.mrOverviewClaude', isOverviewClaudeOpen.value)
}
const docWidth = ref(readSize('dash.mrDocWidth', 820))
const isClaudeShown = computed(() => (tab.value === 'changes' && isClaudeOpen.value) || (tab.value === 'overview' && isOverviewClaudeOpen.value))
const isSplit = computed(() => (tab.value === 'changes' && isBothOpen.value) || (tab.value === 'overview' && isOverviewClaudeOpen.value))
const resizeLeft = (delta: number): void => {
  if (tab.value === 'changes') {
    resizeCode(delta)
    return
  }
  const total = panes.value?.clientWidth ?? 1400
  docWidth.value = clampSize(docWidth.value + delta, 420, total - 360)
}
const saveLeftWidth = (): void => {
  if (tab.value === 'changes') saveCodeWidth()
  else writeSize('dash.mrDocWidth', docWidth.value)
}
const files = ref<MrFile[] | null | undefined>(undefined)
const mode = ref<TerminalMode | null>(null)
const isStarting = ref(false)
const startError = ref<string | null>(null)
const terminalTick = ref(0)
let remountTimer: ReturnType<typeof setTimeout> | null = null

const isMine = computed(() => !!props.myName && props.row.author === props.myName)
const actionValues = computed(() => ({
  ticket: props.row.ticket,
  title: props.row.title,
  branch: props.row.sourceBranch,
  worktree: session.value?.projectPath ?? null,
  mr: `!${props.row.iid}`,
  mrUrl: props.row.url,
  server: server.value ? `http://localhost:${server.value.port}` : null
}))
const addressSessionId = ref<string | null>(null)
const addressSession = computed(
  () =>
    props.sessions.find((s) => s.id === addressSessionId.value) ??
    (isMine.value ? findAddressSession(props.sessions, props.row) : undefined)
)
const isAddressPending = computed(
  () =>
    isAddressing.value ||
    (!!addressSessionId.value && !props.sessions.some((s) => s.id.startsWith(addressSessionId.value as string)))
)
const baseSession = computed(() =>
  isMine.value ? findWorkSession(props.sessions, props.row.ticket) : findReviewSession(props.sessions, followId(props.sessions, props.row.sessionId))
)
const paneSessions = computed(() =>
  [
    baseSession.value ? { label: 'Task', session: baseSession.value } : null,
    addressSession.value && addressSession.value.id !== baseSession.value?.id ? { label: 'Comments', session: addressSession.value } : null
  ].filter((t): t is { label: string; session: Session } => !!t)
)
const pickedSessionId = ref<string | null>(null)
const followTabs = (): void => {
  addressSessionId.value = followId(props.sessions, addressSessionId.value)
  pickedSessionId.value = followId(props.sessions, pickedSessionId.value)
}
watch(() => props.sessions, followTabs)
const session = computed(
  () =>
    paneSessions.value.find((t) => t.session.id === pickedSessionId.value)?.session ??
    (addressSession.value?.isLive ? addressSession.value : null) ??
    baseSession.value ??
    addressSession.value
)
watch(() => session.value?.id ?? null, (id) => emitViewing('viewing', id), { immediate: true })
onActivated(() => emitViewing('viewing', session.value?.id ?? null))
onDeactivated(() => emitViewing('viewing', null))
const repoPath = ref<string | null>(null)
const loadRepo = async (): Promise<void> => {
  repoPath.value = await window.api.getMrRepo(props.row.key)
}
void loadRepo()
const codeCwd = computed(() => session.value?.projectPath ?? repoPath.value)
const branchUrl = (branch: string): string => `${origin}/${props.row.projectPath}/-/tree/${branch.split('/').map(encodeURIComponent).join('/')}`
const openJira = (key: string): void => window.api.openTicket(key)
const isAddressing = ref(false)
const addressComments = async (): Promise<void> => {
  isAddressing.value = true
  startError.value = null
  tab.value = 'changes'
  if (!isClaudeOpen.value) toggleClaude()
  try {
    const result = await window.api.startAddress(props.row.key)
    startError.value = result.error
    if (result.sessionId) {
      addressSessionId.value = result.sessionId
      pickedSessionId.value = result.sessionId
    }
  } finally {
    isAddressing.value = false
  }
}
const chip = computed(() => reviewLabel(props.row.review))
const facts = computed(() => {
  const list: string[] = []
  if (session.value?.model) list.push(session.value.model.replace(/^claude-/, ''))
  return list
})

const loadFiles = async (): Promise<void> => {
  files.value = undefined
  files.value = await window.api.getMrFiles(props.row.key)
}
const review = async (): Promise<void> => {
  isStarting.value = true
  startError.value = null
  try {
    const result = await window.api.startReview(props.row.key)
    startError.value = result.error
    if (!result.error) tab.value = 'changes'
  } catch (e) {
    startError.value = String(e)
  } finally {
    isStarting.value = false
  }
}
const terminal = ref<{ takeOver: () => Promise<boolean>; paste: (text: string) => void } | null>(null)
const askClaude = (text: string): void => {
  tab.value = 'changes'
  if (!isClaudeOpen.value) toggleClaude()
  terminal.value?.paste(text)
}
const takeOverHere = async (): Promise<boolean> => (terminal.value ? terminal.value.takeOver() : false)
const remountTerminal = (): void => {
  mode.value = null
  terminalTick.value += 1
}
const stopTurn = (): void => {
  if (session.value) window.api.stopTurn(session.value.id)
}
const openInVscode = async (): Promise<void> => {
  if (!session.value) return
  await window.api.openInVscode(session.value.id)
  remountTimer = setTimeout(remountTerminal, 1500)
}
const focusVscode = (): void => {
  if (session.value) window.api.openSession(plainSession(session.value))
}

const status = ref<MrStatus | null>(null)
const busyAction = ref<string | null>(null)
const actionError = ref<string | null>(null)
const notice = ref<string | null>(null)
const comment = ref('')
const PIPELINE_COLOR: Record<string, string> = { success: '#3dd68c', failed: '#f2706a', running: '#6aa9ff', pending: '#e8b84a', canceled: '#9d9d9d' }
const explanations = ref<Record<string, string>>({})
const loadStatus = async (): Promise<void> => {
  const [next, notes] = await Promise.all([window.api.getMrStatus(props.row.key), window.api.getMrExplanations(props.row.key)])
  status.value = next
  explanations.value = notes
  recheckCommentable()
}
const serverKey = computed(() => props.row.ticket ?? `MR-${props.row.iid}`)
const server = computed(() => (props.servers ?? []).find((sv) => sv.key === serverKey.value) ?? null)
const serverCwd = ref<string | null>(null)
const loadServerCwd = async (): Promise<void> => {
  const place = await window.api.getMrBranchFolder(props.row.key)
  serverCwd.value = place.folder ?? session.value?.projectPath ?? place.repo
}
const isRefreshingStatus = ref(false)
const refreshStatus = async (): Promise<void> => {
  isRefreshingStatus.value = true
  try {
    await Promise.all([loadStatus(), window.api.refreshLists()])
  } finally {
    isRefreshingStatus.value = false
  }
}
const approvalText = computed(() => {
  const a = status.value?.approvals
  if (!a) return null
  if (a.approvedBy.length) return `Approved by ${a.approvedBy.join(', ')}${a.left ? ` · ${a.left} more needed` : ''}`
  return a.left ? `${a.left} approval${a.left === 1 ? '' : 's'} needed` : 'No approvals yet'
})
const threads = computed(() => status.value?.discussions ?? [])
const openThreads = computed(() => threads.value.filter((d) => d.isResolvable && !d.isResolved).length)
const origin = ((): string => {
  try {
    return new URL(window.api.getSettings().gitlabBase).origin
  } catch {
    return ''
  }
})()
const overview = computed(() => status.value?.overview ?? null)
const descriptionHtml = computed(() => {
  const ov = overview.value
  if (!ov) return ''
  return ov.descriptionHtml ? renderGitlabHtml(ov.descriptionHtml, origin, props.row.projectId) : ov.description ? renderMarkdown(ov.description, origin, props.row.projectId) : ''
})
const noteHtml = computed<Record<number, string>>(() =>
  Object.fromEntries(threads.value.flatMap((d) => d.notes).map((n) => [n.id, renderMarkdown(n.body, origin, props.row.projectId)]))
)
const onMediaError = (e: Event): void => {
  const el = e.target
  if (!(el instanceof HTMLVideoElement || el instanceof HTMLImageElement) || el.dataset.failed) return
  const src = el.getAttribute('src') ?? ''
  const webUrl = toUploadWebUrl(src)
  if (webUrl !== src) {
    el.setAttribute('src', webUrl)
    return
  }
  el.dataset.failed = '1'
  const box = document.createElement('span')
  box.className = 'mediafail'
  box.append(`${el instanceof HTMLVideoElement || isVideoUrl(src) ? 'Video' : 'Image'} could not load here. `)
  const signIn = document.createElement('button')
  signIn.className = 'mediasignin'
  signIn.dataset.signin = '1'
  signIn.textContent = 'Sign in to GitLab'
  const link = document.createElement('a')
  link.href = webUrl
  link.target = '_blank'
  link.textContent = 'Open it in GitLab'
  box.append(signIn, ' or ', link)
  el.replaceWith(box)
}
const mediaTick = ref(0)
const isSigningIn = ref(false)
const onMediaClick = async (e: MouseEvent): Promise<void> => {
  const target = e.target instanceof HTMLElement ? e.target.closest('[data-signin]') : null
  if (!target || isSigningIn.value) return
  e.preventDefault()
  e.stopPropagation()
  isSigningIn.value = true
  try {
    if (await window.api.signInGitlab()) mediaTick.value++
  } finally {
    isSigningIn.value = false
  }
}
const expandedResolved = ref<Set<string>>(new Set())
const toggleResolved = (id: string): void => {
  const next = new Set(expandedResolved.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedResolved.value = next
}
const versionPopup = ref<{ title: string; data: MrVersionDiff | null; line: number | null; isWhole: boolean } | null>(null)
const popupRows = (rows: DiffRow[]): DiffRow[] => {
  const popup = versionPopup.value
  if (!popup?.line || popup.isWhole) return rows
  return rowsAround(rows, popup.line) ?? rows
}
const isPopupTrimmed = computed(() => {
  const popup = versionPopup.value
  if (!popup?.line || !popup.data) return false
  return popup.data.files.some((f) => !!rowsAround(f.rows, popup.line as number))
})
const openVersion = async (href: string, path: string | null, line: number | null = null): Promise<void> => {
  const link = parseVersionLink(href)
  if (!link) return
  versionPopup.value = { title: path ? `${path}${line ? `:${line}` : ''}` : 'Changes in this version', data: null, line, isWhole: false }
  const data = await window.api.getMrVersionDiff(props.row.key, link.diffId, link.startSha, path)
  if (versionPopup.value) versionPopup.value = { ...versionPopup.value, data }
}
const onThreadClick = (e: MouseEvent, path: string | null, line: number | null = null): void => {
  const a = (e.target as HTMLElement).closest('a')
  if (!a || !parseVersionLink(a.href)) return
  e.preventDefault()
  void openVersion(a.href, path, line)
}
const codeComments = computed<CodeComment[]>(() =>
  threads.value.flatMap((d): CodeComment[] =>
    d.anchor && d.anchor.side === 'new'
      ? [
          {
            id: d.id,
            path: d.anchor.path,
            line: d.anchor.line,
            isResolved: d.isResolved,
            discussionId: d.id,
            isResolvable: d.isResolvable,
            notes: d.notes.map((n) => ({ author: n.author, body: n.body, html: noteHtml.value[n.id] }))
          }
        ]
      : []
  ).concat(
    (status.value?.drafts ?? []).flatMap((p) =>
      p.anchor && p.anchor.side === 'new'
        ? [
            {
              id: `draft-${p.id}`,
              path: p.anchor.path,
              line: p.anchor.line,
              isResolved: false,
              isDraft: true,
              draftId: p.id,
              notes: [{ author: 'You (pending)', body: p.body, html: renderMarkdown(p.body, origin, props.row.projectId) }]
            }
          ]
        : []
    )
  )
)
const hint = computed(() => mergeHint(status.value?.state?.mergeStatus ?? 'checking'))
const isSquash = ref(false)
const isSourceRemoved = ref(true)
watch(
  () => overview.value?.pipeline?.id ?? overview.value?.createdAt,
  () => {
    if (!overview.value) return
    isSquash.value = overview.value.isSquash
    isSourceRemoved.value = overview.value.isSourceRemoved
  }
)
const initials = (name: string): string =>
  name
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
const replyTo = ref<string | null>(null)
const reply = ref('')
const postReply = async (discussionId: string): Promise<void> => {
  busyAction.value = 'reply'
  actionError.value = null
  try {
    const result = await window.api.postMrReply(props.row.key, discussionId, reply.value)
    actionError.value = result.error
    if (!result.error && !result.isCancelled) {
      reply.value = ''
      replyTo.value = null
      await loadStatus()
    }
  } finally {
    busyAction.value = null
  }
}
const runAction = async (action: 'approve' | 'unapprove' | 'merge' | 'rebase'): Promise<void> => {
  busyAction.value = action
  actionError.value = null
  try {
    const result = await window.api.runMrAction(
      props.row.key,
      action,
      action === 'merge' ? { isSquash: isSquash.value, isSourceRemoved: isSourceRemoved.value } : undefined
    )
    const isRefused = /^HTTP 40[13]/.test(result.error ?? '')
    if (isRefused && (action === 'approve' || action === 'unapprove')) {
      window.open(props.row.url, '_blank')
      actionError.value = `${result.error}. Your token cannot approve on this GitLab, so the merge request opened in the browser to approve there.`
    } else actionError.value = result.error
    notice.value = result.notice ?? null
    if (!result.isCancelled) await loadStatus()
  } finally {
    busyAction.value = null
  }
}
const postComment = async (): Promise<void> => {
  busyAction.value = 'comment'
  actionError.value = null
  try {
    const result = await window.api.postMrComment(props.row.key, comment.value)
    actionError.value = result.error
    if (!result.error && !result.isCancelled) {
      comment.value = ''
      await loadStatus()
    }
  } finally {
    busyAction.value = null
  }
}
const drafts = computed<MrDraftNote[]>(() => status.value?.drafts ?? [])
const sortedDrafts = computed(() => sortDrafts(drafts.value))
const draftHtml = computed<Record<number, string>>(() =>
  Object.fromEntries(drafts.value.map((d) => [d.id, renderMarkdown(d.body, origin, props.row.projectId)]))
)
const explanationHtml = computed<Record<string, string>>(() =>
  Object.fromEntries(Object.entries(explanations.value).map(([id, text]) => [id, renderMarkdown(text, origin, props.row.projectId)]))
)
const isReviewListOpen = ref(false)
const runReview = async (action: MrReviewAction): Promise<boolean> => {
  busyAction.value = action.kind
  actionError.value = null
  try {
    const result = await window.api.mrReview(props.row.key, action)
    actionError.value = result.error
    if (result.isCancelled) return false
    await loadStatus()
    return !result.error
  } finally {
    busyAction.value = null
  }
}
const editKey = ref<string | null>(null)
const editText = ref('')
const startEdit = (key: string, body: string): void => {
  editKey.value = key
  editText.value = body
}
const saveDraftEdit = async (id: number): Promise<void> => {
  if (await runReview({ kind: 'draft-edit', id, body: editText.value })) editKey.value = null
}
const saveNoteEdit = async (discussionId: string, noteId: number): Promise<void> => {
  if (await runReview({ kind: 'note-edit', discussionId, noteId, body: editText.value })) editKey.value = null
}
const addReplyDraft = async (discussionId: string): Promise<void> => {
  if (!(await runReview({ kind: 'draft-add', body: reply.value, replyTo: discussionId }))) return
  reply.value = ''
  replyTo.value = null
}
const addGeneralDraft = async (): Promise<void> => {
  if (await runReview({ kind: 'draft-add', body: comment.value })) comment.value = ''
}
const draftWhere = (d: MrDraftNote): string => {
  if (d.anchor) return `${d.anchor.path}:${d.anchor.line}`
  if (!d.replyTo) return 'General comment'
  const thread = threads.value.find((t) => t.id === d.replyTo)
  if (thread?.where) return `Reply on ${thread.where}`
  return thread ? `Reply to ${thread.notes[0]?.author ?? 'a thread'}` : 'Reply in a thread'
}
const codeView = ref<{ goToFileLine: (path: string, line: number) => Promise<void> } | null>(null)
const flashElement = (id: string): void => {
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  el.classList.add('flash')
  setTimeout(() => el.classList.remove('flash'), 1600)
}
const openDraft = async (d: MrDraftNote): Promise<void> => {
  isReviewListOpen.value = false
  if (d.anchor) {
    tab.value = 'changes'
    if (!isCodeOpen.value) toggleCode()
    await nextTick()
    await codeView.value?.goToFileLine(d.anchor.path, d.anchor.line)
    return
  }
  tab.value = 'overview'
  const replyTo = d.replyTo
  if (replyTo && threads.value.find((t) => t.id === replyTo)?.isResolved && !expandedResolved.value.has(replyTo)) toggleResolved(replyTo)
  await nextTick()
  flashElement(replyTo ? `thread-${replyTo}` : 'mr-composer')
}
const isDraftMr = computed(() => overview.value?.isDraft ?? props.row.isDraft)
const toggleDraft = (): void => {
  void runReview({ kind: 'set-draft', isDraft: !isDraftMr.value, title: props.row.title })
}
const isTitleEditing = ref(false)
const titleText = ref('')
const startTitleEdit = (): void => {
  titleText.value = props.row.title
  isTitleEditing.value = true
}
const saveTitle = async (): Promise<void> => {
  if (!titleText.value.trim() || titleText.value === props.row.title) {
    isTitleEditing.value = false
    return
  }
  if (await runReview({ kind: 'edit-text', title: titleText.value.trim() })) isTitleEditing.value = false
}
const isDescEditing = ref(false)
const isDescPreview = ref(false)
const descText = ref('')
const descPreview = computed(() => renderMarkdown(descText.value, origin, props.row.projectId))
const startDescEdit = (): void => {
  descText.value = overview.value?.description ?? ''
  isDescPreview.value = false
  isDescEditing.value = true
}
const saveDesc = async (): Promise<void> => {
  if (await runReview({ kind: 'edit-text', description: descText.value })) isDescEditing.value = false
}
const commentable = ref<MrCommentable | null>(null)
let shownFile: { path: string; folder: string | null; isReadOnly: boolean } | null = null
const checkCommentable = async (path: string, folder: string | null, isReadOnly: boolean): Promise<void> => {
  shownFile = { path, folder, isReadOnly }
  commentable.value = null
  const result = await window.api.mrCommentable(props.row.key, folder, isReadOnly, path)
  if (shownFile?.path === path) commentable.value = result
}
const recheckCommentable = (): void => {
  if (shownFile) void checkCommentable(shownFile.path, shownFile.folder, shownFile.isReadOnly)
}
const openItems = computed<MenuItem[]>(() => [
  { label: 'GitLab', hint: props.row.url, icon: 'external', run: () => window.open(props.row.url, '_blank') },
  { label: 'VS Code with the review session', hint: 'Moves the session to VS Code', icon: 'code', isDisabled: !session.value, run: () => void openInVscode() }
])

onMounted(() => {
  void loadServerCwd()
  void loadFiles()
  void loadStatus()
})
watch(
  () => props.row.sha,
  () => {
    void loadFiles()
    void loadStatus()
  }
)
const STATUS_REFRESH_MS = 10000
let statusTimer: ReturnType<typeof setTimeout> | null = null
let lastStatusAt = Date.now()
const scheduleStatus = (): void => {
  if (statusTimer) return
  statusTimer = setTimeout(
    () => {
      statusTimer = null
      lastStatusAt = Date.now()
      void loadStatus()
    },
    Math.max(0, STATUS_REFRESH_MS - (Date.now() - lastStatusAt))
  )
}
watch(
  () => paneSessions.value.map((t) => `${t.session.id}:${t.session.status}:${t.session.lastActive}`).join('|'),
  scheduleStatus
)
onBeforeUnmount(() => {
  if (remountTimer) clearTimeout(remountTimer)
  if (statusTimer) clearTimeout(statusTimer)
})
</script>

<template>
  <div class="view">
    <header class="head">
      <div class="line">
        <span class="proj">{{ row.projectName }}</span>
        <a class="iid" :href="row.url" target="_blank" title="Open in GitLab">!{{ row.iid }}</a>
        <span v-if="!isMine" class="pill" :style="{ '--c': chip.color }">{{ chip.label }}</span>
        <span v-if="isGone" class="pill" style="--c: #666d78">no longer in your to-do</span>
        <span v-if="isDraftMr" class="draftbadge">Draft</span>
        <button v-if="overview" class="linkbtn draftlink" :disabled="!!busyAction || isGone" :title="isDraftMr ? 'Remove the Draft prefix so it can be merged' : 'Mark as draft so it cannot be merged yet'" @click="toggleDraft">
          {{ isDraftMr ? 'Mark as ready' : 'Mark as draft' }}
        </button>
        <input
          v-if="isTitleEditing"
          v-model="titleText"
          class="titleedit"
          @keydown.enter="saveTitle"
          @keydown.esc="isTitleEditing = false"
        />
        <template v-if="isTitleEditing">
          <button class="btn sm" @click="isTitleEditing = false">Cancel</button>
          <button class="btn sm primary" :disabled="!!busyAction" @click="saveTitle">Save title</button>
        </template>
        <h1 v-else class="title editable" :title="`${row.title} — click to edit`" @click="startTitleEdit">{{ row.title }}</h1>
        <button v-if="row.ticket" class="fact jira" title="Open in Jira" @click="openJira(row.ticket)">{{ row.ticket }}</button>
      </div>
      <div v-if="status?.state || approvalText" class="status">
        <span v-if="status?.state?.pipeline" class="st" :style="{ color: PIPELINE_COLOR[status.state.pipeline] ?? '#9d9d9d' }">
          <i :style="{ background: PIPELINE_COLOR[status.state.pipeline] ?? '#9d9d9d' }" />Pipeline {{ status.state.pipeline }}
        </span>
        <span v-if="approvalText" class="st" :class="{ ok: status?.approvals?.isApprovedByMe }"><Icon name="check" :size="13" />{{ approvalText }}</span>
        <span v-if="status?.state?.hasConflicts" class="st bad">Conflicts with {{ row.targetBranch }}</span>
        <span v-else-if="status?.state?.behind" class="st">{{ status.state.behind }} commits behind {{ row.targetBranch }}</span>
        <span v-if="openThreads" class="st warn"><Icon name="message" :size="13" />{{ openThreads }} open threads</span>
        <span v-if="status?.state && status.state.state !== 'opened'" class="st">{{ status.state.state }}</span>
        <span v-if="status?.problem" class="st bad" :title="status.problem">GitLab: {{ status.problem }}</span>
      </div>
      <div class="bar">
        <nav class="tabs">
          <button :class="{ on: tab === 'overview' }" @click="tab = 'overview'"><Icon name="fileText" :size="15" />Overview<span v-if="threads.length" class="count">{{ threads.filter((d) => !d.isSystem).length }}</span></button>
          <button :class="{ on: tab === 'server' }" @click="tab = 'server'"><Icon name="server" :size="15" />Server<span v-if="server" class="dot" /></button>
          <button :class="{ on: tab === 'changes' }" @click="tab = 'changes'">
            <Icon name="code" :size="15" />Changes<span v-if="files" class="count">{{ files.length }}</span>
          </button>
        </nav>
        <span class="sub">
          <Icon name="user" :size="13" />{{ row.author }}
          <Icon name="branch" :size="13" /><a class="bref" :href="branchUrl(row.sourceBranch)" target="_blank" :title="`Open ${row.sourceBranch} in GitLab`">{{ row.sourceBranch }}</a><span class="arrow">→</span><a class="bref" :href="branchUrl(row.targetBranch)" target="_blank">{{ row.targetBranch }}</a>
        </span>
        <span class="grow" />
        <ContextChip v-if="session" :session="session" :mode="mode" />
        <div v-if="tab === 'changes'" class="seg" :title="['Show or hide the panes', ...facts].join(' · ')">
          <button :class="{ on: isCodeOpen }" @click="toggleCode"><Icon name="code" :size="14" />Code</button>
          <button :class="{ on: isClaudeOpen }" @click="toggleClaude"><Icon name="terminal" :size="14" />Claude</button>
        </div>
        <div v-if="tab === 'overview'" class="seg" :title="['Show Claude next to the overview', ...facts].join(' · ')">
          <button :class="{ on: isOverviewClaudeOpen }" @click="toggleOverviewClaude"><Icon name="terminal" :size="14" />Claude</button>
        </div>
        <button v-if="isClaudeShown" class="stop" :disabled="mode !== 'attach'" title="Interrupt Claude's current turn (Esc)" @click="stopTurn"><Icon name="stop" :size="12" />Stop</button>
        <button class="btn icon" :class="{ spinning: isRefreshingStatus }" :disabled="isRefreshingStatus" title="Reload this merge request from GitLab" @click="refreshStatus"><Icon name="refresh" :size="14" /></button>
        <MenuButton label="Open in" icon="external" :items="openItems" />
        <button
          v-if="isMine"
          class="btn primary"
          :disabled="isAddressPending || isGone"
          title="Starts a fresh Claude session in the MR worktree for the unresolved threads"
          @click="addressComments"
        >
          <span v-if="isAddressPending" class="spin" /><Icon v-else name="message" :size="13" />{{ isAddressPending ? 'Starting…' : 'Address comments' }}
        </button>
        <button v-else class="btn primary" :disabled="isStarting || isGone" @click="review">
          <Icon name="play" :size="13" />{{ isStarting ? 'Starting review…' : row.review === 'not-reviewed' ? 'Review' : 'Review again' }}
        </button>
      </div>
      <div v-if="startError" class="warn">{{ startError }}</div>
      <div v-if="actionError" class="warn">GitLab: {{ actionError }}</div>
      <div v-if="notice" class="notice">{{ notice }}<button class="linkbtn" @click="notice = null">Dismiss</button></div>
      <div v-if="drafts.length" class="reviewbar">
        <span class="rvdot" />
        <b>Review</b>
        <span class="muted">{{ drafts.length }} pending {{ drafts.length === 1 ? 'comment' : 'comments' }}, visible only to you</span>
        <button class="btn sm" @click="isReviewListOpen = !isReviewListOpen">{{ isReviewListOpen ? 'Hide' : 'Show' }}</button>
        <span class="grow" />
        <button class="btn sm primary" :disabled="!!busyAction || isGone" @click="runReview({ kind: 'submit-review', count: drafts.length })">
          <Icon name="send" :size="13" />{{ busyAction === 'submit-review' ? 'Submitting…' : 'Submit review' }}
        </button>
      </div>
      <div v-if="drafts.length && isReviewListOpen" class="reviewlist">
        <div v-for="d in sortedDrafts" :key="d.id" class="rvitem">
          <button class="rvwhere" :title="d.anchor ? 'Open this line in Changes' : 'Scroll to this thread'" @click="openDraft(d)">{{ draftWhere(d) }}</button>
          <template v-if="editKey === `d:${d.id}`">
            <textarea v-model="editText" rows="3" />
            <div class="crow">
              <button class="btn sm" @click="editKey = null">Cancel</button>
              <button class="btn sm primary" :disabled="!editText.trim() || !!busyAction" @click="saveDraftEdit(d.id)">Save</button>
            </div>
          </template>
          <div v-else class="md" v-html="draftHtml[d.id]" />
          <div v-if="editKey !== `d:${d.id}`" class="rvbtns">
            <button class="linkbtn" @click="startEdit(`d:${d.id}`, d.body)">Edit</button>
            <button class="linkbtn danger" :disabled="!!busyAction" @click="runReview({ kind: 'draft-delete', id: d.id })">Delete</button>
          </div>
        </div>
      </div>
    </header>

    <div v-show="tab !== 'server'" ref="panes" class="panes">
      <section v-show="tab === 'changes' && isCodeOpen" class="pane code" :style="isBothOpen ? { flex: 'none', width: `${codeWidth}px`, maxWidth: 'calc(100% - 360px)' } : undefined">
        <CodeView
          ref="codeView"
          :cwd="codeCwd"
          :ticket-key="row.ticket ?? `MR-${row.iid}`"
          :branch-ref="{ source: row.sourceBranch, target: row.targetBranch }"
          :ticket-title="row.title"
          :can-ask="mode === 'attach'"
          :source-session-id="session?.id ?? null"
          :comments="codeComments"
          :commentable="commentable"
          :review="runReview"
          @ask="askClaude"
          @version="openVersion"
          @file-shown="checkCommentable"
        />
      </section>
      <section v-show="tab === 'overview'" class="pane doc" :style="isOverviewClaudeOpen ? { flex: 'none', width: `${docWidth}px`, maxWidth: 'calc(100% - 360px)' } : undefined">
        <div class="ov">
          <div class="ovmain">
            <p v-if="status === null" class="muted">Loading…</p>
            <template v-else-if="overview">
              <div class="byline">
                <span v-if="overview.isDraft" class="draft">Draft</span>
                <b>{{ overview.author }}</b> requested to merge <a class="bpill" :href="branchUrl(row.sourceBranch)" target="_blank">{{ row.sourceBranch }}</a> into <a class="bpill" :href="branchUrl(row.targetBranch)" target="_blank">{{ row.targetBranch }}</a>
                <span class="muted inline">{{ ago(Date.parse(overview.createdAt)) }}</span>
              </div>
              <div v-if="isDescEditing" class="descedit">
                <div class="seg">
                  <button :class="{ on: !isDescPreview }" @click="isDescPreview = false">Write</button>
                  <button :class="{ on: isDescPreview }" @click="isDescPreview = true">Preview</button>
                </div>
                <div v-if="isDescPreview" class="md" v-html="descPreview" />
                <textarea v-else v-model="descText" rows="14" spellcheck="true" />
                <div class="crow">
                  <button class="btn sm" @click="isDescEditing = false">Cancel</button>
                  <button class="btn sm primary" :disabled="!!busyAction" @click="saveDesc">{{ busyAction === 'edit-text' ? 'Saving…' : 'Save description' }}</button>
                </div>
              </div>
              <template v-else>
                <div v-if="descriptionHtml" :key="`desc${mediaTick}`" class="md" @error.capture="onMediaError" @click.capture="onMediaClick" v-html="descriptionHtml" />
                <p v-else class="muted">No description.</p>
                <button class="linkbtn" :disabled="isGone" @click="startDescEdit">Edit description</button>
              </template>

              <div class="widgets">
                <div class="w">
                  <span class="wicon" :style="{ color: PIPELINE_COLOR[overview.pipeline?.status ?? ''] ?? '#6f6f6f' }"><Icon name="check" :size="16" /></span>
                  <div class="wbody">
                    <template v-if="overview.pipeline">
                      <b>Pipeline <a :href="overview.pipeline.url" target="_blank">#{{ overview.pipeline.id }}</a> {{ overview.pipeline.status }}</b>
                      <small>for <code>{{ overview.pipeline.sha }}</code> on {{ row.sourceBranch }}<template v-if="overview.pipeline.coverage"> · test coverage {{ overview.pipeline.coverage }}%</template></small>
                    </template>
                    <b v-else class="dim">No pipeline</b>
                  </div>
                </div>
                <div class="w">
                  <span class="wicon" :style="{ color: status?.approvals?.approvedBy.length ? '#3dd68c' : '#6f6f6f' }"><Icon name="user" :size="16" /></span>
                  <button
                    v-if="!isMine || status?.approvals?.isApprovedByMe"
                    class="btn sm"
                    :class="{ approved: status?.approvals?.isApprovedByMe }"
                    :disabled="!!busyAction || isGone"
                    @click="runAction(status?.approvals?.isApprovedByMe ? 'unapprove' : 'approve')"
                  >
                    <Icon name="check" :size="13" />{{ status?.approvals?.isApprovedByMe ? 'Revoke approval' : 'Approve' }}
                  </button>
                  <div class="wbody">
                    <div v-if="status?.approvals?.approvedBy.length" class="approvers">
                      <span class="by">Approved by</span>
                      <span v-for="a in status.approvals.approvedBy" :key="a" class="person"><span class="av sm">{{ initials(a) }}</span>{{ a }}</span>
                      <span v-if="status.approvals.left" class="by">· {{ status.approvals.left }} more needed</span>
                    </div>
                    <b v-else>{{ approvalText ?? 'Approvals unknown' }}</b>
                  </div>
                </div>
                <div class="w merge">
                  <span class="wicon" :style="{ color: hint.isReady ? '#3dd68c' : '#e8b84a' }"><Icon name="pr" :size="16" /></span>
                  <div class="wbody">
                    <b>{{ hint.text }}</b>
                    <div class="opts">
                      <label><input v-model="isSourceRemoved" type="checkbox" />Delete source branch</label>
                      <label><input v-model="isSquash" type="checkbox" />Squash commits</label>
                    </div>
                    <small v-if="status?.state?.behind">{{ status.state.behind }} commits behind {{ row.targetBranch }}</small>
                    <div class="wbtns">
                      <button
                        class="btn sm mergebtn"
                        :disabled="!!busyAction || isGone || !hint.isReady || (status?.state ? !status.state.canMerge : true)"
                        @click="runAction('merge')"
                      >
                        {{ busyAction === 'merge' ? 'Merging…' : 'Merge' }}
                      </button>
                      <button class="btn sm" :disabled="!!busyAction || isGone" @click="runAction('rebase')">
                        <Icon name="refresh" :size="13" />{{ busyAction === 'rebase' ? 'Rebasing…' : 'Rebase' }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <h2 class="acth">Activity</h2>
              <p v-if="status.discussions === null" class="muted">Could not load the activity.</p>
              <template v-for="d in threads" :key="d.id">
                <div v-if="d.isSystem" class="sys">
                  <i />
                  <b>{{ d.notes[0].author }}</b>
                  <span class="md inline" v-html="noteHtml[d.notes[0].id]" />
                  <span class="when">{{ ago(Date.parse(d.notes[0].createdAt)) }}</span>
                </div>
                <button v-else-if="d.isResolved && !expandedResolved.has(d.id)" class="collapsed" @click="toggleResolved(d.id)">
                  <Icon name="check" :size="13" />
                  <span class="cwhere">{{ d.where ?? 'Thread' }}</span>
                  <span class="cwho">{{ d.notes[0].author }}: {{ d.notes[0].body.split(String.fromCharCode(10))[0] }}</span>
                  <span class="ccount">{{ d.notes.length }} {{ d.notes.length === 1 ? 'comment' : 'comments' }}</span>
                  <Icon name="chevronRight" :size="13" />
                </button>
                <article v-else :id="`thread-${d.id}`" class="thread" :class="{ resolved: d.isResolved }" @click="onThreadClick($event, d.anchor?.path ?? null, d.anchor?.line ?? null)">
                  <div v-if="d.where || d.isResolvable" class="thead">
                    <code v-if="d.where">{{ d.where }}</code>
                    <span v-if="d.isResolvable" class="rs" :class="{ done: d.isResolved }">{{ d.isResolved ? 'resolved' : 'open' }}</span>
                    <button v-if="d.isResolved" class="collapse" @click="toggleResolved(d.id)">Hide</button>
                    <button
                      v-if="d.isResolvable"
                      class="btn sm resolvebtn"
                      :disabled="!!busyAction || isGone"
                      @click="runReview({ kind: 'resolve', discussionId: d.id, isResolved: !d.isResolved })"
                    >
                      <Icon name="check" :size="12" />{{ d.isResolved ? 'Unresolve' : 'Resolve' }}
                    </button>
                  </div>
                  <div v-if="d.snippet" class="snip">
                    <div v-for="(r, i) in d.snippet.rows" :key="i" class="sl" :class="{ hit: r.isHit, add: r.mark === '+', del: r.mark === '-' }"><span class="ln">{{ r.no ?? '' }}</span><span class="mk">{{ r.mark }}</span>{{ r.text }}</div>
                  </div>
                  <div v-for="n in d.notes" :key="n.id" class="note">
                    <span class="av">{{ initials(n.author) }}</span>
                    <div class="nbody">
                      <div class="nhead">
                        <b>{{ n.author }}</b><span>{{ ago(Date.parse(n.createdAt)) }}</span>
                        <template v-if="n.isMine && editKey !== `n:${n.id}`">
                          <button class="linkbtn" @click="startEdit(`n:${n.id}`, n.body)">Edit</button>
                          <button class="linkbtn danger" :disabled="!!busyAction" @click="runReview({ kind: 'note-delete', discussionId: d.id, noteId: n.id })">Delete</button>
                        </template>
                      </div>
                      <template v-if="editKey === `n:${n.id}`">
                        <textarea v-model="editText" rows="3" />
                        <div class="crow">
                          <button class="btn sm" @click="editKey = null">Cancel</button>
                          <button class="btn sm primary" :disabled="!editText.trim() || !!busyAction" @click="saveNoteEdit(d.id, n.id)">Save</button>
                        </div>
                      </template>
                      <div v-else :key="`n${n.id}-${mediaTick}`" class="md" @error.capture="onMediaError" @click.capture="onMediaClick" v-html="noteHtml[n.id]" />
                    </div>
                  </div>
                  <div v-for="p in draftsForThread(drafts, d.id)" :key="`p${p.id}`" class="note pending">
                    <span class="av">…</span>
                    <div class="nbody">
                      <div class="nhead">
                        <b>You</b><span class="pendtag">Pending</span>
                        <template v-if="editKey !== `d:${p.id}`">
                          <button class="linkbtn" @click="startEdit(`d:${p.id}`, p.body)">Edit</button>
                          <button class="linkbtn danger" :disabled="!!busyAction" @click="runReview({ kind: 'draft-delete', id: p.id })">Delete</button>
                        </template>
                      </div>
                      <template v-if="editKey === `d:${p.id}`">
                        <textarea v-model="editText" rows="3" />
                        <div class="crow">
                          <button class="btn sm" @click="editKey = null">Cancel</button>
                          <button class="btn sm primary" :disabled="!editText.trim() || !!busyAction" @click="saveDraftEdit(p.id)">Save</button>
                        </div>
                      </template>
                      <div v-else class="md" v-html="draftHtml[p.id]" />
                    </div>
                  </div>
                  <details v-if="explanationHtml[d.id]" class="explain">
                    <summary>Wyjaśnienie <span>only you see this, it is not part of the reply</span></summary>
                    <div class="md" v-html="explanationHtml[d.id]" />
                  </details>
                  <div class="replyrow">
                    <template v-if="replyTo === d.id">
                      <textarea v-model="reply" rows="3" placeholder="Reply…" />
                      <div class="crow">
                        <button class="btn sm" @click="replyTo = null">Cancel</button>
                        <button class="btn sm" :disabled="!reply.trim() || !!busyAction" title="Save as a pending draft note; publish it with Submit review" @click="addReplyDraft(d.id)">Add to review</button>
                        <button class="btn sm primary" :disabled="!reply.trim() || !!busyAction" @click="postReply(d.id)">
                          {{ busyAction === 'reply' ? 'Posting…' : 'Post reply' }}
                        </button>
                      </div>
                    </template>
                    <button v-else class="replybtn" @click="(replyTo = d.id), (reply = '')">Reply…</button>
                  </div>
                </article>
              </template>
              <div v-for="p in generalDrafts(drafts)" :key="`g${p.id}`" class="note pending general">
                <span class="av">…</span>
                  <div class="nbody">
                    <div class="nhead">
                      <b>You</b><span class="pendtag">Pending</span>
                      <template v-if="editKey !== `d:${p.id}`">
                        <button class="linkbtn" @click="startEdit(`d:${p.id}`, p.body)">Edit</button>
                        <button class="linkbtn danger" :disabled="!!busyAction" @click="runReview({ kind: 'draft-delete', id: p.id })">Delete</button>
                      </template>
                    </div>
                    <template v-if="editKey === `d:${p.id}`">
                      <textarea v-model="editText" rows="3" />
                      <div class="crow">
                        <button class="btn sm" @click="editKey = null">Cancel</button>
                        <button class="btn sm primary" :disabled="!editText.trim() || !!busyAction" @click="saveDraftEdit(p.id)">Save</button>
                      </div>
                    </template>
                    <div v-else class="md" v-html="draftHtml[p.id]" />
                  </div>
              </div>
              <div id="mr-composer" class="composer">
                <textarea v-model="comment" rows="4" placeholder="Write a comment on this merge request" spellcheck="true" />
                <div class="crow">
                  <span class="muted small">You confirm before it is posted.</span>
                  <button class="btn" :disabled="!comment.trim() || !!busyAction" title="Save as a pending draft note; publish it with Submit review" @click="addGeneralDraft">Add to review</button>
                  <button class="btn primary" :disabled="!comment.trim() || !!busyAction" @click="postComment">
                    <Icon name="send" :size="13" />{{ busyAction === 'comment' ? 'Posting…' : 'Comment' }}
                  </button>
                </div>
              </div>
            </template>
            <p v-else class="muted">Could not load the merge request{{ status.problem ? `: ${status.problem}` : '' }}.</p>
          </div>
          <aside v-if="overview" class="ovside">
            <div class="sb">
              <h4>Assignees</h4>
              <p v-for="a in overview.assignees" :key="a"><span class="av sm">{{ initials(a) }}</span>{{ a }}</p>
              <p v-if="!overview.assignees.length" class="muted small">None</p>
            </div>
            <div class="sb">
              <h4>Reviewers</h4>
              <p v-for="r in overview.reviewers" :key="r"><span class="av sm">{{ initials(r) }}</span>{{ r }}</p>
              <p v-if="!overview.reviewers.length" class="muted small">None</p>
            </div>
            <div class="sb">
              <h4>Labels</h4>
              <div class="labels">
                <span v-for="l in overview.labels" :key="l" class="label">{{ l }}</span>
              </div>
              <p v-if="!overview.labels.length" class="muted small">None</p>
            </div>
            <div class="sb">
              <h4>Milestone</h4>
              <p :class="{ 'muted small': !overview.milestone }">{{ overview.milestone ?? 'None' }}</p>
            </div>
          </aside>
        </div>
      </section>
      <Splitter v-if="isSplit" @resize="resizeLeft" @done="saveLeftWidth" />
    <section v-show="isClaudeShown" class="pane claude">
      <div v-if="paneSessions.length > 1" class="stabs">
        <button
          v-for="t in paneSessions"
          :key="t.session.id"
          :class="{ on: t.session.id === session?.id }"
          :title="`${t.session.name ?? t.session.projectName} · ${t.session.status}`"
          @click="pickedSessionId = t.session.id"
        >
          <i :class="{ live: t.session.isLive }" />{{ t.label }}
        </button>
      </div>
      <div v-if="isAddressPending" class="pending"><span class="spin" />Starting a Claude session for the review comments. It opens here when it is ready.</div>
      <ClaudeTerminal
        v-if="session"
        ref="terminal"
        :key="`${session.id}-${terminalTick}`"
        :session-id="session.id"
        :project-name="session.projectName"
        @mode="mode = $event"
        @exited="remountTerminal"
        @focus-vscode="focusVscode"
      />
      <div v-else-if="isMine" class="empty">
        <Icon name="bot" :size="34" />
        <p>No Claude session worked on {{ row.ticket ?? 'this ticket' }}. Start one from the ticket in My tickets.</p>
      </div>
      <div v-else-if="row.sessionId" class="empty"><span class="spin" />Waiting for the review session to appear…</div>
      <div v-else class="empty">
        <Icon name="pr" :size="34" />
        <p>No review yet. Claude reviews this MR in its own worktree, so your checkout stays untouched.</p>
        <button class="btn primary" :disabled="isStarting || isGone" @click="review"><Icon name="play" :size="13" />Review</button>
      </div>
      <QuickActions :session-id="session?.id ?? null" :mode="mode" :take-over="takeOverHere" :extra="isMine ? [] : REVIEW_ACTIONS" :values="actionValues" :stage="isMine ? (taskStage ?? 'mr') : null" />
    </section>
    </div>

    <section v-show="tab === 'server'" class="pane">
      <ServerPanel v-if="serverCwd" :key="serverCwd" :ticket-key="serverKey" :cwd="serverCwd" :servers="servers ?? []" />
      <p v-else class="muted pad">Looking for the folder with {{ row.sourceBranch }}…</p>
    </section>

    <template v-if="versionPopup">
      <div class="vscrim" @click="versionPopup = null" />
      <div class="vpop" role="dialog">
        <header class="vhead">
          <Icon name="diff" :size="15" />
          <b>{{ versionPopup.title }}</b>
          <span class="grow" />
          <button v-if="isPopupTrimmed" class="btn sm" @click="versionPopup.isWhole = !versionPopup.isWhole">{{ versionPopup.isWhole ? 'Only the thread lines' : 'Show whole diff' }}</button>
          <button class="iconbtn" title="Close" @click="versionPopup = null"><Icon name="close" :size="15" /></button>
        </header>
        <div class="vbody">
          <p v-if="!versionPopup.data" class="muted">Loading the change…</p>
          <p v-else-if="!versionPopup.data.files.length" class="muted">No change found{{ versionPopup.data.problem ? `: ${versionPopup.data.problem}` : '' }}.</p>
          <p v-else-if="versionPopup.data.problem" class="muted small">{{ versionPopup.data.problem }}</p>
          <section v-for="f in versionPopup.data?.files ?? []" :key="f.path" class="vfile">
            <h4>{{ f.path }}</h4>
            <div class="vdiff">
              <div v-for="(r, i) in popupRows(f.rows)" :key="i" class="vr" :class="{ add: r.kind === '+', del: r.kind === '-', hunk: r.kind === 'hunk', hit: !!versionPopup?.line && r.new === versionPopup.line }">
                <span class="ln">{{ r.old ?? '' }}</span><span class="ln">{{ r.new ?? '' }}</span><span class="mk">{{ r.kind === 'hunk' ? '' : r.kind }}</span>{{ r.text }}
              </div>
            </div>
          </section>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.view {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-1);
}
.head {
  flex: none;
  padding: 0 16px;
  background: var(--bg-1);
  border-bottom: 1px solid var(--line);
}
.line {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  height: 48px;
  font-size: 12px;
}
.proj {
  flex: none;
  color: var(--text-3);
}
.iid {
  flex: none;
  font: 600 13px var(--font-mono);
  color: var(--text-2);
  text-decoration: none;
}
.iid:hover {
  color: var(--accent);
}
.pill {
  flex: none;
  padding: 0 8px;
  font-size: 11px;
  line-height: 18px;
  color: var(--c);
  border: 1px solid var(--c);
  border-radius: 9px;
}
.title {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 600 15px var(--font-ui);
  color: var(--text);
}
.grow {
  flex: 1;
}
.fact {
  flex: none;
  font-size: 12px;
  color: var(--text-4);
  white-space: nowrap;
}
.line .fact {
  font-family: var(--font-mono);
  color: var(--text-3);
}
.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-height: 42px;
}
.tabs {
  display: flex;
  gap: 4px;
  align-self: stretch;
}
.tabs button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  font: 500 13px var(--font-ui);
  color: var(--text-4);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
}
.tabs button:hover {
  color: var(--text-2);
}
.tabs button.on {
  color: var(--text);
  border-bottom-color: var(--accent);
}
.count {
  padding: 0 6px;
  font-size: 11px;
  line-height: 16px;
  color: var(--text-3);
  background: var(--bg-4);
  border-radius: 8px;
}
.sub {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  margin-left: 10px;
  overflow: hidden;
  white-space: nowrap;
  font-size: 12px;
  color: var(--text-4);
}
.sub .icon:not(:first-child) {
  margin-left: 8px;
}
.sub code {
  font: 12px var(--font-mono);
  color: var(--text-3);
}
.arrow {
  color: var(--text-5);
}
.btn {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  box-sizing: border-box;
  font: 500 12.5px var(--font-ui);
  color: var(--text-2);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 7px;
  cursor: pointer;
  text-decoration: none;
}
.btn:hover:not(:disabled),
.btn:focus-visible {
  color: var(--text);
  background: var(--bg-4);
  border-color: var(--line-3);
  outline: none;
}
.btn.primary {
  font-weight: 600;
  color: var(--on-accent);
  background: var(--accent);
  border-color: var(--accent);
}
.btn.primary:hover:not(:disabled) {
  color: var(--on-accent);
  background: var(--accent-hover);
}
.btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.stop {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 10px;
  font: 500 12.5px var(--font-ui);
  color: var(--danger);
  background: none;
  border: 1px solid var(--danger-line);
  border-radius: 7px;
  cursor: pointer;
}
.stop:hover:not(:disabled) {
  background: var(--danger-soft);
  border-color: var(--danger);
}
.stop:disabled {
  color: var(--text-5);
  border-color: var(--line);
  cursor: default;
}
.warn {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--warn);
}
.status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 16px;
  margin: -6px 0 8px;
  font-size: 12px;
  color: var(--text-3);
}
.st {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.st i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.st.ok {
  color: var(--ok);
}
.st.bad {
  color: var(--danger);
}
.st.warn {
  color: var(--warn);
}
.btn.approved {
  color: var(--ok);
  border-color: var(--ok-line);
  background: rgba(61, 214, 140, 0.08);
}
.btn.merge:not(:disabled) {
  color: var(--accent);
  border-color: rgba(61, 214, 140, 0.4);
}
.ov {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 1180px;
  padding: 20px 24px 40px;
}
.ovmain {
  flex: 1;
  min-width: 0;
}
.ovside {
  order: -1;
  display: flex;
  flex-wrap: wrap;
  gap: 0 32px;
  border-bottom: 1px solid var(--line);
}
.ovside .sb {
  border-bottom: none;
  padding: 0 0 10px;
}
.byline {
  margin-bottom: 14px;
  font-size: 13px;
  color: var(--text-3);
}
.byline b {
  color: var(--text);
}
.byline code {
  padding: 1px 6px;
  font: 12px var(--font-mono);
  color: var(--info);
  background: var(--info-soft);
  border-radius: 5px;
}
.draft {
  margin-right: 6px;
  padding: 1px 7px;
  font-size: 11px;
  color: var(--warn);
  border: 1px solid var(--warn);
  border-radius: 9px;
}
.inline {
  display: inline;
  margin: 0 0 0 4px;
}
.md {
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--text-2);
  overflow-wrap: anywhere;
  user-select: text;
}
.md :deep(p) {
  margin: 0 0 10px;
}
.md :deep(a) {
  color: var(--info);
  text-decoration: none;
}
.md :deep(a:hover) {
  text-decoration: underline;
}
.md :deep(h1),
.md :deep(h2),
.md :deep(h3),
.md :deep(h4) {
  margin: 16px 0 8px;
  font-size: 15px;
  color: var(--text);
}
.md :deep(code) {
  padding: 1px 5px;
  font: 12.5px var(--font-mono);
  background: var(--bg-3);
  border-radius: 4px;
}
.md :deep(pre) {
  overflow-x: auto;
  padding: 10px 12px;
  background: var(--bg-editor);
  border: 1px solid var(--line);
  border-radius: 7px;
}
.md :deep(pre code) {
  padding: 0;
  background: none;
}
.md :deep(table) {
  width: 100%;
  margin: 8px 0 12px;
  border-collapse: collapse;
}
.md :deep(th),
.md :deep(td) {
  padding: 6px 10px;
  text-align: left;
  vertical-align: top;
  border: 1px solid var(--line-2);
}
.md :deep(th) {
  color: var(--text);
  background: var(--bg-2);
}
.md :deep(img),
.md :deep(video) {
  display: block;
  max-width: 100%;
  max-height: 420px;
  border-radius: 6px;
}
.md :deep(blockquote) {
  margin: 8px 0;
  padding: 2px 12px;
  color: var(--text-3);
  border-left: 3px solid var(--line-3);
}
.md :deep(details) {
  margin: 6px 0;
}
.md :deep(summary) {
  cursor: pointer;
  color: var(--text);
}
.md :deep(ul),
.md :deep(ol) {
  margin: 4px 0 10px;
  padding-left: 22px;
}
.md :deep(.mediafail) {
  display: inline-block;
  margin: 4px 0;
  padding: 6px 10px;
  color: var(--warn);
  background: var(--warn-soft);
  border-radius: 6px;
}
.md :deep(.mediasignin) {
  padding: 0;
  font: inherit;
  color: inherit;
  text-decoration: underline;
  background: none;
  border: 0;
  cursor: pointer;
}
.md.inline :deep(p) {
  display: inline;
  margin: 0;
}
.widgets {
  margin: 20px 0 28px;
  border: 1px solid var(--line-2);
  border-radius: 10px;
  overflow: hidden;
}
.w {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  background: var(--bg-2);
}
.w + .w {
  border-top: 1px solid var(--line);
}
.wicon {
  flex: none;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: 2px solid currentColor;
  border-radius: 50%;
}
.wbody {
  flex: 1;
  min-width: 0;
  padding-top: 3px;
}
.wbody b {
  display: block;
  font-size: 13px;
  color: var(--text);
}
.wbody b.dim {
  color: var(--text-4);
}
.wbody a {
  color: var(--info);
  text-decoration: none;
}
.wbody small {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-4);
}
.wbody small code {
  font: 11.5px var(--font-mono);
}
.opts {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin-top: 8px;
  font-size: 12.5px;
  color: var(--text-2);
}
.opts label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.opts input {
  margin: 0;
  accent-color: var(--accent);
}
.wbtns {
  display: flex;
  gap: 6px;
  margin-top: 10px;
}
.btn.sm {
  height: 28px;
  padding: 0 11px;
}
.btn.mergebtn:not(:disabled) {
  font-weight: 600;
  color: var(--on-accent);
  background: var(--accent);
  border-color: var(--accent);
}
.acth {
  margin: 0 0 12px;
  font: 600 15px var(--font-ui);
  color: var(--text);
}
.sys {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 0 0 10px 6px;
  font-size: 12.5px;
  color: var(--text-3);
}
.sys i {
  flex: none;
  width: 8px;
  height: 8px;
  margin-right: 4px;
  border-radius: 50%;
  background: var(--line-3);
}
.sys b {
  color: var(--text-2);
}
.sys .when {
  flex: none;
  color: var(--text-4);
}
.srvchip {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  max-width: 260px;
  padding: 0 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 12px var(--font-mono);
  color: var(--ok);
  background: rgba(61, 214, 140, 0.08);
  border: 1px solid var(--ok-line);
  border-radius: 13px;
  cursor: pointer;
}
.srvchip i {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ok);
}
.srvchip:hover {
  border-color: var(--ok);
}
.collapsed {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin-bottom: 8px;
  padding: 8px 12px;
  text-align: left;
  font: 12.5px var(--font-ui);
  color: var(--text-4);
  background: var(--bg-1);
  border: 1px dashed var(--line-2);
  border-radius: 8px;
  cursor: pointer;
}
.collapsed:hover {
  color: var(--text-2);
  border-color: var(--line-3);
}
.collapsed .icon:first-child {
  color: var(--ok);
}
.cwhere {
  flex: none;
  font: 12px var(--font-mono);
  color: var(--text-3);
}
.cwho {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ccount {
  flex: none;
}
.collapse {
  padding: 0 4px;
  font: 12px var(--font-ui);
  color: var(--text-4);
  background: none;
  border: none;
  cursor: pointer;
}
.iconbtn {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  color: var(--text-4);
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.iconbtn:hover {
  color: var(--text);
  background: var(--bg-3);
}
.vscrim {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(0, 0, 0, 0.55);
}
.vpop {
  position: fixed;
  top: 6vh;
  left: 50%;
  z-index: 51;
  display: flex;
  flex-direction: column;
  width: min(1000px, 92vw);
  max-height: 86vh;
  transform: translateX(-50%);
  background: var(--bg-1);
  border: 1px solid var(--line-2);
  border-radius: 12px;
  box-shadow: var(--shadow);
}
.vhead {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 10px 10px 16px;
  font-size: 13px;
  color: var(--text);
  border-bottom: 1px solid var(--line);
}
.vhead b {
  font-family: var(--font-mono);
  font-weight: 600;
}
.vbody {
  overflow: auto;
  padding: 12px 16px 18px;
}
.vfile h4 {
  margin: 8px 0 6px;
  font: 600 12.5px var(--font-mono);
  color: var(--text-2);
}
.vdiff {
  padding: 4px 0;
  font: 12.5px/1.6 var(--font-mono);
  color: #cccccc;
  background: var(--bg-editor);
  border: 1px solid var(--line);
  border-radius: 7px;
  overflow-x: auto;
}
.vr {
  padding-right: 12px;
  white-space: pre;
}
.vr.add {
  background: rgba(61, 214, 140, 0.12);
}
.vr.del {
  background: rgba(242, 112, 106, 0.12);
}
.vr.hunk {
  color: var(--info);
  background: var(--info-soft);
}
.vr .ln {
  display: inline-block;
  width: 40px;
  padding-right: 8px;
  text-align: right;
  color: var(--text-5);
  user-select: none;
}
.vr .mk {
  display: inline-block;
  width: 16px;
  color: var(--text-4);
}
.snip {
  margin: 8px 0 10px;
  padding: 6px 0;
  overflow-x: auto;
  font: 12.5px/1.6 var(--font-mono);
  color: #cccccc;
  background: var(--bg-editor);
  border: 1px solid var(--line);
  border-radius: 7px;
}
.sl {
  padding: 0 12px 0 0;
  white-space: pre;
}
.sl.add {
  background: rgba(61, 214, 140, 0.1);
}
.sl.del {
  background: rgba(242, 112, 106, 0.1);
}
.mk {
  display: inline-block;
  width: 14px;
  color: var(--text-4);
  user-select: none;
}
.sl.hit {
  background: rgba(232, 184, 74, 0.12);
  box-shadow: inset 3px 0 0 var(--warn);
}
.snip .ln {
  display: inline-block;
  width: 44px;
  margin-right: 12px;
  padding-right: 8px;
  text-align: right;
  color: var(--text-5);
  user-select: none;
}
.approvers {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding-top: 1px;
}
.approvers .by {
  font-size: 12.5px;
  color: var(--text-3);
}
.person {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px 2px 2px;
  font-size: 12.5px;
  color: var(--text);
  background: var(--bg-4);
  border: 1px solid var(--line-2);
  border-radius: 14px;
}
.person .av.sm {
  margin-right: 6px;
  background: rgba(61, 214, 140, 0.18);
  color: var(--ok);
}
.draftbadge {
  flex: none;
  padding: 0 7px;
  font: 700 11px/19px var(--font-ui);
  color: var(--bg-0);
  background: var(--warn);
  border-radius: 5px;
}
.fact.jira {
  padding: 0;
  font: 600 12px var(--font-mono);
  color: var(--info);
  background: none;
  border: none;
  cursor: pointer;
}
.fact.jira:hover {
  text-decoration: underline;
}
.bref {
  font: 12px var(--font-mono);
  color: var(--text-3);
  text-decoration: none;
}
.bref:hover {
  color: var(--info);
  text-decoration: underline;
}
.bpill {
  padding: 1px 6px;
  font: 12px var(--font-mono);
  color: var(--info);
  background: var(--info-soft);
  border-radius: 5px;
  text-decoration: none;
}
.bpill:hover {
  text-decoration: underline;
}
.av {
  flex: none;
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  font: 600 11px var(--font-ui);
  color: var(--text);
  background: var(--bg-4);
  border-radius: 50%;
}
.av.sm {
  width: 22px;
  height: 22px;
  margin-right: 8px;
  font-size: 9.5px;
}
.note {
  display: flex;
  gap: 10px;
}
.nbody {
  flex: 1;
  min-width: 0;
}
.replyrow {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--line);
}
.replyrow textarea {
  box-sizing: border-box;
  width: 100%;
  padding: 8px 10px;
  font: 13px/1.5 var(--font-ui);
  color: var(--text);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 7px;
  outline: none;
  resize: vertical;
}
.replyrow .crow {
  justify-content: flex-end;
  gap: 6px;
}
.replybtn {
  width: 100%;
  padding: 6px 10px;
  text-align: left;
  font: 12.5px var(--font-ui);
  color: var(--text-4);
  background: var(--bg-3);
  border: 1px solid var(--line);
  border-radius: 7px;
  cursor: text;
}
.sb {
  padding: 12px 0;
  border-bottom: 1px solid var(--line);
}
.sb h4 {
  margin: 0 0 8px;
  font: 600 12.5px var(--font-ui);
  color: var(--text);
}
.sb p {
  display: flex;
  align-items: center;
  margin: 4px 0;
  font-size: 13px;
  color: var(--text-2);
}
.labels {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.label {
  padding: 1px 8px;
  font-size: 11.5px;
  color: var(--text);
  background: var(--bg-4);
  border-radius: 10px;
}
.thread {
  margin-bottom: 12px;
  padding: 10px 12px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 9px;
}
.thread.resolved {
  opacity: 0.6;
}
.thead {
  display: flex;
  align-items: center;
  gap: 8px;
}
.thead:empty {
  display: none;
}
.thead code {
  font: 12px var(--font-mono);
  color: var(--info);
}
.rs {
  margin-left: auto;
  padding: 0 7px;
  font-size: 11px;
  line-height: 17px;
  color: var(--warn);
  border: 1px solid var(--warn);
  border-radius: 9px;
}
.rs.done {
  color: var(--ok);
  border-color: var(--ok-line);
}
.note + .note {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--line);
}
.thead + .note {
  margin-top: 8px;
}
.nhead {
  display: flex;
  gap: 8px;
  font-size: 12px;
  color: var(--text-4);
}
.nhead b {
  color: var(--text);
}
.note p {
  margin: 4px 0 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-2);
  user-select: text;
}
.composer {
  margin-top: 16px;
}
.composer textarea {
  box-sizing: border-box;
  width: 100%;
  padding: 10px 12px;
  font: 13px/1.5 var(--font-ui);
  color: var(--text);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 8px;
  outline: none;
  resize: vertical;
}
.composer textarea:focus {
  border-color: var(--accent);
}
.crow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}
.small {
  margin: 0;
  font-size: 12px;
}
.panes {
  flex: 1;
  min-height: 0;
  display: flex;
}
.pane.claude {
  background: var(--bg-editor);
}
.stabs {
  flex: none;
  display: flex;
  gap: 2px;
  padding: 4px 6px;
  border-bottom: 1px solid var(--line);
}
.stabs button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 26px;
  padding: 0 11px;
  font: 500 12.5px var(--font-ui);
  color: var(--text-4);
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.stabs button:hover {
  color: var(--text-2);
  background: var(--bg-2);
}
.stabs button.on {
  color: var(--text);
  background: var(--bg-3);
}
.stabs i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #666d78;
}
.stabs i.live {
  background: var(--ok, #3fb950);
}
.seg {
  flex: none;
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  background: var(--bg-0);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.seg button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 10px;
  font: 500 12.5px var(--font-ui);
  color: var(--text-4);
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.seg button:hover {
  color: var(--text-2);
}
.seg button.on {
  color: var(--text);
  background: var(--bg-4);
}
.pane {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  text-align: center;
  color: var(--text-3);
}
.pending {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--text-2);
  background: var(--bg-2);
  border-bottom: 1px solid var(--line);
}
.spin {
  flex: none;
  width: 12px;
  height: 12px;
  border: 2px solid var(--line-2);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.doc {
  overflow-y: auto;
}
.docbody {
  max-width: 900px;
  padding: 20px 24px 40px;
}
h3 {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--text-3);
}
h3:not(:first-child) {
  margin-top: 22px;
}
.tot {
  margin-left: 6px;
  font-weight: 400;
}
.desc {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.55;
  font-size: 13px;
  color: var(--text-2);
}
.muted {
  color: var(--text-4);
}
.files {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--bg-4);
  border-radius: 8px;
}
.files li {
  display: flex;
  gap: 10px;
  padding: 6px 10px;
  font-size: 12px;
  border-top: 1px solid var(--bg-4);
}
.files li:first-child {
  border-top: none;
}
.path {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  font-family: var(--font-mono);
  color: var(--text-2);
}
.add {
  color: var(--ok);
}
.del {
  color: var(--danger);
}
.reviewbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  padding: 7px 12px;
  font-size: 12.5px;
  background: color-mix(in srgb, var(--accent) 8%, var(--bg-2));
  border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
  border-radius: 8px;
}
.rvdot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
}
.reviewlist {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 320px;
  margin-top: 6px;
  padding: 10px 12px;
  overflow-y: auto;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.rvitem {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--line);
}
.rvitem:last-child {
  padding-bottom: 0;
  border-bottom: none;
}
.rvitem textarea,
.nbody textarea,
.descedit textarea {
  box-sizing: border-box;
  width: 100%;
  padding: 8px 10px;
  font: 13px/1.5 var(--font-ui);
  color: var(--text);
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 7px;
  outline: none;
  resize: vertical;
}
.rvwhere {
  align-self: flex-start;
  padding: 0;
  font: 12px var(--font-mono);
  color: var(--accent);
  background: none;
  border: none;
  cursor: pointer;
}
.rvbtns {
  display: flex;
  gap: 10px;
}
.linkbtn {
  padding: 0;
  font: 12px var(--font-ui);
  color: var(--text-4);
  background: none;
  border: none;
  cursor: pointer;
}
.linkbtn:hover:not(:disabled) {
  color: var(--text);
}
.linkbtn.danger:hover:not(:disabled) {
  color: #f2706a;
}
.nhead .linkbtn {
  margin-left: 4px;
}
.note.pending {
  border-left: 2px dashed var(--accent);
}
.note.pending.general {
  margin: 0 0 10px;
}
.explain {
  margin: 4px 12px 8px 46px;
  padding: 6px 10px;
  background: var(--bg-2);
  border: 1px dashed var(--line-3);
  border-radius: 6px;
}
.explain summary {
  font: 600 12px var(--font-ui);
  color: var(--text-2);
  cursor: pointer;
}
.explain summary span {
  margin-left: 6px;
  font-weight: 400;
  color: var(--text-4);
}
.pendtag {
  padding: 0 6px;
  font-size: 11px;
  color: var(--accent);
  border: 1px dashed var(--accent);
  border-radius: 4px;
}
.resolvebtn {
  margin-left: auto;
}
.title.editable {
  cursor: text;
}
.title.editable:hover {
  text-decoration: underline dotted var(--text-4);
}
.titleedit {
  flex: 1;
  min-width: 0;
  padding: 3px 8px;
  font: 600 16px var(--font-ui);
  color: var(--text);
  background: var(--bg-3);
  border: 1px solid var(--accent);
  border-radius: 6px;
  outline: none;
}
.descedit {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.descedit .seg {
  align-self: flex-start;
}
.tabs .dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-left: 2px;
  border-radius: 50%;
  background: var(--ok);
}
.muted.pad {
  padding: 24px;
}
.draftlink {
  flex: none;
  font-size: 12px;
}
.btn.icon {
  width: 30px;
  padding: 0;
  justify-content: center;
}
.btn.icon.spinning :deep(svg) {
  animation: mrspin 0.8s linear infinite;
}
@keyframes mrspin {
  to {
    transform: rotate(360deg);
  }
}
.thread.flash,
.composer.flash {
  animation: threadflash 1.6s ease-out;
}
@keyframes threadflash {
  0%,
  40% {
    box-shadow: 0 0 0 2px var(--accent);
  }
  100% {
    box-shadow: 0 0 0 2px transparent;
  }
}
.notice {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  padding: 7px 12px;
  font-size: 12.5px;
  color: var(--text-2);
  background: var(--accent-soft);
  border-radius: 8px;
}
.vr.hit {
  box-shadow: inset 3px 0 0 var(--warn);
  background: var(--warn-soft);
}
</style>
