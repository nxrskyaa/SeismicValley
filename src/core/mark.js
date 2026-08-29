import * as THREE from 'three'
import { UI } from './palette.js'

/**
 * THE SEISMIC MARK — the real one, taken from the brand's own vector.
 *
 * This has been wrong three times and each wrong version shipped, so the source
 * is written down. The logo lockup at seismic.systems is
 * `framerusercontent.com/images/2cg0d3xmnPDzLY9KL9p8XXPi0.svg`: a 1474x428
 * wordmark whose glyph is a **faceted crystal**, five flat facets, 284 units
 * across by 420 tall. The FACET POLYGONS BELOW ARE THAT FILE'S OWN COORDINATES,
 * normalised to height 1 and centred — not traced, not remembered, parsed.
 *
 * The three wrong versions, so none of them comes back:
 *
 *   1. Two mirrored lunes. Not on the site and not on the character.
 *   2. The crystal, traced by eye off the 128px favicon. Right shape, and the
 *      trace is in fact accurate — overlaid on the official vector it lands on
 *      the facet boundaries — but it had no facets and read flat.
 *   3. Back to lunes with inner crescents, on the reasoning that the emblem on
 *      Rocky's chest is what the brand is. It is not: that emblem is a chest
 *      decoration on fan art, and the BRAND is the crystal.
 *
 * The silhouette is kept from the pixel trace because the vector's facets are
 * drawn with seam gaps and share no exact vertices, so their union cannot be
 * chained from the edges. Overlaid, the two agree.
 *
 * The pink shard at the bottom of this file is a THIRD thing and is unrelated:
 * an elongated hexagon set into the little ones' chests. It was always right.
 */

/** The silhouette, height 1.0, width 0.677 — the logo's real aspect. +Y up. */
const CRYSTAL = [
  [0.012, 0.5],
  [0.257, 0.384],
  [0.339, 0.058],
  [0.339, -0.151],
  [0.199, -0.5],
  [-0.094, -0.5],
  [-0.339, -0.116],
]

/** The five facets, exactly as the brand's vector draws them, darkest first. */
export const MARK_FACETS = [
  { tone: '#5a3e49', points: [[0.2181, 0.0012], [-0.1045, -0.4754], [-0.3384, -0.1084], [-0.021, 0.3135]] },
  { tone: '#725a63', points: [[0.2081, -0.5], [-0.0942, -0.5], [0.2314, -0.0116], [0.3384, -0.1419]] },
  { tone: '#7a646d', points: [[0.2544, 0.3861], [0.2222, 0.0262], [-0.0118, 0.3317], [-0.0012, 0.5]] },
  { tone: '#928087', points: [[0.3384, -0.1147], [0.2389, 0.0046], [0.267, 0.3181]] },
  { tone: '#4c333d', points: [[-0.0303, 0.3322], [-0.28, 0.0005], [-0.0215, 0.4728]] },
]

/** The outline as a THREE.Shape. An array of one, so every caller that used to
 *  spread two lunes still works unchanged. */
export function markShapes() {
  const s = new THREE.Shape()
  s.moveTo(CRYSTAL[0][0], CRYSTAL[0][1])
  for (let i = 1; i < CRYSTAL.length; i++) s.lineTo(CRYSTAL[i][0], CRYSTAL[i][1])
  s.closePath()
  return [s]
}

let markGeoCache = null
/** The mark as a bevelled slab facing +Z. Cached — a mark on a flag, a gate and
 *  forty coins is one geometry, not forty-two. */
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

/**
 * The mark as vertex-coloured flat geometry — all five facets, in their own
 * tones. For the places that carry the BRAND rather than a stencil cut into
 * stone: the flag, the gate lintel, the title card.
 */
export function markFacetGeometry() {
  const geos = []
  for (const { tone, points } of MARK_FACETS) {
    const shape = new THREE.Shape()
    shape.moveTo(points[0][0], points[0][1])
    for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1])
    shape.closePath()
    const g = new THREE.ShapeGeometry(shape, 1)
    const c = new THREE.Color().setStyle(tone, THREE.SRGBColorSpace)
    const n = g.attributes.position.count
    const col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3)
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    geos.push(g)
  }
  return geos
}

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
 *  stencil cut into stone is; otherwise it draws all five facets. */
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
  ctx.fillStyle = ink
  ctx.fill(glyph === 'shard' ? shardPath2D(size * scale) : markPath2D(size * scale))
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}
