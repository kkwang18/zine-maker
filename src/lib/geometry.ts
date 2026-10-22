import type { PaperSize, SurfaceKind } from './types'

/**
 * Formats, by the size of one page. Print formats fold from a single sheet cut
 * into a 4 × 2 grid (Letter 11 × 8.5 in, A4 297 × 210 mm). Instagram has no
 * sheet: each page is a carousel slide, and a spread is two slides side by side.
 */
export const PAPER: Record<PaperSize, { label: string; page: { width: number; height: number }; print: boolean }> = {
  letter: { label: 'Letter', page: { width: 11 / 4, height: 8.5 / 2 }, print: true },
  a4: { label: 'A4', page: { width: 297 / 4, height: 210 / 2 }, print: true },
  instagram: { label: 'Instagram', page: { width: 1080, height: 1350 }, print: false },
}

export function pageAspect(paper: PaperSize): number {
  const { width, height } = PAPER[paper].page
  return width / height
}

export function surfaceAspect(kind: SurfaceKind, paper: PaperSize): number {
  return kind === 'spread' ? pageAspect(paper) * 2 : pageAspect(paper)
}

/** The automatic sequence's 8 pages, in reading order: a cover, three spreads, a back. */
export const ZINE_SURFACES: { kind: SurfaceKind; label: string }[] = [
  { kind: 'cover', label: 'Cover' },
  { kind: 'spread', label: '2 – 3' },
  { kind: 'spread', label: '4 – 5' },
  { kind: 'spread', label: '6 – 7' },
  { kind: 'back', label: 'Back' },
]

/** Most a photo may be trimmed on any one side so it can fill a slot edge to edge. */
export const MAX_CROP_PER_SIDE = 0.05
