import { hammingDistance } from './analyze'
import { fitPhoto, type Fit } from './fit'
import { surfaceAspect, ZINE_SURFACES } from './geometry'
import { arcFor, findLayout, layoutsFor } from './layouts'
import type { Draft, DraftSurface, PaperSize, Photo, Slot, SlotRole, Template, ZineStyle } from './types'

// The sequencer picks photos and layouts for the 8-page arc:
//   cover → opening spread → peak spread → fade spread → back
// It tries every combination of layouts, fills each with the best photos it
// can find, and keeps the highest-scoring zine.

export const MIN_PHOTOS = 4

/** Photos this similar (out of 64 hash bits) count as near-duplicates. */
const DUPLICATE_DISTANCE = 8

const ROLE_WEIGHT: Record<SlotRole, number> = { cover: 2, peak: 2, bleed: 1, framed: 1, small: 1, coda: 0.6 }

const PEAK_SURFACE = 2

/**
 * How much each style rewards photos covering the page. Collage wants photos to
 * take up most of every page, so it favours photos whose shape suits the slot.
 */
const COVERAGE_WEIGHT: Record<ZineStyle, number> = { quiet: 0, magazine: 0, collage: 2.5 }

/** How far below the best score a zine can be and still be offered as an alternative. */
const ALTERNATIVE_MARGIN = 1.2

/** When changing a layout, how strongly to keep the photos already on that spread. */
const KEEP_BONUS = 1

/** What each photo is like, ranked within the set (0 = least, 1 = most). */
interface Traits {
  drama: number
  detail: number
  dark: number
  /** Strong but simple — the kind of image that holds a cover. */
  iconic: number
}

function rankWithin(values: number[]): number[] {
  if (values.length === 1) return [0.5]
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0])
  const ranks = new Array<number>(values.length)
  order.forEach(([, i], r) => (ranks[i] = r / (values.length - 1)))
  return ranks
}

function traitsOf(photos: Photo[]): Traits[] {
  const drama = rankWithin(photos.map((p) => p.stats.tonalRange + p.stats.contrast))
  const detail = rankWithin(photos.map((p) => p.stats.detail))
  const dark = rankWithin(photos.map((p) => 1 - p.stats.meanLuma))
  return photos.map((_, i) => ({
    drama: drama[i],
    detail: detail[i],
    dark: dark[i],
    iconic: drama[i] * (1 - 0.7 * detail[i]),
  }))
}

/** How well a photo's character suits a slot's job, 0..1. */
function roleScore(role: SlotRole, t: Traits): number {
  switch (role) {
    case 'cover':
      return 0.6 * t.iconic + 0.4 * t.drama
    case 'peak':
      return 0.7 * t.drama + 0.3 * t.dark
    case 'bleed':
      return 0.2 + 0.5 * t.drama + 0.3 * t.detail
    case 'framed':
      return 0.5 + 0.3 * t.drama
    case 'small':
      // Busy pictures turn to mush when small; simple ones still read.
      return 1 - t.detail
    case 'coda':
      return 0.5 * (1 - t.detail) + 0.5 * t.dark
  }
}

/** Splits off near-identical photos, keeping the most dramatic of each group. */
function dedupe(photos: Photo[], traits: Traits[]): { unique: Photo[]; duplicates: Photo[] } {
  const order = photos.map((_, i) => i).sort((a, b) => traits[b].drama - traits[a].drama)
  const unique: Photo[] = []
  const duplicates: Photo[] = []
  for (const i of order) {
    const p = photos[i]
    const twin = unique.some((u) => hammingDistance(u.stats.hash, p.stats.hash) <= DUPLICATE_DISTANCE)
    ;(twin ? duplicates : unique).push(p)
  }
  return { unique, duplicates }
}

interface SlotRef {
  slot: Slot
  surface: number
  aspect: number
}

interface Skeleton {
  templates: Template[]
  slots: SlotRef[]
}

