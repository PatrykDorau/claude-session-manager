<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import type { DevServer, MenuItem, MrFile, MrRow, MrStatus, MrVersionDiff, QuickAction, Session, TerminalMode } from '../types'
import { plainSession } from '../cards'
import { reviewLabel, findReviewSession, findWorkSession, mergeHint } from './mrs'
import { renderGitlabHtml, renderMarkdown, toUploadWebUrl, isVideoUrl, parseVersionLink } from './mrhtml'
import Icon from './Icon.vue'
import MenuButton from './MenuButton.vue'
import { ago } from '../display'
import ClaudeTerminal from './ClaudeTerminal.vue'
import CodeView from './CodeView.vue'
import Splitter from './Splitter.vue'
import { clampSize, readSize, writeSize, readFlag } from './dashboard'
import QuickActions from './QuickActions.vue'

const props = defineProps<{ row: MrRow; sessions: Session[]; isGone: boolean; myName?: string | null; servers?: DevServer[] }>()

const REVIEW_ACTIONS: QuickAction[] = [
  {
    label: 'Save findings as draft notes',
    prompt:
      'Zapisz potwierdzone uwagi z review jako draft notes w tym MR (gitlab.js mr draft-note). Najpierw pokaż mi listę do potwierdzenia.'
  }
]

const tab = ref<'overview' | 'changes'>('overview')
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
  codeWidth.value = clampSize(codeWidth.value + delta, 320, total - 320)
}
const saveCodeWidth = (): void => writeSize('dash.mrCodeWidth', codeWidth.value)
const files = ref<MrFile[] | null | undefined>(undefined)
const mode = ref<TerminalMode | null>(null)
const isStarting = ref(false)
const startError = ref<string | null>(null)
const terminalTick = ref(0)
let remountTimer: ReturnType<typeof setTimeout> | null = null

const isMine = computed(() => !!props.myName && props.row.author === props.myName)
const session = computed(() =>
  isMine.value ? findWorkSession(props.sessions, props.row.ticket) : findReviewSession(props.sessions, props.row.sessionId)
)
const repoPath = ref<string | null>(null)
const loadRepo = async (): Promise<void> => {
  repoPath.value = await window.api.getMrRepo(props.row.key)
}
void loadRepo()
const codeCwd = computed(() => session.value?.projectPath ?? repoPath.value)
const branchUrl = (branch: string): string => `${origin}/${props.row.projectPath}/-/tree/${branch.split('/').map(encodeURIComponent).join('/')}`
const openJira = (key: string): void => window.api.openTicket(key)
const isAddressing = ref(false)
const addressPrompt = (where: string): string =>
  `${where} Przeczytaj nierozwiązane wątki w moim MR !${props.row.iid} (${props.row.url}) przez gitlab.js mr discussions ${props.row.iid} i odnieś się do każdego: popraw kod tam, gdzie uwaga jest trafna, a przy pozostałych zaproponuj odpowiedź. Najpierw pokaż mi listę wątków z tym, co zamierzasz zrobić, i poczekaj na moje potwierdzenie. Niczego nie publikuj w GitLabie.`
