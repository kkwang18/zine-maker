import JSZip from 'jszip'
import type { Doc } from './doc'
import type { PhotoData, PhotoStats } from './types'

// A project file (.zine) is a zip: project.json with the zine, plus every
// original photo and its resized copies, so it opens anywhere exactly as saved.

const VERSION = 1

interface PhotoEntry extends Omit<PhotoData, 'file' | 'previewFile' | 'thumbFile' | 'stats'> {
  /** The hash is a bigint, which JSON can't hold; it's stored as hex. */
  stats: Omit<PhotoStats, 'hash'> & { hash: string }
  file: { path: string; type: string }
  preview: string | null
  thumb: string | null
}

interface ProjectJson {
  version: number
  doc: Doc
  photos: PhotoEntry[]
}

export async function saveProject(doc: Doc, photos: PhotoData[]): Promise<Blob> {
  const zip = new JSZip()
  const entries = photos.map((p): PhotoEntry => {
    const ext = p.name.includes('.') ? p.name.slice(p.name.lastIndexOf('.')) : ''
    const file = `photos/${p.id}${ext}`
    zip.file(file, p.file)
    if (p.previewFile) zip.file(`previews/${p.id}.jpg`, p.previewFile)
    if (p.thumbFile) zip.file(`thumbs/${p.id}.jpg`, p.thumbFile)
    const { file: _, previewFile: __, thumbFile: ___, stats, ...rest } = p
    return {
      ...rest,
      stats: { ...stats, hash: stats.hash.toString(16) },
      file: { path: file, type: p.file.type },
      preview: p.previewFile ? `previews/${p.id}.jpg` : null,
      thumb: p.thumbFile ? `thumbs/${p.id}.jpg` : null,
    }
  })
  zip.file('project.json', JSON.stringify({ version: VERSION, doc, photos: entries } satisfies ProjectJson, null, 2))
  // Photos are already compressed; zipping them again only costs time.
  return zip.generateAsync({ type: 'blob', compression: 'STORE' })
}

export async function openProject(file: Blob): Promise<{ doc: Doc; photos: PhotoData[] }> {
  const zip = await JSZip.loadAsync(file)
  const manifest = zip.file('project.json')
  if (!manifest) throw new Error('This isn’t a zine project file.')
  const json = JSON.parse(await manifest.async('string')) as ProjectJson
  if (json.version !== VERSION) throw new Error('This project was saved by a different version.')

  const blob = async (path: string | null, type: string) => {
    const entry = path ? zip.file(path) : null
    return entry ? new Blob([await entry.async('arraybuffer')], { type }) : null
  }
  const photos = await Promise.all(
    json.photos.map(async (p): Promise<PhotoData> => {
      const original = await blob(p.file.path, p.file.type)
      if (!original) throw new Error(`The project is missing ${p.name}.`)
      return {
        id: p.id,
        name: p.name,
        width: p.width,
        height: p.height,
        aspect: p.aspect,
        stats: { ...p.stats, hash: BigInt(`0x${p.stats.hash}`) },
        file: original,
        previewFile: await blob(p.preview, 'image/jpeg'),
        thumbFile: await blob(p.thumb, 'image/jpeg'),
      }
    }),
  )
  return { doc: json.doc, photos }
}
