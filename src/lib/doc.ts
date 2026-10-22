import { STYLES } from './styles'
import type { Draft, PageColor, PaperSize, TitleFont, ZineStyle } from './types'

/**
 * Everything someone decides about their zine, apart from the photos
 * themselves: what undo steps through and what gets saved.
 */
export interface Doc {
  title: string
  byline: string
  backText: string
  paper: PaperSize
  zineStyle: ZineStyle
  pageColor: PageColor
  circles: boolean
  titleFont: TitleFont
  /** Which of the automatic sequence's alternatives to show. */
  variant: number
  /** Hand edits. Until someone rearranges something, the zine follows the automatic sequence. */
  manual: Draft | null
  /** Page numbers and a running head, repeated on every inside page. */
  folios: Folios
}

export interface Folios {
  numbers: boolean
  /** Where the numbers sit on each page; "outer" means the corner away from the fold. */
  position: 'bottom-outer' | 'bottom-centre' | 'top-outer'
  /** A line repeated at the top of every inside page (empty for none). */
  running: string
}

export const NEW_DOC: Doc = {
  title: '',
  byline: '',
  backText: '',
  paper: 'letter',
  zineStyle: 'quiet',
  pageColor: STYLES.quiet.page,
  circles: false,
  titleFont: STYLES.quiet.font,
  variant: 0,
  manual: null,
  folios: { numbers: false, position: 'bottom-outer', running: '' },
}

/** A doc saved by an older version may be missing newer settings: fill them in. */
export function upgradeDoc(saved: Partial<Doc>): Doc {
  return { ...NEW_DOC, ...saved, folios: { ...NEW_DOC.folios, ...saved.folios } }
}
