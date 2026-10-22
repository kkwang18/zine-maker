import { arrange } from './arrange'
import { fitPhoto } from './fit'
import { surfaceAspect } from './geometry'
import { findLayout } from './layouts'
import type { Draft, DraftSurface, FreePhoto, FreeText, PageColor, PaperSize, Photo, Rect, SlotAddress, Surface } from './types'

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
      color: s.color,
      free: (s.free ?? []).flatMap((f) => {
        const photo = photos.get(f.photoId)
        if (!photo) return []
        return [{ id: f.id, z: f.z, placement: { photoId: photo.id, dest: contain(f.box, photo.aspect, aspect), src: FULL } }]
      }),
      slots: template.slots.map((slot, j) => {
        const frame = s.frames?.[j]
        const z = frame?.z ?? j
        const moved = Boolean(frame?.box)
        const id = s.photoIds[j]
        const photo = id ? photos.get(id) : undefined
        const home = fitted?.[j] ?? slot.rect
        if (!photo) return { rect: frame?.box ?? home, placement: null, z, moved }
        if (fitted) {
          // The frame already has the photo's shape: the whole photo, uncropped.
          const dest = frame?.box ? contain(frame.box, photo.aspect, aspect) : home
          return { rect: home, placement: { photoId: photo.id, dest, src: FULL, shape: slot.shape }, z, moved }
        }
        // A photo placed by hand in a fill slot it can't fill with a small crop
        // is framed inside the slot instead — never cropped further.
        const fit = fitPhoto(photo, slot, aspect) ?? fitPhoto(photo, { ...slot, mode: 'fit' }, aspect)!
        // Moved by hand: the photo (as cropped, if at all) keeps its shape inside the new box.
        const dest = frame?.box ? contain(frame.box, (photo.aspect * fit.src.w) / fit.src.h, aspect) : fit.dest
        return { rect: slot.rect, placement: { photoId: photo.id, dest, src: fit.src, shape: slot.shape }, z, moved }
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

function withFrame(draft: Draft, at: SlotAddress, change: (f: { box?: Rect; z?: number }) => { box?: Rect; z?: number }): Draft {
  return updateSurface(draft, at.surface, (s) => {
    const frames = s.photoIds.map((_, j) => s.frames?.[j] ?? null)
    frames[at.slot] = change(frames[at.slot] ?? {})
    return { ...s, frames }
  })
}

export function moveFrame(draft: Draft, at: SlotAddress, box: Rect): Draft {
  return withFrame(draft, at, (f) => ({ ...f, box }))
}

/** Put a moved photo back where its layout had it (keeping its place in the stack). */
export function resetFrame(draft: Draft, at: SlotAddress): Draft {
  return withFrame(draft, at, (f) => ({ z: f.z }))
}

/** Every stacking position in use on a surface: photos and text boxes. */
function stack(s: DraftSurface): number[] {
  return [
    ...s.photoIds.map((_, j) => s.frames?.[j]?.z ?? j),
    ...(s.free ?? []).map((f) => f.z),
    ...(s.texts ?? []).map((t) => t.z),
  ]
}

export type Layer = { type: 'slot'; slot: number } | { type: 'free'; id: string } | { type: 'text'; id: string }

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
  return updateText(draft, surface, item.id, { z })
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
