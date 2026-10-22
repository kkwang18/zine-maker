import type { Arrangement, Slot, SlotRole, SurfaceKind, Template, TextBlock, ZineStyle } from './types'

// Three layout vocabularies. Rects are fractions of the page (or spread) they sit on.
//
// Quiet, after the Ravens-era photobooks: photos bleeding off the page or across
// the fold, small photos alone in a black field, and whole pages left black.
//
// Magazine, after Japanese city-boy magazines: bright pages, soft-cornered
// photos, catalog grids and zig-zags, a big masthead.
//
// Collage, between the two and made with Instagram in mind: photos take up
// most of every page, square-cornered, often overlapping each other and the
// seam between slides, with Magazine's catalog grids and Quiet's full bleeds.

const CENTER = { x: 0.5, y: 0.5 }

function slot(
  role: SlotRole,
  mode: Slot['mode'],
  x: number,
  y: number,
  w: number,
  h: number,
  align = CENTER,
  extra: Pick<Slot, 'shape'> = {},
): Slot {
  return { role, mode, rect: { x, y, w, h }, align, ...extra }
}

/** A soft-cornered magazine photo. */
const soft = { shape: 'rounded' } as const

// Page templates are defined as right-hand pages; `mirror` flips them for the
// left side of a spread, so "inner" elements always lean toward the fold.

export function mirror(t: Template): Template {
  return {
    id: t.id,
    slots: t.slots.map((s) => ({
      ...s,
      rect: { ...s.rect, x: 1 - s.rect.x - s.rect.w },
      align: { x: 1 - s.align.x, y: s.align.y },
    })),
    text: t.text.map((b) => ({ ...b, x: 1 - b.x, anchor: b.anchor === 'start' ? 'end' : 'start' })),
  }
}

/** Two pages side by side become one spread, in spread coordinates. */
export function pair(left: Template, right: Template): Template {
  const place = (t: Template, offset: number): Template => ({
    ...t,
    slots: t.slots.map((s) => ({ ...s, rect: { ...s.rect, x: offset + s.rect.x / 2, w: s.rect.w / 2 } })),
    text: t.text.map((b) => ({ ...b, x: offset + b.x / 2 })),
  })
  const l = place(mirror(left), 0)
  const r = place(right, 0.5)
  return { id: `${left.id}|${right.id}`, slots: [...l.slots, ...r.slots], text: [...l.text, ...r.text] }
}

const text = (kind: TextBlock['kind'], x: number, y: number, extra: Partial<TextBlock> = {}): TextBlock => ({
  kind,
  x,
  y,
  anchor: 'start',
  ...extra,
})

// ── Quiet ───────────────────────────────────────────────────────────────────

const Q = {
  bleed: { id: 'bleed', slots: [slot('bleed', 'fill', 0, 0, 1, 1)], text: [] },
  framed: {
    id: 'framed',
    // Sits a little above centre — the optical middle of the page.
    slots: [slot('framed', 'fit', 0.1, 0.12, 0.8, 0.64)],
    text: [],
  },
  smallLow: {
    id: 'small-low',
    slots: [slot('small', 'fit', 0.1, 0.58, 0.5, 0.3, { x: 0, y: 1 })],
    text: [],
  },
  smallHigh: {
    id: 'small-high',
    slots: [slot('small', 'fit', 0.4, 0.12, 0.5, 0.3, { x: 1, y: 0 })],
    text: [],
  },
  black: { id: 'black', slots: [], text: [] },
} satisfies Record<string, Template>

const Q_SPREADS = {
  across: { id: 'across', slots: [slot('peak', 'fill', 0, 0, 1, 1)], text: [] },
  // A wide photo running across the fold, framed by black above and below.
  band: { id: 'band', slots: [slot('peak', 'fit', 0.05, 0.14, 0.9, 0.72)], text: [] },
} satisfies Record<string, Template>

