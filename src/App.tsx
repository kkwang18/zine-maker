import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { readDrag } from './components/dragItem'
import { FlipText } from './components/FlipText'
import { PhotoToolbar, ShapeToolbar, TextToolbar } from './components/ItemToolbar'
import { LayoutPicker } from './components/LayoutPicker'
import { PageActions } from './components/PageActions'
import { PhotoTray } from './components/PhotoTray'
import { PhotoViewer } from './components/PhotoViewer'
import { Preview } from './components/Preview'
import { SurfaceView, type SurfaceEditor } from './components/SurfaceView'
import { forget, loadPhoto, showable, stored } from './lib/analyze'
import { ArrangeBar, type Units } from './components/ArrangeBar'
import {
  addFree,
  addShape,
  addText,
  alignRects,
  distributeRects,
  duplicate,
  isLocked,
  placeItem,
  setLocked,
  type Align,
  type Layer,
  moveFrame,
  moveFree,
  moveSpread,
  placePhoto,
  placesOf,
  removePhoto as withoutPhoto,
  removeShape,
  removeSpread,
  removeText,
  renderDraft,
  resetFrame,
  restack,
  setFrameShape,
  setSurfaceColor,
  swapPhotos,
  takeOff,
  updateShape,
  updateText,
  type PhotoRef,
} from './lib/draft'
import { carouselPosts } from './lib/carousel'
import { pageInches, preflight, type ExportTarget, type Issue } from './lib/preflight'
import { clearSaved, deletePhoto, loadSaved, savePhotos, saveState } from './lib/persist'
import { PAPER, pageAspect } from './lib/geometry'
import { findLayout, hasCircles, withoutCircles } from './lib/layouts'
import { fillEmptySlots, insertSpread, lookAlikes, MIN_PHOTOS, relayout, sequence } from './lib/sequence'
import { NEW_DOC, upgradeDoc, type Doc, type Folios } from './lib/doc'
import { PAGE_COLORS, STYLES, TITLE_FONTS } from './lib/styles'
import { useHistory } from './lib/useHistory'
import type {
  Draft,
  FreeText,
  PageColor,
  PaperSize,
  Photo,
  Rect,
  Shape,
  ShapeKind,
  SlotAddress,
  SurfaceKind,
  TextKind,
  TitleFont,
  ZineStyle,
} from './lib/types'
import './App.css'

const THIS_MONTH = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

/**
 * Up to 64 pages: about the most a stapled booklet folds well. On Instagram,
 * longer zines are split into several carousel posts.
 */
const MAX_SPREADS = 31

/** What's selected: a photo or empty slot on a page, a photo in the tray, a shape or a text box. */
type Selection =
  | { type: 'slot'; at: SlotAddress }
  | { type: 'free'; surface: number; id: string }
  | { type: 'photo'; id: string }
  | { type: 'shape'; surface: number; id: string }
  | { type: 'text'; surface: number; id: string }

/** Typing in a field or a text box shouldn't trigger page shortcuts. */
function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null
  return Boolean(el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)))
}

/** Wait for the next frame to be drawn, or a moment if the tab isn't drawing (it's in the background). */
const nextFrame = () => Promise.race([new Promise(requestAnimationFrame), new Promise((done) => setTimeout(done, 100))])

/** Save a file to the person's computer. */
function download(blob: Blob, name: string) {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = name
  link.click()
  // Give the browser a moment to start the download before letting go of the file.
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000)
}

type PanelSection = 'project' | 'style' | 'cover' | 'numbers' | 'back' | 'photos'

/** Which panel sections are open is remembered per browser; only Photos starts open. */
const OPEN_SECTIONS = 'zine-maker:open-sections'

function savedOpenSections(): Set<PanelSection> {
  try {
    const saved = localStorage.getItem(OPEN_SECTIONS)
    if (saved) return new Set(JSON.parse(saved) as PanelSection[])
  } catch {
    // No storage (private window, blocked site data): fall back to the default.
  }
  return new Set(['photos'])
}

/**
 * A panel section with a folder-tab label that opens and closes it. Closed,
 * it shows a one-line summary of its settings instead.
 */