function skeletons(paper: PaperSize, style: ZineStyle, circles: boolean): Skeleton[] {
  const arc = arcFor(style, circles)
  const out: Skeleton[] = []
  for (const cover of arc.cover)
    for (const opening of arc.opening)
      for (const peak of arc.peak)
        for (const fade of arc.fade)
          for (const back of arc.back) {
            // The same spread layout twice in eight pages feels flat.
            if (opening.id === fade.id || opening.id === peak.id || peak.id === fade.id) continue
            const templates = [cover, opening, peak, fade, back]
            const slots = templates.flatMap((t, i) => {
              const aspect = surfaceAspect(ZINE_SURFACES[i].kind, paper)
              return t.slots.map((slot) => ({ slot, surface: i, aspect }))
            })
            out.push({ templates, slots })
          }
  return out
}

/** Everything about the photo pool that doesn't depend on the layout, computed once. */
class Pool {
  readonly photos: Photo[]
  readonly traits: Traits[]
  /** Score for putting two photos on the same spread. */
  readonly pairScore: number[][]
  private fits = new Map<string, Fit | null>()

  constructor(photos: Photo[]) {
    this.photos = photos
    this.traits = traitsOf(photos)
    this.pairScore = photos.map((a) =>
      photos.map((b) => {
        // Avoid look-alikes side by side; reward light against dark.
        const similarity = 1 - hammingDistance(a.stats.hash, b.stats.hash) / 32
        return -Math.max(0, similarity - 0.4) * 2 + 0.3 * Math.abs(a.stats.meanLuma - b.stats.meanLuma)
      }),
    )
  }

  fit(p: number, ref: SlotRef): Fit | null {
    const { rect, align, mode } = ref.slot
    const key = `${p}:${mode}:${ref.aspect}:${rect.x},${rect.y},${rect.w},${rect.h}:${align.x},${align.y}`
    if (!this.fits.has(key)) this.fits.set(key, fitPhoto(this.photos[p], ref.slot, ref.aspect))
    return this.fits.get(key)!
  }

  /**
   * Score for one photo in one slot, ignoring its neighbours. With `lenient`,
   * a photo too far from a fill slot's shape is scored as framed inside it
   * instead of ruled out — how it'll be shown if someone puts it there.
   */
  slotScore(p: number, ref: SlotRef, lenient = false): number {
    let quality = this.fit(p, ref)?.quality
    if (quality === undefined) {
      if (!lenient) return -Infinity
      quality = this.fit(p, { ...ref, slot: { ...ref.slot, mode: 'fit' } })!.quality / 2
    }
    const role = ref.slot.role
    // Small slots don't care much how fully the photo fills them.
    const fitWeight = role === 'small' || role === 'coda' ? 0.15 : 0.4
    return ROLE_WEIGHT[role] * ((1 - fitWeight) * roleScore(role, this.traits[p]) + fitWeight * quality)
  }
}

/** -1 marks an empty slot. */
type Assignment = number[]

function planScore(pool: Pool, sk: Skeleton, slotScores: number[][], assign: Assignment): number {
  let score = 0
  const surfaceDrama = new Array<number>(sk.templates.length).fill(0)
  for (let i = 0; i < assign.length; i++) {
    const p = assign[i]
    if (p < 0) return -Infinity
    score += slotScores[i][p]
    const s = sk.slots[i].surface
    surfaceDrama[s] = Math.max(surfaceDrama[s], pool.traits[p].drama)
    for (let j = i + 1; j < assign.length; j++) {
      if (sk.slots[j].surface === s) score += pool.pairScore[p][assign[j]]
    }
  }

  // The peak should be the most dramatic moment.
  if (surfaceDrama[PEAK_SURFACE] >= Math.max(surfaceDrama[1], surfaceDrama[3])) score += 0.5

  // Using more of the photos people brought is good, up to a point.
  return score + 0.15 * assign.length
}