const Q_COVERS: Template[] = [
  {
    id: 'cover-bleed',
    slots: [slot('cover', 'fill', 0, 0, 1, 1)],
    // Title runs down the right edge; the name sits small at the foot.
    text: [
      text('title', 0.9, 0.06, { vertical: true, onPhoto: true }),
      text('byline', 0.1, 0.94, { onPhoto: true }),
    ],
  },
  {
    id: 'cover-framed',
    slots: [slot('cover', 'fit', 0.1, 0.1, 0.8, 0.62, { x: 0.5, y: 0 })],
    text: [text('title', 0.1, 0.86), text('byline', 0.1, 0.93)],
  },
]

const Q_BACKS: Template[] = [
  { id: 'back-small', slots: [slot('coda', 'fit', 0.36, 0.36, 0.28, 0.2)], text: [text('colophon', 0.1, 0.92)] },
  { id: 'back-black', slots: [], text: [text('colophon', 0.1, 0.92)] },
]

// ── Magazine ────────────────────────────────────────────────────────────────

const M = {
  full: { id: 'm-full', slots: [slot('bleed', 'fill', 0, 0, 1, 1, CENTER)], text: [] },
  inset: {
    id: 'm-inset',
    slots: [slot('framed', 'fit', 0.1, 0.1, 0.8, 0.74, { x: 0.5, y: 0 }, soft)],
    text: [],
  },
  // Four to a page, like a shopping column.
  grid: {
    id: 'm-grid',
    slots: [
      slot('small', 'fit', 0.08, 0.1, 0.4, 0.37, { x: 0.5, y: 1 }, soft),
      slot('small', 'fit', 0.52, 0.1, 0.4, 0.37, { x: 0.5, y: 1 }, soft),
      slot('small', 'fit', 0.08, 0.53, 0.4, 0.37, { x: 0.5, y: 0 }, soft),
      slot('small', 'fit', 0.52, 0.53, 0.4, 0.37, { x: 0.5, y: 0 }, soft),
    ],
    text: [],
  },
  // Two, one above the other, nudged apart.
  stack: {
    id: 'm-stack',
    slots: [
      slot('framed', 'fit', 0.1, 0.08, 0.72, 0.4, { x: 0, y: 0.5 }, soft),
      slot('framed', 'fit', 0.18, 0.52, 0.72, 0.4, { x: 1, y: 0.5 }, soft),
    ],
    text: [],
  },
  // Three in a zig-zag down the page.
  trio: {
    id: 'm-trio',
    slots: [
      slot('small', 'fit', 0.08, 0.06, 0.56, 0.27, { x: 0, y: 0.5 }, soft),
      slot('small', 'fit', 0.36, 0.365, 0.56, 0.27, { x: 1, y: 0.5 }, soft),
      slot('small', 'fit', 0.08, 0.67, 0.56, 0.27, { x: 0, y: 0.5 }, soft),
    ],
    text: [],
  },
  // An empty page, for a breather next to a single photo.
  blank: { id: 'm-blank', slots: [], text: [] },
} satisfies Record<string, Template>

const M_HERO: Template = {
  id: 'm-hero',
  slots: [slot('peak', 'fill', 0, 0, 1, 1, CENTER)],
  text: [],
}

// One big photo across the fold that keeps its shape, for photos the hero can't fill.
const M_WIDE: Template = {
  id: 'm-wide',
  slots: [slot('peak', 'fit', 0.05, 0.08, 0.9, 0.84, CENTER, soft)],
  text: [],
}

const masthead = (onPhoto = false) => text('title', 0.06, 0.035, { hang: true, onPhoto })

const M_COVERS: Template[] = [
  {
    id: 'm-cover',
    slots: [slot('cover', 'fit', 0.07, 0.24, 0.86, 0.64, CENTER, { shape: 'rounded' })],
    text: [masthead(), text('byline', 0.07, 0.955)],
  },
  {
    id: 'm-cover-bleed',
    slots: [slot('cover', 'fill', 0, 0, 1, 1)],
    text: [masthead(true), text('byline', 0.07, 0.955, { onPhoto: true })],
  },
]

