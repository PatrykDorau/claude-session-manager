import { spawn } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ideDir } from './paths'
import { parseLockFile, normalizePath } from './lock'

function code(args: string[]): void {
  spawn('code', args, { shell: true, detached: true, stdio: 'ignore' }).unref()
}

function focusByTitle(needle: string): void {
  const ps = `
$ErrorActionPreference='SilentlyContinue'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class W { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int n); }
"@
Get-Process | Where-Object { $_.MainWindowTitle -like '*${needle}*' -and $_.MainWindowTitle -like '*Visual Studio Code*' } |
 ForEach-Object { [W]::ShowWindow($_.MainWindowHandle, 9); [W]::SetForegroundWindow($_.MainWindowHandle) }
`
  spawn('powershell.exe', ['-NoProfile', '-Command', ps], {
    detached: true,
    stdio: 'ignore'
  }).unref()
}

async function workspaceLockExists(folder: string): Promise<boolean> {
  const target = normalizePath(folder)
  let files: string[] = []
  try {
    files = (await readdir(ideDir())).filter((f) => f.endsWith('.lock'))
  } catch {
    return false
  }
  for (const f of files) {
    const lock = parseLockFile(await readFile(join(ideDir(), f), 'utf8').catch(() => ''))
    if (lock?.workspaceFolders.some((w) => normalizePath(w) === target)) return true
  }
  return false
}

async function waitForWorkspaceLock(folder: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await workspaceLockExists(folder)) return true
    await new Promise((r) => setTimeout(r, 250))
  }
  return false
}

function openInTerminal(needle: string, id: string): Promise<boolean> {
  const ps = `
$ErrorActionPreference='SilentlyContinue'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class FG {
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out int pid);
 [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool attach);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
 [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
}
"@
$needle='${needle}'
$ws=New-Object -ComObject WScript.Shell
function Focus($proc){
 $hwnd=$proc.MainWindowHandle
 for($i=0;$i -lt 8;$i++){
  $fg=[FG]::GetForegroundWindow()
  $d=0
  $fgThread=[FG]::GetWindowThreadProcessId($fg,[ref]$d)
  $me=[FG]::GetCurrentThreadId()
  [FG]::AttachThreadInput($fgThread,$me,$true) | Out-Null
  [FG]::ShowWindow($hwnd,9) | Out-Null
  [FG]::BringWindowToTop($hwnd) | Out-Null
  [FG]::SetForegroundWindow($hwnd) | Out-Null
  [FG]::AttachThreadInput($fgThread,$me,$false) | Out-Null
  Start-Sleep -Milliseconds 250
  $cur=[FG]::GetForegroundWindow()
  $cp=0
  [FG]::GetWindowThreadProcessId($cur,[ref]$cp) | Out-Null
  if($cp -eq $proc.Id){return $true}
 }
 return $false
}
$deadline=(Get-Date).AddSeconds(25)
$p=$null
while((Get-Date) -lt $deadline){
 $p=Get-Process | Where-Object { $_.MainWindowTitle -like "*$needle*" -and $_.MainWindowTitle -like '*Visual Studio Code*' } | Select-Object -First 1
 if($p){break}
 Start-Sleep -Milliseconds 400
}
if(-not $p){ Write-Host "no VS Code window matched $needle"; exit }
Write-Host "found pid=$($p.Id) title=$($p.MainWindowTitle)"
if(-not (Focus $p)){ Write-Host "aborted: could not bring VS Code to foreground"; exit }
Write-Host "opening side terminal"
$ws.SendKeys('^%{F9}')
Start-Sleep -Milliseconds 1500
if(-not (Focus $p)){ Write-Host "aborted before typing: focus lost"; exit }
$ws.SendKeys('claude --resume ${id}')
Start-Sleep -Milliseconds 300
$ws.SendKeys('{ENTER}')
Write-Host "typed resume command"
`
  return new Promise<boolean>((resolve) => {
    let typed = false
    const p = spawn('powershell.exe', ['-NoProfile', '-Command', ps], { windowsHide: true })
    p.stdout?.on('data', (d) => {
      const s = d.toString()
      if (s.includes('typed resume command')) typed = true
      console.log('[ps]', s.trim())
    })
    p.stderr?.on('data', (d) => console.error('[ps-err]', d.toString().trim()))
    p.on('error', () => resolve(false))
    p.on('close', () => resolve(typed))
  })
}

export function focusWindow(projectName: string): void {
  focusByTitle(projectName)
}

export function openProject(projectPath: string): void {
  code([projectPath])
}

export function switchAccount(): void {
  spawn('cmd.exe', ['/c', 'start', 'Claude login', 'cmd', '/k', 'claude auth login'], {
    detached: true,
    stdio: 'ignore'
  }).unref()
}

export function openAgentView(cwd: string): void {
  spawn('cmd.exe', ['/c', 'start', 'Claude agents', 'cmd', '/k', `claude agents --cwd "${cwd}"`], {
    detached: true,
    stdio: 'ignore'
  }).unref()
}

export function resumeStandalone(cwd: string, id: string): void {
  spawn('cmd.exe', ['/c', 'start', 'Claude Session', 'cmd', '/k', `claude --resume ${id}`], {
    cwd: cwd || undefined,
    detached: true,
    stdio: 'ignore'
  }).unref()
}

export async function reopenAndResume(
  projectPath: string,
  projectName: string,
  id: string
): Promise<boolean> {
  code([projectPath])
  const ready = await waitForWorkspaceLock(projectPath, 40000)
  console.log('[diag] launcher: lock ready=', ready, 'for', projectName)
  return openInTerminal(projectName, id)
}

export async function focusOrOpen(session: {
  projectPath: string
  projectName: string
  id: string
  isLive: boolean
}): Promise<boolean> {
  if (session.isLive) {
    focusByTitle(session.projectName)
    code([session.projectPath])
    return true
  }
  return reopenAndResume(session.projectPath, session.projectName, session.id)
}
