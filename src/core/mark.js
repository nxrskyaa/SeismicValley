import * as THREE from 'three'
import { UI } from './palette.js'

/**
 * THE SEISMIC MARK — traced from the logo at seismic.systems.
 *
 * This was two mirrored lunes for the whole life of the project, and two
 * mirrored lunes are not the Seismic logo. They are not on the site, they are
 * not on the character sheet, and they are not on anything the brand has ever
 * put its name to. The real mark is a **rough-cut crystal**: a seven-sided
 * silhouette, clearly taller than it is wide, broken into four flat facets that
 * run from a dark front-left face to a pale sliver down the right edge.
 *
 * The numbers below are measured, not drawn. The 128px favicon was masked, the
 * silhouette printed as a grid, and the vertices read off it — which is why the
 * outline is 59 units across and 87 tall rather than anything round.
 *
 * Facet tones sampled from the same file:
 *
 *   front    #5a3e49   the big dark face, left and centre
 *   top      #725a63   above and right of it
 *   edge     #928087   the narrow lit sliver down the right
 *   base     #7a646d   the lower right
 *
 * One shape, one set of facets, one place. The flag on the ridge, the badge on
 * the HUD, the plate on Rocky's chest and the favicon all read from here, so
 * they cannot drift apart again.
 */

/**
 * The silhouette, normalised so the crystal is 1.0 tall and 0.678 wide — its
 * real aspect. Centred on the origin, +Y up.
 */
const CRYSTAL = [
  [0.012, 0.500], // apex
  [0.257, 0.384], // right shoulder
  [0.339, 0.058], // right, upper
  [0.339, -0.151], // right, lower
  [0.199, -0.500], // base, right
  [-0.094, -0.500], // base, left
  [-0.339, -0.116], // left
]

/**
 * Where the facets meet inside the outline.
 *
 * `KINK` is where the edge leaving the apex stops falling straight and turns
 * out to the right; `HUB` is where three facet edges converge, a little below
 * centre and right of it. Both were read off the same grid as the outline.
 */
const KINK = [-0.006, 0.314]
const HUB = [0.225, -0.012]

/**
 * The four facets, darkest first.
 *
 * Every one is a closed polygon in the same space as the outline, so drawing
 * them in order fills the silhouette exactly with no seams to line up.
 */
export const MARK_FACETS = [
  { tone: '#5a3e49', points: [CRYSTAL[0], KINK, HUB, CRYSTAL[5], CRYSTAL[6]] },
  { tone: '#725a63', points: [CRYSTAL[0], CRYSTAL[1], HUB, KINK] },
  { tone: '#928087', points: [CRYSTAL[1], CRYSTAL[2], CRYSTAL[3], HUB] },
  { tone: '#7a646d', points: [HUB, CRYSTAL[3], CRYSTAL[4], CRYSTAL[5]] },
]

/** The outline as a THREE.Shape. Kept as an array of one so every caller that
 *  used to spread two lunes still works unchanged. */
export function markShapes() {
  const s = new THREE.Shape()
  s.moveTo(CRYSTAL[0][0], CRYSTAL[0][1])
  for (let i = 1; i < CRYSTAL.length; i++) s.lineTo(CRYSTAL[i][0], CRYSTAL[i][1])
  s.closePath()
  return [s]
}

let markGeoCache = null
/** The mark as a bevelled slab, facing +Z. Cached — a mark on a flag, a gate
 *  and forty coins is one geometry, not forty-two. */
export function markGeometry(depth = 0.16) {
  if (markGeoCache) return markGeoCache
  const geo = new THREE.ExtrudeGeometry(markShapes(), {
    depth, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1, curveSegments: 1,
  })
  geo.center()
  geo.computeVertexNormals()
  markGeoCache = geo
  return geo
}

/** Flat, for anything that only needs the silhouette (decals, HUD plates). */
export function markFlatGeometry() {
  const geo = new THREE.ShapeGeometry(markShapes(), 1)
  geo.center()
  return geo
}

/** Screen-space points at `size`, y flipped. One flattening routine feeds the
 *  canvas path and the SVG path, so the HUD and a flag cannot end up different
 *  shapes. */
const screenPts = (pts, size) => pts.map(([x, y]) => [x * size, -y * size])

