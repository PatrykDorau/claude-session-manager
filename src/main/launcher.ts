import { spawn } from 'node:child_process'
import { basename } from 'node:path'

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

export function resumeStandalone(cwd: string, id: string): void {
  spawn('cmd.exe', ['/c', 'start', 'Claude Session', 'cmd', '/k', `claude --resume ${id}`], {
    cwd: cwd || undefined,
    detached: true,
    stdio: 'ignore'
  }).unref()
}

export async function reopenAndResume(projectPath: string, id: string): Promise<boolean> {
  const needle = basename(projectPath)
  code([projectPath])
  return openInTerminal(needle, id)
}

export async function focusOrOpen(session: {
  projectPath: string
  id: string
  isLive: boolean
}): Promise<boolean> {
  if (session.isLive) {
    code([session.projectPath])
    focusByTitle(basename(session.projectPath))
    return true
  }
  return reopenAndResume(session.projectPath, session.id)
}
