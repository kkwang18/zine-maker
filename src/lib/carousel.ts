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
  const target = Math.ceil(total / Math.ceil(total / SLIDES_PER_POST))
  const posts: number[][] = [[]]
  let slide = 0
  for (const count of perSurface) {
    const current = posts[posts.length - 1]
    if (current.length && current.length + count > target) posts.push([])
    for (let k = 0; k < count; k++) posts[posts.length - 1].push(slide++)
  }
  // Don't leave a straggler (often just the back cover) as a post of its own.
  const last = posts[posts.length - 1]
  const before = posts[posts.length - 2]
  if (before && last.length < target / 2 && before.length + last.length <= SLIDES_PER_POST) {
    before.push(...last)
    posts.pop()
  }
  return posts
}
