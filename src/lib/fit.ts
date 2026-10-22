import { MAX_CROP_PER_SIDE } from './geometry'
import type { Photo, Rect, Slot } from './types'

export interface Fit {
  dest: Rect
  src: Rect
  /** 0..1, how well the photo suits the slot's shape. */
  quality: number
}

/**
 * Work out where a photo lands in a slot on a surface of the given aspect.
 * Returns null if the slot needs the photo to fill it but that would take more
 * than a small crop.
 */
export function fitPhoto(photo: Photo, slot: Slot, surfaceAspect: number): Fit | null {
  const { rect } = slot
  const slotAspect = (rect.w * surfaceAspect) / rect.h

  if (slot.shape === 'circle') return fitCircle(photo, slot, surfaceAspect)
  // Adaptive layouts size the frame to the photo, so any photo fits. The
  // slot's rect sketches the space it's meant for, though, and photos of a
  // similar shape fill that space best: judge it as a framed slot, gently.
  if (slot.flex) {
    const framed = fitPhoto(photo, { ...slot, flex: false, mode: 'fit' }, surfaceAspect)!
    return { ...framed, quality: 0.5 + framed.quality / 2 }
  }

  if (slot.mode === 'fill') {
    const src = trimToAspect(photo, slotAspect)
    if (!src) return null
    const trimmed = 1 - src.w * src.h
    return { dest: rect, src, quality: 1 - trimmed / (2 * MAX_CROP_PER_SIDE) / 2 }
  }

  // Fit: keep the whole photo, as large as the slot allows.
  const full = { x: 0, y: 0, w: 1, h: 1 }
  let w = rect.w
  let h = rect.h
  if (photo.aspect > slotAspect) h = (rect.w * surfaceAspect) / photo.aspect
  else w = (rect.h * photo.aspect) / surfaceAspect
  const dest = {
    x: rect.x + (rect.w - w) * slot.align.x,
    y: rect.y + (rect.h - h) * slot.align.y,
    w,
    h,
  }
  return { dest, src: full, quality: (w * h) / (rect.w * rect.h) }
}

/**
 * The part of the photo to keep so it matches `aspect`, trimming at most
 * MAX_CROP_PER_SIDE from any edge. The trim leans toward the side with less
 * going on, so the subject stays in frame.
 */
function trimToAspect(photo: Photo, aspect: number): Rect | null {
  const tooWide = photo.aspect > aspect
  const keep = tooWide ? aspect / photo.aspect : photo.aspect / aspect
  const trim = 1 - keep
  if (trim > 2 * MAX_CROP_PER_SIDE + 1e-9) return null

  const focus = tooWide ? photo.stats.focus.x : photo.stats.focus.y
  // Centre the kept window on the focus, then keep each side's trim within the limit.
  const ideal = focus - keep / 2
  const start = clamp(ideal, Math.max(0, trim - MAX_CROP_PER_SIDE), Math.min(trim, MAX_CROP_PER_SIDE))

  return tooWide ? { x: start, y: 0, w: keep, h: 1 } : { x: 0, y: start, w: 1, h: keep }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/**
 * The largest square that fits the slot, positioned by `align`, showing a
 * square cut from the photo around its subject. Only circle slots do this —
 * people opt in to the bigger crop.
 */
function fitCircle(photo: Photo, slot: Slot, surfaceAspect: number): Fit {
  const { rect, align } = slot
  // Work in units of the surface's height so width and height are comparable.
  const side = Math.min(rect.w * surfaceAspect, rect.h)
  const w = side / surfaceAspect
  const dest = { x: rect.x + (rect.w - w) * align.x, y: rect.y + (rect.h - side) * align.y, w, h: side }

  const wide = photo.aspect >= 1
  const keep = wide ? 1 / photo.aspect : photo.aspect
  const focus = wide ? photo.stats.focus.x : photo.stats.focus.y
  const start = clamp(focus - keep / 2, 0, 1 - keep)
  const src = wide ? { x: start, y: 0, w: keep, h: 1 } : { x: 0, y: start, w: 1, h: keep }
  // Squarer photos lose less to the circle.
  return { dest, src, quality: Math.sqrt(keep) }
}
