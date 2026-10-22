import { describe, expect, it } from 'vitest'
import { clipToSurface, crossesFold, nearTrim, pageInches, preflight, sliverEdges } from './preflight'
import type { Shape, Surface } from './types'

describe('page sizes', () => {
  it('knows each destination’s real page size', () => {
    expect(pageInches('letter', 'home', 3)).toEqual({ w: 2.75, h: 4.25 })
    expect(pageInches('letter', 'home', 5)).toEqual({ w: 5.5, h: 8.5 })
    expect(pageInches('letter', 'shop', 3)).toEqual({ w: 5.5, h: 8.5 })
    expect(pageInches('a4', 'shop', 3).w * 25.4).toBeCloseTo(148.5, 1)
    expect(pageInches('instagram', 'instagram', 3).w * 300).toBeCloseTo(1080, 6)
  })
})

describe('position checks', () => {
  it('spots things crossing the fold', () => {
    expect(crossesFold({ x: 0.4, y: 0, w: 0.2, h: 1 })).toBe(true)
    expect(crossesFold({ x: 0.1, y: 0, w: 0.3, h: 1 })).toBe(false)
  })

  it('spots things too close to the trim', () => {
    expect(nearTrim({ x: 0.01, y: 0.5, w: 0.2, h: 0.1 }, 0.03, 0.03)).toBe(true)
    expect(nearTrim({ x: 0.1, y: 0.5, w: 0.2, h: 0.1 }, 0.03, 0.03)).toBe(false)
  })

  it('spots a photo stopping just short of the edge, but not one that bleeds or sits well inside', () => {
    const page = { w: 5.5, h: 8.5 }
    expect(sliverEdges({ x: 0.005, y: -0.01, w: 0.995, h: 1.02 }, page, false)).toEqual(['left'])
    expect(sliverEdges({ x: -0.01, y: -0.01, w: 1.02, h: 1.02 }, page, false)).toEqual([])
    expect(sliverEdges({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, page, false)).toEqual([])
  })

  it('measures only the part of a photo that’s on the page', () => {
    const clipped = clipToSurface({ x: -0.2, y: 0.5, w: 0.5, h: 0.2 })!
    for (const [key, value] of Object.entries({ x: 0, y: 0.5, w: 0.3, h: 0.2 }))
      expect(clipped[key as keyof typeof clipped]).toBeCloseTo(value, 9)
    expect(clipToSurface({ x: 1.2, y: 0, w: 0.3, h: 0.3 })).toBeNull()
  })
})

describe('shapes at the trim', () => {
  // No text to measure: an empty page element.
  const book = { querySelectorAll: () => [] } as unknown as HTMLElement
  const bar = (box: Shape['box'], kind: Shape['kind'] = 'rect'): Surface[] => [
    {
      kind: 'cover',
      label: 'Cover',
      aspect: 5.5 / 8.5,
      templateId: 'cover-framed',
      slots: [],
      text: [],
      texts: [],
      free: [],
      shapes: [{ id: 'bar', kind, box, color: 'red', opacity: 1, z: 0 }],
    },
  ]

  it('flags a colour block a hair short of the edge, for a print shop', () => {
    // 1 pixel short at 300 dpi on a 5.5-inch page.
    const short = 1 / (5.5 * 300)
    const issues = preflight(book, bar({ x: short, y: 0.4, w: 0.5, h: 0.1 }), new Map(), 'letter', 'shop')
    expect(issues).toHaveLength(1)
    expect(issues[0].item).toEqual({ type: 'shape', id: 'bar' })
  })

  it('leaves blocks that bleed, circles, and home printing alone', () => {
    expect(preflight(book, bar({ x: -0.02, y: 0.4, w: 0.5, h: 0.1 }), new Map(), 'letter', 'shop')).toEqual([])
    expect(preflight(book, bar({ x: 0.001, y: 0.4, w: 0.5, h: 0.3 }, 'ellipse'), new Map(), 'letter', 'shop')).toEqual([])
    expect(preflight(book, bar({ x: 0.001, y: 0.4, w: 0.5, h: 0.1 }), new Map(), 'letter', 'home')).toEqual([])
  })
})
