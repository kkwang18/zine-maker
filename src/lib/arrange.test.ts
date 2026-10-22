import { describe, expect, it } from 'vitest'
import { arrange } from './arrange'
import type { Rect } from './types'

const ASPECT = 1.6 // an Instagram spread
const AREA = { x: 0.015, y: 0.025, w: 0.97, h: 0.95 }
const EPS = 1e-6

const inside = (r: Rect, a: Rect) =>
  r.x >= a.x - EPS && r.y >= a.y - EPS && r.x + r.w <= a.x + a.w + EPS && r.y + r.h <= a.y + a.h + EPS

/** Physical width ÷ height of a frame on the surface. */
const shapeOf = (r: Rect) => (r.w * ASPECT) / r.h

const overlap = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))

const sets = [
  [1.5, 0.667],
  [0.8, 1.333, 1],
  [0.667, 1.778, 1, 0.5625, 0.8],
  [2.4, 0.75, 1.5, 1.333],
]

describe('mosaics (rows and columns)', () => {
  for (const kind of ['rows', 'columns'] as const) {
    for (const shapes of sets) {
      it(`${kind} of ${shapes.length}: frames fit the photos exactly, stay inside, never overlap`, () => {
        const rects = arrange({ kind, area: AREA }, shapes, ASPECT)
        expect(rects).toHaveLength(shapes.length)
        rects.forEach((r, i) => {
          expect(inside(r, AREA)).toBe(true)
          // Each frame has its photo's shape, so nothing is cropped.
          expect(shapeOf(r)).toBeCloseTo(shapes[i], 6)
        })
        for (let i = 0; i < rects.length; i++)
          for (let j = i + 1; j < rects.length; j++) expect(overlap(rects[i], rects[j])).toBeLessThan(1e-9)
      })
    }
  }

  it('packs mixed shapes tightly by trying every order', () => {
    const rects = arrange({ kind: 'rows', area: AREA }, [1.5, 0.667, 2.37, 1.333, 0.8], ASPECT)
    const covered = rects.reduce((n, r) => n + r.w * r.h, 0) / (AREA.w * AREA.h)
    expect(covered).toBeGreaterThan(0.85)
  })
})

describe('fanned deck', () => {
  it('overlaps neighbours, keeps one height and stays within the width', () => {
    const rects = arrange({ kind: 'fan', area: AREA }, [0.667, 0.8, 0.75], ASPECT)
    const heights = new Set(rects.map((r) => r.h.toFixed(6)))
    expect(heights.size).toBe(1)
    expect(rects[0].x).toBeCloseTo(AREA.x, 6)
    expect(rects[2].x + rects[2].w).toBeCloseTo(AREA.x + AREA.w, 6)
    expect(overlap(rects[0], rects[1])).toBeGreaterThan(0)
    rects.forEach((r, i) => expect(shapeOf(r)).toBeCloseTo([0.667, 0.8, 0.75][i], 6))
  })
})

describe('hero', () => {
  it('stands a tall photo full height on its side, with the rest beside it', () => {
    const [hero, ...rest] = arrange({ kind: 'hero', area: AREA, side: 'left' }, [0.8, 1.5, 1.5], ASPECT)
    expect(hero.h).toBeCloseTo(AREA.h, 6)
    expect(hero.x).toBeCloseTo(AREA.x, 6)
    rest.forEach((r) => expect(r.x).toBeGreaterThan(hero.x))
  })

  it('mirrors for the right-hand version', () => {
    const [left] = arrange({ kind: 'hero', area: AREA, side: 'left' }, [0.8, 1.5], ASPECT)
    const [right] = arrange({ kind: 'hero', area: AREA, side: 'right' }, [0.8, 1.5], ASPECT)
    expect(right.x + right.w).toBeCloseTo(AREA.x + AREA.w, 6)
    expect(right.w).toBeCloseTo(left.w, 6)
  })

  it('puts a wide photo across the top instead', () => {
    const [hero, ...rest] = arrange({ kind: 'hero', area: AREA }, [2.4, 0.8, 0.8], ASPECT)
    expect(hero.y).toBeCloseTo(AREA.y, 6)
    rest.forEach((r) => expect(r.y).toBeGreaterThan(hero.y + hero.h / 2))
  })
})
