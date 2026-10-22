import { useState } from 'react'
import { PAGE_COLORS } from '../lib/styles'
import type { PageColor, SurfaceKind } from '../lib/types'

interface Props {
  kind: SurfaceKind
  color?: PageColor
  canMoveUp: boolean
  canMoveDown: boolean
  canAdd: boolean
  canRemove: boolean
  onMove: (by: -1 | 1) => void
  onAddText: () => void
  onColor: (color: PageColor | undefined) => void
  onAddSpread: () => void
  onRemove: () => void
}

/** Page-level controls: order, colour, text, and adding or removing spreads. */
export function PageActions(props: Props) {
  const { kind, color, onMove, onAddText, onColor, onAddSpread, onRemove } = props
  const [picking, setPicking] = useState(false)
  const spread = kind === 'spread'

  return (
    <div className="page-actions" data-keep-selection>
      {spread && (
        <>
          <button className="icon-btn" title="Move earlier" aria-label="Move spread earlier" disabled={!props.canMoveUp} onClick={() => onMove(-1)}>
            ↑
          </button>
          <button className="icon-btn" title="Move later" aria-label="Move spread later" disabled={!props.canMoveDown} onClick={() => onMove(1)}>
            ↓
          </button>
        </>
      )}
      <button className="pill pill--small" onClick={onAddText}>
        + Text
      </button>
      <button
        className="pill pill--small"
        aria-expanded={picking}
        onClick={() => setPicking(!picking)}
        title={spread ? 'Colour for this spread' : 'Colour for this page'}
      >
        <span className="dot" style={{ background: color ? PAGE_COLORS[color].page : 'var(--page)' }} /> Colour
      </button>
      {picking && (
        <span className="page-actions__swatches" role="radiogroup" aria-label="Page colour">
          <button
            role="radio"
            aria-checked={!color}
            className="chip"
            onClick={() => {
              onColor(undefined)
              setPicking(false)
            }}
          >
            Zine colour
          </button>
          {(Object.keys(PAGE_COLORS) as PageColor[]).map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={color === c}
              aria-label={PAGE_COLORS[c].label}
              title={PAGE_COLORS[c].label}
              className="swatch swatch--small"
              style={{ background: PAGE_COLORS[c].page }}
              onClick={() => {
                onColor(c)
                setPicking(false)
              }}
            />
          ))}
        </span>
      )}
      {spread && (
        <>
          <button className="pill pill--small" disabled={!props.canAdd} onClick={onAddSpread} title="Add a spread after this one">
            + Spread
          </button>
          <button className="pill pill--small" disabled={!props.canRemove} onClick={onRemove} title="Remove this spread">
            Remove
          </button>
        </>
      )}
    </div>
  )
}
