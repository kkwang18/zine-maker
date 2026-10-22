/** Instagram allows up to 20 photos in one carousel post. */
export const SLIDES_PER_POST = 20

/**
 * Split a zine's slides into carousel posts of up to 20. `perSurface` is the
 * slide count of each surface in order (1 for the cover and back, 2 for a
 * spread). Spreads are never split between posts, so their panoramas stay
 * whole, and posts come out as even as that allows. Returns slide indices.
 */
export function carouselPosts(perSurface: number[]): number[][] {
  const total = perSurface.reduce((n, k) => n + k, 0)
  // Fill posts in order, starting a new one whenever the next surface won't fit under `cap`.
  const fill = (cap: number) => {
    const posts: number[][] = [[]]
    let slide = 0
    for (const count of perSurface) {
      if (posts[posts.length - 1].length + count > cap) posts.push([])
      for (let k = 0; k < count; k++) posts[posts.length - 1].push(slide++)
    }
    return posts
  }
  // As few posts as possible, then the smallest cap that still needs no more,
  // so posts come out even and the back cover is never stranded on its own.
  const fewest = fill(SLIDES_PER_POST).length
  let cap = Math.max(...perSurface, Math.ceil(total / fewest))
  while (fill(cap).length > fewest) cap++
  return fill(cap)
}
