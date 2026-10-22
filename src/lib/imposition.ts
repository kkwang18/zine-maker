// Imposition: where each page goes on the printed sheets so that, once
// folded (and stapled), the zine reads in order. Pure page arithmetic, kept
// apart from PDF drawing so it can be tested on its own.

/**
 * The 8-page one-sheet fold, as page numbers (1 = cover, 8 = back) in a 4 × 2
 * grid, left to right. The top row prints upside down so it reads the right
 * way up once folded, and each spread (2|3, 4|5, 6|7) sits on two
 * neighbouring cells, so pictures crossing the fold print continuously.
 */
export const ONE_SHEET = {
  top: [5, 4, 3, 2],
  bottom: [6, 7, 8, 1],
} as const

/**
 * Reading order padded to a multiple of 4, as indexes into the pages
 * (cover first, back last), with null for each blank page. Blanks go just
 * before the back cover, so the back stays the back.
 */
export function paddedPages(count: number): (number | null)[] {
  const total = Math.ceil(count / 4) * 4
  return [...Array.from({ length: count - 1 }, (_, i) => i), ...Array(total - count).fill(null), count - 1]
}

/**
 * A stapled booklet's sheet sides in print order — each sheet's outside, then
 * its inside — with the page index (or null for blank) on the left and right
 * halves. For 12 pages the first sheet is 12|1 outside and 2|11 inside.
 */
export function bookletSides(count: number): { left: number | null; right: number | null }[] {
  const padded = paddedPages(count)
  const total = padded.length
  const at = (n: number) => padded[n - 1]
  const sides: { left: number | null; right: number | null }[] = []
  for (let i = 0; i < total / 4; i++) {
    sides.push({ left: at(total - 2 * i), right: at(2 * i + 1) })
    sides.push({ left: at(2 * i + 2), right: at(total - 2 * i - 1) })
  }
  return sides
}