/** The mark traced into a Path2D, centred on the origin at `size` across. */
export function markPath2D(size = 1) {
  const p = new Path2D()
  screenPts(CRYSTAL, size).forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)))
  p.closePath()
  return p
}

/** Each facet as its own Path2D, with the tone to fill it. */
export function markFacetPaths(size = 1) {
  return MARK_FACETS.map(({ tone, points }) => {
    const p = new Path2D()
    screenPts(points, size).forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)))
    p.closePath()
    return { tone, path: p }
  })
}

/** The mark as an SVG path string, for the DOM. */
export function markSvgPath(size = 100) {
  return screenPts(CRYSTAL, size)
    .map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ') + 'Z'
}

/** The mark as SVG. `flat` draws the silhouette in one colour — which is what a
 *  stencil cut into stone is; otherwise it draws all four facets. */
export function markSvg({ fill = 'currentColor', className = '', flat = true } = {}) {
  const body = flat
    ? `<path d="${markSvgPath(100)}"/>`
    : MARK_FACETS.map(({ tone, points }) => {
      const d = screenPts(points, 100).map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ')
      return `<path fill="${tone}" d="${d}Z"/>`
    }).join('')
  return `<svg class="${className}" viewBox="-40 -55 80 110" role="img" aria-label="Seismic" fill="${fill}">${body}</svg>`
}

/**
 * THE CRYSTAL — Seismic's pink stone.
 *
 * Read straight off the reference sheet: an **elongated hexagon**, pointed top
 * and bottom, with straight parallel sides between them, and clearly taller
 * than it is wide. It is not a rough shard and it is not a rounded gem; it is a
 * cut stone with six flat edges, and the drawing puts one facet line down the
 * right of it so the two halves catch different light.
 *
 * It is the mark Rocky wears on his chest, and the thing a geode holds.
 */
const SHARD_PTS = [
  [0, 0.5],       // top point
  [0.29, 0.2],    // upper right
  [0.29, -0.17],  // lower right
  [0, -0.5],      // bottom point
  [-0.29, -0.17], // lower left
  [-0.29, 0.2],   // upper left
]

export function shardShape() {
  const s = new THREE.Shape()
  s.moveTo(SHARD_PTS[0][0], SHARD_PTS[0][1])
  for (let i = 1; i < SHARD_PTS.length; i++) s.lineTo(SHARD_PTS[i][0], SHARD_PTS[i][1])
  s.closePath()
  return s
}

let shardGeoCache = null
export function shardGeometry() {
  if (shardGeoCache) return shardGeoCache
  // Bevelled hard and shallow: the reference's crystal is a flat cut stone, not
  // a chunky prism, so the depth stays well under its width.
  const geo = new THREE.ExtrudeGeometry(shardShape(), {
    depth: 0.3, bevelEnabled: true, bevelSize: 0.07, bevelThickness: 0.07, bevelSegments: 1, curveSegments: 1,
  })
  geo.center()
  geo.computeVertexNormals()
  shardGeoCache = geo
  return geo
}

export function shardPath2D(size = 1) {
  const p = new Path2D()
  SHARD_PTS.forEach(([x, y], i) => (i ? p.lineTo(x * size, -y * size) : p.moveTo(x * size, -y * size)))
  p.closePath()
  return p
}

/**
 * A canvas texture of the mark or the shard on a flat ground — the flag, the
 * banner and the crate stencil all take one of these. Powers of two, because a
 * non-power-of-two texture silently loses mipmaps and a flag at distance turns
 * into a shimmering smear.
 */
export function markTexture({ ink = UI.cream, ground = UI.ink, glyph = 'mark', size = 256, scale = 0.62 } = {}) {
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  const ctx = cv.getContext('2d')
  ctx.fillStyle = ground
  ctx.fillRect(0, 0, size, size)
  ctx.translate(size / 2, size / 2)
  if (glyph === 'shard') {
    ctx.fillStyle = ink
    ctx.fill(shardPath2D(size * scale))
  } else if (glyph === 'logo') {
    // The full mark, faceted. A flag carrying the brand should carry the brand.
    for (const { tone, path } of markFacetPaths(size * scale)) {
      ctx.fillStyle = tone
      ctx.fill(path)
    }
  } else {
    ctx.fillStyle = ink
    ctx.fill(markPath2D(size * scale))
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}
