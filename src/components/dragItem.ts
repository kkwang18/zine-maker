import type { DragEvent } from 'react'

/** A photo dragged from the tray onto a page. */
export interface DragItem {
  type: 'photo'
  id: string
}

const MIME = 'application/x-zine-item'

export function startDrag(e: DragEvent, item: DragItem) {
  e.dataTransfer.setData(MIME, JSON.stringify(item))
  e.dataTransfer.effectAllowed = 'move'
}

export function isZineDrag(e: DragEvent): boolean {
  return e.dataTransfer.types.includes(MIME)
}

export function readDrag(e: DragEvent): DragItem | null {
  const raw = e.dataTransfer.getData(MIME)
  return raw ? (JSON.parse(raw) as DragItem) : null
}
