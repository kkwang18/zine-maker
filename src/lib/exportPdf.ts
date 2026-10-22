import { degrees, PDFDocument, rgb, StandardFonts, type PDFImage, type PDFPage } from 'pdf-lib'
import { bookletSides, ONE_SHEET, paddedPages } from './imposition'
import { renderPages } from './render'

// Print-ready PDFs. Pages are drawn at 300 dpi and arranged ("imposed") on the
// sheet so that, once printed and folded, they read in order.

/** Landscape sheet sizes, in PDF points (72 per inch). */
const SHEETS = {
  letter: { label: 'Letter', w: 792, h: 612 },
  a4: { label: 'A4', w: 841.89, h: 595.28 },
}

const DPI = 300
const MARK = rgb(0.6, 0.6, 0.6)
const CUT = rgb(0.9, 0.25, 0.15)

export type PrintPaper = keyof typeof SHEETS

/**
 * The whole zine as a PDF. With three spreads it's the classic 8-page zine
 * folded from one sheet; any other length becomes a stapled booklet.
 */
export async function renderPrintPdf(book: HTMLElement, paper: PrintPaper, title: string): Promise<Blob> {
  const sheet = SHEETS[paper]
  const spreads = book.querySelectorAll('.surface--spread').length
  const oneSheet = spreads === 3
  // One-sheet zines have 8 pages per sheet (4 × 2); booklets have 2 per side.
  const page = oneSheet ? { w: sheet.w / 4, h: sheet.h / 2 } : { w: sheet.w / 2, h: sheet.h }
  const px = { width: Math.round((page.w * DPI) / 72), height: Math.round((page.h * DPI) / 72) }

  const pdf = await PDFDocument.create()
  pdf.setTitle(title || 'Zine')
  pdf.setCreator('zine maker')
  const blobs = await renderPages(book, px)
  const pages = await Promise.all(blobs.map(async (b) => pdf.embedJpg(await b.arrayBuffer())))

  if (oneSheet) imposeOneSheet(pdf, pages, sheet)
  else imposeBooklet(pdf, pages, sheet)
  await addInstructions(pdf, sheet, oneSheet, pages.length)
  return new Blob([(await pdf.save()) as BlobPart], { type: 'application/pdf' })
}

/** The 8-page one-sheet fold (see ONE_SHEET for the page order). */
function imposeOneSheet(pdf: PDFDocument, pages: PDFImage[], sheet: { w: number; h: number }) {
  const out = pdf.addPage([sheet.w, sheet.h])
  const cw = sheet.w / 4
  const ch = sheet.h / 2
  const { top, bottom } = ONE_SHEET
  bottom.forEach((n, c) => out.drawImage(pages[n - 1], { x: c * cw, y: 0, width: cw, height: ch }))
  // Rotating 180° turns the image about its bottom-left corner, so anchor at the cell's top-right.
  top.forEach((n, c) =>
    out.drawImage(pages[n - 1], { x: (c + 1) * cw, y: 2 * ch, width: cw, height: ch, rotate: degrees(180) }),
  )
  // Small fold marks at the sheet's edges.
  for (const x of [cw, 2 * cw, 3 * cw]) {
    tick(out, x, 0, x, 10)
    tick(out, x, sheet.h - 10, x, sheet.h)
  }
  tick(out, 0, ch, 10, ch)
  tick(out, sheet.w - 10, ch, sheet.w, ch)
}

/**
 * A stapled booklet: sheets printed on both sides, two pages per side, nested
 * and folded. Blank pages go before the back cover to make a multiple of 4.
 */
function imposeBooklet(pdf: PDFDocument, pages: PDFImage[], sheet: { w: number; h: number }) {
  const half = sheet.w / 2
  for (const { left, right } of bookletSides(pages.length)) {
    const side = pdf.addPage([sheet.w, sheet.h])
    if (left !== null) side.drawImage(pages[left], { x: 0, y: 0, width: half, height: sheet.h })
    if (right !== null) side.drawImage(pages[right], { x: half, y: 0, width: half, height: sheet.h })
    tick(side, half, 0, half, 10)
    tick(side, half, sheet.h - 10, half, sheet.h)
  }
}

function tick(page: PDFPage, x1: number, y1: number, x2: number, y2: number) {
  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.5, color: MARK })
}

