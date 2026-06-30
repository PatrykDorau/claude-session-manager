import {
  app,
  clipboard,
  shell,
  dialog,
  nativeImage,
  Notification,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  globalShortcut
} from 'electron'
import type { NativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import chokidar from 'chokidar'
import icon from '../../resources/icon.png?asset'
import attentionPng from '../../resources/attention.png?asset'
import type { Session } from '../renderer/src/types'
import { rmSync, readdirSync, existsSync } from 'node:fs'
import { join as joinPath } from 'node:path'
import { release } from 'node:os'
import { scanRaw } from './scanner'
import { buildSessions } from './aggregate'
import { normalizePath } from './lock'
import { runningResumeIds, listAgents, gitDirty, probeCommand } from './processes'
import { formatDiagnostics } from './diagnostics'
import { ideDir, projectsDir, doneDir, activeDir, needsInputDir, sessionsDir } from './paths'
import {
  focusOrOpen,
  focusWindow,
  openProject,
  reopenAndResume,
  resumeStandalone,
  switchAccount,
  openAgentView
} from './launcher'
import { loadState, saveState, applyWatched, applyName, type State } from './store'
import { installHooks } from './hooks'
import { fetchUsage } from './usage'
import type { UsageResult } from '../renderer/src/types'

let mainWindow: BrowserWindow
let tray: Tray
let appState: State = {
  watched: [],
  names: {},
  settings: {
    jiraBase: 'https://jira.redge.com/browse/',
    alwaysOnTop: true,
    clickAction: 'default',
    launchOnStartup: false
  }
}
let statePath = ''
let liveAgentIds = new Set<string>()
let agentStatus = new Map<string, string>()
let cachedRunningIds: string[] = []
let attentionIcon: NativeImage | null = null
let dirtyMap: Record<string, boolean> = {}
let lastUsage: UsageResult | null = null
let bgAgents = new Map<string, { status: string; name: string | null }>()
let claudeOk = true
let editorOk = true
let claudeVersion: string | null = null
let lastCounts = { total: 0, live: 0, waiting: 0 }
const knownFolders = new Map<string, string>()
const notifiedWaiting = new Set<string>()

function decorate(sessions: Session[]): Session[] {
  return sessions.map((s) => {
    const reg = agentStatus.get(s.id)
    let status = s.status
    if (reg === 'busy') status = 'working'
    else if (reg === 'idle' && s.status !== 'waiting' && s.status !== 'checkout') status = 'idle'
    return {
      ...s,
      watched: appState.watched.includes(s.id),
      name: appState.names[s.id] ?? null,
      dirty: dirtyMap[s.projectPath ? normalizePath(s.projectPath) : ''] ?? false,
      bg: bgAgents.has(s.id),
      status
    }
  })
}

async function refreshRunning(): Promise<void> {
  cachedRunningIds = [...(await runningResumeIds())]
}

async function refreshAgents(): Promise<void> {
  const list = await listAgents()
  if (!list) return
  liveAgentIds = new Set(list.map((a) => a.sessionId))
  agentStatus = new Map(list.map((a) => [a.sessionId, a.status]))
  bgAgents = new Map(
    list.filter((a) => a.kind === 'background').map((a) => [a.sessionId, { status: a.status, name: a.name }])
  )
}

async function refreshDirty(): Promise<void> {
  const entries = [...knownFolders.entries()]
  const next: Record<string, boolean> = {}
  await Promise.all(entries.map(async ([key, path]) => (next[key] = await gitDirty(path))))
  dirtyMap = next
}

async function pushSessions(): Promise<void> {
  if (!mainWindow) return
  const { raw } = await scanRaw()
  for (const r of raw) if (r.cwd) knownFolders.set(normalizePath(r.cwd), r.cwd)
  const openIds = [...new Set([...liveAgentIds, ...cachedRunningIds])]
  const sessions = buildSessions(raw, openIds, Date.now())
  lastCounts = {
    total: sessions.length,
    live: sessions.filter((s) => s.isLive).length,
    waiting: sessions.filter((s) => s.status === 'waiting').length
  }
  mainWindow.webContents.send('sessions', decorate(sessions))
  updateAttention(sessions)
}

async function probeEnv(): Promise<void> {
  const [cv, ev] = await Promise.all([
    probeCommand('claude', ['--version']),
    probeCommand('code', ['--version'])
  ])
  claudeVersion = cv
  claudeOk = cv !== null
  editorOk = ev !== null
  mainWindow?.webContents.send('claude-status', { claude: claudeOk, editor: editorOk })
}

function openSession(s: Session): void {
  if (!s?.id) return
  if (s.bg) {
    openAgentView(s.projectPath)
    return
  }
  try {
    rmSync(joinPath(doneDir(), s.id), { force: true })
  } catch {
    /* ignore */
  }
  void pushSessions()
  if (!editorOk) {
    resumeStandalone(s.projectPath, s.id)
    return
  }
  const action = appState.settings.clickAction
  if (action === 'project-cmd') {
    openProject(s.projectPath)
    if (!s.isLive) resumeStandalone(s.projectPath, s.id)
  } else if (action === 'project') openProject(s.projectPath)
  else if (action === 'standalone') resumeStandalone(s.projectPath, s.id)
  else if (action === 'terminal')
    void reopenAndResume(s.projectPath, s.projectName, s.id).then((ok) => {
      if (!ok) notifyResumeFailed(s)
    })
  else if (action === 'focus') focusWindow(s.projectName)
  else
    void focusOrOpen(s)
      .then((ok) => {
        if (!ok) notifyResumeFailed(s)
      })
      .catch((err) => console.error('[diag] focusOrOpen threw:', err))
}

async function pushUsage(): Promise<void> {
  const res = await fetchUsage()
  if (res.ok || !lastUsage?.ok) lastUsage = res
  mainWindow?.webContents.send('usage-update', lastUsage)
}

function notifyResumeFailed(s: Session): void {
  mainWindow?.webContents.send('resume-failed', {
    label: s.name ?? s.projectName,
    command: `claude --resume ${s.id}`
  })
}

function notifyNeedsYou(s: Session): void {
  if (!Notification.isSupported()) return
  const label = s.name ?? (s.ticket ? `${s.projectName} · ${s.ticket}` : s.projectName)
  const n = new Notification({
    title: 'Claude needs you',
    body: label,
    icon: attentionIcon ?? icon,
    silent: true
  })
  n.on('click', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
    openSession(s)
  })
  n.show()
  mainWindow?.webContents.send('play-alert')
}

