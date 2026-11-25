const isDocumentHidden = (): boolean => document.hidden

export const whenVisible = (run: () => void, isHidden: () => boolean = isDocumentHidden): (() => void) => {
  const tick = (): void => {
    if (!isHidden()) run()
  }
  return tick
}

export const onVisible = (run: () => void): (() => void) => {
  const handle = (): void => {
    if (!document.hidden) run()
  }
  document.addEventListener('visibilitychange', handle)
  const stop = (): void => document.removeEventListener('visibilitychange', handle)
  return stop
}
