import type { Photo } from '../lib/types'
import { startDrag } from './dragItem'

interface Props {
  photos: Photo[]
  places: Map<string, string>
  lookAlikes: Set<string>
  selectedId: string | null
  onSelect: (id: string) => void
  /** Open the photo whole and uncropped. */
  onView: (id: string) => void
  onRemove: (id: string) => void
}

/** The uploaded photos, marked with where each one ended up. Drag one onto a page to place it. */
export function PhotoTray({ photos, places: where, lookAlikes, selectedId, onSelect, onView, onRemove }: Props) {
  return (
    <ul className="tray">
      {photos.map((photo) => {
        const label = where.get(photo.id) ?? (lookAlikes.has(photo.id) ? 'Look-alike' : 'Unused')
        const classes = [
          'tray__item',
          !where.has(photo.id) && 'tray__item--unused',
          selectedId === photo.id && 'tray__item--selected',
        ]
        return (
          <li key={photo.id} className={classes.filter(Boolean).join(' ')} data-keep-selection>
            <button
              className="tray__pick"
              draggable
              onDragStart={(e) => startDrag(e, { type: 'photo', id: photo.id })}
              onClick={() => onSelect(photo.id)}
              onDoubleClick={() => onView(photo.id)}
              aria-pressed={selectedId === photo.id}
              aria-label={`${photo.name}, ${label}`}
            >
              <img src={photo.thumb} alt="" draggable={false} decoding="async" />
              <span className="tray__label">{label}</span>
            </button>
            <button className="tray__view" onClick={() => onView(photo.id)} aria-label={`View ${photo.name}`} title="View whole photo">
              ⤢
            </button>
            <button className="tray__remove" onClick={() => onRemove(photo.id)} aria-label={`Remove ${photo.name}`}>
              ×
            </button>
          </li>
        )
      })}
    </ul>
  )
}