function updateAttention(sessions: Session[]): void {
  if (!mainWindow) return
  const waitingIds = new Set<string>()
  for (const s of sessions) {
    if (s.status !== 'waiting') continue
    waitingIds.add(s.id)
    if (!notifiedWaiting.has(s.id)) {
      notifiedWaiting.add(s.id)
      notifyNeedsYou(s)
    }
  }
  for (const id of [...notifiedWaiting]) if (!waitingIds.has(id)) notifiedWaiting.delete(id)
  const count = waitingIds.size
  if (count > 0) {
    if (!attentionIcon) attentionIcon = nativeImage.createFromPath(attentionPng)
    mainWindow.setOverlayIcon(attentionIcon, `${count} session(s) need you`)
    if (!mainWindow.isFocused()) mainWindow.flashFrame(true)
  } else {
    mainWindow.setOverlayIcon(null, '')
    mainWindow.flashFrame(false)
  }
  if (tray) {
    const live = sessions.filter((s) => s.isLive).length
    const parts: string[] = []
    if (count) parts.push(`${count} need you`)
    if (live) parts.push(`${live} live`)
    tray.setToolTip(parts.length ? `Claude Sessions — ${parts.join(' · ')}` : 'Claude Sessions')
  }
}

function removeSessionFiles(id: string): void {
  try {
    for (const p of readdirSync(projectsDir())) {
      const f = joinPath(projectsDir(), p, `${id}.jsonl`)
      if (existsSync(f)) {
        rmSync(f, { force: true })
        break
      }
    }
  } catch {
    /* ignore */
  }
  for (const dir of [activeDir(), doneDir(), needsInputDir()]) {
    try {
      rmSync(joinPath(dir, id), { force: true })
    } catch {
      /* ignore */
    }
  }
  liveAgentIds.delete(id)
}

