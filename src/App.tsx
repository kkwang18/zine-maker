import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { readDrag } from './components/dragItem'
import { FlipText } from './components/FlipText'
import { PhotoToolbar, TextToolbar } from './components/ItemToolbar'
import { LayoutPicker } from './components/LayoutPicker'
import { PageActions } from './components/PageActions'
import { PhotoTray } from './components/PhotoTray'
import { Preview } from './components/Preview'
import { SurfaceView, type SurfaceEditor } from './components/SurfaceView'
import { forget, loadPhoto, showable, stored } from './lib/analyze'
import {
  addText,
  clearSlot,
  moveFrame,
  moveSpread,
  placePhoto,
  removePhoto as withoutPhoto,
  removeSpread,
  removeText,
  renderDraft,
  resetFrame,
  restack,
  setSurfaceColor,
  swapSlots,
  updateText,
} from './lib/draft'
import { clearSaved, deletePhoto, loadSaved, savePhotos, saveState } from './lib/persist'
import { PAPER } from './lib/geometry'
import { findLayout, hasCircles, withoutCircles } from './lib/layouts'
import { fillEmptySlots, insertSpread, lookAlikes, MIN_PHOTOS, relayout, sequence } from './lib/sequence'
import { NEW_DOC, type Doc } from './lib/doc'
import { PAGE_COLORS, STYLES, TITLE_FONTS } from './lib/styles'
import { useHistory } from './lib/useHistory'
import type { Draft, FreeText, PageColor, PaperSize, Photo, SlotAddress, TextKind, TitleFont, ZineStyle } from './lib/types'
import './App.css'

const THIS_MONTH = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

/** Instagram carousels hold up to 20 slides: a cover, a back, and nine spreads. */
const MAX_SPREADS = 9

/** What's selected: a photo or empty slot on a page, a photo in the tray, or a text box. */
type Selection =
  | { type: 'slot'; at: SlotAddress }
  | { type: 'photo'; id: string }
  | { type: 'text'; surface: number; id: string }

/** Typing in a field or a text box shouldn't trigger page shortcuts. */
function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null
  return Boolean(el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)))
}

/** Save a file to the person's computer. */
function download(blob: Blob, name: string) {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = name
  link.click()
  // Give the browser a moment to start the download before letting go of the file.
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000)
}

