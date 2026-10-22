import { describe, expect, it } from 'vitest'
import { photo } from '../test/fixtures'
import { fitPhoto } from './fit'
import { MAX_CROP_PER_SIDE } from './geometry'
import type { Slot } from './types'

const PAGE = 0.8 // a 4:5 page
const slot = (mode: Slot['mode'], extra: Partial<Slot> = {}): Slot => ({
  rect: { x: 0, y: 0, w: 1, h: 1 },
  mode,
  align: { x: 0.5, y: 0.5 },
  role: 'bleed',
  ...extra,
})

describe('filling a slot', () => {
  it('fills with a small crop, never more than 5% off any side', () => {
    for (const aspect of [0.72, 0.76, 0.8, 0.84, 0.88]) {
      const fit = fitPhoto(photo(aspect, { focus: { x: 0.1, y: 0.9 } }), slot('fill'), PAGE)
      expect(fit).not.toBeNull()
      const { src } = fit!
      for (const trim of [src.x, src.y, 1 - src.x - src.w, 1 - src.y - src.h]) {
        expect(trim).toBeGreaterThanOrEqual(-1e-9)
        expect(trim).toBeLessThanOrEqual(MAX_CROP_PER_SIDE + 1e-9)
      }
    }
  })

  it('refuses a photo that would need a bigger crop', () => {
    expect(fitPhoto(photo(1.5), slot('fill'), PAGE)).toBeNull()
    expect(fitPhoto(photo(0.5), slot('fill'), PAGE)).toBeNull()
  })

  it('leans the crop away from the subject', () => {
    const left = fitPhoto(photo(0.86, { focus: { x: 0.1, y: 0.5 } }), slot('fill'), PAGE)!
    const right = fitPhoto(photo(0.86, { focus: { x: 0.9, y: 0.5 } }), slot('fill'), PAGE)!
    expect(left.src.x).toBeLessThan(right.src.x)
  })
})

describe('framing a photo in a slot', () => {
  it('keeps the whole photo, at its own shape, inside the slot', () => {
    for (const aspect of [0.5, 1, 2.4]) {
      const { dest, src } = fitPhoto(photo(aspect), slot('fit'), PAGE)!
      expect(src).toEqual({ x: 0, y: 0, w: 1, h: 1 })
      expect((dest.w * PAGE) / dest.h).toBeCloseTo(aspect, 6)
      expect(dest.x).toBeGreaterThanOrEqual(0)
      expect(dest.x + dest.w).toBeLessThanOrEqual(1 + 1e-9)
    }
  })
})

describe('circles', () => {
  it('shows a square cut around the subject, as a square on the page', () => {
    const p = photo(1.5, { focus: { x: 0.8, y: 0.5 } })
    const { dest, src } = fitPhoto(p, slot('fit', { shape: 'circle' }), PAGE)!
    expect((src.w * p.aspect) / src.h).toBeCloseTo(1, 6)
    expect((dest.w * PAGE) / dest.h).toBeCloseTo(1, 6)
    // The subject is on the right, so the square is taken from the right.
    expect(src.x).toBeGreaterThan(0)
  })
})