const addressComments = async (): Promise<void> => {
  if (!session.value) return
  isAddressing.value = true
  startError.value = null
  tab.value = 'changes'
  if (!isClaudeOpen.value) toggleClaude()
  try {
    const place = await window.api.getMrBranchFolder(props.row.key)
    const ticket = props.row.ticket ?? `MR-${props.row.iid}`
    const where = place.folder
      ? `Pracuj w ${place.folder}: to worktree z gałęzią ${props.row.sourceBranch}. Nie przełączaj gałęzi w głównym checkoucie.`
      : `Gałąź ${props.row.sourceBranch} nie jest wyciągnięta w żadnym worktree. W ${place.repo ?? 'repo'} uruchom git worktree add .claude/worktrees/${ticket} ${props.row.sourceBranch} i pracuj tylko tam, bez przełączania głównego checkoutu.`
    const result = await window.api.sendPrompt(session.value.id, addressPrompt(where))
    startError.value = result.error
  } finally {
    isAddressing.value = false
  }
}
const chip = computed(() => reviewLabel(props.row.review))
const facts = computed(() => {
  const list: string[] = []
  if (session.value?.model) list.push(session.value.model.replace(/^claude-/, ''))
  if (session.value?.contextTokens) list.push(`${Math.round(session.value.contextTokens / 1000)}k context`)
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
const comment = ref('')
const PIPELINE_COLOR: Record<string, string> = { success: '#3dd68c', failed: '#f2706a', running: '#6aa9ff', pending: '#e8b84a', canceled: '#9d9d9d' }
const loadStatus = async (): Promise<void> => {
  status.value = await window.api.getMrStatus(props.row.key)
}
const serverKey = computed(() => props.row.ticket ?? `MR-${props.row.iid}`)
const server = computed(() => (props.servers ?? []).find((sv) => sv.key === serverKey.value) ?? null)
const isStartingServer = ref(false)
const startServer = async (): Promise<void> => {
  isStartingServer.value = true
  actionError.value = null
  try {
    const place = await window.api.getMrBranchFolder(props.row.key)
    const result = await window.api.startTicketServer(serverKey.value, place.folder ?? session.value?.projectPath ?? null)
    if (result.error) actionError.value = result.error
  } finally {
    isStartingServer.value = false
  }
}
const openServer = (): void => {
  if (server.value) window.api.openInChrome(server.value.url, serverKey.value)
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
  el.dataset.failed = '1'
  const src = el.getAttribute('src') ?? ''
  const link = document.createElement('a')
  link.href = toUploadWebUrl(src)
  link.target = '_blank'
  link.className = 'mediafail'
  link.textContent = `${el instanceof HTMLVideoElement || isVideoUrl(src) ? 'Video' : 'Image'} could not load here. Open it in GitLab`
  el.replaceWith(link)
}
const expandedResolved = ref<Set<string>>(new Set())
const toggleResolved = (id: string): void => {
  const next = new Set(expandedResolved.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedResolved.value = next
}
const versionPopup = ref<{ title: string; data: MrVersionDiff | null } | null>(null)
const openVersion = async (href: string, path: string | null): Promise<void> => {
  const link = parseVersionLink(href)
  if (!link) return
  versionPopup.value = { title: path ?? 'Changes in this version', data: null }
  const data = await window.api.getMrVersionDiff(props.row.key, link.diffId, link.startSha, path)
  if (versionPopup.value) versionPopup.value = { ...versionPopup.value, data }
}
const onThreadClick = (e: MouseEvent, path: string | null): void => {
  const a = (e.target as HTMLElement).closest('a')
  if (!a || !parseVersionLink(a.href)) return
  e.preventDefault()
  void openVersion(a.href, path)
}
const codeComments = computed(() =>
  threads.value.flatMap((d) =>
    d.anchor && d.anchor.side === 'new'
      ? [{ id: d.id, path: d.anchor.path, line: d.anchor.line, isResolved: d.isResolved, notes: d.notes.map((n) => ({ author: n.author, body: n.body, html: noteHtml.value[n.id] })) }]
      : []
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
const openItems = computed<MenuItem[]>(() => [
  { label: 'GitLab', hint: props.row.url, icon: 'external', run: () => window.open(props.row.url, '_blank') },
  { label: 'VS Code with the review session', hint: 'Moves the session to VS Code', icon: 'code', isDisabled: !session.value, run: () => void openInVscode() }
])

onMounted(() => {
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
onBeforeUnmount(() => {
  if (remountTimer) clearTimeout(remountTimer)
})
</script>

<template>
  <div class="view">
    <header class="head">
      <div class="line">
        <span class="proj">{{ row.projectName }}</span>
        <a class="iid" :href="row.url" target="_blank" title="Open in GitLab">!{{ row.iid }}</a>
        <span class="pill" :style="{ '--c': chip.color }">{{ chip.label }}</span>
        <span v-if="isGone" class="pill" style="--c: #666d78">no longer in your to-do</span>
        <span v-if="row.isDraft" class="draftbadge">Draft</span>
        <h1 class="title" :title="row.title">{{ row.title }}</h1>
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
          <button :class="{ on: tab === 'changes' }" @click="tab = 'changes'">
            <Icon name="code" :size="15" />Changes<span v-if="files" class="count">{{ files.length }}</span>
          </button>
        </nav>
        <span class="sub">
          <Icon name="user" :size="13" />{{ row.author }}
          <Icon name="branch" :size="13" /><a class="bref" :href="branchUrl(row.sourceBranch)" target="_blank" :title="`Open ${row.sourceBranch} in GitLab`">{{ row.sourceBranch }}</a><span class="arrow">→</span><a class="bref" :href="branchUrl(row.targetBranch)" target="_blank">{{ row.targetBranch }}</a>
        </span>
        <span class="grow" />
        <span v-for="f in facts" :key="f" class="fact">{{ f }}</span>
        <div v-if="tab === 'changes'" class="seg" title="Show or hide the panes">
          <button :class="{ on: isCodeOpen }" @click="toggleCode"><Icon name="code" :size="14" />Code</button>
          <button :class="{ on: isClaudeOpen }" @click="toggleClaude"><Icon name="terminal" :size="14" />Claude</button>
        </div>
        <button class="stop" :disabled="mode !== 'attach'" title="Interrupt Claude's current turn (Esc)" @click="stopTurn"><Icon name="stop" :size="12" />Stop</button>
        <button v-if="server" class="srvchip" :title="`Open ${server.url} in this ticket's Chrome`" @click="openServer"><i />{{ server.url.replace(/^https?:\/\//, '') }}</button>
        <button v-else class="btn" :disabled="isStartingServer" title="Start the dev server in the folder that has this branch" @click="startServer">
          <Icon name="server" :size="14" />{{ isStartingServer ? 'Starting…' : 'Server' }}
        </button>
        <button class="btn" :disabled="isRefreshingStatus" title="Reload this merge request from GitLab" @click="refreshStatus"><Icon name="refresh" :size="14" />{{ isRefreshingStatus ? 'Refreshing…' : 'Refresh' }}</button>
        <MenuButton label="Open in" icon="external" :items="openItems" />
        <button
          v-if="isMine"
          class="btn primary"
          :disabled="!session || isAddressing || isGone"
          :title="session ? `Sends the unresolved threads to ${session.name ?? row.ticket}` : `No Claude session found for ${row.ticket ?? 'this ticket'}`"
          @click="addressComments"
        >
          <Icon name="message" :size="13" />{{ isAddressing ? 'Sending…' : 'Address comments' }}
        </button>
        <button v-else class="btn primary" :disabled="isStarting || isGone" @click="review">
          <Icon name="play" :size="13" />{{ isStarting ? 'Starting review…' : row.review === 'not-reviewed' ? 'Review' : 'Review again' }}
        </button>
      </div>
      <div v-if="startError" class="warn">{{ startError }}</div>
      <div v-if="actionError" class="warn">GitLab: {{ actionError }}</div>
    </header>

    <div v-show="tab === 'changes'" ref="panes" class="panes">
      <section v-show="isCodeOpen" class="pane code" :style="isBothOpen ? { flex: 'none', width: `${codeWidth}px` } : undefined">
        <CodeView
          :cwd="codeCwd"
          :ticket-key="row.ticket ?? `MR-${row.iid}`"
          :branch-ref="{ source: row.sourceBranch, target: row.targetBranch }"
          :ticket-title="row.title"
          :can-ask="mode === 'attach'"
          :source-session-id="session?.id ?? null"
          :comments="codeComments"
          @ask="askClaude"
          @version="openVersion"
        />
      </section>
      <Splitter v-if="isBothOpen" @resize="resizeCode" @done="saveCodeWidth" />
    <section v-show="isClaudeOpen" class="pane claude">
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
      <QuickActions :session-id="session?.id ?? null" :mode="mode" :take-over="takeOverHere" :extra="isMine ? [] : REVIEW_ACTIONS" />
    </section>
    </div>

    <section v-show="tab === 'overview'" class="pane doc">
      <div class="ov">
        <div class="ovmain">
          <p v-if="status === null" class="muted">Loading…</p>
          <template v-else-if="overview">
            <div class="byline">
              <span v-if="overview.isDraft" class="draft">Draft</span>
              <b>{{ overview.author }}</b> requested to merge <a class="bpill" :href="branchUrl(row.sourceBranch)" target="_blank">{{ row.sourceBranch }}</a> into <a class="bpill" :href="branchUrl(row.targetBranch)" target="_blank">{{ row.targetBranch }}</a>
              <span class="muted inline">{{ ago(Date.parse(overview.createdAt)) }}</span>
            </div>
            <div v-if="descriptionHtml" class="md" @error.capture="onMediaError" v-html="descriptionHtml" />
            <p v-else class="muted">No description.</p>

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
              <article v-else class="thread" :class="{ resolved: d.isResolved }" @click="onThreadClick($event, d.anchor?.path ?? null)">
                <div v-if="d.where || d.isResolvable" class="thead">
                  <code v-if="d.where">{{ d.where }}</code>
                  <span v-if="d.isResolvable" class="rs" :class="{ done: d.isResolved }">{{ d.isResolved ? 'resolved' : 'open' }}</span>
                  <button v-if="d.isResolved" class="collapse" @click="toggleResolved(d.id)">Hide</button>
                </div>
                <div v-if="d.snippet" class="snip">
                  <div v-for="(r, i) in d.snippet.rows" :key="i" class="sl" :class="{ hit: r.isHit, add: r.mark === '+', del: r.mark === '-' }"><span class="ln">{{ r.no ?? '' }}</span><span class="mk">{{ r.mark }}</span>{{ r.text }}</div>
                </div>
                <div v-for="n in d.notes" :key="n.id" class="note">
                  <span class="av">{{ initials(n.author) }}</span>
                  <div class="nbody">
                    <div class="nhead"><b>{{ n.author }}</b><span>{{ ago(Date.parse(n.createdAt)) }}</span></div>
                    <div class="md" @error.capture="onMediaError" v-html="noteHtml[n.id]" />
                  </div>
                </div>
                <div class="replyrow">
                  <template v-if="replyTo === d.id">
                    <textarea v-model="reply" rows="3" placeholder="Reply…" />
                    <div class="crow">
                      <button class="btn sm" @click="replyTo = null">Cancel</button>
                      <button class="btn sm primary" :disabled="!reply.trim() || !!busyAction" @click="postReply(d.id)">
                        {{ busyAction === 'reply' ? 'Posting…' : 'Post reply' }}
                      </button>
                    </div>
                  </template>
                  <button v-else class="replybtn" @click="(replyTo = d.id), (reply = '')">Reply…</button>
                </div>
              </article>
            </template>
            <div class="composer">
              <textarea v-model="comment" rows="4" placeholder="Write a comment on this merge request" spellcheck="true" />
              <div class="crow">
                <span class="muted small">You confirm before it is posted.</span>
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

    <template v-if="versionPopup">
      <div class="vscrim" @click="versionPopup = null" />
      <div class="vpop" role="dialog">
        <header class="vhead">
          <Icon name="diff" :size="15" />
          <b>{{ versionPopup.title }}</b>
          <span class="grow" />
          <button class="iconbtn" title="Close" @click="versionPopup = null"><Icon name="close" :size="15" /></button>
        </header>
        <div class="vbody">
          <p v-if="!versionPopup.data" class="muted">Loading the change…</p>
          <p v-else-if="!versionPopup.data.files.length" class="muted">No change found{{ versionPopup.data.problem ? `: ${versionPopup.data.problem}` : '' }}.</p>
          <section v-for="f in versionPopup.data?.files ?? []" :key="f.path" class="vfile">
            <h4>{{ f.path }}</h4>
            <div class="vdiff">
              <div v-for="(r, i) in f.rows" :key="i" class="vr" :class="{ add: r.kind === '+', del: r.kind === '-', hunk: r.kind === 'hunk' }">
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
  align-items: center;
  gap: 8px;
  height: 42px;
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
  gap: 28px;
  max-width: 1180px;
  padding: 20px 24px 40px;
}
.ovmain {
  flex: 1;
  min-width: 0;
}
.ovside {
  flex: none;
  width: 230px;
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
.spin {
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
</style>