/** A last page explaining how to print and fold. */
async function addInstructions(
  pdf: PDFDocument,
  sheet: { label: string; w: number; h: number },
  oneSheet: boolean,
  pageCount: number,
) {
  const page = pdf.addPage([sheet.w, sheet.h])
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const ink = rgb(0.04, 0.04, 0.04)
  const left = 54
  let y = sheet.h - 64

  page.drawText(oneSheet ? 'How to fold your zine' : 'How to put your zine together', { x: left, y, size: 22, font: bold, color: ink })
  y -= 36

  const sheets = Math.ceil(pageCount / 4)
  const steps = oneSheet
    ? [
        `Print only page 1 of this PDF, one-sided, on ${sheet.label} paper in landscape, at 100% ("Actual size", not "Fit").`,
        'Fold the sheet in half top to bottom, crease it, and unfold.',
        'Fold it in half left to right, crease, unfold. Fold each short edge in to that middle crease, crease, unfold. You now have 8 panels.',
        'Fold in half top to bottom again. Cut along the middle crease, through the fold, across the middle two panels only (the red line).',
        'Open it out, then fold it in half the long way, pictures facing out. Push the two ends toward each other: the cut opens into a diamond. Keep pushing until it collapses into a booklet, then fold it closed with the cover on the front.',
      ]
    : [
        `Print every page of this PDF except this one, double-sided ("flip on short edge"), on ${sheet.label} paper in landscape, at 100% ("Actual size").`,
        `You'll have ${sheets} sheet${sheets === 1 ? '' : 's'}. Keep them in the order they printed and stack them, the first sheet on the outside.`,
        'Fold the stack in half, crease it firmly, and staple twice along the fold.',
      ]
  steps.forEach((step, i) => {
    page.drawText(`${i + 1}.`, { x: left, y, size: 11, font: bold, color: ink })
    for (const line of wrap(step, regular, 11, oneSheet ? 360 : 640)) {
      page.drawText(line, { x: left + 18, y, size: 11, font: regular, color: ink })
      y -= 15
    }
    y -= 8
  })
  // The PDF's built-in fonts can't draw curly quotes, so this note sticks to straight ones.
  page.drawText("Most home printers leave a thin white border at the edges. That's normal.", {
    x: left,
    y: Math.min(y - 6, 70),
    size: 9,
    font: regular,
    color: rgb(0.4, 0.4, 0.4),
  })

  if (oneSheet) {
    // A small diagram of the sheet: page numbers, and the cut in red.
    const w = 300
    const h = (w * sheet.h) / sheet.w
    const x0 = sheet.w - w - 54
    const y0 = sheet.h - 120 - h
    const cw = w / 4
    const ch = h / 2
    page.drawRectangle({ x: x0, y: y0, width: w, height: h, borderColor: ink, borderWidth: 1 })
    for (let c = 1; c < 4; c++) tick(page, x0 + c * cw, y0, x0 + c * cw, y0 + h)
    tick(page, x0, y0 + ch, x0 + w, y0 + ch)
    const label = (n: number) => (n === 1 ? 'cover' : n === 8 ? 'back' : String(n))
    ;[6, 7, 8, 1].forEach((n, c) =>
      page.drawText(label(n), { x: x0 + c * cw + 8, y: y0 + 8, size: 10, font: regular, color: ink }),
    )
    ;[5, 4, 3, 2].forEach((n, c) =>
      page.drawText(label(n), { x: x0 + (c + 1) * cw - 8, y: y0 + h - 8, size: 10, font: regular, color: ink, rotate: degrees(180) }),
    )
    page.drawLine({ start: { x: x0 + cw, y: y0 + ch }, end: { x: x0 + 3 * cw, y: y0 + ch }, thickness: 2, color: CUT, dashArray: [5, 3] })
    page.drawText('cut', { x: x0 + 2 * cw - 8, y: y0 + ch + 5, size: 9, font: bold, color: CUT })
    page.drawText('The top row prints upside down on purpose.', { x: x0, y: y0 - 16, size: 9, font: regular, color: rgb(0.4, 0.4, 0.4) })
  }
}