/** A panel section with a folder-tab label. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="section">
      <h2 className="tab">{title}</h2>
      <div className="section__body">{children}</div>
    </section>
  )
}

function App() {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(0)
  const [failed, setFailed] = useState<string[]>([])
  // Everything undo can step through.
  const history = useHistory<Doc>(NEW_DOC)
  const { title, byline, backText, paper, zineStyle, pageColor, circles, titleFont, variant, manual } = history.present
  /** Change the zine as one undo step; `mergeKey` folds quick repeats (typing) into one. */
  const change = (patch: Partial<Doc>, mergeKey?: string) => history.update((d) => ({ ...d, ...patch }), mergeKey)
  const setManual = (next: Draft | null) => change({ manual: next })
  const [selected, setSelected] = useState<Selection | null>(null)
  // Waiting for a second photo or slot to swap with.
  const [swapFrom, setSwapFrom] = useState<SlotAddress | null>(null)
  const [editingText, setEditingText] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [previewing, setPreviewing] = useState(false)
  // Autosave: nothing is written until the last session has been read back in.
  const [ready, setReady] = useState(false)
  const [saveNote, setSaveNote] = useState('')
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
        history.reset(saved.doc)
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

  /** Apply a change to the zine. Most changes clear the selection; moving things keeps it. */
  const edit = (change: (d: Draft) => Draft, keep: Selection | null = null) => {
    if (draft) setManual(change(draft))
    setSelected(keep)
    setSwapFrom(null)
  }

  const deselect = () => {
    setSelected(null)
    setSwapFrom(null)
  }

  const sameSlot = (a: SlotAddress, b: SlotAddress) => a.surface === b.surface && a.slot === b.slot

  // Clicking a photo or slot on a page: finish a swap, drop in a tray photo, or select it.
  const clickSlot = (at: SlotAddress) => {
    if (swapFrom) {
      if (sameSlot(swapFrom, at)) setSwapFrom(null)
      else edit((d) => swapSlots(d, swapFrom, at), { type: 'slot', at })
    } else if (selected?.type === 'photo') {
      edit((d) => placePhoto(d, selected.id, at), { type: 'slot', at })
    } else {
      setSelected(selected?.type === 'slot' && sameSlot(selected.at, at) ? null : { type: 'slot', at })
    }
  }

  const clickTrayPhoto = (id: string) => {
    if (selected?.type === 'slot') edit((d) => placePhoto(d, id, selected.at), selected)
    else setSelected(selected?.type === 'photo' && selected.id === id ? null : { type: 'photo', id })
  }

  // Typing into a text box only lasts while it stays selected.
  const typingIn = selected?.type === 'text' && selected.id === editingText ? editingText : null

  const editorFor = (surface: number): SurfaceEditor => ({
    selectedSlot: selected?.type === 'slot' && selected.at.surface === surface ? selected.at.slot : null,
    selectedText: selected?.type === 'text' && selected.surface === surface ? selected.id : null,
    editingText: typingIn,
    swapping: swapFrom !== null,
    onSlotClick: (slot) => clickSlot({ surface, slot }),
    onSlotDrop: (slot, e) => {
      const item = readDrag(e)
      if (item) edit((d) => placePhoto(d, item.id, { surface, slot }), { type: 'slot', at: { surface, slot } })
    },
    onFrameChange: (slot, box) =>
      edit((d) => moveFrame(d, { surface, slot }, box), { type: 'slot', at: { surface, slot } }),
    onTextClick: (id) => {
      setSwapFrom(null)
      setSelected({ type: 'text', surface, id })
    },
    onTextEdit: (id) => {
      setSelected({ type: 'text', surface, id })
      setEditingText(id)
    },
    onTextChange: (id, change) => edit((d) => updateText(d, surface, id, change), { type: 'text', surface, id }),
    onTextEditEnd: () => setEditingText(null),
    onBackground: deselect,
  })

  const addTextTo = (surface: number) => {
    if (!draft) return
    const { draft: next, id } = addText(draft, surface)
    setManual(next)
    setSelected({ type: 'text', surface, id })
    setEditingText(id)
  }

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

  /** The print PDF, or Instagram slides, depending on the format. */
  const downloadZine = async () => {
    if (!book.current) return
    deselect()
    setExporting(true)
    setExportError('')
    try {
      // Let the cleared selection render first, so no outline ends up in the pictures.
      await new Promise(requestAnimationFrame)
      // The exporters are only loaded when first used, to keep the app quick to open.
      if (paper === 'instagram') {
        const { renderSlides, zipSlides } = await import('./lib/exportSlides')
        download(await zipSlides(await renderSlides(book.current)), `${fileName}-instagram.zip`)
      } else {
        const { renderPrintPdf } = await import('./lib/exportPdf')
        download(await renderPrintPdf(book.current, paper, title.trim()), `${fileName}-print.pdf`)
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err))
    } finally {
      setExporting(false)
    }
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
      await replaceAll(project.doc, project.photos.map(showable))
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
  const lengthNote = !PAPER[paper].print
    ? `${pageCount} slides at 1080 × 1350 for a carousel post. Each spread runs across two slides, so it pans as you swipe.`
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
      // In a text field, leave undo to the field itself.
      if (isTyping()) return
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
      if (!selected || selected.type === 'photo') return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        setManual(
          selected.type === 'slot'
            ? clearSlot(draft, selected.at)
            : removeText(draft, selected.surface, selected.id),
        )
        setSelected(null)
        return
      }
      const step = e.shiftKey ? 0.02 : 0.004
      const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
      if (!delta) return
      e.preventDefault()
      const [dx, dy] = delta
      if (selected.type === 'text') {
        const t = draft[selected.surface].texts?.find((x) => x.id === selected.id)
        // A run of nudges is one undo step.
        if (t) change({ manual: updateText(draft, selected.surface, t.id, { x: t.x + dx, y: t.y + dy }) }, 'nudge')
      } else {
        const dest = renderDraft(draft, byId, paper)[selected.at.surface].slots[selected.at.slot].placement?.dest
        if (dest) change({ manual: moveFrame(draft, selected.at, { ...dest, x: dest.x + dx, y: dest.y + dy }) }, 'nudge')
      }
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
  const editText = (kind: TextKind) => {
    const field = { title: titleField, byline: bylineField, colophon: backField }[kind].current
    field?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    field?.focus()
  }

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

        <Section title="Project">
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

        <Section title="Style">
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

        <Section title="Cover">
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
            <span>Title font</span>
            <div className="fonts" role="radiogroup" aria-label="Title font">
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

        <Section title="Back">
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

        <Section title="Photos">
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
                ? 'Now click a photo or empty slot on a page to put it there.'
                : selected?.type === 'slot'
                  ? 'Click a photo below to put it in the selected spot.'
                  : 'Drag a photo onto a page to place it. Click a photo on a page to move, resize or swap it.'}
            </p>
          )}

          <PhotoTray
            photos={photos}
            draft={draft}
            lookAlikes={similar}
            selectedId={selected?.type === 'photo' ? selected.id : null}
            onSelect={clickTrayPhoto}
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
          <div className="stage__bar" data-keep-selection>
            <button className="pill pill--small" disabled={!history.canUndo} onClick={undo} title="Undo (⌘Z)">
              ↶ Undo
            </button>
            <button className="pill pill--small" disabled={!history.canRedo} onClick={redo} title="Redo (⇧⌘Z)">
              ↷ Redo
            </button>
            <span className="stage__spacer" />
            {exportError && <span className="hint hint--warn">☞ Couldn’t export: {exportError}</span>}
            <button className="pill" onClick={() => setPreviewing(true)}>
              Preview
            </button>
            <button className="pill pill--solid" disabled={exporting} onClick={downloadZine}>
              {exporting ? 'Making…' : paper === 'instagram' ? 'Download slides' : 'Download PDF'}
            </button>
          </div>
        )}
        {draft ? (
          <div className="book" ref={book}>
            {surfaces.map((surface, i) => {
              const slotSelected = selected?.type === 'slot' && selected.at.surface === i ? selected.at : null
              const slot = slotSelected ? surface.slots[slotSelected.slot] : null
              const textSelected = selected?.type === 'text' && selected.surface === i ? selectedText : undefined
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
                  />
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
                        onColor={(c) => edit((d) => setSurfaceColor(d, i, c))}
                        onAddSpread={() => edit((d) => insertSpread(d, i + 1, photos, paper, zineStyle, circles))}
                        onRemove={() => edit((d) => removeSpread(d, i))}
                      />
                    </div>
                    {slotSelected && slot?.placement && (
                      <PhotoToolbar
                        moved={slot.moved}
                        swapping={swapFrom !== null}
                        onSwap={() => setSwapFrom(slotSelected)}
                        onFront={() => edit((d) => restack(d, i, { type: 'slot', slot: slotSelected.slot }, 'front'), selected)}
                        onBack={() => edit((d) => restack(d, i, { type: 'slot', slot: slotSelected.slot }, 'back'), selected)}
                        onReset={() => edit((d) => resetFrame(d, slotSelected), selected)}
                        onRemove={() => edit((d) => clearSlot(d, slotSelected))}
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
