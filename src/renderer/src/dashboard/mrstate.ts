import { ref, computed, watch, onMounted, onBeforeUnmount, type Ref } from 'vue'
import type { CodeComment, DiffRow, MrCommentable, MrDiscussion, MrDraftNote, MrReviewAction, MrRow, MrStatus, MrVersionDiff, Session } from '../types'
import { sortDrafts, rowsAround } from './mrreview'
import { renderMarkdown, parseVersionLink } from './mrhtml'
import { filterThreads, type ThreadFilter } from './mrfilter'
import { writeSize } from './dashboard'

export const PIPELINE_COLOR: Record<string, string> = { success: '#3dd68c', failed: '#f2706a', running: '#6aa9ff', pending: '#e8b84a', canceled: '#9d9d9d' }

export const flashElement = (id: string): void => {
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  el.classList.add('flash')
  setTimeout(() => el.classList.remove('flash'), 1600)
}

export const useMrState = (row: Ref<MrRow>, myName: Ref<string | null | undefined>) => {
  const isMine = computed(() => !!myName.value && row.value.author === myName.value)
  const status = ref<MrStatus | null>(null)
  const busyAction = ref<string | null>(null)
  const actionError = ref<string | null>(null)
  const notice = ref<string | null>(null)
  const explanations = ref<Record<string, string>>({})
  const loadStatus = async (): Promise<void> => {
    const [next, notes] = await Promise.all([window.api.getMrStatus(row.value.key), window.api.getMrExplanations(row.value.key)])
    status.value = next
    explanations.value = notes
    recheckCommentable()
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
  const branchUrl = (branch: string): string => `${origin}/${row.value.projectPath}/-/tree/${branch.split('/').map(encodeURIComponent).join('/')}`
  const overview = computed(() => status.value?.overview ?? null)
  const noteHtml = computed<Record<number, string>>(() =>
    Object.fromEntries(threads.value.flatMap((d) => d.notes).map((n) => [n.id, renderMarkdown(n.body, origin, row.value.projectId)]))
  )
  const readThreadFilter = (): ThreadFilter => {
    try {
      const stored = localStorage.getItem('dash.mrThreadFilter')
      return stored === 'resolved' || stored === 'all' ? stored : 'open'
    } catch {
      return 'open'
    }
  }
  const threadFilter = ref<ThreadFilter>(readThreadFilter())
  const persistThreadFilter = (value: ThreadFilter): void => writeSize('dash.mrThreadFilter', value)
  watch(threadFilter, persistThreadFilter)
  const expandedResolved = ref<Set<string>>(new Set())
  const toggleResolved = (id: string): void => {
    const next = new Set(expandedResolved.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    expandedResolved.value = next
  }
  const isAddressing = ref(false)
  const addressSessionId = ref<string | null>(null)
  const startAddressing = async (): Promise<{ error: string | null; sessionId?: string }> => {
    isAddressing.value = true
    try {
      const result = await window.api.startAddress(row.value.key)
      if (result.sessionId) addressSessionId.value = result.sessionId
      return result
    } finally {
      isAddressing.value = false
    }
  }
  const isAddressPendingIn = (sessions: Session[]): boolean =>
    isAddressing.value || (!!addressSessionId.value && !sessions.some((s) => s.id.startsWith(addressSessionId.value as string)))
  const revealDraft = (d: MrDraftNote): string => {
    const replyTo = d.replyTo
    const isReplyTarget = (t: MrDiscussion): boolean => t.id === replyTo
    if (replyTo && !filterThreads(threads.value, drafts.value, threadFilter.value, true).some(isReplyTarget)) threadFilter.value = 'all'
    if (replyTo && threads.value.find((t) => t.id === replyTo)?.isResolved && !expandedResolved.value.has(replyTo)) toggleResolved(replyTo)
    return replyTo ? `thread-${replyTo}` : 'mr-composer'
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
    const data = await window.api.getMrVersionDiff(row.value.key, link.diffId, link.startSha, path)
    if (versionPopup.value) versionPopup.value = { ...versionPopup.value, data }
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
                notes: [{ author: 'You (pending)', body: p.body, html: renderMarkdown(p.body, origin, row.value.projectId) }]
              }
            ]
          : []
      )
    )
  )
  const drafts = computed<MrDraftNote[]>(() => status.value?.drafts ?? [])
  const sortedDrafts = computed(() => sortDrafts(drafts.value))
  const draftHtml = computed<Record<number, string>>(() =>
    Object.fromEntries(drafts.value.map((d) => [d.id, renderMarkdown(d.body, origin, row.value.projectId)]))
  )
  const explanationHtml = computed<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(explanations.value).map(([id, text]) => [id, renderMarkdown(text, origin, row.value.projectId)]))
  )
  const runReview = async (action: MrReviewAction): Promise<boolean> => {
    busyAction.value = action.kind
    actionError.value = null
    try {
      const result = await window.api.mrReview(row.value.key, action)
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
  const draftWhere = (d: MrDraftNote): string => {
    if (d.anchor) return `${d.anchor.path}:${d.anchor.line}`
    if (!d.replyTo) return 'General comment'
    const thread = threads.value.find((t) => t.id === d.replyTo)
    if (thread?.where) return `Reply on ${thread.where}`
    return thread ? `Reply to ${thread.notes[0]?.author ?? 'a thread'}` : 'Reply in a thread'
  }
  const isDraftMr = computed(() => overview.value?.isDraft ?? row.value.isDraft)
  const toggleDraft = (): void => {
    void runReview({ kind: 'set-draft', isDraft: !isDraftMr.value, title: row.value.title })
  }
  const isTitleEditing = ref(false)
  const titleText = ref('')
  const startTitleEdit = (): void => {
    titleText.value = row.value.title
    isTitleEditing.value = true
  }
  const saveTitle = async (): Promise<void> => {
    if (!titleText.value.trim() || titleText.value === row.value.title) {
      isTitleEditing.value = false
      return
    }
    if (await runReview({ kind: 'edit-text', title: titleText.value.trim() })) isTitleEditing.value = false
  }
  const commentable = ref<MrCommentable | null>(null)
  let shownFile: { path: string; folder: string | null; isReadOnly: boolean } | null = null
  const checkCommentable = async (path: string, folder: string | null, isReadOnly: boolean): Promise<void> => {
    shownFile = { path, folder, isReadOnly }
    commentable.value = null
    const result = await window.api.mrCommentable(row.value.key, folder, isReadOnly, path)
    if (shownFile?.path === path) commentable.value = result
  }
  const recheckCommentable = (): void => {
    if (shownFile) void checkCommentable(shownFile.path, shownFile.folder, shownFile.isReadOnly)
  }

  onMounted(() => {
    void loadStatus()
  })
  watch(
    () => row.value.sha,
    () => {
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
  onBeforeUnmount(() => {
    if (statusTimer) clearTimeout(statusTimer)
  })

  return {
    isMine,
    status,
    busyAction,
    actionError,
    notice,
    loadStatus,
    isRefreshingStatus,
    refreshStatus,
    approvalText,
    threads,
    openThreads,
    origin,
    branchUrl,
    overview,
    noteHtml,
    threadFilter,
    expandedResolved,
    toggleResolved,
    revealDraft,
    isAddressing,
    addressSessionId,
    startAddressing,
    isAddressPendingIn,
    versionPopup,
    popupRows,
    isPopupTrimmed,
    openVersion,
    codeComments,
    drafts,
    sortedDrafts,
    draftHtml,
    explanationHtml,
    runReview,
    editKey,
    editText,
    startEdit,
    saveDraftEdit,
    draftWhere,
    isDraftMr,
    toggleDraft,
    isTitleEditing,
    titleText,
    startTitleEdit,
    saveTitle,
    commentable,
    checkCommentable,
    recheckCommentable,
    scheduleStatus
  }
}

export type MrState = ReturnType<typeof useMrState>
