import JSZip from 'jszip'
import { PAPER } from './geometry'
import { renderPages } from './render'

/** Instagram carousel slides: one per page, 1080 × 1350. */
export function renderSlides(book: HTMLElement): Promise<Blob[]> {
  return renderPages(book, PAPER.instagram.page)
}

/** Bundle slides as 01.jpg, 02.jpg… — the order to post them in. */
export async function zipSlides(slides: Blob[]): Promise<Blob> {
  const zip = new JSZip()
  slides.forEach((blob, i) => zip.file(`${String(i + 1).padStart(2, '0')}.jpg`, blob))
  return zip.generateAsync({ type: 'blob' })
}
