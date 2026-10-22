import { TITLE_FONTS } from '../lib/styles'
import type { FreeText, TextColor, TextFont, TextSize } from '../lib/types'

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

interface PhotoProps {
  moved: boolean
  swapping: boolean
  onSwap: () => void
  onFront: () => void
  onBack: () => void
  onReset: () => void
  onRemove: () => void
}

/** Actions for the photo selected on a page. */
export function PhotoToolbar({ moved, swapping, onSwap, onFront, onBack, onReset, onRemove }: PhotoProps) {
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
