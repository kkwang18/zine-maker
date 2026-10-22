import { describe, expect, it } from 'vitest'
import { carouselPosts, SLIDES_PER_POST } from './carousel'
import { bookletSides, ONE_SHEET, paddedPages } from './imposition'

describe('the one-sheet fold', () => {
  it('uses every page once', () => {
    expect([...ONE_SHEET.top, ...ONE_SHEET.bottom].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('keeps each spread on neighbouring cells, and the covers together', () => {
    const cellOf = (n: number) =>
      ONE_SHEET.top.includes(n as never)
        ? { row: 'top', col: ONE_SHEET.top.indexOf(n as never) }
        : { row: 'bottom', col: ONE_SHEET.bottom.indexOf(n as never) }
    for (const [l, r] of [
      [2, 3],
      [4, 5],
      [6, 7],
      [8, 1],
    ]) {
      const a = cellOf(l)
      const b = cellOf(r)
      expect(a.row).toBe(b.row)
      expect(Math.abs(a.col - b.col)).toBe(1)
    }
  })
})

describe('stapled booklets', () => {
  it('pads to a multiple of 4 with blanks just before the back cover', () => {
    expect(paddedPages(8)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(paddedPages(10)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, null, null, 9])
  })

  for (const pages of [8, 10, 12, 18, 64]) {
    it(`${pages} pages: every page printed once, facing the right partner`, () => {
      const sides = bookletSides(pages)
      const total = paddedPages(pages).length
      expect(sides).toHaveLength(total / 2)
      const printed = sides.flatMap((s) => [s.left, s.right]).filter((p) => p !== null)
      expect([...printed].sort((x, y) => x! - y!)).toEqual(Array.from({ length: pages }, (_, i) => i))
      // In a nested booklet the two pages on a side always add up to the page count plus one.
      const padded = paddedPages(pages)
      const position = (i: number | null) => (i === null ? null : padded.indexOf(i) + 1)
      for (const s of sides) {
        const l = position(s.left)
        const r = position(s.right)
        if (l !== null && r !== null) expect(l + r).toBe(total + 1)
      }
    })
  }

  it('starts with the covers on the outside of the first sheet', () => {
    const [outside] = bookletSides(12)
    expect(outside).toEqual({ left: 11, right: 0 })
  })
})

describe('Instagram posts', () => {
  for (let spreads = 1; spreads <= 31; spreads++) {
    it(`${spreads} spreads: posts of at most 20, in order, spreads kept whole`, () => {
      const perSurface = [1, ...Array(spreads).fill(2), 1]
      const posts = carouselPosts(perSurface)
      const flat = posts.flat()
      expect(flat).toEqual(Array.from({ length: flat.length }, (_, i) => i))
      posts.forEach((p) => expect(p.length).toBeLessThanOrEqual(SLIDES_PER_POST))
      // Slide 2k-1 and 2k are a spread (after the cover): always in the same post.
      for (let s = 0; s < spreads; s++) {
        const left = 1 + s * 2
        expect(posts.findIndex((p) => p.includes(left))).toBe(posts.findIndex((p) => p.includes(left + 1)))
      }
      if (posts.length > 1) expect(posts[posts.length - 1].length).toBeGreaterThan(1)
    })
  }
})
