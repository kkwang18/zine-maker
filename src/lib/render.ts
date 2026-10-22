import { getFontEmbedCSS, toCanvas } from 'html-to-image'

/** Editing aids that shouldn't end up in the pictures. */
const EDITING_ONLY = ['slot--empty', 'edit-ui', 'surface__seam']

function isPrintable(node: HTMLElement): boolean {
  return !EDITING_ONLY.some((c) => node.classList?.contains(c))
}

/**
 * Draw every page of the zine, as laid out on screen, at `size` pixels each,
 * in reading order: cover, then each spread's left and right pages, then back.
 * A spread is drawn once at double width and cut in half, so anything
 * crossing the fold runs on exactly from one page to the next.
 */
export async function renderPages(book: HTMLElement, size: { width: number; height: number }): Promise<Blob[]> {
  // Hide selection and hover outlines while drawing.
  book.classList.add('is-exporting')
  try {
    return await drawPages(book, size)
  } finally {
    book.classList.remove('is-exporting')
  }
}

async function drawPages(book: HTMLElement, size: { width: number; height: number }): Promise<Blob[]> {
  // Embed the fonts once for every surface, rather than once per surface.
  const fontEmbedCSS = await getFontEmbedCSS(book)
  const pages: Blob[] = []

  for (const surface of book.querySelectorAll<HTMLElement>('.surface')) {
    const count = surface.classList.contains('surface--spread') ? 2 : 1
    const pixelRatio = (size.width * count) / surface.offsetWidth
    const drawn = await withOriginals(surface, pixelRatio, () =>
      toCanvas(surface, { pixelRatio, fontEmbedCSS, filter: isPrintable }),
    )
    for (let i = 0; i < count; i++) {
      const page = document.createElement('canvas')
      page.width = size.width
      page.height = size.height
      const sw = drawn.width / count
      page.getContext('2d')!.drawImage(drawn, sw * i, 0, sw, drawn.height, 0, 0, size.width, size.height)
      pages.push(await new Promise<Blob>((done) => page.toBlob((b) => done(b!), 'image/jpeg', 0.92)))
    }
  }
  return pages
}

/**
 * The page shows resized copies of the photos to stay quick. For export, each
 * photo is redrawn from its original file at exactly the size it will appear
 * on the page (`scale` = export pixels per screen pixel), swapped in while the
 * surface is drawn, then swapped back. That's as sharp as the original allows,
 * without pushing whole camera files through the renderer.
 */
async function withOriginals<T>(surface: HTMLElement, scale: number, draw: () => Promise<T>): Promise<T> {
  const imgs = [...surface.querySelectorAll<HTMLImageElement>('img[data-original]')]
  const swapped = await Promise.all(
    imgs.map(async (img) => {
      const preview = img.src
      const needed = Math.ceil(img.getBoundingClientRect().width * scale)
      // Already showing the original, or the preview is sharp enough for this size.
      if (preview === img.dataset.original || needed <= img.naturalWidth) return null
      const url = await resizedOriginal(img.dataset.original!, needed)
      // The exporter reads the file at `src` itself, so no need to wait for it to display.
      img.src = url
      return { img, preview, url }
    }),
  )
  try {
    return await draw()
  } finally {
    for (const s of swapped) {
      if (!s) continue
      s.img.src = s.preview
      URL.revokeObjectURL(s.url)
    }
  }
}

/** The original file, scaled to `width` pixels wide (never enlarged). */
async function resizedOriginal(original: string, width: number): Promise<string> {
  const blob = await (await fetch(original)).blob()
  const full = await createImageBitmap(blob)
  const w = Math.min(width, full.width)
  const h = Math.round((full.height * w) / full.width)
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(full, 0, 0, w, h)
  full.close()
  return URL.createObjectURL(await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.95 }))
}
