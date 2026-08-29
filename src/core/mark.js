import * as THREE from 'three'
import { UI } from './palette.js'

/**
 * THE SEISMIC MARK, traced off the emblem on Rocky's chest.
 *
 * Two mirrored crescents, horns converging on a narrow waist, bodies bulging
 * outward — and a SECOND, smaller crescent nested inside each one. Read as a
 * whole it is an hourglass of four arcs with a small eye in each lobe.
 *
 * ## Two wrong turns, recorded so neither happens again
 *
 * The first version had the outer crescents and no inner ones. Close, and
 * missing the detail that makes the emblem read as itself at any size.
 *
 * The second was worse: seismic.systems serves a faceted grey-plum GEM as its
 * favicon, so the mark was rebuilt as that gem. It is a real Seismic asset and
 * it is not this one — the emblem on the character sheet is what goes on the
 * character, and swapping in the site icon made the game less like the
 * reference rather than more. When these disagree, the sheet wins.
 *
 * The pink crystal is a THIRD thing and it is separate: an elongated hexagon,
 * set into the chest of the little ones and held in hand in the flying drawing.
 * It lives at the bottom of this file and it was always right.
 */

// One lune, solved rather than eyeballed.
//
// Both edges are circles centred on the x-axis, so the horns land at exactly
// ±HORN_Y and the two tips are guaranteed symmetrical — hand-placed bezier
// handles never quite are. The numbers below are for the LEFT lune; the right
// one is its mirror and nothing else.
//
//   horns    (-0.04, ±0.44)
//   outer    centre (-0.04, 0) radius 0.44   — bulges left to x = -0.48
//   inner    centre ( 0.6396, 0) radius 0.8096 — bulges left to x = -0.17
//
// Solved from `(hx-cx)² + hy² = r²` with `r = |bx-cx|`, which is why the outer
// edge comes out an exact semicircle.
const HORN_X = 0.0
const HORN_Y = 0.30

/** The circle through (HORN_X, ±HORN_Y) whose leftmost point is `bulge`.
 *  Solved from `(hx-cx)² + hy² = r²` with `r = |bulge - cx|`. */
function edgeCircle(bulge) {
  const cx = (HORN_X * HORN_X + HORN_Y * HORN_Y - bulge * bulge) / (2 * (HORN_X - bulge))
  const r = Math.abs(bulge - cx)
  return { cx, r, a: Math.atan2(HORN_Y, HORN_X - cx) }
}

const OUTER = edgeCircle(-0.50) // the back of the crescent
const INNER = edgeCircle(-0.355) // the bite out of it

/**
 * The left lune as a closed polyline.
 *
 * Flattened here rather than handed to `Shape.absarc`, on purpose. Arc
 * direction flags are the single easiest thing to get wrong in this shape —
 * one wrong sweep turns a lune into a disc with a bite out of it, and it does
 * not fail, it just draws the wrong logo — so the sweep is written out as
 * explicit angles that can be read and checked.
 */
function lunePoints(seg = 26) {
  const pts = []
  // Outer: top horn counter-clockwise round the LONG way, through π — the
  // leftmost point of the outer circle, and the back of the crescent.
  const outSweep = Math.PI * 2 - 2 * OUTER.a
  for (let i = 0; i <= seg; i++) {
    const a = OUTER.a + outSweep * (i / seg)
    pts.push([OUTER.cx + Math.cos(a) * OUTER.r, Math.sin(a) * OUTER.r])
  }
  // Inner: back from the bottom horn to the top one the SHORT way, clockwise,
  // through π again — the bite. Both arcs pass the same side of the axis, which
  // is what makes the result a crescent and not a ring.
  const inSweep = 2 * INNER.a - Math.PI * 2
  for (let i = 1; i < seg; i++) {
    const a = -INNER.a + inSweep * (i / seg)
    pts.push([INNER.cx + Math.cos(a) * INNER.r, Math.sin(a) * INNER.r])
  }
  return pts
}

/** Both lunes. Hand these to ExtrudeGeometry or ShapeGeometry as one array and
 *  the mark comes out as a single draw call. */
/**
 * The small crescent nested inside each lobe.
 *
 * Same construction as the outer lune at a smaller radius, pushed out toward
 * the belly of the lobe it sits in. On the emblem it is a thick little `C`
 * facing the centre, and it is the difference between the mark and a pair of
 * plain crescents.
 */
function innerPoints(seg = 20) {
  const S = 0.34 // scale against the outer lune
  const OX = -0.145 // pushed out into the belly of the lobe
  return lunePoints(seg).map(([x, y]) => [x * S + OX, y * S])
}

/** Both lunes and both inner crescents, as four contours. Hand them to
 *  ExtrudeGeometry as one array and the mark is a single draw call. */
export function markShapes() {
  const left = lunePoints()
  const inner = innerPoints()
  const shape = (pts, flip) => new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(flip ? -x : x, y)))
  return [shape(left, false), shape(inner, false), shape(left, true), shape(inner, true)]
}

let markGeoCache = null
/** The mark as a bevelled slab, one unit wide, facing +Z. Cached — a mark on a
 *  flag, a gate and forty coins is one geometry, not forty-two. */
export function markGeometry(depth = 0.16) {
  if (markGeoCache) return markGeoCache
  const geo = new THREE.ExtrudeGeometry(markShapes(), {
    depth, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.035, bevelSegments: 1, curveSegments: 14,
  })
  geo.center()
  geo.computeVertexNormals()
  markGeoCache = geo
  return geo
}

/** Flat, for anything that only needs the silhouette (decals, HUD plates). */
export function markFlatGeometry() {
  const geo = new THREE.ShapeGeometry(markShapes(), 14)
  geo.center()
  return geo
}

/** Both lunes as plain point arrays at `size`, y already flipped for screen
 *  space. One flattening routine feeds the canvas path and the SVG path, so a
 *  logo on the HUD and a logo on a flag cannot end up different shapes. */
function screenLunes(size) {
  const left = lunePoints(24)
  const inner = innerPoints(18)
  const at = (pts, flip) => pts.map(([x, y]) => [(flip ? -x : x) * size, -y * size])
  return [at(left, false), at(inner, false), at(left, true), at(inner, true)]
}

/** The mark traced into a Path2D, centred on the origin at `size` across. */
export function markPath2D(size = 1) {
  const p = new Path2D()
  for (const pts of screenLunes(size)) {
    pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)))
    p.closePath()
  }
  return p
}

/** The mark as an SVG path string, for the DOM. */
export function markSvgPath(size = 100) {
  return screenLunes(size)
    .map((pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ') + 'Z')
    .join(' ')
}

export function markSvg({ fill = 'currentColor', className = '' } = {}) {
  return `<svg class="${className}" viewBox="-52 -50 104 100" role="img" aria-label="Seismic" fill="${fill}"><path d="${markSvgPath(100)}"/></svg>`
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
