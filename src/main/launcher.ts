import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { RESUME_FILE_NAME } from './vscodeconfig'

export type ResumeKey = 'F9' | 'F10'

export function createSerialQueue(): <T>(job: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve()
  const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
    const run = tail.then(job, job)
    tail = run.catch(() => undefined)
    return run
  }
  return enqueue
}

const resumeQueue = createSerialQueue()

export function resumeCommand(id: string, ticket: string | null): string {
  return ticket ? `claude --resume ${id} --name ${ticket}` : `claude --resume ${id}`
}

function code(args: string[]): void {
  spawn('code', args, { shell: true, detached: true, stdio: 'ignore' }).unref()
}

function focusByTitle(needle: string): void {
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
 [DllImport("user32.dll")] public static extern void keybd_event(byte b, byte s, uint f, UIntPtr e);
 [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
}
"@
$needle='${needle}'
$deadline=(Get-Date).AddSeconds(6)
$p=$null
while((Get-Date) -lt $deadline){
 $p=Get-Process | Where-Object { $_.MainWindowTitle -like "*$needle*" -and $_.MainWindowTitle -like '*Visual Studio Code*' } | Select-Object -First 1
 if($p){break}
 Start-Sleep -Milliseconds 300
}
if(-not $p){ exit }
$hwnd=$p.MainWindowHandle
for($i=0;$i -lt 10;$i++){
 $fg=[FG]::GetForegroundWindow()
 $d=0
 $fgThread=[FG]::GetWindowThreadProcessId($fg,[ref]$d)
 $me=[FG]::GetCurrentThreadId()
 [FG]::keybd_event(0xA4,0,0,[UIntPtr]::Zero)
 [FG]::keybd_event(0xA4,0,2,[UIntPtr]::Zero)
 [FG]::AttachThreadInput($fgThread,$me,$true) | Out-Null
 [FG]::ShowWindow($hwnd,3) | Out-Null
 [FG]::BringWindowToTop($hwnd) | Out-Null
 [FG]::SetForegroundWindow($hwnd) | Out-Null
 [FG]::AttachThreadInput($fgThread,$me,$false) | Out-Null
 Start-Sleep -Milliseconds 200
 $cur=[FG]::GetForegroundWindow()
 $cp=0
 [FG]::GetWindowThreadProcessId($cur,[ref]$cp) | Out-Null
 if($cp -eq $p.Id){break}
}
`
  spawn('powershell.exe', ['-NoProfile', '-Command', ps], { windowsHide: true })
}

function openInTerminal(
  needle: string,
  command: string,
  key: ResumeKey,
  isLayoutConfigured: boolean
): Promise<boolean> {
  const resumeFile = join(homedir(), '.claude', RESUME_FILE_NAME)
  if (isLayoutConfigured) writeFileSync(resumeFile, command, 'utf8')
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
  [FG]::ShowWindow($hwnd,3) | Out-Null
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
$deadline=(Get-Date).AddSeconds(40)
$p=$null
$isFresh=$false
while((Get-Date) -lt $deadline){
 $p=Get-Process | Where-Object { $_.MainWindowTitle -like "*$needle*" -and $_.MainWindowTitle -like '*Visual Studio Code*' } | Select-Object -First 1
 if($p){break}
 $isFresh=$true
 Start-Sleep -Milliseconds 400
}
if(-not $p){ Write-Host "no VS Code window matched $needle"; exit }
Write-Host "found pid=$($p.Id) title=$($p.MainWindowTitle)"
if($isFresh){ Write-Host "window just opened, waiting for VS Code to load"; Start-Sleep -Seconds 8 }
if(-not (Focus $p)){ Write-Host "aborted: could not bring VS Code to foreground"; exit }
if($${isLayoutConfigured ? 'true' : 'false'}){
 $file='${resumeFile}'
 $isPicked=$false
 $until=(Get-Date).AddSeconds(30)
 while(-not $isPicked -and (Get-Date) -lt $until){
  if(-not (Focus $p)){ Start-Sleep -Milliseconds 500; continue }
  Write-Host "opening resume terminal"
  $ws.SendKeys('^%{${key}}')
  $wait=(Get-Date).AddSeconds(5)
  while((Get-Date) -lt $wait){
   if(-not (Test-Path $file)){ $isPicked=$true; break }
   Start-Sleep -Milliseconds 250
  }
 }
 if(-not $isPicked){ Remove-Item $file; Write-Host "resume file not picked up"; exit }
 Write-Host "resumed from file"
 if($isFresh){
  Start-Sleep -Milliseconds 1500
  if(Focus $p){ $ws.SendKeys('^%{F8}'); Write-Host "opened dev terminal" }
 }
 exit
}
Write-Host "opening side terminal"
$ws.SendKeys('^%{${key}}')
Start-Sleep -Milliseconds 3000
if(-not (Focus $p)){ Write-Host "aborted before typing: focus lost"; exit }
$ws.SendKeys('${command}')
Start-Sleep -Milliseconds 300
$ws.SendKeys('{ENTER}')
Write-Host "typed resume command"
`
  return new Promise<boolean>((resolve) => {
    let typed = false
    const p = spawn('powershell.exe', ['-NoProfile', '-Command', ps], { windowsHide: true })
    p.stdout?.on('data', (d) => {
      const s = d.toString()
      if (s.includes('typed resume command') || s.includes('resumed from file')) typed = true
      console.log('[ps]', s.trim())
    })
    p.stderr?.on('data', (d) => console.error('[ps-err]', d.toString().trim()))
    p.on('error', () => resolve(false))
    p.on('close', () => resolve(typed))
  })
}

export function focusWindow(projectPath: string): void {
  focusByTitle(basename(projectPath))
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

export function resumeStandalone(cwd: string, id: string, ticket: string | null): void {
  spawn('cmd.exe', ['/c', 'start', 'Claude Session', 'cmd', '/k', resumeCommand(id, ticket)], {
    cwd: cwd || undefined,
    detached: true,
    stdio: 'ignore'
  }).unref()
}

export async function reopenAndResume(
  projectPath: string,
  id: string,
  ticket: string | null,
  key: ResumeKey = 'F9',
  isLayoutConfigured = false
): Promise<boolean> {
  const needle = basename(projectPath)
  const openAndType = (): Promise<boolean> => {
    code([projectPath])
    return openInTerminal(needle, resumeCommand(id, ticket), key, isLayoutConfigured)
  }
  return resumeQueue(openAndType)
}

export async function focusOrOpen(session: {
  projectPath: string
  id: string
  isLive: boolean
  ticket: string | null
}): Promise<boolean> {
  if (session.isLive) {
    code([session.projectPath])
    focusByTitle(basename(session.projectPath))
    return true
  }
  return reopenAndResume(session.projectPath, session.id, session.ticket)
}
