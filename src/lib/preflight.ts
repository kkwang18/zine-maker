import { PAPER } from './geometry'
import type { PaperSize, Photo, Rect, Surface } from './types'

// Preflight: problems worth catching before printing or posting, the way a
// print shop would check a file. Photos are judged from the laid-out zine;
// text is measured from the page as drawn, since its height depends on the font.

/** Where the zine is going, which decides how big each page really is. */
export type ExportTarget = 'home' | 'shop' | 'instagram'

export interface Issue {
  /** warn: likely to look wrong. info: worth a look. */
  severity: 'warn' | 'info'
  surface: number
  /** What to select when someone clicks "Show". */
  item?: { type: 'slot'; slot: number } | { type: 'free'; id: string } | { type: 'shape'; id: string } | { type: 'text'; id: string }
  message: string
}

/** Below this, prints look soft; below the second, visibly pixelated. */
const DPI_SOFT = 200
const DPI_POOR = 120
/** Keep text this far from the trim and the fold, in inches (1/8″, about 3 mm). */
const SAFE_IN = 0.125
/** A photo edge closer than this to the trim, without going past it, leaves a white sliver. */
const SLIVER_IN = 0.06

/** Trim size of one page, in inches, for each destination. */
export function pageInches(paper: PaperSize, target: ExportTarget, spreads: number): { w: number; h: number } {
  if (paper === 'instagram') return { w: 1080 / 300, h: 1350 / 300 }
  const sheet = paper === 'letter' ? { w: 11, h: 8.5 } : { w: 297 / 25.4, h: 210 / 25.4 }
  // Home printing folds three spreads from one sheet; anything else, and print shops, use half-sheet pages.
  if (target === 'home' && spreads === 3) return { w: sheet.w / 4, h: sheet.h / 2 }
  return { w: sheet.w / 2, h: sheet.h }
}