const M_BACKS: Template[] = [
  {
    id: 'm-back',
    slots: [slot('coda', 'fit', 0.28, 0.16, 0.44, 0.34, CENTER, { shape: 'rounded' })],
    text: [text('colophon', 0.08, 0.9)],
  },
  { id: 'm-back-text', slots: [], text: [text('colophon', 0.08, 0.9)] },
]

// Circles crop photos to a square, well past the usual limit, so these are
// only offered when someone turns circles on.

const round = { shape: 'circle' } as const

const MC = {
  circle: { id: 'm-circle', slots: [slot('framed', 'fit', 0.1, 0.14, 0.8, 0.72, CENTER, round)], text: [] },
  // Three circles of different sizes, tumbling down the page.
  dots: {
    id: 'm-dots',
    slots: [
      slot('small', 'fit', 0.06, 0.05, 0.62, 0.38, { x: 0, y: 0 }, round),
      slot('small', 'fit', 0.44, 0.45, 0.5, 0.27, { x: 1, y: 0.5 }, round),
      slot('small', 'fit', 0.08, 0.74, 0.4, 0.22, { x: 0, y: 1 }, round),
    ],
    text: [],
  },
} satisfies Record<string, Template>

const CIRCLES: Record<SurfaceKind, Template[]> = {
  cover: [
    {
      id: 'm-cover-circle',
      slots: [slot('cover', 'fit', 0.1, 0.24, 0.8, 0.62, CENTER, { shape: 'circle' })],
      text: [masthead(), text('byline', 0.07, 0.955)],
    },
  ],
  spread: [pair(MC.dots, M.inset), pair(M.full, MC.circle), pair(MC.circle, MC.dots), pair(MC.circle, MC.circle)],
  back: [
    {
      id: 'm-back-circle',
      slots: [slot('coda', 'fit', 0.3, 0.14, 0.4, 0.36, CENTER, { shape: 'circle' })],
      text: [text('colophon', 0.08, 0.9)],
    },
  ],
}

/** Each circle layout's nearest relative without circles. */
const CIRCLE_FALLBACK: Record<string, string> = {
  'm-cover-circle': 'm-cover',
  'm-back-circle': 'm-back',
  'm-circle': 'm-inset',
  'm-dots': 'm-trio',
}

// ── Collage ─────────────────────────────────────────────────────────────────
// Spreads are drawn in spread coordinates directly: on Instagram the seam at
// x = 0.5 is where one slide ends and the next begins. Slots later in a list
// sit on top, so overlaps are drawn in order.
//
// Most Collage spreads are adaptive (see arrange.ts): frames are sized to the
// photos in them, so pages fill up whatever the photos' shapes, uncropped.
// Their slot rects only sketch the idea for the layout picker.

type Sketch = [role: SlotRole, x: number, y: number, w: number, h: number]

function adaptive(id: string, arrange: Arrangement, sketch: Sketch[], text: TextBlock[] = []): Template {
  return {
    id,
    arrange,
    slots: sketch.map(([role, x, y, w, h]) => ({ ...slot(role, 'fit', x, y, w, h), flex: true })),
    text,
  }
}

/** The whole spread, with a sliver of margin. */
const SPREAD_AREA = { x: 0.015, y: 0.025, w: 0.97, h: 0.95 }

