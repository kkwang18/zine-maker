import type { Doc } from './doc'
import type { PhotoData } from './types'

// Autosave: the zine and its photos live in the browser's own database
// (IndexedDB), so closing the tab or refreshing picks up where you left off.
// Nothing leaves the computer.

const DB = 'zine-maker'
const PHOTOS = 'photos'
const STATE = 'state'

interface SavedState {
  doc: Doc
  /** Photo ids in tray order. */
  order: string[]
}

let opening: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(PHOTOS, { keyPath: 'id' })
      req.result.createObjectStore(STATE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return opening
}

/** Run one transaction and wait for it to finish. */
async function run<T>(
  stores: string[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const tx = (await db()).transaction(stores, mode)
  const req = work(tx)
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(req ? req.result : undefined)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export function savePhotos(photos: PhotoData[]) {
  return run([PHOTOS], 'readwrite', (tx) => {
    for (const p of photos) tx.objectStore(PHOTOS).put(p)
  })
}

export function deletePhoto(id: string) {
  return run([PHOTOS], 'readwrite', (tx) => {
    tx.objectStore(PHOTOS).delete(id)
  })
}

export function saveState(doc: Doc, order: string[]) {
  return run([STATE], 'readwrite', (tx) => {
    tx.objectStore(STATE).put({ doc, order } satisfies SavedState, 'current')
  })
}

/** Everything saved last time, or null if there's nothing. */
export async function loadSaved(): Promise<{ doc: Doc; photos: PhotoData[] } | null> {
  const state = (await run([STATE], 'readonly', (tx) => tx.objectStore(STATE).get('current'))) as SavedState | undefined
  if (!state) return null
  const all = ((await run([PHOTOS], 'readonly', (tx) => tx.objectStore(PHOTOS).getAll())) ?? []) as PhotoData[]
  const byId = new Map(all.map((p) => [p.id, p]))
  return { doc: state.doc, photos: state.order.flatMap((id) => byId.get(id) ?? []) }
}

/** Forget the saved zine and all its photos. */
export function clearSaved() {
  return run([PHOTOS, STATE], 'readwrite', (tx) => {
    tx.objectStore(PHOTOS).clear()
    tx.objectStore(STATE).clear()
  })
}