/** Fill a skeleton greedily (most important slots first), then improve by swapping. */
function fill(pool: Pool, sk: Skeleton, coverage: number): { assign: Assignment; score: number } {
  const n = pool.photos.length
  const slotScores = sk.slots.map((ref) =>
    Array.from({ length: n }, (_, p) => {
      const score = pool.slotScore(p, ref)
      if (!coverage || score === -Infinity) return score
      // Area the photo covers, in pages (a spread is two).
      const { dest } = pool.fit(p, ref)!
      const pages = ZINE_SURFACES[ref.surface].kind === 'spread' ? 2 : 1
      return score + coverage * dest.w * dest.h * pages
    }),
  )
  const assign: Assignment = new Array(sk.slots.length).fill(-1)
  const used = new Set<number>()
  const order = sk.slots
    .map((_, i) => i)
    .sort((a, b) => ROLE_WEIGHT[sk.slots[b].slot.role] - ROLE_WEIGHT[sk.slots[a].slot.role])

  for (const i of order) {
    let best = -1
    let bestScore = -Infinity
    for (let p = 0; p < n; p++) {
      if (used.has(p) || slotScores[i][p] === -Infinity) continue
      if (slotScores[i][p] > bestScore) {
        best = p
        bestScore = slotScores[i][p]
      }
    }
    if (best < 0) return { assign, score: -Infinity }
    assign[i] = best
    used.add(best)
  }

  let current = planScore(pool, sk, slotScores, assign)
  const tryChange = (apply: () => void, undo: () => void) => {
    apply()
    const s = planScore(pool, sk, slotScores, assign)
    if (s > current + 1e-9) {
      current = s
      return true
    }
    undo()
    return false
  }

  for (let iter = 0; iter < 30; iter++) {
    let improved = false
    for (let i = 0; i < assign.length; i++) {
      // Swap two placed photos.
      for (let j = i + 1; j < assign.length; j++) {
        const swap = () => ([assign[i], assign[j]] = [assign[j], assign[i]])
        improved = tryChange(swap, swap) || improved
      }
      // Bring in a photo that isn't used yet.
      for (let p = 0; p < n; p++) {
        if (assign.includes(p)) continue
        const prev = assign[i]
        improved = tryChange(() => (assign[i] = p), () => (assign[i] = prev)) || improved
      }
    }
    if (!improved) break
  }
  return { assign, score: current }
}

/**
 * Build a zine from the photos. `variant` 0 is the best-scoring zine; higher
 * variants step through other strong arrangements, for "try another".
 */
export function sequence(
  photos: Photo[],
  paper: PaperSize,
  style: ZineStyle,
  circles: boolean,
  variant = 0,
): Draft | null {
  if (photos.length < MIN_PHOTOS) return null
  const { unique, duplicates } = dedupe(photos, traitsOf(photos))
  // Too few distinct photos: allow near-duplicates back in rather than give up.
  const pool = new Pool(unique.length >= MIN_PHOTOS ? unique : [...unique, ...duplicates])

  const candidates = skeletons(paper, style, circles)
    .filter((sk) => sk.slots.length <= pool.photos.length)
    .map((sk) => ({ sk, ...fill(pool, sk, COVERAGE_WEIGHT[style]) }))
    .filter((c) => c.score > -Infinity)
    .sort((a, b) => b.score - a.score)
  if (!candidates.length) return null

  // Alternatives must be nearly as good, and move at least one photo —
  // a different layout around the same photos doesn't count.
  const alternatives: typeof candidates = []
  const seen = new Set<string>()
  for (const c of candidates) {
    if (c.score < candidates[0].score - ALTERNATIVE_MARGIN) break
    const key = c.sk.templates
      .map((_, si) => c.assign.filter((_, i) => c.sk.slots[i].surface === si).sort().join(','))
      .join('/')
    if (seen.has(key)) continue
    seen.add(key)
    alternatives.push(c)
  }

  const { sk, assign } = alternatives[variant % alternatives.length]
  return sk.templates.map((t, si) => ({
    kind: ZINE_SURFACES[si].kind,
    templateId: t.id,
    photoIds: sk.slots.flatMap((ref, i) => (ref.surface === si ? [pool.photos[assign[i]].id] : [])),
  }))
}

/** Photos left out of the automatic sequence because a near-identical one was used. */
export function lookAlikes(photos: Photo[]): Set<string> {
  return new Set(dedupe(photos, traitsOf(photos)).duplicates.map((p) => p.id))
}

// ── Helpers for hand edits ──────────────────────────────────────────────────

/** Pick the best photo for a slot from `candidates`, preferring those in `keep`. */
function bestFor(pool: Pool, ref: SlotRef, candidates: number[], keep: Set<number>): number {
  let best = -1
  let bestScore = -Infinity
  for (const p of candidates) {
    const s = pool.slotScore(p, ref, true) + (keep.has(p) ? KEEP_BONUS : 0)
    if (s > bestScore) {
      best = p
      bestScore = s
    }
  }
  return best
}

