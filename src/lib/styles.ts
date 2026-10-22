import type { PageColor, TitleFont, ZineStyle } from './types'

export const STYLES: Record<ZineStyle, { label: string; note: string; page: PageColor; font: TitleFont }> = {
  quiet: { label: 'Quiet', note: 'Black pages, big silences', page: 'black', font: 'garamond' },
  magazine: { label: 'Magazine', note: 'Bright, soft corners, playful', page: 'white', font: 'bagel' },
  collage: { label: 'Collage', note: 'Big, overlapping photos', page: 'black', font: 'dm-serif' },
}

/**
 * Fonts for the cover title. `width` is the average letter width in ems, so a
 * masthead can size itself to fit the cover whatever the font.
 */
export const TITLE_FONTS: Record<TitleFont, { label: string; family: string; width: number }> = {
  garamond: { label: 'Garamond', family: "'EB Garamond', Georgia, serif", width: 0.46 },
  'dm-serif': { label: 'DM Serif', family: "'DM Serif Display', Georgia, serif", width: 0.5 },
  bagel: { label: 'Bagel', family: "'Bagel Fat One', sans-serif", width: 0.56 },
  anton: { label: 'Anton', family: "'Anton', Impact, sans-serif", width: 0.42 },
  'space-mono': { label: 'Space Mono', family: "'Space Mono', ui-monospace, monospace", width: 0.62 },
}

/** Page colours, each with a text colour that reads on it. */
export const PAGE_COLORS: Record<PageColor, { label: string; page: string; text: string }> = {
  black: { label: 'Black', page: '#0a0a0a', text: 'rgb(221 216 204 / 0.85)' },
  white: { label: 'White', page: '#fbfaf6', text: '#0a0a0a' },
  sky: { label: 'Sky', page: '#dbeefc', text: '#0a0a0a' },
  mint: { label: 'Mint', page: '#b8d1c9', text: '#0a0a0a' },
  cream: { label: 'Cream', page: '#f1e6cf', text: '#0a0a0a' },
  yellow: { label: 'Yellow', page: '#ffd23f', text: '#0a0a0a' },
  red: { label: 'Red', page: '#ff5436', text: '#0a0a0a' },
  blue: { label: 'Blue', page: '#2f54eb', text: '#ffffff' },
  pink: { label: 'Pink', page: '#ff8fc7', text: '#0a0a0a' },
}