function Section({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string
  summary?: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const body = useId()
  return (
    <section className={`section${open ? ' section--open' : ''}`}>
      <h2 className="section__head">
        <button className="tab section__toggle" aria-expanded={open} aria-controls={body} onClick={onToggle}>
          <span className="section__chevron" aria-hidden="true" />
          {title}
        </button>
        {!open && summary && <span className="section__summary">{summary}</span>}
      </h2>
      {/* Kept mounted while closed, so its fields can still be focused from the page. */}
      <div id={body} className="section__body" hidden={!open}>
        {children}
      </div>
    </section>
  )
}

function App() {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(0)
  const [failed, setFailed] = useState<string[]>([])
  // Everything undo can step through.
  const history = useHistory<Doc>(NEW_DOC)
  const { title, byline, backText, paper, zineStyle, pageColor, circles, titleFont, variant, manual, folios } = history.present
  /** Change the zine as one undo step; `mergeKey` folds quick repeats (typing) into one. */
  const change = (patch: Partial<Doc>, mergeKey?: string) => history.update((d) => ({ ...d, ...patch }), mergeKey)
  const setManual = (next: Draft | null) => change({ manual: next })
  const [selected, setSelected] = useState<Selection | null>(null)
  // Waiting for a second photo or slot to swap with.
  const [swapFrom, setSwapFrom] = useState<PhotoRef | null>(null)
  const [editingText, setEditingText] = useState<string | null>(null)
  // Several items selected together on one page (Shift-click), to align, space or move as one.
  const [group, setGroup] = useState<{ surface: number; layers: Layer[] } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [previewing, setPreviewing] = useState(false)
  // A photo open in the viewer, whole and uncropped.
  const [viewing, setViewing] = useState<string | null>(null)
  const [showGuides, setShowGuides] = useState(false)
  // The digital edition, once made; cleared whenever the zine changes so it's never stale.
  const [shareFile, setShareFile] = useState<File | null>(null)
  const [sharing, setSharing] = useState(false)
  const [shareNote, setShareNote] = useState('')
  // Preflight: the issues for the current destination, and whether the panel is open
  // (with `pending` set when it's standing between someone and a download).
  const [issues, setIssues] = useState<Issue[]>([])
  const [checking, setChecking] = useState<{ target: ExportTarget; pending: boolean } | null>(null)
  const [exportMenu, setExportMenu] = useState(false)
  // The top bar slides away while scrolling down through the pages, and back on the way up.
  const [barHidden, setBarHidden] = useState(false)
  // Autosave: nothing is written until the last session has been read back in.
  const [ready, setReady] = useState(false)
  const [saveNote, setSaveNote] = useState('')
  const [openSections, setOpenSections] = useState(savedOpenSections)
  const book = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const projectInput = useRef<HTMLInputElement>(null)
  const titleField = useRef<HTMLInputElement>(null)
  const bylineField = useRef<HTMLInputElement>(null)
  const backField = useRef<HTMLTextAreaElement>(null)

  const addFiles = useCallback(async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith('image/'))
    if (!images.length) return
    setLoading((n) => n + images.length)
    const results = await Promise.allSettled(images.map(loadPhoto))
    setLoading((n) => n - images.length)
    const loaded = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
    setFailed(images.filter((_, i) => results[i].status === 'rejected').map((f) => f.name))
    setPhotos((prev) => [...prev, ...loaded])
    savePhotos(loaded.map(stored)).catch(() => setSaveNote('Couldn’t save photos in this browser (it may be out of space).'))
  }, [])

  // Pick up where you left off.
  useEffect(() => {
    loadSaved()
      .then((saved) => {
        if (!saved) return
        setPhotos(saved.photos.map(showable))
        history.reset(upgradeDoc(saved.doc))
        if (saved.photos.length) setSaveNote('Picked up where you left off.')
      })
      .catch(() => setSaveNote('Couldn’t read your last session.'))
      .finally(() => setReady(true))
    // Once, on start.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const autoDraft = useMemo(
    () => sequence(photos, paper, zineStyle, circles, variant),
    [photos, paper, zineStyle, circles, variant],
  )
  const draft = manual ?? autoDraft
  const byId = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos])
  const surfaces = useMemo(() => (draft ? renderDraft(draft, byId, paper) : []), [draft, byId, paper])
  const similar = useMemo(() => lookAlikes(photos), [photos])
  const places = useMemo(() => placesOf(draft), [draft])

  /** Apply a change to the zine. Most changes clear the selection; moving things keeps it. */
  const edit = (change: (d: Draft) => Draft, keep: Selection | null = null) => {
    if (draft) setManual(change(draft))
    setSelected(keep)
    setSwapFrom(null)
    setGroup(null)
  }

  const deselect = () => {
    setSelected(null)
    setSwapFrom(null)
    setGroup(null)
  }

  // ── Items as layers: for multiple selection and the precise tools ──

  const keyOf = (l: Layer) => (l.type === 'slot' ? `s${l.slot}` : `${{ free: 'f', shape: 'h', text: 't' }[l.type]}${l.id}`)

  const layerOf = (sel: Selection | null): { surface: number; layer: Layer } | null => {
    if (sel?.type === 'slot') return { surface: sel.at.surface, layer: { type: 'slot', slot: sel.at.slot } }
    if (sel?.type === 'free') return { surface: sel.surface, layer: { type: 'free', id: sel.id } }
    if (sel?.type === 'shape') return { surface: sel.surface, layer: { type: 'shape', id: sel.id } }
    if (sel?.type === 'text') return { surface: sel.surface, layer: { type: 'text', id: sel.id } }
    return null
  }

  const selectionOf = (surface: number, l: Layer): Selection =>
    l.type === 'slot' ? { type: 'slot', at: { surface, slot: l.slot } } : { type: l.type, surface, id: l.id }

  /** What the arranging tools act on: the multiple selection, or the one selected item. */
  const active = (): { surface: number; layers: Layer[] } | null => {
    if (group) return group
    const one = layerOf(selected)
    return one ? { surface: one.surface, layers: [one.layer] } : null
  }

  /** An item's position and size as drawn (surface fractions); text boxes need measuring. */
  const measureRect = (surface: number, l: Layer): Rect | null => {
    const surfaceEl = book.current?.querySelectorAll<HTMLElement>('.surface')[surface]
    const el = surfaceEl?.querySelector<HTMLElement>(`[data-item="${keyOf(l)}"]`)
    if (!surfaceEl || !el) return null
    const b = surfaceEl.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    return { x: (r.left - b.left) / b.width, y: (r.top - b.top) / b.height, w: r.width / b.width, h: r.height / b.height }
  }

  /** Move several items to new rects as one undo step, skipping locked ones; the selection stays. */
  const placeAll = (surface: number, moves: { layer: Layer; rect: Rect }[], mergeKey?: string) => {
    if (!draft) return
    let next = draft
    for (const { layer, rect } of moves) if (!isLocked(next, surface, layer)) next = placeItem(next, surface, layer, rect)
    change({ manual: next }, mergeKey)
  }

  /** Shift-click: add an item to the multiple selection, or take it out. */
  const toggleGroup = (surface: number, layer: Layer) => {
    const current = layerOf(selected)
    const base = group?.surface === surface ? group.layers : current?.surface === surface ? [current.layer] : []
    const has = base.some((l) => keyOf(l) === keyOf(layer))
    const next = has ? base.filter((l) => keyOf(l) !== keyOf(layer)) : [...base, layer]
    setSwapFrom(null)
    if (next.length > 1) {
      setGroup({ surface, layers: next })
      setSelected(null)
    } else {
      setGroup(null)
      setSelected(next[0] ? selectionOf(surface, next[0]) : null)
    }
  }

  /** Real units for a surface: inches (Letter), millimetres (A4) or pixels (Instagram). */
  const unitsFor = (kind: SurfaceKind): Units => {
    const pages = kind === 'spread' ? 2 : 1
    if (paper === 'instagram') return { name: 'px', decimals: 0, width: 1080 * pages, height: 1350 }
    const page = pageInches(paper, 'home', spreadCount)
    const per = paper === 'a4' ? 25.4 : 1
    return { name: paper === 'a4' ? 'mm' : 'in', decimals: paper === 'a4' ? 1 : 2, width: page.w * pages * per, height: page.h * per }
  }

  /** The page an item sits on (its centre decides, on a spread), for aligning one thing to its page. */
  const pageAround = (kind: SurfaceKind, r: Rect): Rect =>
    kind !== 'spread' ? { x: 0, y: 0, w: 1, h: 1 } : r.x + r.w / 2 < 0.5 ? { x: 0, y: 0, w: 0.5, h: 1 } : { x: 0.5, y: 0, w: 0.5, h: 1 }

  const alignActive = (how: Align) => {
    const a = active()
    if (!a) return
    const rects = a.layers.map((l) => measureRect(a.surface, l))
    if (rects.some((r) => !r)) return
    const bounds = a.layers.length === 1 ? pageAround(surfaces[a.surface].kind, rects[0]!) : undefined
    const aligned = alignRects(rects as Rect[], how, bounds)
    placeAll(a.surface, a.layers.map((layer, i) => ({ layer, rect: aligned[i] })))
  }

  const distributeActive = (axis: 'x' | 'y') => {
    const a = active()
    if (!a || a.layers.length < 3) return
    const rects = a.layers.map((l) => measureRect(a.surface, l))
    if (rects.some((r) => !r)) return
    const spaced = distributeRects(rects as Rect[], axis)
    placeAll(a.surface, a.layers.map((layer, i) => ({ layer, rect: spaced[i] })))
  }

  const duplicateActive = () => {
    const one = group ? null : layerOf(selected)
    const rect = one && measureRect(one.surface, one.layer)
    if (!draft || !one || !rect) return
    const { draft: next, item } = duplicate(draft, one.surface, one.layer, rect)
    setManual(next)
    setSelected(selectionOf(one.surface, item))
  }

  const lockActive = () => {
    const a = active()
    if (!a || !draft) return
    const lock = !a.layers.every((l) => isLocked(draft, a.surface, l))
    let next = draft
    for (const l of a.layers) next = setLocked(next, a.surface, l, lock)
    change({ manual: next })
  }

  /** The photo spot a selection points at, if it's a photo on a page. */
  const refOf = (sel: Selection | null): PhotoRef | null =>
    sel?.type === 'slot' || sel?.type === 'free' ? sel : null
  const sameRef = (a: PhotoRef, b: PhotoRef) =>
    a.type === 'slot' && b.type === 'slot'
      ? a.at.surface === b.at.surface && a.at.slot === b.at.slot
      : a.type === 'free' && b.type === 'free' && a.id === b.id

  // Clicking a photo or slot on a page: finish a swap, drop in a tray photo, or select it.
  const clickRef = (ref: PhotoRef) => {
    const current = refOf(selected)
    if (swapFrom) {
      if (sameRef(swapFrom, ref)) setSwapFrom(null)
      else edit((d) => swapPhotos(d, swapFrom, ref), ref)
    } else if (selected?.type === 'photo') {
      edit((d) => placePhoto(d, selected.id, ref), ref)
    } else {
      setGroup(null)
      setSelected(current && sameRef(current, ref) ? null : ref)
    }
  }

  const clickTrayPhoto = (id: string) => {
    const at = refOf(selected)
    if (at) edit((d) => placePhoto(d, id, at), at)
    else setSelected(selected?.type === 'photo' && selected.id === id ? null : { type: 'photo', id })
  }

  /** Put a photo anywhere on a page, centred where it was dropped or clicked. */
  const placeFreely = (surface: number, photoId: string, point: { x: number; y: number }) => {
    const photo = byId.get(photoId)
    if (!draft || !photo) return
    const { draft: next, id } = addFree(draft, surface, photo, point, surfaces[surface].aspect)
    setManual(next)
    setSelected({ type: 'free', surface, id })
    setSwapFrom(null)
  }

  // Typing into a text box only lasts while it stays selected.
  const typingIn = selected?.type === 'text' && selected.id === editingText ? editingText : null

  const editorFor = (surface: number): SurfaceEditor => ({
    selectedSlot: selected?.type === 'slot' && selected.at.surface === surface ? selected.at.slot : null,
    selectedFree: selected?.type === 'free' && selected.surface === surface ? selected.id : null,
    selectedText: selected?.type === 'text' && selected.surface === surface ? selected.id : null,
    selectedShape: selected?.type === 'shape' && selected.surface === surface ? selected.id : null,
    editingText: typingIn,
    groupKeys: group?.surface === surface ? group.layers.map(keyOf) : [],
    swapping: swapFrom !== null,
    onSlotClick: (slot, additive) =>
      additive ? toggleGroup(surface, { type: 'slot', slot }) : clickRef({ type: 'slot', at: { surface, slot } }),
    onSlotDrop: (slot, e) => {
      const item = readDrag(e)
      const at: PhotoRef = { type: 'slot', at: { surface, slot } }
      if (item) edit((d) => placePhoto(d, item.id, at), at)
    },
    onFrameChange: (slot, box) =>
      edit((d) => moveFrame(d, { surface, slot }, box), { type: 'slot', at: { surface, slot } }),
    onFreeClick: (id, additive) =>
      additive ? toggleGroup(surface, { type: 'free', id }) : clickRef({ type: 'free', surface, id }),
    onFreeDrop: (id, e) => {
      const item = readDrag(e)
      const at: PhotoRef = { type: 'free', surface, id }
      if (item) edit((d) => placePhoto(d, item.id, at), at)
    },
    onFreeChange: (id, box) => edit((d) => moveFree(d, surface, id, box), { type: 'free', surface, id }),
    onPageDrop: (point, e) => {
      const item = readDrag(e)
      if (item) placeFreely(surface, item.id, point)
    },
    onTextClick: (id, additive) => {
      if (additive) return toggleGroup(surface, { type: 'text', id })
      setSwapFrom(null)
      setGroup(null)
      setSelected({ type: 'text', surface, id })
    },
    onShapeClick: (id, additive) => {
      if (additive) return toggleGroup(surface, { type: 'shape', id })
      setSwapFrom(null)
      setGroup(null)
      setSelected(selected?.type === 'shape' && selected.id === id ? null : { type: 'shape', surface, id })
    },
    onShapeChange: (id, box) => edit((d) => updateShape(d, surface, id, { box }), { type: 'shape', surface, id }),
    onGroupMove: (dx, dy) => {
      if (!group) return
      const moves = group.layers.flatMap((layer) => {
        const r = measureRect(surface, layer)
        return r ? [{ layer, rect: { ...r, x: r.x + dx, y: r.y + dy } }] : []
      })
      placeAll(surface, moves)
    },
    measure: (r) => {
      const u = unitsFor(surfaces[surface].kind)
      return `${(r.w * u.width).toFixed(u.decimals)} × ${(r.h * u.height).toFixed(u.decimals)} ${u.name}`
    },
    onTextEdit: (id) => {
      setSelected({ type: 'text', surface, id })
      setEditingText(id)
    },
    onTextChange: (id, change) => edit((d) => updateText(d, surface, id, change), { type: 'text', surface, id }),
    onTextEditEnd: () => setEditingText(null),
    // With a photo picked in the tray, clicking bare page puts it there; otherwise it deselects.
    onBackground: (point) => {
      if (selected?.type === 'photo') placeFreely(surface, selected.id, point)
      else deselect()
    },
  })

  const addTextTo = (surface: number) => {
    if (!draft) return
    const { draft: next, id } = addText(draft, surface)
    setManual(next)
    setSelected({ type: 'text', surface, id })
    setEditingText(id)
  }

  /** A new shape, in a colour that shows up on its page; selected so it can be placed. */
  const addShapeTo = (surface: number, kind: ShapeKind) => {
    if (!draft) return
    const page = surfaces[surface].color ?? pageColor
    const color: PageColor = kind === 'line' ? (page === 'black' ? 'white' : 'black') : page === 'yellow' ? 'sky' : 'yellow'
    const { draft: next, id } = addShape(draft, surface, kind, color, surfaces[surface].aspect)
    setManual(next)
    setGroup(null)
    setSelected({ type: 'shape', surface, id })
  }

  /** The shape currently selected, if any. */
  const selectedShape: Shape | undefined =
    selected?.type === 'shape' ? draft?.[selected.surface]?.shapes?.find((f) => f.id === selected.id) : undefined

  /** The text box currently selected, if any. */
  const selectedText: FreeText | undefined =
    selected?.type === 'text' ? draft?.[selected.surface]?.texts?.find((t) => t.id === selected.id) : undefined

  const spreadCount = draft?.filter((s) => s.kind === 'spread').length ?? 0

  const removePhoto = (id: string) => {
    const gone = byId.get(id)
    if (gone) forget(gone)
    deletePhoto(id).catch(() => {})
    const remaining = photos.filter((p) => p.id !== id)
    setPhotos(remaining)
    if (manual) setManual(remaining.length ? fillEmptySlots(withoutPhoto(manual, id), remaining, paper) : null)
    if (selected?.type === 'photo' && selected.id === id) setSelected(null)
  }

  const resequence = () => {
    change({ manual: null, variant: variant + 1 })
    deselect()
  }

  /** The settings that come with a style: its page colour, title font, and a fresh sequence. */
  const styleChange = (next: ZineStyle): Partial<Doc> => ({
    zineStyle: next,
    pageColor: STYLES[next].page,
    titleFont: STYLES[next].font,
    manual: null,
    variant: 0,
  })

  // The styles use different layouts, so switching starts a fresh sequence (undo brings the old one back).
  const switchStyle = (next: ZineStyle) => {
    if (next === zineStyle) return
    change(styleChange(next))
    deselect()
  }

  // Turning circles off swaps any circle layouts for their nearest relatives, keeping the photos.
  const toggleCircles = () => {
    if (!circles || !manual) return change({ circles: !circles })
    let next = manual
    manual.forEach((s, i) => {
      if (hasCircles(findLayout(s.kind, s.templateId)))
        next = relayout(next, i, withoutCircles(s.kind, s.templateId), photos, paper)
    })
    change({ circles: false, manual: next })
  }

  const fileName = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'zine'

  // A shared file must match the zine as it is now.
  useEffect(() => {
    setShareFile(null)
    setShareNote('')
  }, [history.present, photos])

  /**
   * Make the digital edition: a PDF for reading on screen, one page per spread.
   * Browsers only open the share menu straight after a click, and this takes a
   * moment, so sending is a second step (see `sendShareFile`).
   */
  const prepareShare = async () => {
    if (!book.current) return
    deselect()
    setSharing(true)
    setShareNote('')
    try {
      await nextFrame()
      const { renderDigitalPdf } = await import('./lib/exportDigital')
      const pdf = await renderDigitalPdf(book.current, pageAspect(paper), title.trim())
      setShareFile(new File([pdf], `${fileName}.pdf`, { type: 'application/pdf' }))
    } catch (err) {
      setShareNote(`Couldn’t make the PDF: ${err instanceof Error ? err.message : err}`)
    } finally {
      setSharing(false)
    }
  }

  const canShareFiles = (file: File) => typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })

  const sendShareFile = async () => {
    if (!shareFile) return
    try {
      await navigator.share({ files: [shareFile], title: title.trim() || 'My zine' })
      setShareNote('Sent.')
    } catch (err) {
      // Closing the share menu without picking anything isn't an error.
      if (err instanceof DOMException && err.name === 'AbortError') return
      setShareNote('Sharing didn’t work here. Download the PDF and attach it instead.')
    }
  }

  /** Where things go by default: Instagram slides, or the home-printer PDF. */
  const defaultTarget: ExportTarget = paper === 'instagram' ? 'instagram' : 'home'

  // Re-check after every change. Text is measured from the page, so this runs after it's drawn.
  useEffect(() => {
    if (!book.current) return setIssues([])
    setIssues(preflight(book.current, surfaces, byId, paper, checking?.target ?? defaultTarget))
  }, [surfaces, byId, paper, checking?.target, defaultTarget, title, byline, backText])

  const warnings = issues.filter((i) => i.severity === 'warn').length

  // Hide the top bar on the way down the pages, bring it back on the way up.
  useEffect(() => {
    let last = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      if (Math.abs(y - last) < 8) return
      setBarHidden(y > last && y > 160)
      last = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // The export menu closes on a click anywhere else.
  useEffect(() => {
    if (!exportMenu) return
    const close = (e: PointerEvent) => {
      if (!(e.target as Element).closest('.stage__bar')) setExportMenu(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [exportMenu])

  // Never hide it while something in it is open or under way.
  const barShown = !barHidden || exportMenu || Boolean(checking || shareFile || shareNote) || exporting || sharing

  /** Check first; if anything looks wrong, show it before downloading. */
  const requestDownload = (target: ExportTarget) => {
    setExportMenu(false)
    if (!book.current) return
    const found = preflight(book.current, surfaces, byId, paper, target)
    if (found.some((i) => i.severity === 'warn')) {
      setIssues(found)
      setChecking({ target, pending: true })
    } else downloadZine(target)
  }

  /** The home-printer PDF, the print-shop PDF, or Instagram slides. */
  const downloadZine = async (target: ExportTarget) => {
    if (!book.current) return
    deselect()
    setChecking(null)
    setExporting(true)
    setExportError('')
    try {
      // Let the cleared selection render first, so no outline ends up in the pictures.
      await nextFrame()
      // The exporters are only loaded when first used, to keep the app quick to open.
      if (target === 'instagram') {
        const { renderSlides, zipSlides } = await import('./lib/exportSlides')
        const perSurface = surfaces.map((s) => (s.kind === 'spread' ? 2 : 1))
        download(await zipSlides(await renderSlides(book.current), perSurface), `${fileName}-instagram.zip`)
      } else if (paper !== 'instagram') {
        const { renderPrintPdf, renderShopPdf } = await import('./lib/exportPdf')
        if (target === 'shop') download(await renderShopPdf(book.current, paper, title.trim()), `${fileName}-print-shop.pdf`)
        else download(await renderPrintPdf(book.current, paper, title.trim()), `${fileName}-print.pdf`)
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err))
    } finally {
      setExporting(false)
    }
  }

  /** Jump to a problem: scroll its page into view and select the thing at fault. */
  const showIssue = (issue: Issue) => {
    book.current?.querySelectorAll('.book__row')[issue.surface]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const it = issue.item
    if (!it) return deselect()
    if (it.type === 'slot') setSelected({ type: 'slot', at: { surface: issue.surface, slot: it.slot } })
    else setSelected({ type: it.type, surface: issue.surface, id: it.id })
  }

  // ── Saving ────────────────────────────────────────────────────────────────

  // Autosave the zine a moment after each change.
  useEffect(() => {
    if (!ready) return
    const timer = setTimeout(() => {
      saveState(history.present, photos.map((p) => p.id)).catch(() =>
        setSaveNote('Couldn’t save in this browser. Use “Save project” to keep a copy.'),
      )
    }, 400)
    return () => clearTimeout(timer)
  }, [ready, history.present, photos])

  /** Replace everything with a different zine (an opened project, or a fresh start). */
  const replaceAll = async (doc: Doc, next: Photo[]) => {
    photos.forEach(forget)
    setPhotos(next)
    history.reset(doc)
    deselect()
    setEditingText(null)
    await clearSaved()
    await savePhotos(next.map(stored))
  }

  const saveProjectFile = async () => {
    setSaveNote('Packing your project…')
    try {
      const { saveProject } = await import('./lib/project')
      download(await saveProject(history.present, photos.map(stored)), `${fileName}.zine`)
      setSaveNote('Project saved. Open it here any time to carry on.')
    } catch (err) {
      setSaveNote(`Couldn’t save the project: ${err instanceof Error ? err.message : err}`)
    }
  }

  const openProjectFile = async (file: File) => {
    if (photos.length && !window.confirm('Open this project? It replaces the zine you have open now.')) return
    setSaveNote('Opening…')
    try {
      const { openProject } = await import('./lib/project')
      const project = await openProject(file)
      await replaceAll(upgradeDoc(project.doc), project.photos.map(showable))
      setSaveNote(`Opened ${file.name}.`)
    } catch (err) {
      setSaveNote(`Couldn’t open that file: ${err instanceof Error ? err.message : err}`)
    }
  }

  const startOver = async () => {
    if (!window.confirm('Start a new zine? This clears the photos and everything you’ve done.')) return
    await replaceAll(NEW_DOC, [])
    setSaveNote('')
  }

  // Print formats number pages; Instagram numbers slides.
  const caption = (kind: string, label: string, index: number) => {
    if (PAPER[paper].print) return kind === 'spread' ? `P. ${label}` : label
    if (kind === 'spread') return `Slides ${index * 2} – ${index * 2 + 1}`
    return kind === 'cover' ? 'Slide 1' : `Slide ${spreadCount * 2 + 2}`
  }

  // How long the zine is, and what that means for printing or posting.
  const pageCount = spreadCount * 2 + 2
  const posts = carouselPosts(draft?.map((s) => (s.kind === 'spread' ? 2 : 1)) ?? []).map((p) => p.length)
  const lengthNote = !PAPER[paper].print
    ? posts.length > 1
      ? `${pageCount} slides at 1080 × 1350: more than Instagram's 20 per post, so the download is split into ${posts.length} posts (${posts.join(' + ')} slides). Spreads stay whole.`
      : `${pageCount} slides at 1080 × 1350 for a carousel post. Each spread runs across two slides, so it pans as you swipe.`
    : spreadCount === 3
      ? '8 pages, folded from one sheet.'
      : `${pageCount} pages, a stapled booklet${pageCount % 4 ? ' (printing adds a blank page to make a multiple of 4)' : ''}.`

  // Instagram starts in the style made for it; the other styles still work there if picked.
  const chooseFormat = (next: PaperSize) => {
    const toInstagram = next === 'instagram' && paper !== 'instagram' && zineStyle !== 'collage'
    change({ paper: next, ...(toInstagram ? styleChange('collage') : {}) })
    if (toInstagram) deselect()
  }

  const undo = () => {
    deselect()
    setEditingText(null)
    history.undo()
  }
  const redo = () => {
    deselect()
    setEditingText(null)
    history.redo()
  }

  // Keyboard: Cmd/Ctrl+Z undoes, Shift+Cmd+Z or Ctrl+Y redoes, Esc cancels,
  // Delete removes, arrow keys nudge (Shift for bigger steps).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // In a text field, leave undo to the field itself; a full-screen view has its own keys.
      if (isTyping() || previewing || viewing) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
        return
      }
      if (!draft) return
      if (e.key === 'Escape') {
        setSelected(null)
        setSwapFrom(null)
        return
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        duplicateActive()
        return
      }
      const a = active()
      if (!a) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        // Locked items stay put.
        let next = draft
        for (const l of a.layers) {
          if (isLocked(next, a.surface, l)) continue
          if (l.type === 'text') next = removeText(next, a.surface, l.id)
          else if (l.type === 'shape') next = removeShape(next, a.surface, l.id)
          else next = takeOff(next, l.type === 'slot' ? { type: 'slot', at: { surface: a.surface, slot: l.slot } } : { type: 'free', surface: a.surface, id: l.id })
        }
        setManual(next)
        deselect()
        return
      }
      const step = e.shiftKey ? 0.02 : 0.004
      const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
      if (!delta) return
      e.preventDefault()
      const [dx, dy] = delta
      // A run of nudges is one undo step.
      const moves = a.layers.flatMap((layer) => {
        const r = measureRect(a.surface, layer)
        return r ? [{ layer, rect: { ...r, x: r.x + dx, y: r.y + dy } }] : []
      })
      placeAll(a.surface, moves, 'nudge')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Accept drops anywhere in the window.
  useEffect(() => {
    const over = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return
      e.preventDefault()
      setDragging(true)
    }
    const leave = (e: DragEvent) => {
      if (!e.relatedTarget) setDragging(false)
    }
    const drop = (e: DragEvent) => {
      e.preventDefault()
      setDragging(false)
      addFiles([...(e.dataTransfer?.files ?? [])])
    }
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [addFiles])

  const count = draft?.reduce((n, s) => n + s.photoIds.filter(Boolean).length, 0) ?? 0
  const defaultBack = [title.trim() || 'Untitled', `${count} photographs`, THIS_MONTH].join('  ·  ')
  const words: Record<TextKind, string> = {
    title: title.trim(),
    byline: byline.trim(),
    colophon: backText.trim() || defaultBack,
  }

  // Clicking text on a page jumps to the field that edits it.
  const toggleSection = (id: PanelSection) =>
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })

  useEffect(() => {
    try {
      localStorage.setItem(OPEN_SECTIONS, JSON.stringify([...openSections]))
    } catch {
      // Not remembered this time; nothing else depends on it.
    }
  }, [openSections])

  const editText = (kind: TextKind) => {
    // Open the section that holds the field first, then focus it once it's shown.
    const section = kind === 'colophon' ? 'back' : 'cover'
    setOpenSections((prev) => (prev.has(section) ? prev : new Set([...prev, section])))
    setTimeout(() => {
      const field = { title: titleField, byline: bylineField, colophon: backField }[kind].current
      field?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      field?.focus()
    })
  }

  const section = (id: PanelSection) => ({ open: openSections.has(id), onToggle: () => toggleSection(id) })

  const pageVars = {
    '--page': PAGE_COLORS[pageColor].page,
    '--page-text': PAGE_COLORS[pageColor].text,
    '--title-font': TITLE_FONTS[titleFont].family,
    '--title-width': TITLE_FONTS[titleFont].width,
  } as CSSProperties

  return (
    <div className="app" style={pageVars}>
      <aside className="panel">
        <header className="brand">
          <FlipText as="h1" className="brand__mark" text="zine maker" />
          <p className="brand__line">Photos in, zine out.</p>
        </header>

        <Section title="Project" {...section('project')}>
          <div className="pills">
            <button className="pill" disabled={!photos.length} onClick={saveProjectFile}>
              Save project
            </button>
            <button className="pill" onClick={() => projectInput.current?.click()}>
              Open…
            </button>
            <button className="pill" disabled={!photos.length} onClick={startOver}>
              Start over
            </button>
          </div>
          <input
            ref={projectInput}
            type="file"
            accept=".zine"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) openProjectFile(file)
              e.target.value = ''
            }}
          />
          <p className="hint">☞ {saveNote || 'Your work saves in this browser as you go. Save a project file to keep a copy or move computers.'}</p>
        </Section>

        <Section title="Style" summary={`${STYLES[zineStyle].label} · ${PAPER[paper].label}`} {...section('style')}>
          <div className="styles">
            {(Object.keys(STYLES) as ZineStyle[]).map((s) => (
              <button
                key={s}
                className={`style-card style-card--${s}`}
                aria-pressed={zineStyle === s}
                onClick={() => switchStyle(s)}
              >
                <span className="style-card__sketch" aria-hidden="true" />
                <span className="style-card__name">{STYLES[s].label}</span>
                <span className="style-card__note">{STYLES[s].note}</span>
              </button>
            ))}
          </div>

          {zineStyle === 'magazine' && (
            <label className="toggle">
              <input type="checkbox" checked={circles} onChange={toggleCircles} />
              <span className="toggle__track" aria-hidden="true" />
              <span className="toggle__text">
                <strong>Circle photos</strong>
                <span>Adds circle layouts. Circles crop each photo to a square.</span>
              </span>
            </label>
          )}

          <div className="field">
            <span>Pages</span>
            <div className="swatches" role="radiogroup" aria-label="Page colour">
              {(Object.keys(PAGE_COLORS) as PageColor[]).map((c) => (
                <button
                  key={c}
                  role="radio"
                  aria-checked={pageColor === c}
                  aria-label={PAGE_COLORS[c].label}
                  title={PAGE_COLORS[c].label}
                  className="swatch"
                  style={{ background: PAGE_COLORS[c].page }}
                  onClick={() => change({ pageColor: c })}
                />
              ))}
            </div>
          </div>

          <div className="field">
            <span>Format</span>
            <div className="pills">
              {(Object.keys(PAPER) as PaperSize[]).map((p) => (
                <button key={p} className="pill" aria-pressed={paper === p} onClick={() => chooseFormat(p)}>
                  {PAPER[p].label}
                </button>
              ))}
            </div>
          </div>

          {draft && <p className="hint">☞ {lengthNote}</p>}
        </Section>

        <Section title="Cover" summary={title.trim() || 'Untitled'} {...section('cover')}>
          <label className="field">
            <span>Title</span>
            <input
              ref={titleField}
              value={title}
              maxLength={60}
              placeholder="Untitled"
              onChange={(e) => change({ title: e.target.value }, 'title')}
            />
          </label>
          <div className="field">
            <span>Font</span>
            <div className="fonts" role="radiogroup" aria-label="Font for the title, name and back text">
              {(Object.keys(TITLE_FONTS) as TitleFont[]).map((f) => (
                <button
                  key={f}
                  role="radio"
                  aria-checked={titleFont === f}
                  className="font-option"
                  style={{ fontFamily: TITLE_FONTS[f].family }}
                  onClick={() => change({ titleFont: f })}
                >
                  <span className="font-option__sample">{title.trim() || 'Aa'}</span>
                  <span className="font-option__name">{TITLE_FONTS[f].label}</span>
                </button>
              ))}
            </div>
          </div>
          <label className="field">
            <span>Name</span>
            <input
              ref={bylineField}
              value={byline}
              maxLength={60}
              placeholder="Your name (optional)"
              onChange={(e) => change({ byline: e.target.value }, 'byline')}
            />
          </label>
        </Section>

        <Section
          title="Page numbers"
          summary={[folios.numbers ? 'Numbered' : 'Off', folios.running.trim()].filter(Boolean).join(' · ')}
          {...section('numbers')}
        >
          <label className="toggle">
            <input
              type="checkbox"
              checked={folios.numbers}
              onChange={() => change({ folios: { ...folios, numbers: !folios.numbers } })}
            />
            <span className="toggle__track" aria-hidden="true" />
            <span className="toggle__text">
              <strong>Number the pages</strong>
              <span>On every inside page; the covers stay clean.</span>
            </span>
          </label>
          {folios.numbers && (
            <div className="pills" role="radiogroup" aria-label="Where page numbers go">
              {(
                [
                  ['bottom-outer', 'Bottom corner'],
                  ['bottom-centre', 'Bottom centre'],
                  ['top-outer', 'Top corner'],
                ] as [Folios['position'], string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  role="radio"
                  aria-checked={folios.position === value}
                  className="pill pill--small"
                  aria-pressed={folios.position === value}
                  onClick={() => change({ folios: { ...folios, position: value } })}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <label className="field">
            <span>Running head</span>
            <input
              value={folios.running}
              maxLength={60}
              placeholder="Repeated at the top of every page"
              onChange={(e) => change({ folios: { ...folios, running: e.target.value } }, 'running')}
            />
          </label>
        </Section>

        <Section title="Back" summary={backText.trim() || 'Default line'} {...section('back')}>
          <label className="field">
            <span>Text</span>
            <textarea
              ref={backField}
              value={backText}
              maxLength={300}
              rows={3}
              placeholder={defaultBack}
              onChange={(e) => change({ backText: e.target.value }, 'backText')}
            />
          </label>
          {!backText.trim() && <p className="hint">☞ Leave empty to use the line shown.</p>}
        </Section>

        <Section
          title="Photos"
          summary={photos.length ? `${photos.length} photo${photos.length === 1 ? '' : 's'}` : 'None yet'}
          {...section('photos')}
        >
          <div className="pills">
            <button className="pill pill--solid" onClick={() => input.current?.click()}>
              Add photos
            </button>
            <button className="pill" disabled={!autoDraft} onClick={resequence}>
              {manual ? 'New sequence (drops changes)' : 'Try another sequence'}
            </button>
          </div>
          <input
            ref={input}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              addFiles([...(e.target.files ?? [])])
              e.target.value = ''
            }}
          />

          {loading > 0 && <p className="hint">☞ Reading {loading} photo{loading === 1 ? '' : 's'}…</p>}
          {failed.length > 0 && <p className="hint hint--warn">☞ Couldn’t open: {failed.join(', ')}</p>}
          {draft && (
            <p className="hint">
              ☞{' '}
              {selected?.type === 'photo'
                ? 'Now click a photo or slot to put it there, or anywhere on a page to place it freely.'
                : selected?.type === 'slot' || selected?.type === 'free'
                  ? 'Click a photo below to put it in the selected spot.'
                  : 'Drag a photo onto a slot, or onto bare page to place it freely (hold Shift to drop it on top of another photo). Pick the + layout to start from blank.'}
            </p>
          )}

          <PhotoTray
            photos={photos}
            places={places}
            lookAlikes={similar}
            selectedId={selected?.type === 'photo' ? selected.id : null}
            onSelect={clickTrayPhoto}
            onView={setViewing}
            onRemove={removePhoto}
          />
        </Section>
      </aside>

      <main
        className="stage"
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest('[data-keep-selection], .surface')) deselect()
        }}
      >
        {draft && (
          <div className={`stage__bar${barShown ? '' : ' stage__bar--hidden'}`} data-keep-selection>
            <button className="pill pill--small" disabled={!history.canUndo} onClick={undo} title="Undo (⌘Z)" aria-label="Undo">
              ↶<span className="wide-only"> Undo</span>
            </button>
            <button className="pill pill--small" disabled={!history.canRedo} onClick={redo} title="Redo (⇧⌘Z)" aria-label="Redo">
              ↷<span className="wide-only"> Redo</span>
            </button>
            <button
              className="pill pill--small"
              aria-pressed={showGuides}
              onClick={() => setShowGuides(!showGuides)}
              title="Centre lines, thirds and margins on every page"
            >
              Guides
            </button>
            <span className="stage__spacer" />
            {exportError && <span className="hint hint--warn">☞ Couldn’t export: {exportError}</span>}
            <button className="pill" onClick={() => setPreviewing(true)}>
              Preview
            </button>
            <button
              className="pill pill--solid"
              disabled={exporting || sharing}
              aria-expanded={exportMenu}
              onClick={() => setExportMenu(!exportMenu)}
            >
              {exporting ? 'Making…' : sharing ? 'Preparing…' : 'Export ▾'}
              {warnings > 0 && <span className="badge">{warnings}</span>}
            </button>
            {exportMenu && (
              <div className="share-panel download-menu" role="menu">
                {paper === 'instagram' ? (
                  <button role="menuitem" className="download-option" onClick={() => requestDownload('instagram')}>
                    <strong>Download slides</strong>
                    <span>Every page at 1080 × 1350, ready to post as a carousel.</span>
                  </button>
                ) : (
                  <>
                    <button role="menuitem" className="download-option" onClick={() => requestDownload('home')}>
                      <strong>PDF for a home printer</strong>
                      <span>
                        {spreadCount === 3
                          ? 'One sheet, laid out to fold into the zine, with a folding guide.'
                          : 'Double-sided sheets to stack, fold and staple, with instructions.'}
                      </span>
                    </button>
                    <button role="menuitem" className="download-option" onClick={() => requestDownload('shop')}>
                      <strong>PDF for a print shop</strong>
                      <span>
                        Single pages at {paper === 'a4' ? 'A5' : 'half-letter'} size with bleed and crop marks, ready to
                        print, trim and staple.
                      </span>
                    </button>
                  </>
                )}
                <button
                  role="menuitem"
                  className="download-option"
                  onClick={() => {
                    setExportMenu(false)
                    prepareShare()
                  }}
                >
                  <strong>Share</strong>
                  <span>A PDF to read on screen, for sending to people.</span>
                </button>
                <button
                  role="menuitem"
                  className="download-option"
                  onClick={() => {
                    setExportMenu(false)
                    setChecking({ target: defaultTarget, pending: false })
                  }}
                >
                  <strong>
                    Check for problems{warnings > 0 && <span className="badge">{warnings}</span>}
                  </strong>
                  <span>
                    {warnings > 0
                      ? `${warnings} to fix before ${paper === 'instagram' ? 'posting' : 'printing'}.`
                      : issues.length > 0
                        ? `${issues.length} small thing${issues.length === 1 ? '' : 's'} to look at.`
                        : 'All clear right now.'}
                  </span>
                </button>
              </div>
            )}
            {checking && (
              <div className="share-panel preflight" role="status">
                <p>
                  <strong>
                    {issues.length === 0
                      ? 'All clear.'
                      : `${warnings} to fix, ${issues.length - warnings} to look at`}
                  </strong>{' '}
                  Checked for {checking.target === 'shop' ? 'a print shop' : checking.target === 'home' ? 'a home printer' : 'Instagram'}.
                </p>
                {paper !== 'instagram' && !checking.pending && (
                  <div className="pills">
                    {(['home', 'shop'] as const).map((t) => (
                      <button key={t} className="pill pill--small" aria-pressed={checking.target === t} onClick={() => setChecking({ target: t, pending: false })}>
                        {t === 'home' ? 'Home printer' : 'Print shop'}
                      </button>
                    ))}
                  </div>
                )}
                {issues.length > 0 && (
                  <ul className="issues">
                    {issues.map((issue, i) => (
                      <li key={i} className={`issue issue--${issue.severity}`}>
                        <span>{issue.message}</span>
                        <button className="pill pill--small" onClick={() => showIssue(issue)}>
                          Show
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="pills">
                  {checking.pending && (
                    <button className="pill pill--solid" onClick={() => downloadZine(checking.target)}>
                      Download anyway
                    </button>
                  )}
                  <button className="pill" onClick={() => setChecking(null)}>
                    {checking.pending ? 'Fix first' : 'Close'}
                  </button>
                </div>
              </div>
            )}
            {(shareFile || shareNote) && (
              <div className="share-panel" role="status">
                {shareFile ? (
                  <>
                    <p>
                      <strong>Ready to share.</strong> {shareFile.name}, {(shareFile.size / 1e6).toFixed(1)} MB: one page
                      per spread, opens on any phone or computer.
                    </p>
                    <div className="pills">
                      {canShareFiles(shareFile) && (
                        <button className="pill pill--solid" onClick={sendShareFile}>
                          Send…
                        </button>
                      )}
                      <button className="pill" onClick={() => download(shareFile, shareFile.name)}>
                        Download
                      </button>
                      <button className="pill" onClick={() => setShareFile(null)}>
                        Close
                      </button>
                    </div>
                    {!canShareFiles(shareFile) && (
                      <p className="hint">☞ This browser can’t open the share menu. Download it, then attach it to a message or email.</p>
                    )}
                  </>
                ) : null}
                {shareNote && <p className="hint">☞ {shareNote}</p>}
              </div>
            )}
          </div>
        )}
        {draft ? (
          <div className="book" ref={book}>
            {surfaces.map((surface, i) => {
              const slotSelected = selected?.type === 'slot' && selected.at.surface === i ? selected.at : null
              const slot = slotSelected ? surface.slots[slotSelected.slot] : null
              const freeSelected = selected?.type === 'free' && selected.surface === i ? selected : null
              const photoSelected: PhotoRef | null = slot?.placement ? { type: 'slot', at: slotSelected! } : freeSelected
              const layer = slotSelected
                ? ({ type: 'slot', slot: slotSelected.slot } as const)
                : freeSelected
                  ? ({ type: 'free', id: freeSelected.id } as const)
                  : null
              const textSelected = selected?.type === 'text' && selected.surface === i ? selectedText : undefined
              const shapeSelected = selected?.type === 'shape' && selected.surface === i ? selectedShape : undefined
              return (
                // Keyed by position: spreads keep their place in the list as they're reordered.
                <figure key={i} className={`book__row book__row--${surface.kind}`}>
                  <SurfaceView
                    surface={surface}
                    zineStyle={zineStyle}
                    photos={byId}
                    words={words}
                    editor={editorFor(i)}
                    onWordsClick={editText}
                    seam={PAPER[paper].print ? 'fold' : 'slides'}
                    showGuides={showGuides}
                    folios={
                      surface.kind === 'spread' && (folios.numbers || folios.running.trim())
                        ? { ...folios, running: folios.running.trim(), pages: [i * 2, i * 2 + 1] }
                        : undefined
                    }
                  />
                  {/* The selected item's tools float at the bottom of the screen while this page is in view. */}
                  <div className="dock" data-keep-selection>
                    {(() => {
                      // The precise tools: for a multiple selection here, or the one item selected here.
                      const many = group?.surface === i ? group : null
                      const one = !many ? layerOf(selected) : null
                      if (!many && one?.surface !== i) return null
                      const l = one?.layer
                      const rect: Rect | null = !l
                        ? null
                        : l.type === 'slot'
                          ? (surface.slots[l.slot].placement?.dest ?? null)
                          : l.type === 'free'
                            ? (surface.free.find((f) => f.id === l.id)?.placement.dest ?? null)
                            : l.type === 'shape'
                              ? (surface.shapes.find((f) => f.id === l.id)?.box ?? null)
                              : (() => {
                                const t = surface.texts.find((x) => x.id === l.id)
                                // A text box's height follows its words, so it isn't shown.
                                return t ? { x: t.x, y: t.y, w: t.w, h: Number.NaN } : null
                              })()
                      if (!many && !rect) return null
                      const layers = many ? many.layers : [l!]
                      return (
                        <ArrangeBar
                          units={unitsFor(surface.kind)}
                          rect={rect}
                          kind={many ? 'group' : l!.type === 'text' || l!.type === 'shape' ? l!.type : 'photo'}
                          count={layers.length}
                          locked={layers.every((x) => isLocked(draft, i, x))}
                          onPlace={(r) => placeAll(i, [{ layer: l!, rect: { ...r, h: Number.isNaN(r.h) ? 0 : r.h } }])}
                          onAlign={alignActive}
                          onDistribute={distributeActive}
                          onDuplicate={duplicateActive}
                          onLock={lockActive}
                        />
                      )
                    })()}
                    {photoSelected && layer && (
                      <PhotoToolbar
                        moved={Boolean(slot?.moved)}
                        swapping={swapFrom !== null}
                        shape={
                          (slot ? slot.placement?.shape : surface.free.find((f) => f.id === freeSelected?.id)?.placement.shape) ??
                          'plain'
                        }
                        onShape={(shape) => edit((d) => setFrameShape(d, photoSelected, shape), selected)}
                        onSwap={() => setSwapFrom(photoSelected)}
                        onFront={() => edit((d) => restack(d, i, layer, 'front'), selected)}
                        onBack={() => edit((d) => restack(d, i, layer, 'back'), selected)}
                        onReset={() => slotSelected && edit((d) => resetFrame(d, slotSelected), selected)}
                        onRemove={() => edit((d) => takeOff(d, photoSelected))}
                      />
                    )}
                    {shapeSelected && (
                      <ShapeToolbar
                        shape={shapeSelected}
                        onChange={(change) => edit((d) => updateShape(d, i, shapeSelected.id, change), selected)}
                        onFront={() => edit((d) => restack(d, i, { type: 'shape', id: shapeSelected.id }, 'front'), selected)}
                        onBack={() => edit((d) => restack(d, i, { type: 'shape', id: shapeSelected.id }, 'back'), selected)}
                        onRemove={() => edit((d) => removeShape(d, i, shapeSelected.id))}
                      />
                    )}
                    {textSelected && (
                      <TextToolbar
                        text={textSelected}
                        onChange={(change) => edit((d) => updateText(d, i, textSelected.id, change), selected)}
                        onEdit={() => setEditingText(textSelected.id)}
                        onFront={() => edit((d) => restack(d, i, { type: 'text', id: textSelected.id }, 'front'), selected)}
                        onBack={() => edit((d) => restack(d, i, { type: 'text', id: textSelected.id }, 'back'), selected)}
                        onRemove={() => edit((d) => removeText(d, i, textSelected.id))}
                      />
                    )}
                  </div>
                  <figcaption>
                    <div className="caption-row">
                      <span className="tab tab--small">{caption(surface.kind, surface.label, i)}</span>
                      <PageActions
                        kind={surface.kind}
                        color={surface.color}
                        canMoveUp={draft[i - 1]?.kind === 'spread'}
                        canMoveDown={draft[i + 1]?.kind === 'spread'}
                        canAdd={spreadCount < MAX_SPREADS}
                        canRemove={spreadCount > 1}
                        onMove={(by) => edit((d) => moveSpread(d, i, by))}
                        onAddText={() => addTextTo(i)}
                        onAddShape={(kind) => addShapeTo(i, kind)}
                        onColor={(c) => edit((d) => setSurfaceColor(d, i, c))}
                        onAddSpread={() => edit((d) => insertSpread(d, i + 1, photos, paper, zineStyle, circles))}
                        onRemove={() => edit((d) => removeSpread(d, i))}
                      />
                    </div>
                    <LayoutPicker
                      zineStyle={zineStyle}
                      circles={circles}
                      kind={surface.kind}
                      aspect={surface.aspect}
                      current={surface.templateId}
                      onPick={(id) => edit((d) => relayout(d, i, id, photos, paper))}
                    />
                  </figcaption>
                </figure>
              )
            })}
          </div>
        ) : (
          <button className="empty" onClick={() => input.current?.click()}>
            <FlipText className="empty__big" text="Drop photos here" />
            <span className="empty__list">
              <span>☞ Bring {MIN_PHOTOS} or more finished photos.</span>
              <span>☞ They’re laid out as they are, never edited.</span>
              <span>☞ Everything stays on your computer.</span>
            </span>
            {photos.length > 0 && photos.length < MIN_PHOTOS && (
              <span className="tab tab--small">
                {MIN_PHOTOS - photos.length} more to go
              </span>
            )}
          </button>
        )}
      </main>

      {viewing && (
        <PhotoViewer
          photos={photos}
          places={places}
          lookAlikes={similar}
          startId={viewing}
          onPlace={(id) => {
            setGroup(null)
            setSwapFrom(null)
            setSelected({ type: 'photo', id })
          }}
          onClose={() => setViewing(null)}
        />
      )}

      {previewing && draft && (
        <Preview
          surfaces={surfaces}
          zineStyle={zineStyle}
          photos={byId}
          words={words}
          slides={!PAPER[paper].print}
          title={title.trim()}
          onClose={() => setPreviewing(false)}
        />
      )}

      {dragging && (
        <div className="dropping">
          <FlipText text="Drop to add" />
        </div>
      )}
    </div>
  )
}

export default App
