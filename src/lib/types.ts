/** A rectangle in fractions (0..1) of whatever it lives in: a surface, or a photo. */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface PhotoStats {
  /** Average luminance, 0 (black) .. 1 (white). */
  meanLuma: number
  /** Standard deviation of luminance — a rough measure of tonal contrast. */
  contrast: number
  /** Distance between the darkest and brightest tones (2nd–98th percentile). */
  tonalRange: number
  /** Share of pixels that are near-black / near-white. */
  darkFraction: number
  brightFraction: number
  /** Average edge strength: high for detailed, cluttered frames; low for simple ones. */
  detail: number
  /** Where the detail is concentrated, 0..1 in each axis. Used to aim small crops. */
  focus: { x: number; y: number }
  /** 64-bit difference hash, for spotting near-duplicates. */
  hash: bigint
}

/** An uploaded photo as stored: the original file, untouched, and what was learned from it. */
export interface PhotoData {
  id: string
  name: string
  file: Blob
  /** Resized copies for drawing on screen and in the tray; null when the original is already that small. */
  previewFile: Blob | null
  thumbFile: Blob | null
  width: number
  height: number
  /** width / height */
  aspect: number
  stats: PhotoStats
}

/** A photo ready to show: its files as URLs. Exports use `url`, the original. */
export interface Photo extends PhotoData {
  url: string
  preview: string
  thumb: string
}

export type PaperSize = 'letter' | 'a4' | 'instagram'

/** The overall look: Quiet (sparse, black, after Fukase), Magazine (bright, playful) or Collage (big, overlapping). */
export type ZineStyle = 'quiet' | 'magazine' | 'collage'
export type PageColor = 'black' | 'white' | 'sky' | 'mint' | 'cream' | 'yellow' | 'red' | 'blue' | 'pink'
export type PhotoShape = 'rounded' | 'circle'
export type TitleFont = 'garamond' | 'dm-serif' | 'bagel' | 'anton' | 'space-mono'

/** What a slot asks of the photo placed in it; drives which photo the sequencer picks. */
export type SlotRole = 'cover' | 'peak' | 'bleed' | 'framed' | 'small' | 'coda'

export interface Slot {
  /** Area of the surface this slot occupies. */
  rect: Rect
  /**
   * fill: the photo covers the whole rect (allowed only if it needs a small crop).
   * fit:  the photo keeps its shape and sits inside the rect, positioned by `align`.
   */
  mode: 'fill' | 'fit'
  /** For fit slots: where the photo sits in the leftover space (0 = left/top, 1 = right/bottom). */
  align: { x: number; y: number }
  role: SlotRole
  /**
   * rounded: soften the corners (a mask on the page; the file is untouched).
   * circle: show the photo as the largest circle that fits the slot. This crops
   * to a square, well past the usual small-crop limit, so it's opt-in.
   */
  shape?: PhotoShape
  /** Part of an adaptive layout: the frame is fitted to the photo, so any photo suits it. */
  flex?: boolean
}

/** The words on the zine, all written by the person making it. */
export type TextKind = 'title' | 'byline' | 'colophon'

export interface TextBlock {
  kind: TextKind
  /** Anchor point in surface fractions. */
  x: number
  y: number
  vertical?: boolean
  anchor: 'start' | 'end'
  /** Horizontal text hangs down from `y` instead of sitting on it. */
  hang?: boolean
  /** Sits over a photo, so it needs to read against any image. */
  onPhoto?: boolean
}

/**
 * An adaptive layout: frames are sized to the photos in them rather than
 * fixed (see arrange.ts). Slot rects then only sketch the idea, for the
 * layout picker and for scoring.
 */
export interface Arrangement {
  /** rows / columns: an edge-to-edge mosaic. fan: an overlapping deck. hero: one big photo, the rest beside it. */
  kind: 'rows' | 'columns' | 'fan' | 'hero'
  /** The part of the surface to fill, in surface fractions. */
  area: Rect
  /** Space between photos, as a fraction of the surface's width. */
  gap?: number
  side?: 'left' | 'right'
}

export interface Template {
  id: string
  slots: Slot[]
  text: TextBlock[]
  arrange?: Arrangement
}

export interface Placement {
  photoId: string
  /** Where the photo lands on the surface. */
  dest: Rect
  /** Which part of the photo is shown (the whole photo unless a small crop was needed). */
  src: Rect
  shape?: PhotoShape
}

/**
 * A slot someone has rearranged by hand. `box` replaces the layout's position
 * (the photo keeps its shape inside it); `z` is its place in the stack.
 */
export interface Frame {
  box?: Rect
  z?: number
}

export type TextSize = 's' | 'm' | 'l'
export type TextFont = TitleFont | 'sans'
export type TextColor = 'auto' | 'black' | 'white'

/** A text box added anywhere on a page. Position and width are surface fractions. */
export interface FreeText {
  id: string
  text: string
  x: number
  y: number
  w: number
  size: TextSize
  font: TextFont
  color: TextColor
  z: number
}

export type SurfaceKind = 'cover' | 'spread' | 'back'

/** The editable zine: a layout and a photo per slot for each surface, in reading order. */
export interface DraftSurface {
  kind: SurfaceKind
  templateId: string
  /** One entry per slot in the template; null is an empty slot. */
  photoIds: (string | null)[]
  /** Hand arrangement, per slot (parallel to photoIds). */
  frames?: (Frame | null)[]
  texts?: FreeText[]
  /** Page colour for just this surface, instead of the zine's. */
  color?: PageColor
}

export type Draft = DraftSurface[]

export interface SlotAddress {
  surface: number
  slot: number
}

/** A draft surface worked out for display: exact positions for every slot. */
export interface Surface {
  kind: SurfaceKind
  label: string
  /** Physical width / height of this surface. */
  aspect: number
  templateId: string
  slots: {
    rect: Rect
    placement: Placement | null
    /** Stacking order; later layout slots sit on top unless rearranged. */
    z: number
    /** Moved or resized by hand. */
    moved: boolean
  }[]
  text: TextBlock[]
  texts: FreeText[]
  color?: PageColor
}
