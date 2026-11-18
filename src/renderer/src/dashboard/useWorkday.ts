import { onBeforeUnmount, ref, type Ref } from 'vue'
import { finishedJson, msToMidnight, readFinished, toggleFinished } from './workday'

const STORE_KEY = 'dash.finished'

const readStoredFinished = (now: number): string[] => {
  try {
    return readFinished(localStorage.getItem(STORE_KEY), now)
  } catch {
    return []
  }
}

export const useWorkday = (): { now: Ref<number>; finished: Ref<string[]>; toggleFinish: (key: string) => void } => {
  const now = ref(Date.now())
  const finished = ref(readStoredFinished(now.value))
  let timer: ReturnType<typeof setTimeout> | null = null
  const schedule = (): void => {
    timer = setTimeout(onMidnight, msToMidnight(Date.now()) + 1000)
  }
  const onMidnight = (): void => {
    now.value = Date.now()
    finished.value = readStoredFinished(now.value)
    schedule()
  }
  const stop = (): void => {
    if (timer) clearTimeout(timer)
  }
  const toggleFinish = (key: string): void => {
    const at = Date.now()
    finished.value = toggleFinished(readStoredFinished(at), key)
    try {
      localStorage.setItem(STORE_KEY, finishedJson(finished.value, at))
    } catch {
      return
    }
  }
  schedule()
  onBeforeUnmount(stop)
  return { now, finished, toggleFinish }
}
