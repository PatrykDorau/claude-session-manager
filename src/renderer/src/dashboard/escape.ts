import { onBeforeUnmount, watch, type Ref } from 'vue'

export const useEscapeClose = (isOpen: Ref<boolean>, close: () => void): void => {
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return
    e.stopPropagation()
    close()
  }
  const sync = (isNowOpen: boolean): void => {
    if (isNowOpen) window.addEventListener('keydown', onKey, true)
    else window.removeEventListener('keydown', onKey, true)
  }
  const stop = (): void => window.removeEventListener('keydown', onKey, true)
  watch(isOpen, sync, { immediate: true })
  onBeforeUnmount(stop)
}