function applyLaunchOnStartup(on: boolean): void {
  app.setLoginItemSettings({ openAtLogin: on, args: ['--hidden'] })
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 360,
    height: 500,
    minWidth: 180,
    minHeight: 200,
    frame: false,
    alwaysOnTop: appState.settings.alwaysOnTop,
    skipTaskbar: false,
    show: false,
    backgroundColor: '#0d1117',
    icon,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  })

  win.setAlwaysOnTop(appState.settings.alwaysOnTop, 'screen-saver')

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

function wireSessions(win: BrowserWindow): void {
  let timer: NodeJS.Timeout | null = null
  const schedule = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(pushSessions, 1000)
  }
  let aTimer: NodeJS.Timeout | null = null
  const scheduleAgents = (): void => {
    if (aTimer) clearTimeout(aTimer)
    aTimer = setTimeout(async () => {
      await refreshAgents()
      await pushSessions()
    }, 600)
  }
  chokidar.watch([projectsDir(), ideDir()], { ignoreInitial: true, depth: 2 }).on('all', schedule)
  chokidar.watch(sessionsDir(), { ignoreInitial: true, depth: 0 }).on('all', scheduleAgents)
  win.webContents.on('did-finish-load', async () => {
    await refreshRunning()
    await refreshAgents()
    void probeEnv()
    await pushSessions()
    void pushUsage()
  })
  setInterval(pushSessions, 2000)
  setInterval(refreshRunning, 6000)
  setInterval(refreshAgents, 8000)
  setInterval(refreshDirty, 8000)
  setInterval(pushUsage, 60000)
  setInterval(probeEnv, 30000)
}

function buildTray(win: BrowserWindow): void {
  tray = new Tray(icon)
  const toggle = (): void => (win.isVisible() ? win.hide() : win.show())
  tray.setToolTip('Claude Sessions')
  tray.on('click', toggle)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show / Hide', click: toggle },
      {
        label: 'Always on top',
        type: 'checkbox',
        checked: appState.settings.alwaysOnTop,
        click: (i) => win.setAlwaysOnTop(i.checked, 'screen-saver')
      },
      {
        label: 'Launch on startup',
        type: 'checkbox',
        checked: appState.settings.launchOnStartup,
        click: (i) => {
          appState.settings.launchOnStartup = i.checked
          applyLaunchOnStartup(i.checked)
          saveState(statePath, appState)
        }
      },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ])
  )
}

