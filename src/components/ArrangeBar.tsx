import { useState } from 'react'
import type { Align } from '../lib/draft'
import type { Rect } from '../lib/types'

/** Converting between surface fractions and real units (inches, millimetres or pixels). */
export interface Units {
  name: string
  decimals: number
  /** Real size of the whole surface. */
  width: number
  height: number
}

interface Props {
  units: Units
  /** The selected item's position and size, or null when several are selected. */
  rect: Rect | null
  /** Text boxes size their height to the words; photos keep their shape; shapes stretch. */
  kind: 'photo' | 'shape' | 'text' | 'group'
  count: number
  locked: boolean
  onPlace: (rect: Rect) => void
  onAlign: (how: Align) => void
  onDistribute: (axis: 'x' | 'y') => void
  onDuplicate: () => void
  onLock: () => void
}

const ALIGN: { how: Align; label: string; title: string }[] = [
  { how: 'left', label: '⇤', title: 'Align left' },
  { how: 'centre', label: '↔', title: 'Centre across' },
  { how: 'right', label: '⇥', title: 'Align right' },
  { how: 'top', label: '⤒', title: 'Align top' },
  { how: 'middle', label: '↕', title: 'Centre up and down' },
  { how: 'bottom', label: '⤓', title: 'Align bottom' },
]

/**
 * Exact position and size in real units, alignment, distribution, duplicate
 * and lock: the precise tools, under the page with something selected.
 */
export function ArrangeBar({ units, rect, kind, count, locked, onPlace, onAlign, onDistribute, onDuplicate, onLock }: Props) {
  const group = kind === 'group'
  return (
    <div className="toolbar arrange" data-keep-selection>
      <span className="toolbar__label">{group ? `${count} selected` : 'Arrange'}</span>
      {rect && <Fields units={units} rect={rect} kind={kind} disabled={locked} onPlace={onPlace} />}
      <span className="toolbar__group" role="group" aria-label={group ? 'Align with each other' : 'Align on the page'}>
        {ALIGN.map((a) => (
          <button
            key={a.how}
            className="chip chip--icon"
            title={`${a.title}${group ? '' : ' on the page'}`}
            aria-label={a.title}
            disabled={locked}
            onClick={() => onAlign(a.how)}
          >
            {a.label}
          </button>
        ))}
      </span>
      {group && count >= 3 && (
        <span className="toolbar__group" role="group" aria-label="Distribute">
          <button className="chip" onClick={() => onDistribute('x')} title="Space evenly across">
            Space across
          </button>
          <button className="chip" onClick={() => onDistribute('y')} title="Space evenly down">
            Space down
          </button>
        </span>
      )}
      {!group && (
        <button className="pill pill--small" onClick={onDuplicate} title="Duplicate (⌘D)">
          Duplicate
        </button>
      )}
      <button className="pill pill--small" aria-pressed={locked} onClick={onLock}>
        {locked ? 'Unlock' : 'Lock'}
      </button>
    </div>
  )
}

/** X, Y, W and H boxes. Photos keep their shape, so W and H move together; a shape's change apart. */
function Fields({ units, rect, kind, disabled, onPlace }: { units: Units; rect: Rect; kind: Props['kind']; disabled: boolean; onPlace: (r: Rect) => void }) {
  const toUnits = { x: rect.x * units.width, y: rect.y * units.height, w: rect.w * units.width, h: rect.h * units.height }
  const commit = (field: keyof Rect, value: number) => {
    if (!Number.isFinite(value) || value <= 0 && (field === 'w' || field === 'h')) return
    const frac = field === 'x' || field === 'w' ? value / units.width : value / units.height
    if (field === 'x') onPlace({ ...rect, x: frac })
    else if (field === 'y') onPlace({ ...rect, y: frac })
    else if (field === 'w') onPlace({ ...rect, w: frac, h: kind === 'photo' ? (frac * rect.h) / rect.w : rect.h })
    else onPlace({ ...rect, h: frac, w: kind === 'shape' ? rect.w : (frac * rect.w) / rect.h })
  }
  return (
    <span className="fields">
      {(['x', 'y', 'w', 'h'] as const).map((f) => (
        <NumberField
          key={f}
          label={f.toUpperCase()}
          unit={units.name}
          value={toUnits[f]}
          decimals={units.decimals}
          // A text box's height follows its words.
          disabled={disabled || (kind === 'text' && f === 'h')}
          onCommit={(v) => commit(f, v)}
        />
      ))}
    </span>
  )
}

/** A number box that only applies its value on Enter or when you leave it. */
function NumberField(props: { label: string; unit: string; value: number; decimals: number; disabled: boolean; onCommit: (v: number) => void }) {
  // A value that can't be shown (a text box's height) reads as "auto".
  const shown = Number.isFinite(props.value) ? props.value.toFixed(props.decimals) : 'auto'
  const [draft, setDraft] = useState<string | null>(null)
  const done = () => {
    if (draft !== null && draft !== shown) props.onCommit(parseFloat(draft))
    setDraft(null)
  }
  return (
    <label className="number-field" title={`${props.label} in ${props.unit}`}>
      <span>{props.label}</span>
      <input
        inputMode="decimal"
        value={draft ?? shown}
        disabled={props.disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={done}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setDraft(null)
            e.currentTarget.blur()
          }
        }}
      />
    </label>
  )
}
