import { degrees, PDFDocument, rgb, StandardFonts, type PDFImage, type PDFPage } from 'pdf-lib'
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

/**
 * The 8-page one-sheet fold. The sheet is a 4 × 2 grid; the top row prints
 * upside down so it reads the right way up once folded:
 *
 *     top (upside down):  5  4  3  2
 *     bottom:             6  7  8  1
 *
 * Each spread (2|3, 4|5, 6|7) sits on two neighbouring cells, so pictures
 * crossing the fold print continuously.
 */
function imposeOneSheet(pdf: PDFDocument, pages: PDFImage[], sheet: { w: number; h: number }) {
  const out = pdf.addPage([sheet.w, sheet.h])
  const cw = sheet.w / 4
  const ch = sheet.h / 2
  const bottom = [6, 7, 8, 1]
  const top = [5, 4, 3, 2]
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
  const total = Math.ceil(pages.length / 4) * 4
  const back = pages[pages.length - 1]
  // Page n (1-based) of the padded booklet, or null for a blank.
  const at = (n: number): PDFImage | null => (n === total ? back : n <= pages.length - 1 ? pages[n - 1] : null)
  const half = sheet.w / 2

  for (let i = 0; i < total / 4; i++) {
    // Outside of the sheet, then inside: e.g. for 12 pages, sheet 1 is 12|1 then 2|11.
    for (const [left, right] of [
      [total - 2 * i, 2 * i + 1],
      [2 * i + 2, total - 2 * i - 1],
    ]) {
      const side = pdf.addPage([sheet.w, sheet.h])
      const l = at(left)
      const r = at(right)
      if (l) side.drawImage(l, { x: 0, y: 0, width: half, height: sheet.h })
      if (r) side.drawImage(r, { x: half, y: 0, width: half, height: sheet.h })
      tick(side, half, 0, half, 10)
      tick(side, half, sheet.h - 10, half, sheet.h)
    }
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
