import { arrange } from './arrange'
import { fitPhoto } from './fit'
import { surfaceAspect } from './geometry'
import { findLayout } from './layouts'
import type { Draft, DraftSurface, FreeText, PageColor, PaperSize, Photo, Rect, SlotAddress, Surface } from './types'

/** Text boxes start above the photos. */
const TEXT_Z = 100

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
          const full = { x: 0, y: 0, w: 1, h: 1 }
          const dest = frame?.box ? contain(frame.box, photo.aspect, aspect) : home
          return { rect: home, placement: { photoId: photo.id, dest, src: full, shape: slot.shape }, z, moved }
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

export function swapSlots(draft: Draft, a: SlotAddress, b: SlotAddress): Draft {
  const pa = photoAt(draft, a)
  const pb = photoAt(draft, b)
  return withSlot(withSlot(draft, a, pb), b, pa)
}

/**
 * Put a photo into a slot. If it was already placed somewhere, the two swap;
 * otherwise whatever was in the slot goes back to the unused pile.
 */
export function placePhoto(draft: Draft, photoId: string, at: SlotAddress): Draft {
  const from = locate(draft, photoId)
  return from ? swapSlots(draft, from, at) : withSlot(draft, at, photoId)
}

export function clearSlot(draft: Draft, at: SlotAddress): Draft {
  return withSlot(draft, at, null)
}

export function removePhoto(draft: Draft, photoId: string): Draft {
  const at = locate(draft, photoId)
  return at ? clearSlot(draft, at) : draft
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
  return [...s.photoIds.map((_, j) => s.frames?.[j]?.z ?? j), ...(s.texts ?? []).map((t) => t.z)]
}

export type Layer = { type: 'slot'; slot: number } | { type: 'text'; id: string }

/** Bring something to the front of its page, or send it to the back. */
export function restack(draft: Draft, surface: number, item: Layer, direction: 'front' | 'back'): Draft {
  const zs = stack(draft[surface])
  const z = direction === 'front' ? Math.max(...zs) + 1 : Math.min(...zs) - 1
  if (item.type === 'slot') return withFrame(draft, { surface, slot: item.slot }, (f) => ({ ...f, z }))
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
