import { describe, expect, it } from 'vitest'
import { photo } from '../test/fixtures'
import {
  addFree,
  addShape,
  addText,
  alignRects,
  distributeRects,
  duplicate,
  findPhoto,
  isLocked,
  moveSpread,
  placeItem,
  placePhoto,
  removePhoto,
  removeShape,
  removeSpread,
  renderDraft,
  restack,
  setFrameShape,
  setLocked,
  swapPhotos,
  updateShape,
} from './draft'
import type { Draft } from './types'

const a = photo(0.8, {}, 'a.jpg')
const b = photo(1.5, {}, 'b.jpg')
const c = photo(1, {}, 'c.jpg')
const photos = new Map([a, b, c].map((p) => [p.id, p]))

/** Cover, one spread with two framed slots, back. */
function zine(): Draft {
  return [
    { kind: 'cover', templateId: 'cover-framed', photoIds: [a.id] },
    { kind: 'spread', templateId: 'framed|framed', photoIds: [b.id, null] },
    { kind: 'back', templateId: 'back-black', photoIds: [] },
  ]
}

describe('placing and swapping photos', () => {
  it('swaps when a placed photo goes somewhere else', () => {
    const d = placePhoto(zine(), a.id, { type: 'slot', at: { surface: 1, slot: 0 } })
    expect(d[0].photoIds).toEqual([b.id])
    expect(d[1].photoIds[0]).toBe(a.id)
  })

  it('fills an empty slot with a new photo', () => {
    const d = placePhoto(zine(), c.id, { type: 'slot', at: { surface: 1, slot: 1 } })
    expect(d[1].photoIds).toEqual([b.id, c.id])
  })

  it('moves a photo to a free spot rather than showing it twice', () => {
    const { draft } = addFree(zine(), 1, a, { x: 0.25, y: 0.5 }, 1.6)
    expect(draft[0].photoIds).toEqual([null])
    expect(findPhoto(draft, a.id)).toMatchObject({ type: 'free', surface: 1 })
  })

  it('centres a free photo where it was dropped, at its own shape', () => {
    const { draft, id } = addFree(zine(), 1, b, { x: 0.25, y: 0.5 }, 1.6)
    const placed = renderDraft(draft, photos, 'instagram')[1].free.find((f) => f.id === id)!.placement.dest
    expect(placed.x + placed.w / 2).toBeCloseTo(0.25, 6)
    expect(placed.y + placed.h / 2).toBeCloseTo(0.5, 6)
    expect((placed.w * 1.6) / placed.h).toBeCloseTo(b.aspect, 6)
  })

  it('swaps a free photo with a slot', () => {
    const { draft, id } = addFree(zine(), 1, c, { x: 0.7, y: 0.5 }, 1.6)
    const d = swapPhotos(draft, { type: 'free', surface: 1, id }, { type: 'slot', at: { surface: 1, slot: 0 } })
    expect(d[1].photoIds[0]).toBe(c.id)
    expect(d[1].free![0].photoId).toBe(b.id)
  })

  it('removes a deleted photo from every page', () => {
    const { draft } = addFree(zine(), 1, c, { x: 0.7, y: 0.5 }, 1.6)
    const d = removePhoto(removePhoto(draft, a.id), c.id)
    expect(findPhoto(d, a.id)).toBeNull()
    expect(findPhoto(d, c.id)).toBeNull()
    expect(d[1].free).toEqual([])
  })
})