function usedIds(draft: Draft): Set<string> {
  return new Set(draft.flatMap((s) => s.photoIds.filter((id): id is string => id !== null)))
}

/**
 * Switch one surface to a new layout. Its photos carry over into whichever new
 * slots suit them; any slots left over are filled with the best unused photos.
 */
export function relayout(draft: Draft, surface: number, templateId: string, photos: Photo[], paper: PaperSize): Draft {
  const current = draft[surface]
  const template = findLayout(current.kind, templateId)
  const pool = new Pool(photos)
  const index = new Map(photos.map((p, i) => [p.id, i]))
  const used = usedIds(draft)
  const mine = new Set(current.photoIds.flatMap((id) => (id && index.has(id) ? [index.get(id)!] : [])))
  let candidates = [...mine, ...photos.flatMap((p, i) => (used.has(p.id) ? [] : [i]))]

  const aspect = surfaceAspect(current.kind, paper)
  const photoIds: (string | null)[] = template.slots.map(() => null)
  const order = template.slots
    .map((_, i) => i)
    .sort((a, b) => ROLE_WEIGHT[template.slots[b].role] - ROLE_WEIGHT[template.slots[a].role])
  for (const i of order) {
    const p = bestFor(pool, { slot: template.slots[i], surface, aspect }, candidates, mine)
    if (p < 0) continue
    photoIds[i] = photos[p].id
    candidates = candidates.filter((c) => c !== p)
  }

  // A new layout starts from its own positions, so hand arrangement is cleared.
  const next: DraftSurface = { ...current, templateId: template.id, photoIds, frames: undefined }
  return draft.map((s, i) => (i === surface ? next : s))
}

/** Put the best unused photo into each empty slot, where there is one. */
export function fillEmptySlots(draft: Draft, photos: Photo[], paper: PaperSize): Draft {
  const pool = new Pool(photos)
  const used = usedIds(draft)
  let candidates = photos.flatMap((p, i) => (used.has(p.id) ? [] : [i]))
  return draft.map((surface, si) => {
    if (!surface.photoIds.includes(null)) return surface
    const template = findLayout(surface.kind, surface.templateId)
    const aspect = surfaceAspect(surface.kind, paper)
    const photoIds = surface.photoIds.map((id, i) => {
      if (id !== null) return id
      const p = bestFor(pool, { slot: template.slots[i], surface: si, aspect }, candidates, new Set())
      if (p < 0) return null
      candidates = candidates.filter((c) => c !== p)
      return photos[p].id
    })
    return { ...surface, photoIds }
  })
}

/**
 * Add a spread at position `at` in the draft, choosing the layout that best
 * suits the photos not used yet. With none left, it's a one-photo layout with
 * an empty slot to fill.
 */
export function insertSpread(
  draft: Draft,
  at: number,
  photos: Photo[],
  paper: PaperSize,
  style: ZineStyle,
  circles: boolean,
): Draft {
  const pool = new Pool(photos)
  const used = usedIds(draft)
  const unused = photos.flatMap((p, i) => (used.has(p.id) ? [] : [i]))
  const aspect = surfaceAspect('spread', paper)

  let best: { template: Template; photoIds: (string | null)[]; score: number } | null = null
  for (const template of layoutsFor(style, circles).spread) {
    let candidates = [...unused]
    let score = 0
    const photoIds = template.slots.map((slot) => {
      const ref = { slot, surface: at, aspect }
      const p = bestFor(pool, ref, candidates, new Set())
      // An empty slot is worth less than any photo.
      if (p < 0) {
        score -= 2
        return null
      }
      candidates = candidates.filter((c) => c !== p)
      const { dest } = pool.fit(p, ref) ?? pool.fit(p, { ...ref, slot: { ...slot, mode: 'fit' } })!
      score += pool.slotScore(p, ref, true) + COVERAGE_WEIGHT[style] * dest.w * dest.h * 2
      return photos[p].id
    })
    if (!best || score > best.score) best = { template, photoIds, score }
  }

  const spread: DraftSurface = { kind: 'spread', templateId: best!.template.id, photoIds: best!.photoIds }
  return [...draft.slice(0, at), spread, ...draft.slice(at)]
}
