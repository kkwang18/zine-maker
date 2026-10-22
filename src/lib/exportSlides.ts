import JSZip from 'jszip'
import { carouselPosts } from './carousel'
import { PAPER } from './geometry'
import { renderPages } from './render'

/** Instagram carousel slides: one per page, 1080 × 1350. */
export function renderSlides(book: HTMLElement): Promise<Blob[]> {
  return renderPages(book, PAPER.instagram.page)
}

/**
 * Bundle slides as 01.jpg, 02.jpg… in posting order. A zine too long for one
 * post gets a folder per post: post-1/01.jpg, post-2/01.jpg…
 */
export async function zipSlides(slides: Blob[], perSurface: number[]): Promise<Blob> {
  const zip = new JSZip()
  const posts = carouselPosts(perSurface)
  posts.forEach((post, p) => {
    const folder = posts.length > 1 ? `post-${p + 1}/` : ''
    post.forEach((slide, i) => zip.file(`${folder}${String(i + 1).padStart(2, '0')}.jpg`, slides[slide]))
  })
  return zip.generateAsync({ type: 'blob' })
}
