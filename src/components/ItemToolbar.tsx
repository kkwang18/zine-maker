import { PAGE_COLORS, TITLE_FONTS } from '../lib/styles'
import type { FrameShape, FreeText, PageColor, Shape, TextColor, TextFont, TextSize } from '../lib/types'

const FONTS: { id: TextFont; label: string; family: string }[] = [
  { id: 'sans', label: 'Sans', family: 'var(--sans)' },
  ...(Object.keys(TITLE_FONTS) as (keyof typeof TITLE_FONTS)[]).map((id) => ({
    id,
    label: TITLE_FONTS[id].label,
    family: TITLE_FONTS[id].family,
  })),
]
const SIZES: { id: TextSize; label: string }[] = [
  { id: 's', label: 'S' },
  { id: 'm', label: 'M' },
  { id: 'l', label: 'L' },
]
const COLORS: { id: TextColor; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'black', label: 'Black' },
  { id: 'white', label: 'White' },
]

const FRAMES: { id: FrameShape; label: string; title: string }[] = [
  { id: 'plain', label: 'Plain', title: 'Square corners' },
  { id: 'rounded', label: 'Rounded', title: 'Softened corners' },
  { id: 'arch', label: 'Arch', title: 'A rounded top, like a window' },
  { id: 'pill', label: 'Pill', title: 'Fully rounded ends' },
  { id: 'circle', label: 'Circle', title: 'A circle around the subject (crops the photo to a square)' },
]

interface PhotoProps {
  moved: boolean
  swapping: boolean
  /** The shape it shows as now. */
  shape: FrameShape
  onShape: (shape: FrameShape) => void
  onSwap: () => void
  onFront: () => void
  onBack: () => void
  onReset: () => void
  onRemove: () => void
}

/** Actions for the photo selected on a page. */
export function PhotoToolbar({ moved, swapping, shape, onShape, onSwap, onFront, onBack, onReset, onRemove }: PhotoProps) {
  if (swapping) {
    return (
      <div className="toolbar" data-keep-selection>
        <span className="toolbar__note">☞ Click another photo or an empty slot to swap with. Esc to cancel.</span>
      </div>
    )
  }
  return (
    <div className="toolbar" data-keep-selection>
      <span className="toolbar__label">Photo</span>
      <button className="pill pill--small" onClick={onSwap}>
        Swap
      </button>
      <span className="toolbar__group" role="radiogroup" aria-label="Frame shape">
        {FRAMES.map((f) => (
          <button key={f.id} role="radio" aria-checked={shape === f.id} className="chip" title={f.title} onClick={() => onShape(f.id)}>
            {f.label}
          </button>
        ))}
      </span>
      <button className="pill pill--small" onClick={onFront}>
        To front
      </button>
      <button className="pill pill--small" onClick={onBack}>
        To back
      </button>
      {moved && (
        <button className="pill pill--small" onClick={onReset}>
          Reset position
        </button>
      )}
      <button className="pill pill--small" onClick={onRemove}>
        Take off page
      </button>
      <span className="toolbar__note">Drag to move · corners to resize</span>
    </div>
  )
}

interface TextProps {
  text: FreeText
  onChange: (change: Partial<FreeText>) => void
  onEdit: () => void
  onFront: () => void
  onBack: () => void
  onRemove: () => void
}

/** Actions for the text box selected on a page. */
export function TextToolbar({ text, onChange, onEdit, onFront, onBack, onRemove }: TextProps) {
  return (
    <div className="toolbar toolbar--text" data-keep-selection>
      <span className="toolbar__label">Text</span>
      <button className="pill pill--small pill--solid" onClick={onEdit}>
        Edit words
      </button>
      <span className="toolbar__group" role="radiogroup" aria-label="Font">
        {FONTS.map((f) => (
          <button
            key={f.id}
            role="radio"
            aria-checked={text.font === f.id}
            className="chip"
            style={{ fontFamily: f.family }}
            onClick={() => onChange({ font: f.id })}
          >
            {f.label}
          </button>
        ))}
      </span>
      <span className="toolbar__group" role="radiogroup" aria-label="Size">
        {SIZES.map((s) => (
          <button key={s.id} role="radio" aria-checked={text.size === s.id} className="chip" onClick={() => onChange({ size: s.id })}>
            {s.label}
          </button>
        ))}
      </span>
      <span className="toolbar__group" role="radiogroup" aria-label="Colour">
        {COLORS.map((c) => (
          <button key={c.id} role="radio" aria-checked={text.color === c.id} className="chip" onClick={() => onChange({ color: c.id })}>
            {c.label}
          </button>
        ))}
      </span>
      <button className="pill pill--small" onClick={onFront}>
        To front
      </button>
      <button className="pill pill--small" onClick={onBack}>
        To back
      </button>
      <button className="pill pill--small" onClick={onRemove}>
        Delete
      </button>
      <span className="toolbar__note">Double-click to type · drag to move · right edge for width</span>
    </div>
  )
}

const OPACITY = [1, 0.75, 0.5, 0.25]
const SHAPE_NAMES = { rect: 'Rectangle', ellipse: 'Circle', line: 'Line' }

interface ShapeProps {
  shape: Shape
  onChange: (change: Partial<Shape>) => void
  onFront: () => void
  onBack: () => void
  onRemove: () => void
}

/** Actions for the shape selected on a page: colour, see-through, stacking. */
export function ShapeToolbar({ shape, onChange, onFront, onBack, onRemove }: ShapeProps) {
  return (
    <div className="toolbar" data-keep-selection>
      <span className="toolbar__label">{SHAPE_NAMES[shape.kind]}</span>
      <span className="toolbar__group" role="radiogroup" aria-label="Colour">
        {(Object.keys(PAGE_COLORS) as PageColor[]).map((c) => (
          <button
            key={c}
            role="radio"
            aria-checked={shape.color === c}
            aria-label={PAGE_COLORS[c].label}
            title={PAGE_COLORS[c].label}
            className="swatch swatch--small"
            style={{ background: PAGE_COLORS[c].page }}
            onClick={() => onChange({ color: c })}
          />
        ))}
      </span>
      <span className="toolbar__group" role="radiogroup" aria-label="Opacity">
        {OPACITY.map((o) => (
          <button key={o} role="radio" aria-checked={shape.opacity === o} className="chip" onClick={() => onChange({ opacity: o })}>
            {o * 100}%
          </button>
        ))}
      </span>
      <button className="pill pill--small" onClick={onFront}>
        To front
      </button>
      <button className="pill pill--small" onClick={onBack}>
        To back
      </button>
      <button className="pill pill--small" onClick={onRemove}>
        Delete
      </button>
      <span className="toolbar__note">Drag to move · corners to stretch, Shift keeps proportions</span>
    </div>
  )
}
