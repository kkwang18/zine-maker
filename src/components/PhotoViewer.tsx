import { useEffect, useState } from 'react'
import type { Photo } from '../lib/types'

interface Props {
  photos: Photo[]
  /** Where each photo is in the zine ("2 – 3", "Cover"); missing means unused. */
  places: Map<string, string>
  lookAlikes: Set<string>
  startId: string
  /** Pick this photo to put on a page (the next click on a slot or page places it). */
  onPlace: (id: string) => void
  onClose: () => void
}

/** One photo at a time, whole and uncropped, to see properly before using it. */
export function PhotoViewer({ photos, places, lookAlikes, startId, onPlace, onClose }: Props) {
  const [id, setId] = useState(startId)
  // Start among the unused ones when that's where the person came from.
  const [unusedOnly, setUnusedOnly] = useState(!places.has(startId))
  const unused = photos.filter((p) => !places.has(p.id))
  const list = unusedOnly && unused.length ? unused : photos
  const at = Math.max(0, list.findIndex((p) => p.id === id))
  const photo = list[at]

  const go = (by: 1 | -1) => setId(list[(at + by + list.length) % list.length].id)

  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', keys)
    return () => window.removeEventListener('keydown', keys)
  })

  if (!photo) return null
  const place = places.get(photo.id)
  const shape = photo.aspect > 1.05 ? 'Landscape' : photo.aspect < 0.95 ? 'Portrait' : 'Square'

  return (
    <div className="reader viewer" role="dialog" aria-modal="true" aria-label="Photo">
      <header className="reader__bar">
        <span className="viewer__name">{photo.name}</span>
        <button className="pill" onClick={onClose}>
          Back to editing
        </button>
      </header>
      <div className="reader__stage">
        <div className="viewer__frame">
          <button className="icon-btn viewer__step" aria-label="Previous photo" disabled={list.length < 2} onClick={() => go(-1)}>
            ←
          </button>
          <img className="viewer__photo" src={photo.preview} alt={photo.name} />
          <button className="icon-btn viewer__step" aria-label="Next photo" disabled={list.length < 2} onClick={() => go(1)}>
            →
          </button>
        </div>
        <p className="viewer__facts">
          <span className="tab tab--small">{place ?? (lookAlikes.has(photo.id) ? 'Look-alike' : 'Unused')}</span>
          <span>
            {at + 1} of {list.length}
            {unusedOnly && unused.length ? ' unused' : ''} · {shape}, {photo.width} × {photo.height} px
          </span>
        </p>
        {lookAlikes.has(photo.id) && !place && <p className="hint">☞ Very like another photo, so the sequence leaves it out.</p>}
        <div className="pills">
          <button
            className="pill pill--solid"
            onClick={() => {
              onPlace(photo.id)
              onClose()
            }}
          >
            {place ? 'Move to another spot' : 'Put on a page'}
          </button>
          {unused.length > 0 && unused.length < photos.length && (
            <button className="pill" aria-pressed={unusedOnly} onClick={() => setUnusedOnly(!unusedOnly)}>
              Unused only ({unused.length})
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
