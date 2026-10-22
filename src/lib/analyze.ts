import type { Photo, PhotoData, PhotoStats } from './types'

// Analysis runs on a small copy of the image. It only reads pixels; the
// original file is never changed and is kept for printing.
const SAMPLE_SIZE = 128
const FOCUS_EDGE_THRESHOLD = 0.12

// Full-size camera photos (often 12–48 megapixels) are slow to draw and move
// around on screen, so the page shows a resized copy; exports swap the
// original back in. The tray needs an even smaller copy.
const PREVIEW_SIZE = 2560
const THUMB_SIZE = 400

export async function loadPhoto(file: File): Promise<Photo> {
  // Browsers apply EXIF orientation here by default, matching how <img> shows it.
  const bitmap = await createImageBitmap(file)
  try {
    const { width, height } = bitmap
    const [previewFile, thumbFile] = await Promise.all([resized(bitmap, PREVIEW_SIZE), resized(bitmap, THUMB_SIZE)])
    return showable({
      id: crypto.randomUUID(),
      name: file.name,
      file,
      previewFile,
      thumbFile,
      width,
      height,
      aspect: width / height,
      stats: analyze(bitmap),
    })
  } finally {
    bitmap.close()
  }
}

/** Give a stored photo URLs to show it by. */
export function showable(data: PhotoData): Photo {
  const url = URL.createObjectURL(data.file)
  return {
    ...data,
    url,
    preview: data.previewFile ? URL.createObjectURL(data.previewFile) : url,
    thumb: data.thumbFile ? URL.createObjectURL(data.thumbFile) : url,
  }
}

/** Release a photo's URLs once it's gone. */
export function forget(photo: Photo) {
  new Set([photo.url, photo.preview, photo.thumb]).forEach((u) => URL.revokeObjectURL(u))
}

/** Just the stored parts of a photo, without its URLs. */
export function stored({ id, name, file, previewFile, thumbFile, width, height, aspect, stats }: Photo): PhotoData {
  return { id, name, file, previewFile, thumbFile, width, height, aspect, stats }
}

/** A copy no longer than `size` on its long edge, or null if the original is already that small. */
async function resized(bitmap: ImageBitmap, size: number): Promise<Blob | null> {
  const scale = size / Math.max(bitmap.width, bitmap.height)
  if (scale >= 1) return null
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale))
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 })
}

function lumaPixels(source: ImageBitmap, w: number, h: number): Float32Array {
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(source, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)
  const luma = new Float32Array(w * h)
  for (let i = 0; i < luma.length; i++) {
    const r = data[i * 4] / 255
    const g = data[i * 4 + 1] / 255
    const b = data[i * 4 + 2] / 255
    luma[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  return luma
}

function analyze(bitmap: ImageBitmap): PhotoStats {
  const scale = SAMPLE_SIZE / Math.max(bitmap.width, bitmap.height)
  const w = Math.max(2, Math.round(bitmap.width * scale))
  const h = Math.max(2, Math.round(bitmap.height * scale))
  const luma = lumaPixels(bitmap, w, h)
  const n = luma.length

  let sum = 0
  let dark = 0
  let bright = 0
  const histogram = new Uint32Array(256)
  for (const v of luma) {
    sum += v
    if (v < 0.12) dark++
    if (v > 0.85) bright++
    histogram[Math.min(255, Math.floor(v * 256))]++
  }
  const mean = sum / n

  let variance = 0
  for (const v of luma) variance += (v - mean) ** 2

  // Edge strength per pixel; its average is "detail", its centroid is "focus".
  let edgeSum = 0
  let focusWeight = 0
  let fx = 0
  let fy = 0
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const i = y * w + x
      const e = Math.abs(luma[i + 1] - luma[i]) + Math.abs(luma[i + w] - luma[i])
      edgeSum += e
      // Only clear edges say where the subject is; grain and noise would pull it to the centre.
      const strong = Math.max(0, e - FOCUS_EDGE_THRESHOLD)
      focusWeight += strong
      fx += strong * (x + 0.5)
      fy += strong * (y + 0.5)
    }
  }

  return {
    meanLuma: mean,
    contrast: Math.sqrt(variance / n),
    tonalRange: percentile(histogram, n, 0.98) - percentile(histogram, n, 0.02),
    darkFraction: dark / n,
    brightFraction: bright / n,
    detail: edgeSum / ((w - 1) * (h - 1)),
    focus: focusWeight > 0 ? { x: fx / focusWeight / w, y: fy / focusWeight / h } : { x: 0.5, y: 0.5 },
    hash: differenceHash(bitmap),
  }
}

function percentile(histogram: Uint32Array, n: number, p: number): number {
  let seen = 0
  for (let i = 0; i < histogram.length; i++) {
    seen += histogram[i]
    if (seen >= p * n) return i / 255
  }
  return 1
}

/** dHash: shrink to 9×8, then record whether each pixel is brighter than its right neighbour. */
function differenceHash(bitmap: ImageBitmap): bigint {
  const luma = lumaPixels(bitmap, 9, 8)
  let hash = 0n
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      hash = (hash << 1n) | (luma[y * 9 + x] > luma[y * 9 + x + 1] ? 1n : 0n)
    }
  }
  return hash
}

export function hammingDistance(a: bigint, b: bigint): number {
  let x = a ^ b
  let count = 0
  while (x) {
    x &= x - 1n
    count++
  }
  return count
}