describe('arranging by hand', () => {
  it('brings things to the front and sends them to the back', () => {
    const { draft, id } = addText(zine(), 1)
    const front = restack(draft, 1, { type: 'slot', slot: 0 }, 'front')
    expect(front[1].frames![0]!.z).toBeGreaterThan(front[1].texts!.find((t) => t.id === id)!.z)
    const back = restack(draft, 1, { type: 'text', id }, 'back')
    expect(back[1].texts![0].z).toBeLessThan(0)
  })

  it('places any item at an exact position and size', () => {
    const rect = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 }
    const d = placeItem(zine(), 1, { type: 'slot', slot: 0 }, rect)
    expect(d[1].frames![0]!.box).toEqual(rect)
  })

  it('duplicates a slot photo as a free copy, offset and on top', () => {
    const rect = { x: 0.1, y: 0.1, w: 0.3, h: 0.3 }
    const { draft, item } = duplicate(zine(), 1, { type: 'slot', slot: 0 }, rect)
    expect(item.type).toBe('free')
    const copy = draft[1].free![0]
    expect(copy.photoId).toBe(b.id)
    expect(copy.box.x).toBeGreaterThan(rect.x)
  })

  it('locks and unlocks', () => {
    const layer = { type: 'slot', slot: 0 } as const
    const locked = setLocked(zine(), 1, layer, true)
    expect(isLocked(locked, 1, layer)).toBe(true)
    expect(isLocked(setLocked(locked, 1, layer, false), 1, layer)).toBe(false)
  })
})

