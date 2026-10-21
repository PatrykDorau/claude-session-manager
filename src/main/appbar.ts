import * as koffi from 'koffi'
import type { DockEdge, Rect } from './store'

const ABM_NEW = 0
const ABM_REMOVE = 1
const ABM_QUERYPOS = 2
const ABM_SETPOS = 3
const ABE: Record<DockEdge, number> = { left: 0, right: 2 }
const CALLBACK_MESSAGE = 0x8000 + 77

interface AppBarData {
  cbSize: number
  hWnd: bigint
  uCallbackMessage: number
  uEdge: number
  rc: { left: number; top: number; right: number; bottom: number }
  lParam: bigint
}

let shAppBarMessage: ((msg: number, data: AppBarData) => unknown) | null = null
let appBarDataSize = 0
const registered = new Set<bigint>()

const api = (): ((msg: number, data: AppBarData) => unknown) => {
  if (shAppBarMessage) return shAppBarMessage
  const RECT = koffi.struct('ABRECT', {
    left: 'int32',
    top: 'int32',
    right: 'int32',
    bottom: 'int32'
  })
  const APPBARDATA = koffi.struct('APPBARDATA', {
    cbSize: 'uint32',
    hWnd: 'uintptr_t',
    uCallbackMessage: 'uint32',
    uEdge: 'uint32',
    rc: RECT,
    lParam: 'intptr_t'
  })
  appBarDataSize = koffi.sizeof(APPBARDATA)
  const shell32 = koffi.load('shell32.dll')
  shAppBarMessage = shell32.func('__stdcall', 'SHAppBarMessage', 'uintptr_t', [
    'uint32',
    koffi.inout(koffi.pointer(APPBARDATA))
  ]) as unknown as (msg: number, data: AppBarData) => unknown
  return shAppBarMessage
}

const hwndOf = (handle: Buffer): bigint => handle.readBigUInt64LE(0)

const dataFor = (hwnd: bigint, edge: DockEdge, r: Rect): AppBarData => ({
  cbSize: appBarDataSize,
  hWnd: hwnd,
  uCallbackMessage: CALLBACK_MESSAGE,
  uEdge: ABE[edge],
  rc: { left: r.x, top: r.y, right: r.x + r.width, bottom: r.y + r.height },
  lParam: 0n
})

export function registerAppBar(
  handle: Buffer,
  edge: DockEdge,
  monitor: Rect,
  width: number
): Rect | null {
  try {
    const call = api()
    const hwnd = hwndOf(handle)
    const data = dataFor(hwnd, edge, monitor)
    if (!registered.has(hwnd)) {
      call(ABM_NEW, data)
      registered.add(hwnd)
    }
    call(ABM_QUERYPOS, data)
    if (edge === 'left') data.rc.right = data.rc.left + width
    else data.rc.left = data.rc.right - width
    call(ABM_SETPOS, data)
    const { left, top, right, bottom } = data.rc
    return { x: left, y: top, width: right - left, height: bottom - top }
  } catch (e) {
    console.error('[diag] appbar register failed:', e)
    return null
  }
}

export function unregisterAppBar(handle: Buffer): void {
  try {
    const hwnd = hwndOf(handle)
    if (!registered.has(hwnd)) return
    api()(ABM_REMOVE, dataFor(hwnd, 'left', { x: 0, y: 0, width: 0, height: 0 }))
    registered.delete(hwnd)
  } catch (e) {
    console.error('[diag] appbar remove failed:', e)
  }
}
