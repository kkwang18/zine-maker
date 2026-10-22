import { arrange } from './arrange'
import { fitPhoto, squareAround } from './fit'
import { surfaceAspect } from './geometry'
import { findLayout } from './layouts'
import type {
  Draft,
  DraftSurface,
  Frame,
  FrameShape,
  FreePhoto,
  FreeText,
  PageColor,
  PaperSize,
  Photo,
  PhotoShape,
  Rect,
  Shape,
  ShapeKind,
  SlotAddress,
  Surface,
} from './types'

/** Text boxes start above the photos. */
const TEXT_Z = 100
/** Photos placed by hand start above the layout's photos, below text. */
const FREE_Z = 50
const FULL = { x: 0, y: 0, w: 1, h: 1 }

/** "Cover", "2 – 3", …, "Back": pages in reading order, however many spreads there are. */
export function surfaceLabel(draft: Draft, i: number): string {
  const kind = draft[i].kind
  if (kind === 'cover') return 'Cover'
  if (kind === 'back') return 'Back'
  return `${i * 2} – ${i * 2 + 1}`
}

/** The largest rect of physical aspect `aspect` that fits in `box`, centred. */
function contain(box: Rect, aspect: number, surfaceAspect: number): Rect {
  const boxAspect = (box.w * surfaceAspect) / box.h
  const w = aspect > boxAspect ? box.w : (box.h * aspect) / surfaceAspect
  const h = aspect > boxAspect ? (box.w * surfaceAspect) / aspect : box.h
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h }
}

/** The shape a photo shows as: one picked by hand, else its layout's. */
function frameShape(picked: FrameShape | undefined, layout?: PhotoShape): PhotoShape | undefined {
  return picked === 'plain' ? undefined : (picked ?? layout)
}

/** Work out exact positions for every slot of every surface. */
export function renderDraft(draft: Draft, photos: Map<string, Photo>, paper: PaperSize): Surface[] {
  return draft.map((s, i) => {
    const template = findLayout(s.kind, s.templateId)
    const aspect = surfaceAspect(s.kind, paper)
    // Adaptive layouts: frames fitted to the photos actually placed (empty slots keep a typical shape).
    const fitted = template.arrange
      ? arrange(
          template.arrange,
          template.slots.map((_, j) => photos.get(s.photoIds[j] ?? '')?.aspect ?? 1.4),
          aspect,
        )
      : null
    return {
      kind: s.kind,
      label: surfaceLabel(draft, i),
      aspect,
      templateId: template.id,
      text: template.text,
      texts: s.texts ?? [],
      shapes: s.shapes ?? [],
      color: s.color,
      free: (s.free ?? []).flatMap((f) => {
        const photo = photos.get(f.photoId)
        if (!photo) return []
        const shape = frameShape(f.shape)
        // A circle shows the square around the subject, as the largest square in the box.
        const placement =
          shape === 'circle'
            ? { photoId: photo.id, dest: contain(f.box, 1, aspect), src: squareAround(photo), shape }
            : { photoId: photo.id, dest: contain(f.box, photo.aspect, aspect), src: FULL, shape }
        return [{ id: f.id, z: f.z, locked: Boolean(f.locked), placement }]
      }),
      slots: template.slots.map((slot, j) => {
        const frame = s.frames?.[j]
        const z = frame?.z ?? j
        const moved = Boolean(frame?.box)
        const locked = Boolean(frame?.locked)
        const id = s.photoIds[j]
        const photo = id ? photos.get(id) : undefined
        const home = fitted?.[j] ?? slot.rect
        if (!photo) return { rect: frame?.box ?? home, placement: null, z, moved, locked }
        const shape = frameShape(frame?.shape, slot.shape)
        if (fitted) {
          const box = frame?.box ?? home
          // The frame already has the photo's shape: the whole photo, uncropped.
          const placement =
            shape === 'circle'
              ? { photoId: photo.id, dest: contain(box, 1, aspect), src: squareAround(photo), shape }
              : { photoId: photo.id, dest: frame?.box ? contain(box, photo.aspect, aspect) : home, src: FULL, shape }
          return { rect: home, placement, z, moved, locked }
        }
        // A photo placed by hand in a fill slot it can't fill with a small crop
        // is framed inside the slot instead — never cropped further.
        const asked = { ...slot, shape }
        const fit = fitPhoto(photo, asked, aspect) ?? fitPhoto(photo, { ...asked, mode: 'fit' }, aspect)!
        // Moved by hand: the photo (as cropped, if at all) keeps its shape inside the new box.
        const dest = frame?.box ? contain(frame.box, (photo.aspect * fit.src.w) / fit.src.h, aspect) : fit.dest
        return { rect: slot.rect, placement: { photoId: photo.id, dest, src: fit.src, shape }, z, moved, locked }
      }),
    }
  })
}