export function preflight(
  book: HTMLElement,
  surfaces: Surface[],
  photos: Map<string, Photo>,
  paper: PaperSize,
  target: ExportTarget,
): Issue[] {
  const issues: Issue[] = []
  const spreads = surfaces.filter((s) => s.kind === 'spread').length
  const page = pageInches(paper, target, spreads)
  const instagram = target === 'instagram'
  const booklet = !instagram && !(target === 'home' && spreads === 3)
  const elements = [...book.querySelectorAll<HTMLElement>('.surface')]

  surfaces.forEach((surface, s) => {
    const spread = surface.kind === 'spread'
    const widthIn = page.w * (spread ? 2 : 1)
    const where = surface.kind === 'spread' ? `Pages ${surface.label}` : surface.label

    // ── Photos ──
    const placed = [
      ...surface.slots.flatMap((slot, i) =>
        slot.placement ? [{ placement: slot.placement, item: { type: 'slot' as const, slot: i } }] : [],
      ),
      ...surface.free.map((f) => ({ placement: f.placement, item: { type: 'free' as const, id: f.id } })),
    ]
    for (const { placement, item } of placed) {
      const photo = photos.get(placement.photoId)
      if (!photo) continue
      const dest = clipToSurface(placement.dest)
      if (!dest) continue
      const shownPixels = photo.width * placement.src.w * (dest.w / placement.dest.w)
      const dpi = shownPixels / (dest.w * widthIn)
      if (instagram) {
        if (dpi < 300 * 0.8) {
          issues.push({ severity: 'warn', surface: s, item, message: `${where}: ${photo.name} is smaller than the slide shows it, so it'll look soft. Make it smaller or use a bigger file.` })
        }
      } else if (dpi < DPI_POOR) {
        issues.push({ severity: 'warn', surface: s, item, message: `${where}: ${photo.name} prints at ${Math.round(dpi)} dpi and will look pixelated. Make it smaller or use a bigger file.` })
      } else if (dpi < DPI_SOFT) {
        issues.push({ severity: 'info', surface: s, item, message: `${where}: ${photo.name} prints at ${Math.round(dpi)} dpi, a little soft up close.` })
      }

      if (target === 'shop') {
        const near = sliverEdges(placement.dest, page, spread)
        if (near.length) {
          issues.push({ severity: 'warn', surface: s, item, message: `${where}: ${photo.name} stops just short of the ${near.join(' and ')} edge, which leaves a thin white line after trimming. Pull it past the edge, or further in.` })
        }
      }
      if (booklet && spread && crossesFold(placement.dest)) {
        issues.push({ severity: 'info', surface: s, item, message: `${where}: ${photo.name} crosses the fold. Stapling hides a few millimetres in the middle, so keep faces and detail away from it.` })
      }
    }

    // ── Shapes: a block or rule meant to bleed must clear the trim, as photos must ──
    if (target === 'shop') {
      for (const shape of surface.shapes) {
        // A circle only touches its box's edges at one point, so it can't leave a sliver.
        if (shape.kind === 'ellipse') continue
        const near = sliverEdges(shape.box, page, spread)
        if (near.length) {
          const name = shape.kind === 'line' ? 'A line' : 'A colour block'
          issues.push({ severity: 'warn', surface: s, item: { type: 'shape', id: shape.id }, message: `${where}: ${name} stops just short of the ${near.join(' and ')} edge, which leaves a thin line of paper after trimming. Pull it past the edge, or further in.` })
        }
      }
    }

    surface.slots.forEach((slot, i) => {
      if (!slot.placement) issues.push({ severity: 'warn', surface: s, item: { type: 'slot', slot: i }, message: `${where}: an empty slot.` })
    })

    // ── Text, measured as drawn ──
    const el = elements[s]
    if (!el) return
    const box = el.getBoundingClientRect()
    for (const node of el.querySelectorAll<HTMLElement>('.text, .free-text')) {
      const r = node.getBoundingClientRect()
      if (!r.width || !r.height) continue
      const rect = { x: (r.left - box.left) / box.width, y: (r.top - box.top) / box.height, w: r.width / box.width, h: r.height / box.height }
      const id = node.dataset.item?.startsWith('t') ? node.dataset.item.slice(1) : undefined
      const item = id ? { type: 'text' as const, id } : undefined
      const label = node.classList.contains('text--title') ? 'The title' : node.classList.contains('text--byline') ? 'Your name' : node.classList.contains('text--colophon') ? 'The back text' : 'A text box'
      if (spread && crossesFold(rect, instagram ? 0 : SAFE_IN / widthIn)) {
        issues.push({ severity: 'warn', surface: s, item, message: instagram ? `${where}: ${label} runs across two slides and will be cut in half.` : `${where}: ${label} runs into the fold, where it'll be hard to read.` })
      } else if (!instagram && nearTrim(rect, SAFE_IN / widthIn, SAFE_IN / page.h)) {
        issues.push({ severity: 'warn', surface: s, item, message: `${where}: ${label} is within 3 mm of the page edge and may get trimmed or lost in the printer's margin.` })
      }
    }
  })

  return issues
}

/** The part of a rect that's actually on the surface, or null if none is. */
export function clipToSurface(r: Rect): Rect | null {
  const x = Math.max(0, r.x)
  const y = Math.max(0, r.y)
  const w = Math.min(1, r.x + r.w) - x
  const h = Math.min(1, r.y + r.h) - y
  return w > 0 && h > 0 ? { x, y, w, h } : null
}

export function crossesFold(r: Rect, margin = 0.005): boolean {
  return r.x < 0.5 + margin && r.x + r.w > 0.5 - margin && r.w > 2 * margin
}

/** Within `mx` / `my` (surface fractions) of the outer edges. */
export function nearTrim(r: Rect, mx: number, my: number): boolean {
  return r.x < mx || r.y < my || r.x + r.w > 1 - mx || r.y + r.h > 1 - my
}

/** Which outer edges a photo nearly, but not quite, reaches. */
export function sliverEdges(r: Rect, page: { w: number; h: number }, spread: boolean): string[] {
  const gx = SLIVER_IN / (page.w * (spread ? 2 : 1))
  const gy = SLIVER_IN / page.h
  const edges: string[] = []
  if (r.x > 0.0005 && r.x < gx) edges.push('left')
  if (1 - (r.x + r.w) > 0.0005 && 1 - (r.x + r.w) < gx) edges.push('right')
  if (r.y > 0.0005 && r.y < gy) edges.push('top')
  if (1 - (r.y + r.h) > 0.0005 && 1 - (r.y + r.h) < gy) edges.push('bottom')
  return edges
}

/** Human labels for each destination, used in buttons and notes. */
export const TARGET_LABEL: Record<ExportTarget, string> = {
  home: 'home printer',
  shop: 'print shop',
  instagram: PAPER.instagram.label,
}
