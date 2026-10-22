import { useEffect, useRef, useState } from 'react'
import type { Photo, Surface, TextKind, ZineStyle } from '../lib/types'
import { FlipText } from './FlipText'
import { SurfaceView } from './SurfaceView'

interface Props {
  surfaces: Surface[]
  zineStyle: ZineStyle
  photos: Map<string, Photo>
  words: Record<TextKind, string>
  /** Instagram: a swipeable carousel. Print: a book, one opening at a time. */
  slides: boolean
  title: string
  onClose: () => void
}

/** The zine as a reader meets it, without any editing controls. */
export function Preview(props: Props) {
  const { onClose } = props
  useEffect(() => {
    const close = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])

  return (
    <div className="reader" role="dialog" aria-modal="true" aria-label="Preview">
      <header className="reader__bar">
        <FlipText text="Preview" className="reader__title" />
        <button className="pill" onClick={onClose}>
          Back to editing
        </button>
      </header>
      {props.slides ? <Carousel {...props} /> : <Book {...props} />}
    </div>
  )
}

/** Print: the cover alone on the right, each spread open, the back alone on the left. */
function Book({ surfaces, zineStyle, photos, words }: Props) {
  const [at, setAt] = useState(0)
  const [direction, setDirection] = useState<1 | -1>(1)
  const last = surfaces.length - 1
  const go = (by: 1 | -1) => {
    const next = Math.min(last, Math.max(0, at + by))
    if (next === at) return
    setDirection(by)
    setAt(next)
  }

  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', keys)
    return () => window.removeEventListener('keydown', keys)
  })

  const surface = surfaces[at]
  const spreadAspect = surfaces.find((s) => s.kind === 'spread')?.aspect ?? surface.aspect * 2
  const label = surface.kind === 'spread' ? `Pages ${surface.label}` : surface.label

  return (
    <div className="reader__stage">
      <div className="book-view" style={{ aspectRatio: spreadAspect, ['--spread-aspect' as string]: spreadAspect }}>
        {/* Keyed by page, so each turn plays the entrance animation again. */}
        <div key={at} className={`book-view__opening book-view__opening--${surface.kind} turn-${direction > 0 ? 'next' : 'prev'}`}>
          <SurfaceView surface={surface} zineStyle={zineStyle} photos={photos} words={words} seam="fold" />
        </div>
        <button className="book-view__half book-view__half--prev" aria-label="Previous page" disabled={at === 0} onClick={() => go(-1)} />
        <button className="book-view__half book-view__half--next" aria-label="Next page" disabled={at === last} onClick={() => go(1)} />
      </div>
      <nav className="reader__nav">
        <button className="icon-btn" aria-label="Previous page" disabled={at === 0} onClick={() => go(-1)}>
          ←
        </button>
        <span className="tab tab--small">
          {label} · {at + 1} of {surfaces.length}
        </span>
        <button className="icon-btn" aria-label="Next page" disabled={at === last} onClick={() => go(1)}>
          →
        </button>
      </nav>
    </div>
  )
}

/** Instagram: slides in a row, snapping one at a time, as in the app. Spreads pan across two. */
function Carousel({ surfaces, zineStyle, photos, words, title }: Props) {
  const track = useRef<HTMLDivElement>(null)
  const [slide, setSlide] = useState(0)
  const count = surfaces.reduce((n, s) => n + (s.kind === 'spread' ? 2 : 1), 0)

  const scrollTo = (i: number) => {
    const el = track.current
    if (!el) return
    el.scrollTo({ left: Math.max(0, Math.min(count - 1, i)) * el.clientWidth, behavior: 'smooth' })
  }

  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') scrollTo(slide + 1)
      if (e.key === 'ArrowLeft') scrollTo(slide - 1)
    }
    window.addEventListener('keydown', keys)
    return () => window.removeEventListener('keydown', keys)
  })

  return (
    <div className="reader__stage">
      <div className="phone">
        <div className="phone__head">
          <span className="phone__avatar" />
          <strong>{title || 'your zine'}</strong>
        </div>
        <div className="phone__viewport">
          <div
            ref={track}
            className="phone__track"
            onScroll={(e) => setSlide(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
          >
            <div className="phone__strip" style={{ width: `${count * 100}%` }}>
              {surfaces.map((s, i) => (
                <div key={i} style={{ width: `${((s.kind === 'spread' ? 2 : 1) / count) * 100}%` }}>
                  <SurfaceView surface={s} zineStyle={zineStyle} photos={photos} words={words} seam="none" />
                </div>
              ))}
              {/* One snap point per slide, so a spread stops halfway like a real carousel. */}
              {Array.from({ length: count }, (_, i) => (
                <span key={i} className="phone__snap" style={{ left: `${(i / count) * 100}%`, width: `${100 / count}%` }} />
              ))}
            </div>
          </div>
          {slide > 0 && (
            <button className="phone__arrow phone__arrow--prev" aria-label="Previous slide" onClick={() => scrollTo(slide - 1)}>
              ‹
            </button>
          )}
          {slide < count - 1 && (
            <button className="phone__arrow phone__arrow--next" aria-label="Next slide" onClick={() => scrollTo(slide + 1)}>
              ›
            </button>
          )}
        </div>
        <div className="phone__dots" aria-label={`Slide ${slide + 1} of ${count}`}>
          {Array.from({ length: count }, (_, i) => (
            <span key={i} className={i === slide ? 'is-on' : ''} />
          ))}
        </div>
      </div>
      <p className="hint">☞ Swipe, scroll sideways, or use the arrow keys.</p>
    </div>
  )
}
