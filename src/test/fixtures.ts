import type { Photo, PhotoStats } from '../lib/types'

// Test photos: no image files, just the shape and the numbers the app reads
// from a real photo.

let seed = 1

/** A deterministic, well-spread 64-bit value, so test photos never look like near-duplicates. */
function hash64(): bigint {
  let z = BigInt(seed++) * 0x9e3779b97f4a7c15n
  z = (z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n
  z = (z ^ (z >> 27n)) * 0x94d049bb133111ebn
  return (z ^ (z >> 31n)) & 0xffffffffffffffffn
}

export function photo(aspect: number, stats: Partial<PhotoStats> = {}, name = `photo-${seed}.jpg`): Photo {
  const height = 2000
  return {
    id: crypto.randomUUID(),
    name,
    file: new Blob([name], { type: 'image/jpeg' }),
    previewFile: null,
    thumbFile: null,
    url: '',
    preview: '',
    thumb: '',
    width: Math.round(height * aspect),
    height,
    aspect,
    stats: {
      meanLuma: 0.5,
      contrast: 0.2,
      tonalRange: 0.7,
      darkFraction: 0.1,
      brightFraction: 0.1,
      detail: 0.05,
      focus: { x: 0.5, y: 0.5 },
      hash: hash64(),
      ...stats,
    },
  }
}

/** A mixed set, like a real camera roll: portraits, landscapes, squares, a panorama. */
export function cameraRoll(count: number): Photo[] {
  const shapes = [0.667, 1.5, 0.8, 1.333, 1, 0.5625, 1.778, 2.4, 0.75]
  return Array.from({ length: count }, (_, i) =>
    photo(shapes[i % shapes.length], { meanLuma: 0.2 + ((i * 37) % 60) / 100, contrast: 0.1 + ((i * 13) % 30) / 100 }),
  )
}