describe('aligning and spacing', () => {
  const rects = [
    { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    { x: 0.4, y: 0.3, w: 0.1, h: 0.1 },
    { x: 0.8, y: 0.2, w: 0.1, h: 0.3 },
  ]

  it('aligns to the edges of the group', () => {
    expect(alignRects(rects, 'left').map((r) => r.x)).toEqual([0.1, 0.1, 0.1])
    expect(alignRects(rects, 'bottom').map((r) => +(r.y + r.h).toFixed(6))).toEqual([0.5, 0.5, 0.5])
  })

  it('centres one thing on a page', () => {
    const [r] = alignRects([rects[0]], 'centre', { x: 0, y: 0, w: 0.5, h: 1 })
    expect(r.x + r.w / 2).toBeCloseTo(0.25, 6)
  })

  it('spaces things evenly between the outer two', () => {
    const spaced = distributeRects(rects, 'x').sort((p, q) => p.x - q.x)
    const gaps = [spaced[1].x - (spaced[0].x + spaced[0].w), spaced[2].x - (spaced[1].x + spaced[1].w)]
    expect(gaps[0]).toBeCloseTo(gaps[1], 6)
    expect(spaced[0].x).toBeCloseTo(0.1, 6)
    expect(spaced[2].x).toBeCloseTo(0.8, 6)
  })
})

describe('pages', () => {
  const four: Draft = [
    { kind: 'cover', templateId: 'cover-framed', photoIds: [] },
    { kind: 'spread', templateId: 'quiet-blank-spread', photoIds: [] },
    { kind: 'spread', templateId: 'across', photoIds: [null] },
    { kind: 'back', templateId: 'back-black', photoIds: [] },
  ]

  it('reorders spreads but never moves the covers', () => {
    expect(moveSpread(four, 1, 1).map((s) => s.templateId)).toEqual(['cover-framed', 'across', 'quiet-blank-spread', 'back-black'])
    expect(moveSpread(four, 1, -1)).toBe(four)
  })

  it('keeps at least one spread', () => {
    const one = removeSpread(four, 1)
    expect(one.filter((s) => s.kind === 'spread')).toHaveLength(1)
    expect(removeSpread(one, 1)).toBe(one)
  })
})

describe('shapes', () => {
  it('starts on the right-hand page, behind every photo', () => {
    const { draft, id } = addShape(zine(), 1, 'rect', 'yellow', 1.6)
    const shape = draft[1].shapes!.find((f) => f.id === id)!
    expect(shape.box.x + shape.box.w / 2).toBeCloseTo(0.75, 6)
    expect(shape.z).toBeLessThan(0)
    expect(renderDraft(draft, photos, 'instagram')[1].shapes).toEqual([shape])
  })

  it('puts each new shape on top of the others, still behind the photos', () => {
    const first = addShape(zine(), 1, 'rect', 'yellow', 1.6)
    const second = addShape(first.draft, 1, 'ellipse', 'red', 1.6)
    const z = (id: string) => second.draft[1].shapes!.find((f) => f.id === id)!.z
    expect(z(second.id)).toBeGreaterThan(z(first.id))
    expect(z(second.id)).toBeLessThan(0)
  })

  it('draws a circle round, in physical proportion', () => {
    const { draft } = addShape(zine(), 1, 'ellipse', 'red', 1.6)
    const { box } = draft[1].shapes![0]
    expect((box.w * 1.6) / box.h).toBeCloseTo(1, 6)
  })

  it('moves, recolours, restacks, duplicates, locks and deletes like anything else', () => {
    const { draft, id } = addShape(zine(), 1, 'line', 'black', 1.6)
    const layer = { type: 'shape', id } as const
    const rect = { x: 0.1, y: 0.9, w: 0.8, h: 0.01 }
    let d = placeItem(draft, 1, layer, rect)
    expect(d[1].shapes![0].box).toEqual(rect)
    d = updateShape(d, 1, id, { color: 'red', opacity: 0.5 })
    expect(d[1].shapes![0]).toMatchObject({ color: 'red', opacity: 0.5 })
    d = restack(d, 1, layer, 'front')
    expect(d[1].shapes![0].z).toBeGreaterThan(1)
    const copy = duplicate(setLocked(d, 1, layer, true), 1, layer, rect)
    expect(copy.item.type).toBe('shape')
    expect(copy.draft[1].shapes).toHaveLength(2)
    expect(isLocked(copy.draft, 1, copy.item)).toBe(false)
    expect(removeShape(copy.draft, 1, id)[1].shapes!.map((f) => f.id)).toEqual([(copy.item as { id: string }).id])
  })
})

describe('frame shapes', () => {
  // A full-bleed page beside one of Magazine's circle pages.
  const circles = (): Draft => [
    { kind: 'cover', templateId: 'cover-framed', photoIds: [] },
    { kind: 'spread', templateId: 'm-full|m-circle', photoIds: [b.id, a.id] },
    { kind: 'back', templateId: 'back-black', photoIds: [] },
  ]
  const placed = (d: Draft, slot: number) => renderDraft(d, photos, 'letter')[1].slots[slot].placement!

  it('turns any photo into a circle: a square around the subject, square on the page', () => {
    const d = setFrameShape(circles(), { type: 'slot', at: { surface: 1, slot: 0 } }, 'circle')
    const { src, dest, shape } = placed(d, 0)
    const aspect = renderDraft(d, photos, 'letter')[1].aspect
    expect(shape).toBe('circle')
    expect((src.w * b.aspect) / src.h).toBeCloseTo(1, 6)
    expect((dest.w * aspect) / dest.h).toBeCloseTo(1, 6)
  })

  it('shows a free photo as a circle too', () => {
    const { draft, id } = addFree(zine(), 1, b, { x: 0.25, y: 0.5 }, 1.6)
    const d = setFrameShape(draft, { type: 'free', surface: 1, id }, 'circle')
    const { src, dest } = renderDraft(d, photos, 'instagram')[1].free[0].placement
    expect((src.w * b.aspect) / src.h).toBeCloseTo(1, 6)
    expect((dest.w * 1.6) / dest.h).toBeCloseTo(1, 6)
  })

  it('can undo a layout’s circle, showing the whole photo', () => {
    expect(placed(circles(), 1).shape).toBe('circle')
    const d = setFrameShape(circles(), { type: 'slot', at: { surface: 1, slot: 1 } }, 'plain')
    expect(placed(d, 1).shape).toBeUndefined()
    expect(placed(d, 1).src).toEqual({ x: 0, y: 0, w: 1, h: 1 })
  })

  it('rounds an arch or pill without cropping', () => {
    for (const shape of ['arch', 'pill'] as const) {
      const d = setFrameShape(circles(), { type: 'slot', at: { surface: 1, slot: 0 } }, shape)
      expect(placed(d, 0).shape).toBe(shape)
      expect(placed(d, 0).src).toEqual(placed(circles(), 0).src)
    }
  })

  it('keeps its shape when copied', () => {
    const { draft, item } = duplicate(circles(), 1, { type: 'slot', slot: 1 }, { x: 0.6, y: 0.2, w: 0.3, h: 0.3 })
    expect(draft[1].free!.find((f) => f.id === (item as { id: string }).id)!.shape).toBe('circle')
  })
})
