<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { MenuItem, MrReviewAction, MrRow } from '../types'
import { readFlag, writeSize } from './dashboard'
import { PIPELINE_COLOR, type MrState } from './mrstate'
import { draftsForThread, generalDrafts } from './mrreview'
import { filterThreads, threadCounts, noteLink, type ThreadFilter } from './mrfilter'
import MenuButton from './MenuButton.vue'
import { mergeHint } from './mrs'
import { renderGitlabHtml, renderMarkdown, toUploadWebUrl, isVideoUrl, parseVersionLink } from './mrhtml'
import Icon from './Icon.vue'
import MrHeaderControls from './MrHeaderControls.vue'
import { ago } from '../display'

const props = defineProps<{
  row: MrRow
  state: MrState
  isGone: boolean
  isHeaderShown?: boolean
  isAddressPending?: boolean
  openItems?: MenuItem[]
}>()
const emit = defineEmits<{ 'open-line': [path: string, line: number]; 'address-comments': [] }>()

const {
  isMine,
  status,
  busyAction,
  actionError,
  notice,
  loadStatus,
  approvalText,
  threads,
  origin,
  branchUrl,
  overview,
  noteHtml,
  threadFilter: filter,
  expandedResolved,
  toggleResolved,
  versionPopup,
  popupRows,
  isPopupTrimmed,
  openVersion,
  drafts,
  draftHtml,
  explanationHtml,
  runReview,
  editKey,
  editText,
  startEdit,
  saveDraftEdit
} = props.state

