import { describe, expect, it } from 'vitest'
import { cameraRoll, photo } from '../test/fixtures'
import { lookAlikes, sequence } from './sequence'
import type { PaperSize, ZineStyle } from './types'

const STYLES: ZineStyle[] = ['quiet', 'magazine', 'collage']
const PAPERS: PaperSize[] = ['letter', 'a4', 'instagram']

describe('the automatic sequence', () => {
  for (const style of STYLES)
    for (const paper of PAPERS)
      it(`${style} on ${paper}: makes a zine from 4 to 9 photos`, () => {
        for (let n = 4; n <= 9; n++) {
          const photos = cameraRoll(n)
          const draft = sequence(photos, paper, style, style === 'magazine', 0)
          expect(draft, `${n} photos`).not.toBeNull()
          expect(draft!.map((s) => s.kind)).toEqual(['cover', 'spread', 'spread', 'spread', 'back'])

          // Every photo is used at most once.
          const used = draft!.flatMap((s) => s.photoIds.filter(Boolean))
          expect(new Set(used).size).toBe(used.length)

          // No spread layout repeats.
          const spreads = draft!.filter((s) => s.kind === 'spread').map((s) => s.templateId)
          expect(new Set(spreads).size).toBe(spreads.length)
        }
      })

  it('gives nothing for fewer than 4 photos', () => {
    expect(sequence(cameraRoll(3), 'letter', 'quiet', false)).toBeNull()
  })

  it('is the same every time for the same photos', () => {
    const photos = cameraRoll(8)
    expect(sequence(photos, 'letter', 'collage', false, 0)).toEqual(sequence(photos, 'letter', 'collage', false, 0))
  })

  it('offers different alternatives when asked for another', () => {
    const photos = cameraRoll(9)
    const first = JSON.stringify(sequence(photos, 'letter', 'quiet', false, 0))
    const second = JSON.stringify(sequence(photos, 'letter', 'quiet', false, 1))
    expect(second).not.toBe(first)
  })
})

describe('look-alikes', () => {
  it('flags a near-identical photo, and only that', () => {
    const a = photo(1.5)
    const twin = photo(1.5, { hash: a.stats.hash ^ 0b101n, contrast: 0.1 })
    const other = photo(0.8)
    const flagged = lookAlikes([a, twin, other])
    expect(flagged.size).toBe(1)
    expect(flagged.has(other.id)).toBe(false)
  })
})
