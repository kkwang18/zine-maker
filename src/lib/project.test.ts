import { describe, expect, it } from 'vitest'
import { stored } from './analyze'
import { NEW_DOC, upgradeDoc } from './doc'
import { cameraRoll } from '../test/fixtures'
import { openProject, saveProject } from './project'

describe('project files', () => {
  it('opens exactly what was saved', async () => {
    const photos = cameraRoll(3).map(stored)
    const doc = { ...NEW_DOC, title: 'Night Walks', manual: [{ kind: 'cover' as const, templateId: 'cover-framed', photoIds: [photos[0].id] }] }
    const back = await openProject(await saveProject(doc, photos))
    expect(back.doc).toEqual(doc)
    expect(back.photos.map((p) => p.id)).toEqual(photos.map((p) => p.id))
    for (const [i, p] of back.photos.entries()) {
      expect(p.stats).toEqual(photos[i].stats)
      expect(await p.file.text()).toBe(await photos[i].file.text())
    }
  })

  it('refuses a file that isn’t a project', async () => {
    await expect(openProject(new Blob(['not a zip']))).rejects.toThrow()
  })
})

describe('older saves', () => {
  it('fill in settings added since', () => {
    const { folios: _, ...old } = NEW_DOC
    expect(upgradeDoc(old).folios).toEqual(NEW_DOC.folios)
  })
})