app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')
app.commandLine.appendSwitch('disable-http-cache')

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron.app')

  statePath = join(app.getPath('userData'), 'state.json')
  appState = loadState(statePath)
  applyLaunchOnStartup(appState.settings.launchOnStartup)

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  process.on('uncaughtException', (e) => console.error('[diag] uncaughtException:', e))
  process.on('unhandledRejection', (e) => console.error('[diag] unhandledRejection:', e))

  ipcMain.on('open-session', (_e, s) => openSession(s))
  ipcMain.on('get-version', (e) => {
    e.returnValue = app.getVersion()
  })
  ipcMain.on('get-diagnostics', (e) => {
    e.returnValue = formatDiagnostics({
      version: app.getVersion(),
      platform: process.platform,
      release: release(),
      electron: process.versions.electron,
      node: process.versions.node,
      claude: claudeOk ? (claudeVersion ?? '?') : null,
      editor: editorOk,
      signedIn: lastUsage?.ok ? 'yes' : lastUsage?.error === 'no-credentials' ? 'no' : 'unknown',
      total: lastCounts.total,
      live: lastCounts.live,
      waiting: lastCounts.waiting
    })
  })
  ipcMain.on('get-usage', (e) => {
    e.returnValue = lastUsage
  })
  ipcMain.on('switch-account', () => {
    switchAccount()
  })
  ipcMain.on('minimize-window', () => {
    mainWindow?.minimize()
  })
  ipcMain.on('install-hooks', (e) => {
    e.returnValue = installHooks()
  })
  ipcMain.on('open-ticket', (_e, code: string) => {
    void shell.openExternal(appState.settings.jiraBase + code)
  })
  ipcMain.on('get-settings', (e) => {
    e.returnValue = {
      jiraBase: appState.settings.jiraBase,
      alwaysOnTop: appState.settings.alwaysOnTop,
      clickAction: appState.settings.clickAction,
      launchOnStartup: appState.settings.launchOnStartup
    }
  })
  ipcMain.on('set-settings', (_e, patch: Partial<State['settings']>) => {
    if (typeof patch.jiraBase === 'string') appState.settings.jiraBase = patch.jiraBase
    if (typeof patch.alwaysOnTop === 'boolean') {
      appState.settings.alwaysOnTop = patch.alwaysOnTop
      mainWindow?.setAlwaysOnTop(patch.alwaysOnTop, 'screen-saver')
    }
    if (patch.clickAction) appState.settings.clickAction = patch.clickAction
    if (typeof patch.launchOnStartup === 'boolean') {
      appState.settings.launchOnStartup = patch.launchOnStartup
      applyLaunchOnStartup(patch.launchOnStartup)
    }
    saveState(statePath, appState)
  })
  ipcMain.on('session-menu', (_e, s) => {
    if (!s?.id) return
    const menu = Menu.buildFromTemplate([
      ...(s.bg
        ? [{ label: 'Open agent view (attach)', click: () => openAgentView(s.projectPath) }]
        : [{ label: s.isLive ? 'Focus window' : 'Open & resume', click: () => void focusOrOpen(s) }]),
      { label: 'Open project in VS Code', click: () => openProject(s.projectPath) },
      {
        label: 'Resume in side terminal',
        click: () =>
          void reopenAndResume(s.projectPath, s.projectName, s.id).then((ok) => {
            if (!ok) notifyResumeFailed(s)
          })
      },
      {
        label: 'Resume in standalone terminal',
        click: () => resumeStandalone(s.projectPath, s.id)
      },
      { label: 'Focus existing window', click: () => focusWindow(s.projectName) },
      { label: 'Open folder in Explorer', click: () => void shell.openPath(s.projectPath) },
      { label: 'Copy resume command', click: () => clipboard.writeText(`claude --resume ${s.id}`) },
      { type: 'separator' },
      {
        label: s.watched ? 'Unwatch' : 'Watch',
        click: () => {
          appState = applyWatched(appState, s.id, !s.watched)
          saveState(statePath, appState)
          void pushSessions()
        }
      }
    ])
    menu.popup({ window: mainWindow })
  })
  ipcMain.on('copy-text', (_e, text: string) => {
    clipboard.writeText(text)
  })
  ipcMain.on('set-watched', (_e, id: string, on: boolean) => {
    appState = applyWatched(appState, id, on)
    saveState(statePath, appState)
    void pushSessions()
  })
  ipcMain.on('set-name', (_e, id: string, name: string | null) => {
    appState = applyName(appState, id, name)
    saveState(statePath, appState)
    void pushSessions()
  })
  ipcMain.on('remove-session', async (_e, id: string, label: string) => {
    if (!id) return
    const first = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['Cancel', 'Delete'],
      defaultId: 0,
      cancelId: 0,
      title: 'Delete session',
      message: 'Delete this session?',
      detail: label
    })
    if (first.response !== 1) return
    const second = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['Cancel', 'Permanently delete'],
      defaultId: 0,
      cancelId: 0,
      title: 'Are you sure?',
      message: 'This permanently deletes the transcript and cannot be undone.',
      detail: label
    })
    if (second.response !== 1) return
    removeSessionFiles(id)
    void pushSessions()
  })

  mainWindow = createWindow()
  wireSessions(mainWindow)
  buildTray(mainWindow)

  mainWindow.on('close', (e) => {
    console.log('[diag] window close event, isQuiting=', (app as never as { isQuiting?: boolean }).isQuiting)
    if (!(app as unknown as { isQuiting?: boolean }).isQuiting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })
  mainWindow.on('focus', () => mainWindow.flashFrame(false))
  mainWindow.on('blur', () => console.log('[diag] window blur'))
  mainWindow.on('hide', () => console.log('[diag] window hide'))
  mainWindow.webContents.on('render-process-gone', (_e, d) =>
    console.error('[diag] renderer gone:', d)
  )

  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show()
  })

  if (!process.argv.includes('--hidden')) mainWindow.show()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
      wireSessions(mainWindow)
    }
  })
  })
}

app.on('before-quit', () => {
  console.log('[diag] before-quit')
  ;(app as unknown as { isQuiting?: boolean }).isQuiting = true
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
