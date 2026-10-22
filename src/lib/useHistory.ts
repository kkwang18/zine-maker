import { useCallback, useState } from 'react'

/** How many steps back undo can go. */
const LIMIT = 200
/** Changes with the same key this close together count as one step (typing a title, say). */
const MERGE_MS = 1000

interface History<T> {
  past: T[]
  present: T
  future: T[]
  lastKey: string | null
  lastTime: number
}

/** State with undo and redo. */
export function useHistory<T>(initial: T) {
  const [h, setH] = useState<History<T>>({ past: [], present: initial, future: [], lastKey: null, lastTime: 0 })

  /** Apply a change as a new step. Pass `mergeKey` to fold quick repeats into one step. */
  const update = useCallback((change: (current: T) => T, mergeKey?: string) => {
    setH((h) => {
      const next = change(h.present)
      if (Object.is(next, h.present)) return h
      const now = Date.now()
      const merge = mergeKey !== undefined && mergeKey === h.lastKey && now - h.lastTime < MERGE_MS
      return {
        past: merge ? h.past : [...h.past, h.present].slice(-LIMIT),
        present: next,
        future: [],
        lastKey: mergeKey ?? null,
        lastTime: now,
      }
    })
  }, [])

  const undo = useCallback(() => {
    setH((h) =>
      h.past.length
        ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future], lastKey: null, lastTime: 0 }
        : h,
    )
  }, [])

  const redo = useCallback(() => {
    setH((h) =>
      h.future.length
        ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), lastKey: null, lastTime: 0 }
        : h,
    )
  }, [])

  /** Replace everything, with no history (opening a saved project, starting over). */
  const reset = useCallback((value: T) => {
    setH({ past: [], present: value, future: [], lastKey: null, lastTime: 0 })
  }, [])

  return { present: h.present, update, undo, redo, reset, canUndo: h.past.length > 0, canRedo: h.future.length > 0 }
}