const headerOpenItems = computed<MenuItem[]>(
  () => props.openItems ?? [{ label: 'GitLab', hint: props.row.url, icon: 'external', run: () => window.open(props.row.url, '_blank') }]
)
const addressComments = (): void => emit('address-comments')
const openLine = (path: string, line: number): void => emit('open-line', path, line)
const comment = ref('')
const isSystemShown = ref(readFlag('dash.mrSystemShown'))
const setFilter = (next: ThreadFilter): void => {
  filter.value = next
}
const persistSystemShown = (value: boolean): void => writeSize('dash.mrSystemShown', value)
watch(isSystemShown, persistSystemShown)
const shownThreads = computed(() => filterThreads(threads.value, drafts.value, filter.value, isSystemShown.value, keptIds.value))
const counts = computed(() => threadCounts(threads.value, drafts.value))
const emptyText = computed(() => (filter.value === 'open' ? 'No open threads' : filter.value === 'resolved' ? 'No resolved threads' : 'No threads'))
const commitsText = computed(() => {
  const n = status.value?.commits ?? null
  return n === null ? '' : ` · ${n} ${n === 1 ? 'commit' : 'commits'}`
})
const copyNoteLink = (noteId: number): void => {
  void navigator.clipboard.writeText(noteLink(props.row.url, noteId))
}
const makeStartEdit = (key: string, body: string): (() => void) => {
  const runStartEdit = (): void => startEdit(key, body)
  return runStartEdit
}
const makeCopyNoteLink = (noteId: number): (() => void) => {
  const runCopyNoteLink = (): void => copyNoteLink(noteId)
  return runCopyNoteLink
}
const makeReview = (action: MrReviewAction): (() => void) => {
  const runReviewAction = (): void => void runReview(action)
  return runReviewAction
}
const makePostReply = (discussionId: string): (() => void) => {
  const runPostReply = (): void => void postReply(discussionId)
  return runPostReply
}
const noteMenu = (d: { id: string }, n: { id: number; body: string; isMine: boolean }): MenuItem[] => {
  const isBusy = !!busyAction.value
  const items: MenuItem[] = []
  if (n.isMine) items.push({ label: 'Edit', isDisabled: isBusy, run: makeStartEdit(`n:${n.id}`, n.body) })
  items.push({ label: 'Copy link', run: makeCopyNoteLink(n.id) })
  if (n.isMine) items.push({ label: 'Delete', isDisabled: isBusy, run: makeReview({ kind: 'note-delete', discussionId: d.id, noteId: n.id }) })
  return items
}
const draftMenu = (p: { id: number; body: string }): MenuItem[] => [
  { label: 'Edit', isDisabled: !!busyAction.value, run: makeStartEdit(`d:${p.id}`, p.body) },
  { label: 'Delete', isDisabled: !!busyAction.value, run: makeReview({ kind: 'draft-delete', id: p.id }) }
]
const postNowItems = (discussionId: string): MenuItem[] => [
  { label: 'Post now', isDisabled: !reply.value.trim() || !!busyAction.value, run: makePostReply(discussionId) }
]
const descriptionHtml = computed(() => {
  const ov = overview.value
  if (!ov) return ''
  return ov.descriptionHtml ? renderGitlabHtml(ov.descriptionHtml, origin, props.row.projectId) : ov.description ? renderMarkdown(ov.description, origin, props.row.projectId) : ''
})
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
const onThreadClick = (e: MouseEvent, path: string | null, line: number | null = null): void => {
  const a = (e.target as HTMLElement).closest('a')
  if (!a || !parseVersionLink(a.href)) return
  e.preventDefault()
  void openVersion(a.href, path, line)
}
const hint = computed(() => mergeHint(status.value?.state?.mergeStatus ?? 'checking'))
const isSquash = ref(false)
const isSourceRemoved = ref(true)
watch(
  () => overview.value?.pipeline?.id ?? overview.value?.createdAt,
  () => {
    if (!overview.value) return
    isSquash.value = overview.value.isSquash
    isSourceRemoved.value = overview.value.isSourceRemoved
  },
  { immediate: true }
)
const initials = (name: string): string =>
  name
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
const replyTo = ref<string | null>(null)
const resolveEditedThreadId = (): string | null => {
  const key = editKey.value
  if (!key) return null
  const id = Number(key.slice(2))
  if (key.startsWith('n:')) return threads.value.find((t) => t.notes.some((n) => n.id === id))?.id ?? null
  return drafts.value.find((p) => p.id === id)?.replyTo ?? null
}
const keptIds = computed(() => [replyTo.value, resolveEditedThreadId()].filter((id): id is string => !!id))
const reply = ref('')
const isReplyResolving = ref(true)
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
const saveNoteEdit = async (discussionId: string, noteId: number): Promise<void> => {
  if (await runReview({ kind: 'note-edit', discussionId, noteId, body: editText.value })) editKey.value = null
}
const addReplyDraft = async (discussionId: string): Promise<void> => {
  if (!(await runReview({ kind: 'draft-add', body: reply.value, replyTo: discussionId, isResolving: isReplyResolving.value }))) return
  reply.value = ''
  replyTo.value = null
}
const addGeneralDraft = async (): Promise<void> => {
  if (await runReview({ kind: 'draft-add', body: comment.value })) comment.value = ''
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
</script>

<template>
  <div v-if="isHeaderShown" class="ovhead">
    <MrHeaderControls :row="row" :state="state" :is-gone="isGone" :is-address-pending="isAddressPending ?? false" :open-items="headerOpenItems" @address-comments="addressComments" />
  </div>
  <div class="ov">
    <div class="ovmain">
      <p v-if="status === null" class="muted">Loading…</p>
      <template v-else-if="overview">
        <div class="byline">
          <span v-if="overview.isDraft" class="draft">Draft</span>
          <b>{{ overview.author }}</b> requested to merge <a class="bpill" :href="branchUrl(row.sourceBranch)" target="_blank">{{ row.sourceBranch }}</a> into <a class="bpill" :href="branchUrl(row.targetBranch)" target="_blank">{{ row.targetBranch }}</a>
          <span class="muted inline">{{ ago(Date.parse(overview.createdAt)) }}{{ commitsText }}</span>
        </div>
        <div class="meta">
          <span class="metaitem"><span class="metalabel">Assignees</span><span v-for="a in overview.assignees" :key="a" class="person"><span class="av sm">{{ initials(a) }}</span>{{ a }}</span><span v-if="!overview.assignees.length" class="muted">—</span></span>
          <span class="metaitem"><span class="metalabel">Reviewers</span><span v-for="r in overview.reviewers" :key="r" class="person"><span class="av sm">{{ initials(r) }}</span>{{ r }}</span><span v-if="!overview.reviewers.length" class="muted">—</span></span>
          <span v-if="overview.labels.length" class="metaitem"><span v-for="l in overview.labels" :key="l" class="label">{{ l }}</span></span>
          <span class="metaitem"><span class="metalabel">Milestone</span><span :class="{ muted: !overview.milestone }">{{ overview.milestone ?? '—' }}</span></span>
        </div>
        <h2 class="acth">Description</h2>
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

        <h2 class="acth">Merge</h2>
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

        <div class="actbar">
          <h2 class="acth">Activity</h2>
          <div class="seg">
            <button :class="{ on: filter === 'open' }" @click="setFilter('open')">Open {{ counts.open }}</button>
            <button :class="{ on: filter === 'resolved' }" @click="setFilter('resolved')">Resolved {{ counts.resolved }}</button>
            <button :class="{ on: filter === 'all' }" @click="setFilter('all')">All</button>
          </div>
          <span class="grow" />
          <label class="opts sysopt"><input v-model="isSystemShown" type="checkbox" />zdarzenia systemowe</label>
        </div>
        <p v-if="status.discussions === null" class="muted">Could not load the activity.</p>
        <p v-else-if="!shownThreads.length" class="muted emptythreads">
          {{ emptyText }}
          <button v-if="filter !== 'all'" class="linkbtn" @click="setFilter('all')">Show all</button>
        </p>
        <template v-for="d in shownThreads" :key="d.id">
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
            <div class="thead">
              <code v-if="d.where && d.anchor?.side === 'new'" class="golink" title="Show in code" @click.stop="openLine(d.anchor.path, d.anchor.line)">{{ d.where }}</code>
              <code v-else-if="d.where">{{ d.where }}</code>
              <span v-else class="general">General</span>
              <span v-if="d.isResolvable" class="rs" :class="{ done: d.isResolved }">{{ d.isResolved ? 'resolved' : 'open' }}</span>
              <span class="tcount">{{ d.notes.length }} {{ d.notes.length === 1 ? 'comment' : 'comments' }}</span>
            </div>
            <div v-if="d.snippet" class="snip">
              <div v-for="(r, i) in d.snippet.rows" :key="i" class="sl" :class="{ hit: r.isHit, add: r.mark === '+', del: r.mark === '-' }"><span class="ln">{{ r.no ?? '' }}</span><span class="mk">{{ r.mark }}</span>{{ r.text }}</div>
            </div>
            <div v-for="n in d.notes" :key="n.id" class="note">
              <span class="av">{{ initials(n.author) }}</span>
              <div class="nbody">
                <div class="nhead">
                  <b>{{ n.author }}</b><span>{{ ago(Date.parse(n.createdAt)) }}</span>
                  <span class="grow" />
                  <MenuButton v-if="editKey !== `n:${n.id}`" label="Note actions" icon="more" is-icon title="Note actions" :items="noteMenu(d, n)" />
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
                  <span class="grow" />
                  <MenuButton v-if="editKey !== `d:${p.id}`" label="Note actions" icon="more" is-icon title="Note actions" :items="draftMenu(p)" />
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
                  <label title="Resolve this thread when the review is submitted"><input v-model="isReplyResolving" type="checkbox" />Resolve thread</label>
                  <span class="split">
                    <button class="btn sm primary" :disabled="!reply.trim() || !!busyAction" title="Save as a pending draft note; publish it with Submit review" @click="addReplyDraft(d.id)">
                      Add to review
                    </button>
                    <MenuButton label="Post options" icon="chevronDown" is-icon title="Post options" :items="postNowItems(d.id)" />
                  </span>
                </div>
              </template>
              <div v-else class="footrow">
                <button class="replybtn" @click="(replyTo = d.id), (reply = ''), (isReplyResolving = true)">Reply…</button>
                <button v-if="d.isResolved" class="linkbtn" @click="toggleResolved(d.id)">Collapse</button>
                <button
                  v-if="d.isResolvable"
                  class="btn sm"
                  :disabled="!!busyAction || isGone"
                  @click="runReview({ kind: 'resolve', discussionId: d.id, isResolved: !d.isResolved })"
                >
                  <Icon name="check" :size="12" />{{ d.isResolved ? 'Unresolve' : 'Resolve' }}
                </button>
              </div>
            </div>
          </article>
        </template>
        <div v-for="p in generalDrafts(drafts)" :key="`g${p.id}`" class="note pending general">
          <span class="av">…</span>
            <div class="nbody">
              <div class="nhead">
                <b>You</b><span class="pendtag">Pending</span>
                <span class="grow" />
                <MenuButton v-if="editKey !== `d:${p.id}`" label="Note actions" icon="more" is-icon title="Note actions" :items="draftMenu(p)" />
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
  </div>

  <Teleport to="body">
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
  </Teleport>
</template>

<style scoped>
.ovhead {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 12px 24px 0;
}
.grow {
  flex: 1;
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
.btn.approved {
  color: var(--ok);
  border-color: var(--ok-line);
  background: rgba(61, 214, 140, 0.08);
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
.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 24px;
  margin-bottom: 18px;
  padding-bottom: 14px;
  font-size: 13px;
  color: var(--text-2);
  border-bottom: 1px solid var(--line);
}
.metaitem {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.metalabel {
  font-size: 12px;
  color: var(--text-4);
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
  margin: 0 0 28px;
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
  margin: 20px 0 12px;
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
.actbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin-bottom: 12px;
}
.actbar .acth {
  margin: 0;
}
.sysopt {
  margin-top: 0;
}
.emptythreads {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}
.general {
  font-size: 12px;
  color: var(--text-3);
}
.tcount {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-4);
}
.footrow {
  display: flex;
  align-items: center;
  gap: 10px;
}
.footrow .replybtn {
  flex: 1;
  width: auto;
}
.split {
  display: inline-flex;
}
.split :deep(.trigger) {
  width: 28px;
  height: 28px;
  border-radius: 0 7px 7px 0;
}
.split .btn {
  border-radius: 7px 0 0 7px;
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
.thead code {
  font: 12px var(--font-mono);
  color: var(--info);
}
.thead code.golink {
  cursor: pointer;
}
.thead code.golink:hover {
  text-decoration: underline;
}
.rs {
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
.muted {
  color: var(--text-4);
}
.add {
  color: var(--ok);
}
.del {
  color: var(--danger);
}
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
.descedit {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.descedit .seg {
  align-self: flex-start;
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
.vr.hit {
  box-shadow: inset 3px 0 0 var(--warn);
  background: var(--warn-soft);
}
</style>
