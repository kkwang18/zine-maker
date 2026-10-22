# zine maker

Turns a set of finished photos into a zine: an 8-page one-sheet fold, a
stapled booklet, or an Instagram carousel. Three looks: Quiet (after the
Ravens-era photobooks), Magazine, and Collage.

Photos are never edited. The only change allowed is a small crop (at most 5%
per side) so a photo whose shape is close to a page can fill it edge to edge.

Everything runs in the browser; photos never leave the device.

```bash
npm install
npm run dev
```

## How it works

- `src/lib/analyze.ts` reads each photo (brightness, contrast, tonal range,
  detail, where the subject is, a near-duplicate hash). It only reads pixels.
- `src/lib/layouts.ts` is the layout vocabulary and the arc:
  cover → opening → peak → fade → back.
- `src/lib/fit.ts` places a photo in a slot, either filling it with a small
  crop or keeping its shape inside it.
- `src/lib/sequence.ts` scores every combination of layouts with the best
  photos for each, and offers the top results as "try another sequence".
- `src/lib/draft.ts` holds hand edits: moved photos, text boxes, spreads,
  page colours. `src/lib/useHistory.ts` gives them undo and redo.
- `src/lib/persist.ts` autosaves to the browser (IndexedDB);
  `src/lib/project.ts` saves and opens `.zine` project files.
- `src/lib/render.ts` draws pages for export, swapping each photo's original
  back in at the size it's printed. `exportPdf.ts` lays pages out for the
  one-sheet fold or a stapled booklet; `exportSlides.ts` makes Instagram slides.