const C_SPREADS = {
  // One photo across both slides, edge to edge.
  pano: { id: 'c-pano', slots: [slot('peak', 'fill', 0, 0, 1, 1)], text: [] },

  // Edge-to-edge mosaics: photos butted together in justified rows.
  mosaic2: adaptive('c-mosaic-2', { kind: 'rows', area: SPREAD_AREA }, [
    ['framed', 0.015, 0.025, 0.5, 0.95],
    ['framed', 0.515, 0.025, 0.47, 0.95],
  ]),
  mosaic3: adaptive('c-mosaic-3', { kind: 'rows', area: SPREAD_AREA }, [
    ['framed', 0.015, 0.025, 0.4, 0.95],
    ['framed', 0.415, 0.025, 0.3, 0.95],
    ['framed', 0.715, 0.025, 0.27, 0.95],
  ]),
  mosaic5: adaptive('c-mosaic-5', { kind: 'rows', area: SPREAD_AREA }, [
    ['small', 0.015, 0.025, 0.35, 0.5],
    ['small', 0.365, 0.025, 0.3, 0.5],
    ['small', 0.665, 0.025, 0.32, 0.5],
    ['small', 0.015, 0.525, 0.5, 0.45],
    ['small', 0.515, 0.525, 0.47, 0.45],
  ]),
  // Tall columns side by side, each photo stacked as needed.
  columns4: adaptive('c-columns-4', { kind: 'columns', area: SPREAD_AREA }, [
    ['small', 0.015, 0.025, 0.24, 0.55],
    ['small', 0.015, 0.575, 0.24, 0.4],
    ['small', 0.255, 0.025, 0.36, 0.95],
    ['small', 0.615, 0.025, 0.37, 0.95],
  ]),

  // One big photo at full height, the others tucked against its edge.
  hero2: adaptive('c-hero-2', { kind: 'hero', area: SPREAD_AREA, side: 'left' }, [
    ['peak', 0.015, 0.025, 0.58, 0.95],
    ['framed', 0.56, 0.07, 0.42, 0.42],
    ['framed', 0.56, 0.51, 0.42, 0.42],
  ]),
  hero3: adaptive('c-hero-3', { kind: 'hero', area: SPREAD_AREA, side: 'right' }, [
    ['peak', 0.42, 0.025, 0.565, 0.95],
    ['small', 0.015, 0.07, 0.44, 0.28],
    ['small', 0.015, 0.36, 0.44, 0.28],
    ['small', 0.015, 0.65, 0.44, 0.28],
  ]),

  // A deck of photos fanned across both slides, overlapping, high and low.
  fan3: adaptive('c-fan-3', { kind: 'fan', area: SPREAD_AREA }, [
    ['framed', 0.015, 0.04, 0.4, 0.82],
    ['framed', 0.3, 0.14, 0.4, 0.82],
    ['framed', 0.585, 0.04, 0.4, 0.82],
  ]),
  fan4: adaptive('c-fan-4', { kind: 'fan', area: SPREAD_AREA }, [
    ['small', 0.015, 0.04, 0.32, 0.8],
    ['small', 0.23, 0.16, 0.32, 0.8],
    ['small', 0.445, 0.04, 0.32, 0.8],
    ['small', 0.665, 0.16, 0.32, 0.8],
  ]),

  // Two big photos crossing over the seam.
  overlap: {
    id: 'c-overlap',
    slots: [
      slot('framed', 'fit', 0.02, 0.03, 0.64, 0.8),
      slot('framed', 'fit', 0.36, 0.17, 0.62, 0.8),
    ].map((s, i) => ({ ...s, align: i ? { x: 0, y: 0 } : { x: 1, y: 1 } })),
    text: [],
  },
  // A big photo with a smaller one laid over its corner.
  bigSmall: {
    id: 'c-big-small',
    slots: [
      slot('framed', 'fit', 0.02, 0.04, 0.74, 0.92, { x: 0, y: 0.5 }),
      slot('small', 'fit', 0.6, 0.48, 0.37, 0.48, { x: 1, y: 1 }),
    ],
    text: [],
  },

  // One photo, as big as it goes: for zines with few photos.
  solo: { id: 'c-solo', slots: [slot('peak', 'fit', 0.03, 0.04, 0.94, 0.92)], text: [] },
  left: { id: 'c-left', slots: [slot('framed', 'fit', 0.02, 0.04, 0.7, 0.92, { x: 0, y: 0.5 })], text: [] },
  right: { id: 'c-right', slots: [slot('framed', 'fit', 0.28, 0.04, 0.7, 0.92, { x: 1, y: 0.5 })], text: [] },
} satisfies Record<string, Template>

