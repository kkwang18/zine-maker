import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { snapEdge, snapMove, snapTargets, type Guides } from '../lib/snap'
import { PAGE_COLORS, TITLE_FONTS } from '../lib/styles'
import type { FreeText, Photo, Placement, Rect, Surface, TextBlock, TextKind, ZineStyle } from '../lib/types'
import { isZineDrag } from './dragItem'

/** Hooks for arranging the page by hand; leave out to draw the surface as it will print. */
export interface SurfaceEditor {
  selectedSlot: number | null
  selectedFree: string | null
  selectedText: string | null
  editingText: string | null
  /** A photo is waiting to be swapped: other photos and empty slots light up as targets. */
  swapping: boolean
  onSlotClick: (slot: number) => void
  /** A photo dragged in from the tray. */
  onSlotDrop: (slot: number, e: DragEvent) => void
  onFrameChange: (slot: number, box: Rect) => void
  onFreeClick: (id: string) => void
  /** A photo dragged in from the tray onto a freely placed photo. */
  onFreeDrop: (id: string, e: DragEvent) => void
  onFreeChange: (id: string, box: Rect) => void
  /** A photo dragged in from the tray onto bare page, at `point` (surface fractions). */
  onPageDrop: (point: { x: number; y: number }, e: DragEvent) => void
  onTextClick: (id: string) => void
  onTextEdit: (id: string) => void
  onTextChange: (id: string, change: Partial<FreeText>) => void
  onTextEditEnd: () => void
  /** A press on the bare page, away from any photo or text, at `point` (surface fractions). */
  onBackground: (point: { x: number; y: number }) => void
}

interface Props {
  surface: Surface
  zineStyle: ZineStyle
  photos: Map<string, Photo>
  words: Record<TextKind, string>
  editor?: SurfaceEditor
  /** Clicking the title, name or back text, to edit it. */
  onWordsClick?: (kind: TextKind) => void
  /** What joins a spread's two pages: a paper fold, the edge between two slides, or nothing. */
  seam?: 'fold' | 'slides' | 'none'
  /** Show centre lines, thirds and margins on each page, for lining things up. */
  showGuides?: boolean
}

const pct = (v: number) => `${v * 100}%`
const box = (r: Rect): CSSProperties => ({ left: pct(r.x), top: pct(r.y), width: pct(r.w), height: pct(r.h) })

/** Text sizes, in hundredths of a page's width. */
const TEXT_SIZE = { s: 3, m: 5, l: 9 }
const TEXT_COLOR = { auto: 'var(--page-text)', black: '#0a0a0a', white: '#ffffff' }

type Corner = 'nw' | 'ne' | 'sw' | 'se'
type Item = { type: 'slot'; slot: number } | { type: 'free'; id: string } | { type: 'text'; id: string }

interface Gesture {
  item: Item
  /** move, resize a photo from a corner, or change a text box's width. */
  action: 'move' | Corner | 'width'
  start: Rect
  pointer: { x: number; y: number }
  size: { w: number; h: number }
  targets: Guides
  moved: boolean
  /** The element being dragged; moved directly, without re-rendering, until the drop. */
  el: HTMLElement
  /** Where the item is now, while dragging. */
  last?: Rect
  /** Latest pointer position, applied once per animation frame. */
  pending?: { x: number; y: number }
  frame?: number
}

/** Pixels the pointer must travel before a press becomes a drag rather than a click. */
const DRAG_START = 4
/** How close, in pixels, before something snaps to a guide. */
const SNAP = 6
const MIN_SIZE = 0.04

const sameGuides = (a: Guides, b: Guides) => a.x.join() === b.x.join() && a.y.join() === b.y.join()

const itemKey = (item: Item) =>
  item.type === 'slot' ? `s${item.slot}` : item.type === 'free' ? `f${item.id}` : `t${item.id}`

/** Margin of the layout guides, as a share of the page. */
const MARGIN = 0.06

/**
 * Layout guides for each page of a surface, in surface fractions: page edges
 * and centres, thirds, and a margin. Photos snap to these too.
 */
function pageGuides(spread: boolean): Guides {
  const pages = spread ? [0, 0.5] : [0]
  const pw = spread ? 0.5 : 1
  const x = pages.flatMap((p) => [p + pw * MARGIN, p + pw / 3, p + pw / 2, p + (pw * 2) / 3, p + pw * (1 - MARGIN)])
  const y = [MARGIN, 1 / 3, 0.5, 2 / 3, 1 - MARGIN]
  return { x, y }
}

