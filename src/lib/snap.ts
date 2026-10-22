import type { Rect } from './types'

export interface Guides {
  x: number[]
  y: number[]
}

/**
 * Lines worth lining up with on a surface: its edges and centre, the middle
 * of each page on a spread, and the edges and centres of everything else on it.
 */
export function snapTargets(others: Rect[], spread: boolean): Guides {
  const x = [0, 0.5, 1, ...(spread ? [0.25, 0.75] : [])]
  const y = [0, 0.5, 1]
  for (const r of others) {
    x.push(r.x, r.x + r.w / 2, r.x + r.w)
    y.push(r.y, r.y + r.h / 2, r.y + r.h)
  }
  return { x, y }
}

/**
 * Nudge `start` so that its start, centre or end lands on the closest target
 * within `threshold`. Returns the new start and the line it snapped to.
 */
function snapAxis(start: number, size: number, targets: number[], threshold: number): [number, number | null] {
  let best: [number, number | null] = [start, null]
  let bestDistance = threshold
  for (const edge of [start, start + size / 2, start + size]) {
    for (const t of targets) {
      const d = Math.abs(t - edge)
      if (d < bestDistance) {
        bestDistance = d
        best = [start + (t - edge), t]
      }
    }
  }
  return best
}

/** Snap a rect being moved. `threshold` is in surface fractions per axis. */
export function snapMove(rect: Rect, targets: Guides, threshold: { x: number; y: number }): { rect: Rect; guides: Guides } {
  const [x, gx] = snapAxis(rect.x, rect.w, targets.x, threshold.x)
  const [y, gy] = snapAxis(rect.y, rect.h, targets.y, threshold.y)
  return { rect: { ...rect, x, y }, guides: { x: gx === null ? [] : [gx], y: gy === null ? [] : [gy] } }
}

/** Snap a single moving edge (when resizing). */
export function snapEdge(edge: number, targets: number[], threshold: number): [number, number | null] {
  const [snapped, guide] = snapAxis(edge, 0, targets, threshold)
  return [snapped, guide]
}
