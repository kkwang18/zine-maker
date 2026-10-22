import type { Arrangement, Rect } from './types'

// Adaptive layouts. Instead of fixed frames that a photo may or may not suit,
// these size each frame to the shape of the photo in it, so the area fills
// up without cropping anything. All maths here is in physical units, where a
// surface is `aspect` wide and 1 tall; results come back as surface fractions.

/** Most a fanned deck spreads before photos stop overlapping, and least. */
const FAN_SPAN = { min: 1.15, max: 1.6 }
/** Share of the width a hero photo may take before its partners are squeezed out. */
const HERO_MAX = 0.62
/** How far partner photos tuck over the hero's edge. */
const HERO_TUCK = 0.06

type Box = { x: number; y: number; w: number; h: number }

/**
 * Frames for photos of the given shapes (width / height; a default stands in
 * for empty slots), arranged as `arrangement` asks, on a surface of `aspect`.
 */
export function arrange(arrangement: Arrangement, shapes: number[], aspect: number): Rect[] {
  const a = arrangement.area
  const area: Box = { x: a.x * aspect, y: a.y, w: a.w * aspect, h: a.h }
  const gap = (arrangement.gap ?? 0) * aspect
  let boxes: Box[]
  switch (arrangement.kind) {
    case 'rows':
      boxes = justify(area, shapes, gap)
      break
    case 'columns':
      // Columns are rows turned on their side.
      boxes = justify(flip(area), shapes.map((s) => 1 / s), gap).map(flip)
      break
    case 'fan':
      boxes = fan(area, shapes)
      break
    case 'hero':
      boxes = hero(area, shapes, gap, arrangement.side ?? 'left')
      break
  }
  return boxes.map((b) => ({ x: b.x / aspect, y: b.y, w: b.w / aspect, h: b.h }))
}

const flip = (b: Box): Box => ({ x: b.y, y: b.x, w: b.h, h: b.w })

/**
 * Justified rows: photos side by side, each row as tall as it needs to be to
 * span the full width. Tries every way of splitting the photos into up to
 * three rows and keeps the one whose height best matches the area.
 */
function justify(area: Box, shapes: number[], gap: number): Box[] {
  let best: { rows: number[][]; heights: number[]; total: number } | null = null
  // Photos may go in any order within the area; with a handful, try every
  // order and every way of breaking it into rows.
  const candidates = shapes.length <= 5 ? orders(shapes.length).flatMap((order) => splitOrder(order)) : splits(shapes.length, 3)
  for (const rows of candidates) {
    const heights = rows.map((row) => (area.w - gap * (row.length - 1)) / row.reduce((s, i) => s + shapes[i], 0))
    const total = heights.reduce((s, h) => s + h, 0) + gap * (rows.length - 1)
    // Over- and under-filling are judged alike: how many times too tall or short.
    if (!best || Math.abs(Math.log(total / area.h)) < Math.abs(Math.log(best.total / area.h))) best = { rows, heights, total }
  }
  const { rows, heights, total } = best!
  // Too tall to fit: shrink everything and centre it across the width.
  const scale = Math.min(1, area.h / total)
  const width = area.w * scale
  const x0 = area.x + (area.w - width) / 2
  let y = area.y + (area.h - total * scale) / 2
  const boxes: Box[] = new Array(shapes.length)
  rows.forEach((row, r) => {
    const h = heights[r] * scale
    let x = x0
    for (const i of row) {
      boxes[i] = { x, y, w: shapes[i] * h, h }
      x += shapes[i] * h + gap * scale
    }
    y += h + gap * scale
  })
  return boxes
}

/** Every ordering of 0..n-1. */
function orders(n: number): number[][] {
  if (n <= 1) return [Array.from({ length: n }, (_, i) => i)]
  return orders(n - 1).flatMap((rest) => Array.from({ length: n }, (_, at) => [...rest.slice(0, at), n - 1, ...rest.slice(at)]))
}

/** Every way to break an ordering into up to three rows. */
function splitOrder(order: number[]): number[][][] {
  return splits(order.length, Math.min(3, order.length)).map((rows) => rows.map((row) => row.map((i) => order[i])))
}

/** Every way to cut 0..n-1 into `rows` runs, for 1 up to `maxRows` rows. */
function splits(n: number, maxRows: number): number[][][] {
  const out: number[][][] = []
  const walk = (start: number, rowsLeft: number, acc: number[][]) => {
    if (start === n) {
      if (acc.length) out.push(acc)
      return
    }
    if (rowsLeft === 0) return
    for (let end = start + 1; end <= n; end++) {
      walk(end, rowsLeft - 1, [...acc, Array.from({ length: end - start }, (_, k) => start + k)])
    }
  }
  walk(0, maxRows, [])
  return out
}

/**
 * A fanned deck: photos of one height, overlapping left to right just enough
 * to span the width, alternately high and low.
 */
function fan(area: Box, shapes: number[]): Box[] {
  const sum = shapes.reduce((s, a) => s + a, 0)
  // As tall as possible, but no taller than spreads the deck past its widest.
  let h = Math.min(area.h * 0.9, (area.w * FAN_SPAN.max) / sum)
  // And tall enough that neighbours overlap, unless that won't fit.
  h = Math.min(area.h, Math.max(h, (area.w * FAN_SPAN.min) / sum))
  const widths = shapes.map((a) => a * h)
  const total = widths.reduce((s, w) => s + w, 0)
  const step = shapes.length > 1 ? (total - area.w) / (shapes.length - 1) : 0
  const free = area.h - h
  let x = area.x + (shapes.length > 1 ? 0 : (area.w - total) / 2)
  return widths.map((w, i) => {
    const box = { x, y: area.y + free * (i % 2 ? 0.85 : 0.15), w, h }
    x += w - step
    return box
  })
}

/**
 * One big photo at full height on one side, and the rest arranged in the
 * space beside it, tucked slightly over its edge. A photo too wide to stand
 * beside the others goes across the top instead, with the rest below.
 */
function hero(area: Box, shapes: number[], gap: number, side: 'left' | 'right'): Box[] {
  const [main, ...others] = shapes
  if (others.length && main * area.h > area.w * HERO_MAX) return heroTop(area, shapes, gap)
  let h = area.h
  let w = main * h
  if (w > area.w * HERO_MAX) {
    w = area.w * HERO_MAX
    h = w / main
  }
  const tuck = others.length ? area.w * HERO_TUCK : 0
  const first: Box = { x: area.x, y: area.y + (area.h - h) / 2, w, h }
  const restArea: Box = { x: area.x + w - tuck, y: area.y + area.h * 0.05, w: area.w - w + tuck, h: area.h * 0.9 }
  const rest = others.length ? justify(restArea, others, gap) : []
  const boxes = [first, ...rest]
  // The right-handed version is the same, mirrored.
  return side === 'left' ? boxes : boxes.map((b) => ({ ...b, x: 2 * area.x + area.w - b.x - b.w }))
}

/** The wide-hero version: the big photo across the top, the rest in a row tucked under its edge. */
function heroTop(area: Box, shapes: number[], gap: number): Box[] {
  const [main, ...others] = shapes
  const w = Math.min(area.w, main * area.h * HERO_MAX)
  const h = w / main
  const first: Box = { x: area.x + (area.w - w) / 2, y: area.y, w, h }
  const tuck = area.h * HERO_TUCK
  const restArea: Box = { x: area.x + area.w * 0.04, y: area.y + h - tuck, w: area.w * 0.92, h: area.h - h + tuck }
  return [first, ...justify(restArea, others, gap)]
}