const coverWords = [text('title', 0.06, 0.9), text('byline', 0.06, 0.955)]

const C_COVERS: Template[] = [
  {
    id: 'c-cover-bleed',
    slots: [slot('cover', 'fill', 0, 0, 1, 1)],
    text: [text('byline', 0.06, 0.04, { hang: true, onPhoto: true }), text('title', 0.06, 0.94, { onPhoto: true })],
  },
  {
    id: 'c-cover-top',
    slots: [slot('cover', 'fit', 0, 0, 1, 0.78, { x: 0.5, y: 0 })],
    text: coverWords,
  },
  adaptive(
    'c-cover-mosaic',
    { kind: 'rows', area: { x: 0, y: 0, w: 1, h: 0.78 } },
    [
      ['cover', 0, 0, 1, 0.46],
      ['framed', 0, 0.46, 0.5, 0.32],
      ['framed', 0.5, 0.46, 0.5, 0.32],
    ],
    coverWords,
  ),
  adaptive(
    'c-cover-fan',
    { kind: 'fan', area: { x: 0.03, y: 0.03, w: 0.94, h: 0.74 } },
    [
      ['cover', 0.03, 0.05, 0.6, 0.62],
      ['framed', 0.37, 0.14, 0.6, 0.62],
    ],
    coverWords,
  ),
]

const C_BACKS: Template[] = [
  {
    id: 'c-back',
    slots: [slot('coda', 'fit', 0, 0, 1, 0.8, { x: 0.5, y: 0 })],
    text: [text('colophon', 0.06, 0.95)],
  },
  adaptive(
    'c-back-mosaic',
    { kind: 'rows', area: { x: 0, y: 0, w: 1, h: 0.8 } },
    [
      ['coda', 0, 0, 0.5, 0.8],
      ['coda', 0.5, 0, 0.5, 0.8],
    ],
    [text('colophon', 0.06, 0.95)],
  ),
  { id: 'c-back-text', slots: [], text: [text('colophon', 0.06, 0.93)] },
]

// ── The arcs ────────────────────────────────────────────────────────────────
// Each position in the zine has a few layouts that suit its job in the flow.
// The sequencer tries every combination and keeps the one that best fits
// the photos it was given.

export interface Arc {
  cover: Template[]
  opening: Template[]
  peak: Template[]
  fade: Template[]
  back: Template[]
}

export const ARCS: Record<ZineStyle, Arc> = {
  quiet: {
    cover: Q_COVERS,
    // Opening: quiet. Black or a small photo facing something larger.
    opening: [pair(Q.black, Q.bleed), pair(Q.smallLow, Q.bleed), pair(Q.black, Q.framed), pair(Q.smallHigh, Q.framed)],
    // Peak: the biggest, darkest moment.
    peak: [Q_SPREADS.across, Q_SPREADS.band, pair(Q.bleed, Q.bleed)],
    // Fade: shrinking, ending in black.
    fade: [pair(Q.framed, Q.smallLow), pair(Q.smallHigh, Q.black), pair(Q.bleed, Q.smallLow), pair(Q.framed, Q.black)],
    back: Q_BACKS,
  },
  magazine: {
    cover: M_COVERS,
    // Opening: one big feature picture, then a taste of what's inside.
    opening: [pair(M.full, M.inset), pair(M.trio, M.inset), pair(M.inset, M.inset), pair(M.blank, M.inset)],
    // Peak: the big moment — one photo across the fold, or the busiest catalog page.
    peak: [M_HERO, M_WIDE, pair(M.inset, M.grid), pair(M.grid, M.grid)],
    // Fade: easing off into pairs.
    fade: [pair(M.stack, M.stack), pair(M.inset, M.inset), pair(M.full, M.trio), pair(M.inset, M.blank)],
    back: M_BACKS,
  },
  collage: {
    cover: C_COVERS,
    // Opening: one big picture with others tucked against it, or a bold pair.
    opening: [C_SPREADS.hero2, C_SPREADS.mosaic2, C_SPREADS.overlap, C_SPREADS.left],
    // Peak: the most photo — one across both slides, a packed mosaic, or a fanned deck.
    peak: [C_SPREADS.pano, C_SPREADS.mosaic5, C_SPREADS.fan4, C_SPREADS.solo],
    // Fade: still full, a little looser.
    fade: [C_SPREADS.hero3, C_SPREADS.fan3, C_SPREADS.mosaic3, C_SPREADS.columns4, C_SPREADS.bigSmall, C_SPREADS.right],
    back: C_BACKS,
  },
}

