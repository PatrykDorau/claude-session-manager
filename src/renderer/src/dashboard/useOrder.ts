import { ref } from 'vue'
import { moveKey, orderRows, readOrder, writeOrder } from './order'

type Rank = { isActive: boolean; priority: string | undefined }

export const useManualOrder = (prefix: string) => {
  const orders = ref<Record<string, string[] | undefined>>({})
  const dragging = ref<{ group: string; key: string } | null>(null)
  const dropTarget = ref<{ key: string; isAfter: boolean } | null>(null)
  const manualOf = (group: string): string[] | undefined =>
    group in orders.value ? orders.value[group] : (orders.value[group] = readOrder(`${prefix}.${group}`))
  const ordered = <T extends { key: string }>(group: string, rows: T[], rank: (row: T) => Rank): T[] => orderRows(rows, rank, manualOf(group))
  const isManual = (group: string): boolean => !!manualOf(group)?.length
  const save = (group: string, order: string[] | undefined): void => {
    orders.value = { ...orders.value, [group]: order }
    writeOrder(`${prefix}.${group}`, order)
  }
  const resetOrder = (group: string): void => save(group, undefined)
  const onDragStart = (e: DragEvent, group: string, key: string): void => {
    dragging.value = { group, key }
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
  }
  const onDragOver = (e: DragEvent, group: string, key: string): void => {
    if (dragging.value?.group !== group) return
    e.preventDefault()
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect()
    dropTarget.value = { key, isAfter: e.clientY > box.top + box.height / 2 }
  }
  const onDrop = (group: string, shown: string[]): void => {
    const from = dragging.value
    const target = dropTarget.value
    if (from && target && from.group === group) save(group, moveKey(shown, from.key, target.key, target.isAfter))
    onDragEnd()
  }
  const onDragEnd = (): void => {
    dragging.value = null
    dropTarget.value = null
  }
  return { ordered, isManual, resetOrder, onDragStart, onDragOver, onDrop, onDragEnd, dragging, dropTarget }
}
