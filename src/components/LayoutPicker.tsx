import { layoutName, layoutsFor } from '../lib/layouts'
import type { Slot, SurfaceKind, ZineStyle } from '../lib/types'

interface Props {
  zineStyle: ZineStyle
  circles: boolean
  kind: SurfaceKind
  aspect: number
  current: string
  onPick: (templateId: string) => void
}

const pct = (v: number) => `${v * 100}%`

/** Where a slot's photo area is drawn; circles take the largest square in the slot. */
function area(s: Slot, aspect: number) {
  if (s.shape !== 'circle') return s.rect
  const side = Math.min(s.rect.w * aspect, s.rect.h)
  const w = side / aspect
  return { x: s.rect.x + (s.rect.w - w) * s.align.x, y: s.rect.y + (s.rect.h - side) * s.align.y, w, h: side }
}

/** A row of small layout diagrams for one surface. */
export function LayoutPicker({ zineStyle, circles, kind, aspect, current, onPick }: Props) {
  return (
    <div className="picker" role="radiogroup" aria-label="Layout">
      {layoutsFor(zineStyle, circles)[kind].map((t) => (
        <button
          key={t.id}
          role="radio"
          aria-checked={t.id === current}
          title={layoutName(t.id)}
          className="picker__option"
          onClick={() => onPick(t.id)}
        >
          <span className={`picker__diagram picker__diagram--${kind}`} style={{ aspectRatio: aspect }}>
            {t.slots.map((s, i) => {
              const r = area(s, aspect)
              return (
                <span
                  key={i}
                  className={`picker__slot picker__slot--${s.mode}${s.shape ? ` picker__slot--${s.shape}` : ''}`}
                  style={{
                    left: pct(r.x),
                    top: pct(r.y),
                    width: pct(r.w),
                    height: pct(r.h),
                  }}
                />
              )
            })}
            {kind === 'spread' && <span className="picker__fold" />}
          </span>
        </button>
      ))}
    </div>
  )
}