// ── The libraries people pick from ──────────────────────────────────────────
// Every layout the arcs use, plus a few more, roughly from loudest to quietest.

export const LAYOUTS: Record<ZineStyle, Record<SurfaceKind, Template[]>> = {
  quiet: {
    cover: Q_COVERS,
    spread: [
      Q_SPREADS.across,
      Q_SPREADS.band,
      pair(Q.bleed, Q.bleed),
      pair(Q.black, Q.bleed),
      pair(Q.smallLow, Q.bleed),
      pair(Q.bleed, Q.smallLow),
      pair(Q.framed, Q.framed),
      pair(Q.black, Q.framed),
      pair(Q.smallHigh, Q.framed),
      pair(Q.framed, Q.smallLow),
      pair(Q.framed, Q.black),
      pair(Q.smallHigh, Q.black),
    ],
    back: Q_BACKS,
  },
  magazine: {
    cover: M_COVERS,
    spread: [
      M_HERO,
      M_WIDE,
      pair(M.full, M.inset),
      pair(M.inset, M.full),
      pair(M.grid, M.grid),
      pair(M.inset, M.grid),
      pair(M.trio, M.inset),
      pair(M.full, M.trio),
      pair(M.stack, M.stack),
      pair(M.stack, M.full),
      pair(M.inset, M.inset),
      pair(M.blank, M.inset),
      pair(M.inset, M.blank),
    ],
    back: M_BACKS,
  },
  collage: {
    cover: C_COVERS,
    spread: [
      C_SPREADS.pano,
      C_SPREADS.mosaic2,
      C_SPREADS.mosaic3,
      C_SPREADS.mosaic5,
      C_SPREADS.columns4,
      C_SPREADS.hero2,
      C_SPREADS.hero3,
      C_SPREADS.fan3,
      C_SPREADS.fan4,
      C_SPREADS.overlap,
      C_SPREADS.bigSmall,
      C_SPREADS.solo,
      C_SPREADS.left,
      C_SPREADS.right,
    ],
    back: C_BACKS,
  },
}

/** The layouts on offer for a style, with circle layouts added when they're turned on. */
export function layoutsFor(style: ZineStyle, circles: boolean): Record<SurfaceKind, Template[]> {
  const base = LAYOUTS[style]
  if (style !== 'magazine' || !circles) return base
  return {
    cover: [...base.cover, ...CIRCLES.cover],
    spread: [...base.spread, ...CIRCLES.spread],
    back: [...base.back, ...CIRCLES.back],
  }
}

/** The automatic sequence's options, with a circle layout at each quieter moment when circles are on. */
export function arcFor(style: ZineStyle, circles: boolean): Arc {
  const arc = ARCS[style]
  if (style !== 'magazine' || !circles) return arc
  return {
    cover: [...arc.cover, CIRCLES.cover[0]],
    opening: [...arc.opening, pair(MC.dots, M.inset)],
    peak: arc.peak,
    fade: [...arc.fade, pair(M.full, MC.circle)],
    back: [...arc.back, CIRCLES.back[0]],
  }
}

