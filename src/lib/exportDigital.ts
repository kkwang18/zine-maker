import { PDFDocument } from 'pdf-lib'
import { renderSurfaces } from './render'

// The digital edition: a PDF for reading on a screen and sending to people.
// One PDF page per surface in reading order — the cover, each spread whole as
// one wide page (so pictures across the fold stay in one piece), then the
// back. Every phone and computer can open it straight from a message.

/** Page width in pixels: sharp on phones and laptops, light enough to send. */
const PAGE_PX = 1100
/** Page width in PDF points; only sets the starting zoom in viewers. */
const PAGE_PT = 360

export async function renderDigitalPdf(book: HTMLElement, pageAspect: number, title: string): Promise<Blob> {
  const size = { width: PAGE_PX, height: Math.round(PAGE_PX / pageAspect) }
  const surfaces = await renderSurfaces(book, size)

  const pdf = await PDFDocument.create()
  pdf.setTitle(title || 'Zine')
  pdf.setCreator('zine maker')
  const scale = PAGE_PT / PAGE_PX
  for (const blob of surfaces) {
    const image = await pdf.embedJpg(await blob.arrayBuffer())
    const page = pdf.addPage([image.width * scale, image.height * scale])
    page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() })
  }
  return new Blob([(await pdf.save()) as BlobPart], { type: 'application/pdf' })
}