export function photoAt(draft: Draft, at: SlotAddress): string | null {
  return draft[at.surface]?.photoIds[at.slot] ?? null
}

export function locate(draft: Draft, photoId: string): SlotAddress | null {
  for (let surface = 0; surface < draft.length; surface++) {
    const slot = draft[surface].photoIds.indexOf(photoId)
    if (slot >= 0) return { surface, slot }
  }
  return null
}

function updateSurface(draft: Draft, i: number, change: (s: DraftSurface) => DraftSurface): Draft {
  return draft.map((s, j) => (j === i ? change(s) : s))
}

function withSlot(draft: Draft, at: SlotAddress, photoId: string | null): Draft {
  return updateSurface(draft, at.surface, (s) => ({
    ...s,
    photoIds: s.photoIds.map((id, j) => (j === at.slot ? photoId : id)),
  }))
}

/** A photo on a page: in a layout slot, or placed freely by hand. */
export type PhotoRef = { type: 'slot'; at: SlotAddress } | { type: 'free'; surface: number; id: string }

function photoOf(draft: Draft, ref: PhotoRef): string | null {
  if (ref.type === 'slot') return photoAt(draft, ref.at)
  return draft[ref.surface]?.free?.find((f) => f.id === ref.id)?.photoId ?? null
}

/** Put a photo in a slot or free spot; null empties a slot, or removes a free spot. */
function setPhoto(draft: Draft, ref: PhotoRef, photoId: string | null): Draft {
  if (ref.type === 'slot') return withSlot(draft, ref.at, photoId)
  return updateSurface(draft, ref.surface, (s) => ({
    ...s,
    free: photoId
      ? (s.free ?? []).map((f) => (f.id === ref.id ? { ...f, photoId } : f))
      : (s.free ?? []).filter((f) => f.id !== ref.id),
  }))
}

/** Where a photo is on the pages, if anywhere. */
export function findPhoto(draft: Draft, photoId: string): PhotoRef | null {
  const at = locate(draft, photoId)
  if (at) return { type: 'slot', at }
  for (let surface = 0; surface < draft.length; surface++) {
    const free = draft[surface].free?.find((f) => f.photoId === photoId)
    if (free) return { type: 'free', surface, id: free.id }
  }
  return null
}

/** Swap the photos in two places. A free spot left without a photo goes away. */
export function swapPhotos(draft: Draft, a: PhotoRef, b: PhotoRef): Draft {
  const pa = photoOf(draft, a)
  const pb = photoOf(draft, b)
  return setPhoto(setPhoto(draft, a, pb), b, pa)
}

/**
 * Put a photo somewhere. If it was already placed, the two swap; otherwise
 * whatever was there goes back to the unused pile.
 */
export function placePhoto(draft: Draft, photoId: string, at: PhotoRef): Draft {
  const from = findPhoto(draft, photoId)
  return from ? swapPhotos(draft, from, at) : setPhoto(draft, at, photoId)
}

/** Take a photo off its page, wherever it is. */
export function takeOff(draft: Draft, ref: PhotoRef): Draft {
  return setPhoto(draft, ref, null)
}

export function clearSlot(draft: Draft, at: SlotAddress): Draft {
  return withSlot(draft, at, null)
}

/** A photo deleted from the zine: gone from every page. */
export function removePhoto(draft: Draft, photoId: string): Draft {
  let next = draft
  for (let ref = findPhoto(next, photoId); ref; ref = findPhoto(next, photoId)) next = setPhoto(next, ref, null)
  return next
}

/**
 * Place a photo freely on a page, centred on `point` (surface fractions), at a
 * comfortable size. A photo already on a page moves here rather than appearing twice.
 */
