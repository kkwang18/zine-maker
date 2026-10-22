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
}