/** One cover, spread, or back page, drawn at any size. */
export function SurfaceView({
  surface,
  zineStyle,
  photos,
  words,
  editor,
  onWordsClick,
  seam = 'fold',
  showGuides = false,
}: Props) {
  const root = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const [guides, setGuides] = useState<Guides>({ x: [], y: [] })

  const colors = surface.color
    ? { '--page': PAGE_COLORS[surface.color].page, '--page-text': PAGE_COLORS[surface.color].text }
    : {}

  /** Where everything else on the page is, for snapping to. */
  const otherRects = (except: Item): Rect[] => {
    const el = root.current!
    const bounds = el.getBoundingClientRect()
    return [...el.querySelectorAll<HTMLElement>('[data-item]')]
      .filter((node) => node.dataset.item !== itemKey(except))
      .map((node) => {
        const r = node.getBoundingClientRect()
        return {
          x: (r.left - bounds.left) / bounds.width,
          y: (r.top - bounds.top) / bounds.height,
          w: r.width / bounds.width,
          h: r.height / bounds.height,
        }
      })
  }

  const begin = (e: ReactPointerEvent, item: Item, action: Gesture['action'], start: Rect) => {
    if (!editor || e.button !== 0) return
    e.stopPropagation()
    const bounds = root.current!.getBoundingClientRect()
    gesture.current = {
      item,
      action,
      start,
      pointer: { x: e.clientX, y: e.clientY },
      size: { w: bounds.width, h: bounds.height },
      targets: withPageGuides(snapTargets(otherRects(item), surface.kind === 'spread'), surface.kind === 'spread'),
      moved: action !== 'move',
      el: root.current!.querySelector<HTMLElement>(`[data-item="${itemKey(item)}"]`)!,
    }
    // Keep receiving moves even if the pointer leaves the page mid-drag.
    try {
      root.current!.setPointerCapture(e.pointerId)
    } catch {
      // Not an active pointer (e.g. a synthetic event); moves still arrive while over the page.
    }
  }

  // Pointer events can arrive far faster than the screen redraws; only the
  // latest position matters, so it's applied once per frame.
  const onPointerMove = (e: ReactPointerEvent) => {
    const g = gesture.current
    if (!g) return
    g.pending = { x: e.clientX, y: e.clientY }
    g.frame ??= requestAnimationFrame(() => apply(g))
  }

  /** Work out where the dragged item should be, and show it there. */
  const apply = (g: Gesture) => {
    g.frame = undefined
    if (!g.pending || gesture.current !== g) return
    const px = g.pending.x - g.pointer.x
    const py = g.pending.y - g.pointer.y
    if (!g.moved && Math.hypot(px, py) < DRAG_START) return
    if (!g.moved) {
      g.moved = true
      g.el.classList.add('item--dragging')
    }
    const dx = px / g.size.w
    const dy = py / g.size.h
    const threshold = { x: SNAP / g.size.w, y: SNAP / g.size.h }
    const s = g.start
    let rect: Rect
    let lines: Guides = { x: [], y: [] }

    if (g.action === 'move') {
      ;({ rect, guides: lines } = snapMove({ ...s, x: s.x + dx, y: s.y + dy }, g.targets, threshold))
    } else if (g.action === 'width') {
      const [right, guide] = snapEdge(s.x + Math.max(MIN_SIZE, s.w + dx), g.targets.x, threshold.x)
      rect = { ...s, w: Math.max(MIN_SIZE, right - s.x) }
      if (guide !== null) lines = { x: [guide], y: [] }
    } else {
      // Resize from a corner, keeping the photo's shape; the opposite corner stays put.
      const west = g.action === 'nw' || g.action === 'sw'
      const north = g.action === 'nw' || g.action === 'ne'
      const movingEdge = west ? s.x + dx : s.x + s.w + dx
      const [edge, guide] = snapEdge(movingEdge, g.targets.x, threshold.x)
      const w = Math.max(MIN_SIZE, west ? s.x + s.w - edge : edge - s.x)
      const h = (w * s.h) / s.w
      rect = { x: west ? s.x + s.w - w : s.x, y: north ? s.y + s.h - h : s.y, w, h }
      if (guide !== null) lines = { x: [guide], y: [] }
    }
    g.last = rect

    // Move and scale with a transform: the GPU slides the already-drawn picture
    // around instead of the page laying it out and repainting it every frame.
    if (g.action === 'width') {
      g.el.style.width = pct(rect.w)
    } else {
      const tx = (rect.x - s.x) * g.size.w
      const ty = (rect.y - s.y) * g.size.h
      g.el.style.transform = `translate(${tx}px, ${ty}px) scale(${rect.w / s.w}, ${rect.h / s.h})`
    }
    // Only re-render for the guides when they actually change.
    setGuides((prev) => (sameGuides(prev, lines) ? prev : lines))
  }

  const onPointerUp = () => {
    const g = gesture.current
    if (!g || !editor) return
    if (g.frame !== undefined) cancelAnimationFrame(g.frame)
    if (g.pending) apply(g)
    gesture.current = null
    // Hand the final position back to React, which redraws the item there in this same frame.
    g.el.classList.remove('item--dragging')
    g.el.style.transform = ''
    setGuides({ x: [], y: [] })
    const result = g.last
    if (!g.moved || !result) {
      // A press without a drag is a click.
      if (g.item.type === 'slot') editor.onSlotClick(g.item.slot)
      else if (g.item.type === 'free') editor.onFreeClick(g.item.id)
      else editor.onTextClick(g.item.id)
      return
    }
    if (g.item.type === 'slot') editor.onFrameChange(g.item.slot, result)
    else if (g.item.type === 'free') editor.onFreeChange(g.item.id, result)
    else editor.onTextChange(g.item.id, { x: result.x, y: result.y, w: result.w })
  }

  /** Where on the surface a pointer or drop landed, in surface fractions. */
  const pointOf = (e: { clientX: number; clientY: number }) => {
    const r = root.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
  }

  return (
    <div
      ref={root}
      className={`surface surface--${surface.kind} look--${zineStyle}${editor?.swapping ? ' surface--swapping' : ''}`}
      style={{ aspectRatio: surface.aspect, ...colors } as CSSProperties}
      data-template={surface.templateId}
      onPointerDown={editor && ((e) => {
        const target = e.target as HTMLElement
        if (target === e.currentTarget || target.classList.contains('surface__seam') || target.classList.contains('layout-guide'))
          editor.onBackground(pointOf(e))
      })}
      // A photo from the tray dropped on bare page lands right there.
      onDragOver={editor && ((e) => {
        if (isZineDrag(e)) e.preventDefault()
      })}
      onDrop={editor && ((e) => {
        if (!isZineDrag(e)) return
        e.preventDefault()
        editor.onPageDrop(pointOf(e), e)
      })}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {surface.slots.map(({ rect, placement, z, moved }, i) => {
        const photo = placement ? photos.get(placement.photoId) : undefined
        if (!photo || !placement) {
          return editor ? <EmptySlot key={i} index={i} rect={rect} editor={editor} /> : null
        }
        const item: Item = { type: 'slot', slot: i }
        return (
          <PhotoItem
            key={i}
            itemKey={itemKey(item)}
            placement={placement}
            photo={photo}
            z={z}
            moved={moved}
            editable={Boolean(editor)}
            selected={editor?.selectedSlot === i}
            onBegin={(e, action) => begin(e, item, action, placement.dest)}
            onActivate={() => editor?.onSlotClick(i)}
            onDropPhoto={(e) => editor?.onSlotDrop(i, e)}
          />
        )
      })}

      {surface.free.map(({ id, placement, z }) => {
        const photo = photos.get(placement.photoId)
        if (!photo) return null
        const item: Item = { type: 'free', id }
        return (
          <PhotoItem
            key={id}
            itemKey={itemKey(item)}
            placement={placement}
            photo={photo}
            z={z}
            moved={false}
            editable={Boolean(editor)}
            selected={editor?.selectedFree === id}
            onBegin={(e, action) => begin(e, item, action, placement.dest)}
            onActivate={() => editor?.onFreeClick(id)}
            onDropPhoto={(e) => editor?.onFreeDrop(id, e)}
          />
        )
      })}

      {surface.text.map((block, i) =>
        words[block.kind] ? <Text key={i} block={block} content={words[block.kind]} onClick={onWordsClick} /> : null,
      )}

      {surface.texts.map((t) => {
        const item: Item = { type: 'text', id: t.id }
        return (
          <TextItem
            key={t.id}
            text={t}
            editor={editor}
            onBegin={(e, action, rect) => begin(e, item, action, rect)}
          />
        )
      })}

      {surface.kind === 'spread' && seam !== 'none' && <div className={`surface__seam surface__seam--${seam}`} />}

      {showGuides && editor && <LayoutGuides spread={surface.kind === 'spread'} />}

      {guides.x.map((x) => (
        <div key={`x${x}`} className="guide guide--v edit-ui" style={{ left: pct(x) }} />
      ))}
      {guides.y.map((y) => (
        <div key={`y${y}`} className="guide guide--h edit-ui" style={{ top: pct(y) }} />
      ))}
    </div>
  )
}