export function addFree(
  draft: Draft,
  surface: number,
  photo: Photo,
  point: { x: number; y: number },
  surfaceAspect: number,
): { draft: Draft; id: string } {
  const from = findPhoto(draft, photo.id)
  let next = from ? setPhoto(draft, from, null) : draft
  // About half a page wide, or less if that would make it too tall.
  const pageWidth = draft[surface].kind === 'spread' ? 0.5 : 1
  let w = pageWidth * 0.55
  let h = (w * surfaceAspect) / photo.aspect
  if (h > 0.7) {
    h = 0.7
    w = (h * photo.aspect) / surfaceAspect
  }
  const free: FreePhoto = {
    id: crypto.randomUUID(),
    photoId: photo.id,
    box: { x: point.x - w / 2, y: point.y - h / 2, w, h },
    z: Math.max(FREE_Z, ...stack(next[surface])) + 1,
  }
  next = updateSurface(next, surface, (s) => ({ ...s, free: [...(s.free ?? []), free] }))
  return { draft: next, id: free.id }
}

export function moveFree(draft: Draft, surface: number, id: string, box: Rect): Draft {
  return updateSurface(draft, surface, (s) => ({
    ...s,
    free: (s.free ?? []).map((f) => (f.id === id ? { ...f, box } : f)),
  }))
}

// ── Arranging by hand ───────────────────────────────────────────────────────

function withFrame(draft: Draft, at: SlotAddress, change: (f: Frame) => Frame): Draft {
  return updateSurface(draft, at.surface, (s) => {
    const frames = s.photoIds.map((_, j) => s.frames?.[j] ?? null)
    frames[at.slot] = change(frames[at.slot] ?? {})
    return { ...s, frames }
  })
}

export function moveFrame(draft: Draft, at: SlotAddress, box: Rect): Draft {
  return withFrame(draft, at, (f) => ({ ...f, box }))
}

/** Put a moved photo back where its layout had it (keeping its place in the stack and its shape). */
export function resetFrame(draft: Draft, at: SlotAddress): Draft {
  return withFrame(draft, at, (f) => ({ z: f.z, locked: f.locked, shape: f.shape }))
}

/** Give one photo a frame shape, wherever it is. */
export function setFrameShape(draft: Draft, ref: PhotoRef, shape: FrameShape | undefined): Draft {
  if (ref.type === 'slot') return withFrame(draft, ref.at, (f) => ({ ...f, shape }))
  return updateSurface(draft, ref.surface, (s) => ({
    ...s,
    free: (s.free ?? []).map((f) => (f.id === ref.id ? { ...f, shape } : f)),
  }))
}

/** Every stacking position in use on a surface: photos, shapes and text boxes. */
function stack(s: DraftSurface): number[] {
  return [
    ...s.photoIds.map((_, j) => s.frames?.[j]?.z ?? j),
    ...(s.free ?? []).map((f) => f.z),
    ...(s.shapes ?? []).map((f) => f.z),
    ...(s.texts ?? []).map((t) => t.z),
  ]
}

export type Layer =
  | { type: 'slot'; slot: number }
  | { type: 'free'; id: string }
  | { type: 'shape'; id: string }
  | { type: 'text'; id: string }

/** Bring something to the front of its page, or send it to the back. */
export function restack(draft: Draft, surface: number, item: Layer, direction: 'front' | 'back'): Draft {
  const zs = stack(draft[surface])
  const z = direction === 'front' ? Math.max(...zs) + 1 : Math.min(...zs) - 1
  if (item.type === 'slot') return withFrame(draft, { surface, slot: item.slot }, (f) => ({ ...f, z }))
  if (item.type === 'free')
    return updateSurface(draft, surface, (s) => ({
      ...s,
      free: (s.free ?? []).map((f) => (f.id === item.id ? { ...f, z } : f)),
    }))
  if (item.type === 'shape') return updateShape(draft, surface, item.id, { z })
  return updateText(draft, surface, item.id, { z })
}

// ── Shapes ──────────────────────────────────────────────────────────────────

/** A rule's thickness when first drawn, as a fraction of the surface's height. */
const LINE_THICKNESS = 0.008

/**
 * Add a shape to a page: centred on it (the right-hand page of a spread),
 * behind the photos, so a colour block sits underneath them.
 */
export function addShape(
  draft: Draft,
  surface: number,
  kind: ShapeKind,
  color: PageColor,
  surfaceAspect: number,
): { draft: Draft; id: string } {
  const s = draft[surface]
  const spread = s.kind === 'spread'
  const page = spread ? 0.5 : 1
  const cx = spread ? 0.75 : 0.5
  // Widths are a share of the page; heights follow in physical proportion.
  const w = page * (kind === 'line' ? 0.6 : kind === 'ellipse' ? 0.36 : 0.5)
  const h = kind === 'line' ? LINE_THICKNESS : kind === 'ellipse' ? w * surfaceAspect : w * surfaceAspect * 0.66
  // Just under the lowest photo or text; shapes already down there step back
  // one, so the new one sits on top of them.
  const z = Math.min(0, ...stack({ ...s, shapes: [] })) - 1
  const shape: Shape = {
    id: crypto.randomUUID(),
    kind,
    box: { x: cx - w / 2, y: 0.5 - h / 2, w, h },
    color,
    opacity: 1,
    z,
  }
  return {
    draft: updateSurface(draft, surface, (x) => ({
      ...x,
      shapes: [...(x.shapes ?? []).map((f) => (f.z <= z ? { ...f, z: f.z - 1 } : f)), shape],
    })),
    id: shape.id,
  }
}