/** Break text into lines no wider than `width` points. */
function wrap(text: string, font: { widthOfTextAtSize: (t: string, s: number) => number }, size: number, width: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

// ── For a print shop ────────────────────────────────────────────────────────
// Print shops print, trim and staple themselves, so they want single pages in
// order, each with bleed (picture carried past the trim, so a slightly-off cut
// never shows a white edge) and crop marks showing where to cut. Pages are a
// standard zine size: half-letter, or A5.

/** Trim size of each page, in points, and the bleed around it. */
const SHOP = {
  letter: { label: 'Half-letter, 5.5 × 8.5 in', w: 396, h: 612, bleed: 9 },
  a4: { label: 'A5, 148 × 210 mm', w: 419.53, h: 595.28, bleed: 8.5 },
}
/** Room outside the bleed for crop marks. */
const SLUG = 22

export async function renderShopPdf(book: HTMLElement, paper: PrintPaper, title: string): Promise<Blob> {
  const size = SHOP[paper]
  const px = (pt: number) => Math.round((pt * DPI) / 72)
  const bleedPx = px(size.bleed)

  const pdf = await PDFDocument.create()
  pdf.setTitle(title || 'Zine')
  pdf.setCreator('zine maker')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const pages = await renderPages(book, { width: px(size.w), height: px(size.h) })

  // Stapled booklets need a multiple of 4 pages: blanks go before the back cover.
  const ordered = paddedPages(pages.length).map((i) => (i === null ? null : pages[i]))
  const total = ordered.length

  const media = { w: size.w + 2 * (size.bleed + SLUG), h: size.h + 2 * (size.bleed + SLUG) }
  const trim = { x: SLUG + size.bleed, y: SLUG + size.bleed }
  for (const [i, blob] of ordered.entries()) {
    const out = pdf.addPage([media.w, media.h])
    out.setBleedBox(SLUG, SLUG, size.w + 2 * size.bleed, size.h + 2 * size.bleed)
    out.setTrimBox(trim.x, trim.y, size.w, size.h)
    if (blob) {
      const image = await pdf.embedJpg(await (await withBleed(blob, bleedPx)).arrayBuffer())
      out.drawImage(image, { x: SLUG, y: SLUG, width: size.w + 2 * size.bleed, height: size.h + 2 * size.bleed })
    }
    cropMarks(out, trim.x, trim.y, size.w, size.h)
    out.drawText(`${title || 'Zine'} · page ${i + 1} of ${total} · ${size.label}`, {
      x: trim.x,
      y: 7,
      size: 6,
      font,
      color: MARK,
    })
  }
  return new Blob([(await pdf.save()) as BlobPart], { type: 'application/pdf' })
}

/**
 * Add bleed by mirroring each edge of the page outward. The picture inside the
 * trim is exactly as designed; if the cut drifts, it lands in a continuation
 * of the same picture rather than on white.
 */
async function withBleed(page: Blob, b: number): Promise<Blob> {
  const img = await createImageBitmap(page)
  const { width: w, height: h } = img
  const canvas = new OffscreenCanvas(w + 2 * b, h + 2 * b)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, b, b)
  // Copy a strip of the page into the bleed, flipped so it mirrors the edge.
  const mirror = (sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, fx: boolean, fy: boolean) => {
    ctx.save()
    ctx.translate(dx + (fx ? sw : 0), dy + (fy ? sh : 0))
    ctx.scale(fx ? -1 : 1, fy ? -1 : 1)
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
    ctx.restore()
  }
  mirror(0, 0, b, h, 0, b, true, false)
  mirror(w - b, 0, b, h, w + b, b, true, false)
  mirror(0, 0, w, b, b, 0, false, true)
  mirror(0, h - b, w, b, b, h + b, false, true)
  mirror(0, 0, b, b, 0, 0, true, true)
  mirror(w - b, 0, b, b, w + b, 0, true, true)
  mirror(0, h - b, b, b, 0, h + b, true, true)
  mirror(w - b, h - b, b, b, w + b, h + b, true, true)
  img.close()
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 })
}

/** Thin lines in the margin, in line with each trim edge, stopping short of the bleed. */
function cropMarks(page: PDFPage, x: number, y: number, w: number, h: number) {
  const gap = SLUG - 4
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.3, color: rgb(0, 0, 0) })
  for (const cx of [x, x + w]) {
    line(cx, 0, cx, gap)
    line(cx, page.getHeight() - gap, cx, page.getHeight())
  }
  for (const cy of [y, y + h]) {
    line(0, cy, gap, cy)
    line(page.getWidth() - gap, cy, page.getWidth(), cy)
  }
}