function EmptySlot({ index, rect, editor }: { index: number; rect: Rect; editor: SurfaceEditor }) {
  const [over, setOver] = useState(false)
  const classes = ['slot', 'slot--empty', editor.selectedSlot === index && 'slot--selected', over && 'slot--over']
  return (
    <div
      className={classes.filter(Boolean).join(' ')}
      style={box(rect)}
      role="button"
      tabIndex={0}
      aria-label="Empty slot"
      data-keep-selection
      onClick={() => editor.onSlotClick(index)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          editor.onSlotClick(index)
        }
      }}
      onDragOver={(e) => {
        if (!isZineDrag(e)) return
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false)
        if (!isZineDrag(e)) return
        e.preventDefault()
        e.stopPropagation()
        editor.onSlotDrop(index, e)
      }}
    >
      <span className="slot__hint">Drop a photo</span>
    </div>
  )
}

/**
 * A photo on the page, shown through a window (`dest`). Sizing the image by
 * `src` shows exactly the kept part of the photo — the file itself is untouched.
 */
function PhotoItem({
  itemKey,
  placement,
  photo,
  z,
  moved,
  editable,
  selected,
  onBegin,
  onActivate,
  onDropPhoto,
}: {
  itemKey: string
  placement: Placement
  photo: Photo
  z: number
  moved: boolean
  editable: boolean
  selected: boolean
  onBegin: (e: ReactPointerEvent, action: 'move' | Corner) => void
  /** Keyboard Enter or Space: the same as clicking it. */
  onActivate: () => void
  /** A photo from the tray dropped on this one. */
  onDropPhoto: (e: DragEvent) => void
}) {
  const [over, setOver] = useState(false)
  const { dest, src } = placement
  const image: CSSProperties = {
    width: pct(1 / src.w),
    height: pct(1 / src.h),
    left: pct(-src.x / src.w),
    top: pct(-src.y / src.h),
  }
  const editor = editable || undefined
  const classes = [
    'item',
    editor && 'item--editable',
    selected && 'item--selected',
    over && 'item--over',
    moved && 'item--moved',
  ]
  return (
    <div
      className={classes.filter(Boolean).join(' ')}
      style={{ ...box(dest), zIndex: z + 1 }}
      data-item={itemKey}
      data-keep-selection
      role={editor ? 'button' : undefined}
      tabIndex={editor ? 0 : undefined}
      aria-label={editor ? `Photo ${photo.name}` : undefined}
      onPointerDown={editor && ((e) => onBegin(e, 'move'))}
      onKeyDown={
        editor &&
        ((e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onActivate()
          }
        })
      }
      onDragOver={
        editor &&
        ((e) => {
          if (!isZineDrag(e)) return
          e.preventDefault()
          setOver(true)
        })
      }
      onDragLeave={editor && (() => setOver(false))}
      onDrop={
        editor &&
        ((e) => {
          setOver(false)
          // With Shift held, let the drop fall through to the page: the new photo goes on top instead.
          if (!isZineDrag(e) || e.shiftKey) return
          e.preventDefault()
          e.stopPropagation()
          onDropPhoto(e)
        })
      }
    >
      <div className={`placed__clip${placement.shape ? ` placed__clip--${placement.shape}` : ''}`}>
        <img
          src={photo.preview}
          data-original={photo.url}
          alt={photo.name}
          style={image}
          draggable={false}
          decoding="async"
        />
      </div>
      {selected &&
        (['nw', 'ne', 'sw', 'se'] as Corner[]).map((c) => (
          <span key={c} className={`handle handle--${c} edit-ui`} onPointerDown={(e) => onBegin(e, c)} />
        ))}
    </div>
  )
}