export function updateShape(draft: Draft, surface: number, id: string, change: Partial<Shape>): Draft {
  return updateSurface(draft, surface, (s) => ({
    ...s,
    shapes: (s.shapes ?? []).map((f) => (f.id === id ? { ...f, ...change } : f)),
  }))
}

export function removeShape(draft: Draft, surface: number, id: string): Draft {
  return updateSurface(draft, surface, (s) => ({ ...s, shapes: (s.shapes ?? []).filter((f) => f.id !== id) }))
}

// ── Text boxes ──────────────────────────────────────────────────────────────

export function addText(draft: Draft, surface: number): { draft: Draft; id: string } {
  const s = draft[surface]
  const spread = s.kind === 'spread'
  const text: FreeText = {
    id: crypto.randomUUID(),
    text: 'Write something',
    // On a spread, start on the right-hand page.
    x: spread ? 0.58 : 0.12,
    y: 0.42,
    w: spread ? 0.32 : 0.64,
    size: 'm',
    font: 'sans',
    color: 'auto',
    z: Math.max(TEXT_Z, ...stack(s)) + 1,
  }
  return { draft: updateSurface(draft, surface, (x) => ({ ...x, texts: [...(x.texts ?? []), text] })), id: text.id }
}

export function updateText(draft: Draft, surface: number, id: string, change: Partial<FreeText>): Draft {
  return updateSurface(draft, surface, (s) => ({
    ...s,
    texts: (s.texts ?? []).map((t) => (t.id === id ? { ...t, ...change } : t)),
  }))
}

export function removeText(draft: Draft, surface: number, id: string): Draft {
  return updateSurface(draft, surface, (s) => ({ ...s, texts: (s.texts ?? []).filter((t) => t.id !== id) }))
}

// ── Pages ───────────────────────────────────────────────────────────────────