/** Find a layout by id in any style, so a draft keeps working if the style changes. */
export function findLayout(kind: SurfaceKind, id: string): Template {
  for (const library of [...Object.values(LAYOUTS), CIRCLES]) {
    const found = library[kind].find((t) => t.id === id)
    if (found) return found
  }
  return LAYOUTS.quiet[kind][0]
}

export function hasCircles(t: Template): boolean {
  return t.slots.some((s) => s.shape === 'circle')
}

/** The closest layout without circles, for when circles are turned off. */
export function withoutCircles(kind: SurfaceKind, id: string): string {
  const swapped = id
    .split('|')
    .map((part) => CIRCLE_FALLBACK[part] ?? part)
    .join('|')
  const library = LAYOUTS.magazine[kind]
  if (library.some((t) => t.id === swapped)) return swapped
  // No direct relative: take the layout holding the closest number of photos, so none are dropped.
  const count = findLayout(kind, id).slots.length
  const distance = (t: Template) => Math.abs(t.slots.length - count) + (t.slots.length < count ? 0.5 : 0)
  return library.reduce((best, t) => (distance(t) < distance(best) ? t : best)).id
}

const LAYOUT_NAMES: Record<string, string> = {
  across: 'One photo across the fold',
  band: 'Wide photo across the fold, framed',
  bleed: 'full page',
  framed: 'framed',
  'small-low': 'small, low',
  'small-high': 'small, high',
  black: 'black',
  'cover-bleed': 'Full-page photo, title on it',
  'cover-framed': 'Framed photo, title below',
  'back-small': 'Small photo and colophon',
  'back-black': 'Colophon only',
  'm-hero': 'One photo across the fold',
  'm-full': 'full page',
  'm-inset': 'one photo',
  'm-grid': 'grid of four',
  'm-stack': 'two stacked',
  'm-trio': 'zig-zag of three',
  'm-cover': 'Big title, photo below',
  'm-cover-bleed': 'Big title over a full-page photo',
  'm-back': 'Photo and colophon',
  'm-back-text': 'Colophon only',
  'm-circle': 'one circle',
  'm-dots': 'three circles',
  'm-cover-circle': 'Big title, circle photo below',
  'm-back-circle': 'Circle photo and colophon',
  'm-wide': 'One big photo across the fold, framed',
  'm-blank': 'empty',
  'c-pano': 'One photo across both slides',
  'c-solo': 'One big photo across the seam',
  'c-overlap': 'Two big photos overlapping',
  'c-big-small': 'Big photo, smaller one on its corner',
  'c-left': 'Big photo, leaning left',
  'c-right': 'Big photo, leaning right',
  'c-cover-bleed': 'Full photo, title on it',
  'c-cover-top': 'Big photo, title below',
  'c-back': 'Photo and colophon',
  'c-back-text': 'Colophon only',
  'c-mosaic-2': 'Two photos, edge to edge',
  'c-mosaic-3': 'Three photos, edge to edge',
  'c-mosaic-5': 'Five photos, edge to edge',
  'c-columns-4': 'Four photos in tall columns',
  'c-hero-2': 'Big photo, two tucked beside it',
  'c-hero-3': 'Big photo, three tucked beside it',
  'c-fan-3': 'Three photos fanned out',
  'c-fan-4': 'Four photos fanned out',
  'c-cover-mosaic': 'Mosaic of three, title below',
  'c-cover-fan': 'Two photos fanned, title below',
  'c-back-mosaic': 'Two photos and colophon',
}

export function layoutName(id: string): string {
  if (LAYOUT_NAMES[id]) return LAYOUT_NAMES[id]
  const [left, right] = id.split('|').map((p) => LAYOUT_NAMES[p] ?? p)
  return `Left ${left} · right ${right}`
}