function TextItem({
  text,
  editor,
  onBegin,
}: {
  text: FreeText
  editor?: SurfaceEditor
  onBegin: (e: ReactPointerEvent, action: 'move' | 'width', rect: Rect) => void
}) {
  const node = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLSpanElement>(null)
  const editing = editor?.editingText === text.id
  const selected = editor?.selectedText === text.id

  // While editing, the browser owns the words in a separate span: React fills it
  // once and reads it back on blur, and the span goes away when editing ends.
  useLayoutEffect(() => {
    const el = input.current
    if (!editing || !el) return
    el.innerText = text.text
    el.focus()
    document.getSelection()?.selectAllChildren(el)
    // Only when editing starts; later renders mustn't overwrite what's being typed.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  const rectOf = (): Rect => {
    const el = node.current!
    const surface = el.parentElement!.getBoundingClientRect()
    return { x: text.x, y: text.y, w: text.w, h: el.getBoundingClientRect().height / surface.height }
  }

  const style = {
    left: pct(text.x),
    top: pct(text.y),
    width: pct(text.w),
    zIndex: text.z + 1,
    fontFamily: text.font === 'sans' ? 'var(--sans)' : TITLE_FONTS[text.font].family,
    fontSize: `calc(var(--u) * ${TEXT_SIZE[text.size]})`,
    color: TEXT_COLOR[text.color],
  } as CSSProperties
  const classes = ['free-text', editor && 'free-text--editable', selected && 'item--selected', editing && 'free-text--editing']

  return (
    <div
      ref={node}
      className={classes.filter(Boolean).join(' ')}
      style={style}
      data-item={`t${text.id}`}
      data-keep-selection
      onPointerDown={editor && !editing ? (e) => onBegin(e, 'move', rectOf()) : undefined}
      onDoubleClick={editor && (() => editor.onTextEdit(text.id))}
    >
      {editing ? (
        <span
          ref={input}
          className="free-text__input"
          contentEditable="plaintext-only"
          suppressContentEditableWarning
          onBlur={(e) => {
            editor!.onTextChange(text.id, { text: e.currentTarget.innerText.trim() || 'Write something' })
            editor!.onTextEditEnd()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') e.currentTarget.blur()
          }}
        />
      ) : (
        text.text
      )}
      {selected && !editing && (
        <span className="handle handle--width edit-ui" onPointerDown={(e) => onBegin(e, 'width', rectOf())} />
      )}
    </div>
  )
}

function Text({
  block,
  content,
  onClick,
}: {
  block: TextBlock
  content: string
  onClick?: (kind: TextKind) => void
}) {
  // --chars lets a masthead shrink to fit however long the title is.
  const style = { top: pct(block.y), '--chars': Math.max(4, content.length) } as CSSProperties
  if (block.anchor === 'start') style.left = pct(block.x)
  else style.right = pct(1 - block.x)
  if (block.vertical) style.translate = '-50% 0'
  else if (!block.hang) style.translate = '0 -100%'
  const classes = [
    'text',
    `text--${block.kind}`,
    block.vertical && 'text--vertical',
    block.onPhoto && 'text--on-photo',
    onClick && 'text--editable',
  ]
  return (
    <div
      className={classes.filter(Boolean).join(' ')}
      style={style}
      title={onClick ? 'Edit text' : undefined}
      data-keep-selection
      onClick={onClick && (() => onClick(block.kind))}
    >
      {content}
    </div>
  )
}

/** Snap lines from the layout guides, added to everything else's edges. */
function withPageGuides(targets: Guides, spread: boolean): Guides {
  const page = pageGuides(spread)
  return { x: [...targets.x, ...page.x], y: [...targets.y, ...page.y] }
}

/** Faint lines to line things up by: each page's centre, thirds and margin. */
function LayoutGuides({ spread }: { spread: boolean }) {
  const { x, y } = pageGuides(spread)
  const centres = new Set([...(spread ? [0.25, 0.75] : [0.5]), 0.5])
  return (
    <>
      {x.map((v) => (
        <div
          key={`gx${v}`}
          className={`layout-guide layout-guide--v edit-ui${centres.has(v) ? ' layout-guide--centre' : ''}`}
          style={{ left: pct(v) }}
        />
      ))}
      {y.map((v) => (
        <div
          key={`gy${v}`}
          className={`layout-guide layout-guide--h edit-ui${v === 0.5 ? ' layout-guide--centre' : ''}`}
          style={{ top: pct(v) }}
        />
      ))}
    </>
  )
}