/** Swap a spread with its neighbour. The cover and back stay put. */
export function moveSpread(draft: Draft, i: number, by: -1 | 1): Draft {
  const j = i + by
  if (draft[i]?.kind !== 'spread' || draft[j]?.kind !== 'spread') return draft
  const next = [...draft]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

export function removeSpread(draft: Draft, i: number): Draft {
  const spreads = draft.filter((s) => s.kind === 'spread').length
  if (draft[i]?.kind !== 'spread' || spreads <= 1) return draft
  return draft.filter((_, j) => j !== i)
}

export function setSurfaceColor(draft: Draft, i: number, color: PageColor | undefined): Draft {
  return updateSurface(draft, i, (s) => ({ ...s, color }))
}

// ── Precise editing: any item, by its layer ─────────────────────────────────

/** Is this item locked against moving and deleting? */
export function isLocked(draft: Draft, surface: number, item: Layer): boolean {
  const s = draft[surface]
  if (item.type === 'slot') return Boolean(s.frames?.[item.slot]?.locked)
  if (item.type === 'free') return Boolean(s.free?.find((f) => f.id === item.id)?.locked)
  if (item.type === 'shape') return Boolean(s.shapes?.find((f) => f.id === item.id)?.locked)
  return Boolean(s.texts?.find((t) => t.id === item.id)?.locked)
}

export function setLocked(draft: Draft, surface: number, item: Layer, locked: boolean): Draft {
  if (item.type === 'slot') return withFrame(draft, { surface, slot: item.slot }, (f) => ({ ...f, locked }))
  if (item.type === 'free')
    return updateSurface(draft, surface, (s) => ({
      ...s,
      free: (s.free ?? []).map((f) => (f.id === item.id ? { ...f, locked } : f)),
    }))
  if (item.type === 'shape') return updateShape(draft, surface, item.id, { locked })
  return updateText(draft, surface, item.id, { locked })
}

/**
 * Put an item at an exact position and size (surface fractions). Photos keep
 * their shape inside the box; shapes take it exactly; text boxes take the
 * position and width, and their height follows the words.
 */
export function placeItem(draft: Draft, surface: number, item: Layer, rect: Rect): Draft {
  if (item.type === 'slot') return moveFrame(draft, { surface, slot: item.slot }, rect)
  if (item.type === 'free') return moveFree(draft, surface, item.id, rect)
  if (item.type === 'shape') return updateShape(draft, surface, item.id, { box: rect })
  return updateText(draft, surface, item.id, { x: rect.x, y: rect.y, w: rect.w })
}

/** How far a copy sits from the original, so both can be seen. */
const COPY_OFFSET = 0.03

/**
 * Copy an item onto the same page, slightly offset, on top. A photo from a
 * layout slot is copied as a freely placed photo (the same picture can appear
 * twice if asked for). Returns the new item.
 */
export function duplicate(
  draft: Draft,
  surface: number,
  item: Layer,
  rect: Rect,
): { draft: Draft; item: Layer } {
  const s = draft[surface]
  const z = Math.max(...stack(s)) + 1
  const box = { ...rect, x: rect.x + COPY_OFFSET, y: rect.y + COPY_OFFSET }
  if (item.type === 'text') {
    const original = s.texts?.find((t) => t.id === item.id)
    if (!original) return { draft, item }
    const copy = { ...original, id: crypto.randomUUID(), x: box.x, y: box.y, z, locked: false }
    return { draft: updateSurface(draft, surface, (x) => ({ ...x, texts: [...(x.texts ?? []), copy] })), item: { type: 'text', id: copy.id } }
  }
  if (item.type === 'shape') {
    const original = s.shapes?.find((f) => f.id === item.id)
    if (!original) return { draft, item }
    const copy = { ...original, id: crypto.randomUUID(), box, z, locked: false }
    return { draft: updateSurface(draft, surface, (x) => ({ ...x, shapes: [...(x.shapes ?? []), copy] })), item: { type: 'shape', id: copy.id } }
  }
  const original = item.type === 'slot' ? {
          photoId: s.photoIds[item.slot],
          // A copy keeps the photo's look, even a shape that came with the layout.
          shape: s.frames?.[item.slot]?.shape ?? findLayout(s.kind, s.templateId).slots[item.slot]?.shape,
        } : s.free?.find((f) => f.id === item.id)
  const photoId = original?.photoId
  if (!photoId) return { draft, item }
  const copy: FreePhoto = { id: crypto.randomUUID(), photoId, box, z, shape: original.shape }
  return { draft: updateSurface(draft, surface, (x) => ({ ...x, free: [...(x.free ?? []), copy] })), item: { type: 'free', id: copy.id } }
}

/** Line items up with each other (or, for one item, with `bounds`, its page). */
export function alignRects(rects: Rect[], how: Align, bounds?: Rect): Rect[] {
  const box = bounds ?? {
    x: Math.min(...rects.map((r) => r.x)),
    y: Math.min(...rects.map((r) => r.y)),
    w: Math.max(...rects.map((r) => r.x + r.w)) - Math.min(...rects.map((r) => r.x)),
    h: Math.max(...rects.map((r) => r.y + r.h)) - Math.min(...rects.map((r) => r.y)),
  }
  return rects.map((r) => {
    switch (how) {
      case 'left':
        return { ...r, x: box.x }
      case 'centre':
        return { ...r, x: box.x + (box.w - r.w) / 2 }
      case 'right':
        return { ...r, x: box.x + box.w - r.w }
      case 'top':
        return { ...r, y: box.y }
      case 'middle':
        return { ...r, y: box.y + (box.h - r.h) / 2 }
      case 'bottom':
        return { ...r, y: box.y + box.h - r.h }
    }
  })
}

export type Align = 'left' | 'centre' | 'right' | 'top' | 'middle' | 'bottom'

/** Space items evenly between the outermost two, across or down. */
export function distributeRects(rects: Rect[], axis: 'x' | 'y'): Rect[] {
  const size = axis === 'x' ? 'w' : 'h'
  const order = rects.map((r, i) => ({ r, i })).sort((a, b) => a.r[axis] - b.r[axis])
  const first = order[0].r
  const last = order[order.length - 1].r
  const span = last[axis] + last[size] - first[axis]
  const gap = (span - rects.reduce((n, r) => n + r[size], 0)) / (rects.length - 1)
  const out = [...rects]
  let at = first[axis]
  for (const { r, i } of order) {
    out[i] = { ...r, [axis]: at }
    at += r[size] + gap
  }
  return out
}
