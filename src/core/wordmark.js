import * as THREE from 'three'

/**
 * Seismic Valley's own letterforms.
 *
 * A logotype set in somebody else's font is somebody else's logotype, so the
 * title is cut here instead — from the same rule the Seismic mark and Rocky's
 * plates follow: orthogonal strokes, every corner cut at 45 degrees. The type,
 * the mark and the mascot are all quarried out of the same stone.
 *
 * It is also the last thing that could have fetched a file at runtime. There is
 * no font in this repository and no link to one.
 *
 * Each glyph is authored as plain orthogonal contours on a 140-unit cap height
 * with the baseline at y = 0 and y increasing UPWARD. `chamfer()` does all the
 * styling, which is why the tables below are boring to read: the facets are a
 * property of the typeface, not something re-typed into every letter.
 */

const CAP = 140 // cap height in glyph units
const CUT = 15 // corner chamfer — big enough to read as a 45-degree cut, not a radius

// contours[0] is the outline; anything after it is a counter (a hole).
const GLYPHS = {
  A: { w: 104, contours: [
    [[4, 0], [32, 0], [38, 44], [66, 44], [72, 0], [100, 0], [74, 140], [30, 140]],
    [[42, 70], [62, 70], [52, 116]],
  ] },
  B: { w: 92, contours: [
    [[6, 0], [72, 0], [88, 16], [88, 52], [76, 70], [88, 88], [88, 124], [72, 140], [6, 140]],
    [[32, 26], [62, 26], [62, 57], [32, 57]],
    [[32, 83], [62, 83], [62, 114], [32, 114]],
  ] },
  C: { w: 96, contours: [[[6, 0], [90, 0], [90, 26], [32, 26], [32, 114], [90, 114], [90, 140], [6, 140]]] },
  D: { w: 96, contours: [
    [[6, 0], [70, 0], [90, 22], [90, 118], [70, 140], [6, 140]],
    [[32, 26], [60, 26], [64, 34], [64, 106], [60, 114], [32, 114]],
  ] },
  E: { w: 92, contours: [[[6, 0], [88, 0], [88, 26], [32, 26], [32, 57], [78, 57], [78, 83], [32, 83], [32, 114], [88, 114], [88, 140], [6, 140]]] },
  F: { w: 88, contours: [[[6, 0], [32, 0], [32, 57], [78, 57], [78, 83], [32, 83], [32, 114], [88, 114], [88, 140], [6, 140]]] },
  G: { w: 100, contours: [[[6, 0], [94, 0], [94, 70], [52, 70], [52, 44], [68, 44], [68, 26], [32, 26], [32, 114], [94, 114], [94, 140], [6, 140]]] },
  H: { w: 100, contours: [[[6, 0], [32, 0], [32, 57], [68, 57], [68, 0], [94, 0], [94, 140], [68, 140], [68, 83], [32, 83], [32, 140], [6, 140]]] },
  I: { w: 52, contours: [[[13, 0], [39, 0], [39, 140], [13, 140]]] },
  // The hook is cut, not curved, for the same reason every other corner is.
  J: { w: 88, contours: [[[20, 46], [20, 0], [82, 0], [82, 140], [56, 140], [56, 26], [46, 26], [46, 46]]] },
  K: { w: 100, contours: [[[6, 0], [32, 0], [32, 52], [66, 0], [100, 0], [56, 66], [100, 140], [66, 140], [32, 86], [32, 140], [6, 140]]] },
  L: { w: 84, contours: [[[6, 0], [80, 0], [80, 26], [32, 26], [32, 140], [6, 140]]] },
  M: { w: 112, contours: [[[6, 0], [32, 0], [32, 100], [56, 58], [80, 100], [80, 0], [106, 0], [106, 140], [78, 140], [56, 98], [34, 140], [6, 140]]] },
  N: { w: 104, contours: [[[6, 0], [32, 0], [32, 86], [72, 0], [98, 0], [98, 140], [72, 140], [72, 54], [32, 140], [6, 140]]] },
  O: { w: 100, contours: [
    [[6, 20], [20, 0], [80, 0], [94, 20], [94, 120], [80, 140], [20, 140], [6, 120]],
    [[32, 26], [68, 26], [68, 114], [32, 114]],
  ] },
  P: { w: 92, contours: [
    [[6, 0], [32, 0], [32, 57], [88, 57], [88, 140], [6, 140]],
    [[32, 83], [62, 83], [62, 114], [32, 114]],
  ] },
  // The tail is a wedge taken OUT of the counter rather than added outside the
  // ring, so Q keeps O's advance width and the word it sits in keeps its rhythm.
  Q: { w: 100, contours: [
    [[6, 20], [20, 0], [80, 0], [94, 20], [94, 120], [80, 140], [20, 140], [6, 120]],
    [[32, 26], [52, 26], [68, 46], [68, 114], [32, 114]],
  ] },
  R: { w: 98, contours: [
    [[6, 0], [32, 0], [32, 57], [56, 57], [72, 0], [98, 0], [82, 57], [88, 57], [88, 140], [6, 140]],
    [[32, 83], [62, 83], [62, 114], [32, 114]],
  ] },
  S: { w: 92, contours: [[[6, 0], [88, 0], [88, 83], [32, 83], [32, 114], [88, 114], [88, 140], [6, 140], [6, 57], [62, 57], [62, 26], [6, 26]]] },
  T: { w: 96, contours: [[[35, 0], [61, 0], [61, 114], [92, 114], [92, 140], [4, 140], [4, 114], [35, 114]]] },
  U: { w: 100, contours: [[[6, 140], [32, 140], [32, 26], [68, 26], [68, 140], [94, 140], [94, 18], [78, 0], [22, 0], [6, 18]]] },
  V: { w: 100, contours: [[[6, 140], [32, 140], [50, 44], [68, 140], [94, 140], [62, 0], [38, 0]]] },
  W: { w: 112, contours: [[[6, 140], [32, 140], [32, 40], [56, 82], [80, 40], [80, 140], [106, 140], [106, 0], [78, 0], [56, 42], [34, 0], [6, 0]]] },
  X: { w: 96, contours: [[[4, 0], [30, 0], [48, 52], [66, 0], [92, 0], [62, 70], [92, 140], [66, 140], [48, 88], [30, 140], [4, 140], [34, 70]]] },
  Y: { w: 96, contours: [[[35, 0], [61, 0], [61, 66], [92, 140], [64, 140], [48, 98], [32, 140], [4, 140], [35, 66]]] },
  Z: { w: 98, contours: [[[6, 0], [92, 0], [92, 40], [42, 114], [92, 114], [92, 140], [6, 140], [6, 100], [56, 26], [6, 26]]] },

  0: { w: 92, contours: [
    [[6, 20], [20, 0], [72, 0], [86, 20], [86, 120], [72, 140], [20, 140], [6, 120]],
    [[32, 26], [60, 26], [60, 114], [32, 114]],
  ] },
  1: { w: 80, contours: [[[10, 0], [70, 0], [70, 26], [53, 26], [53, 140], [27, 140], [27, 26], [10, 26]]] },
  2: { w: 92, contours: [[[6, 0], [86, 0], [86, 26], [40, 26], [86, 90], [86, 120], [72, 140], [20, 140], [6, 120], [6, 96], [32, 96], [32, 114], [60, 114], [60, 102], [6, 36]]] },
  3: { w: 92, contours: [[[6, 20], [20, 0], [72, 0], [86, 20], [86, 58], [76, 70], [86, 82], [86, 120], [72, 140], [20, 140], [6, 120], [6, 100], [32, 100], [32, 114], [60, 114], [60, 83], [34, 83], [34, 57], [60, 57], [60, 26], [32, 26], [32, 40], [6, 40]]] },
  4: { w: 94, contours: [[[46, 0], [72, 0], [72, 44], [88, 44], [88, 70], [72, 70], [72, 140], [40, 140], [6, 70], [6, 44], [46, 44]]] },
  5: { w: 92, contours: [[[6, 0], [72, 0], [86, 20], [86, 58], [72, 78], [32, 78], [32, 114], [86, 114], [86, 140], [6, 140], [6, 52], [60, 52], [60, 26], [6, 26]]] },
  6: { w: 92, contours: [
    [[6, 20], [20, 0], [72, 0], [86, 20], [86, 58], [72, 78], [32, 78], [32, 114], [86, 114], [86, 140], [20, 140], [6, 120]],
    [[32, 26], [60, 26], [60, 52], [32, 52]],
  ] },
  7: { w: 92, contours: [[[30, 0], [58, 0], [86, 114], [86, 140], [6, 140], [6, 114], [56, 114]]] },
  8: { w: 92, contours: [
    [[6, 20], [20, 0], [72, 0], [86, 20], [86, 58], [78, 70], [86, 82], [86, 120], [72, 140], [20, 140], [6, 120], [6, 82], [14, 70], [6, 58]],
    [[26, 24], [66, 24], [66, 56], [26, 56]],
    [[26, 84], [66, 84], [66, 116], [26, 116]],
  ] },
  9: { w: 92, contours: [
    [[6, 120], [20, 140], [72, 140], [86, 120], [86, 82], [72, 62], [32, 62], [32, 26], [86, 26], [86, 0], [20, 0], [6, 20]],
    [[32, 114], [60, 114], [60, 88], [32, 88]],
  ] },

  '-': { w: 92, contours: [[[6, 57], [86, 57], [86, 83], [6, 83]]] },
  '.': { w: 58, contours: [[[16, 0], [42, 0], [42, 26], [16, 26]]] },
  '/': { w: 72, contours: [[[6, 0], [32, 0], [66, 140], [40, 140]]] },
  ' ': { w: 46, contours: [] },
}

/**
 * Cut every corner of a closed contour back along both of its edges. Convex and
 * concave corners are treated identically on purpose: a chamfer that only
 * touches the outside reads as a rounded font with sharp counters, which is
 * exactly the seam this typeface is trying not to have.
 */
function chamfer(points, cut = CUT) {
  const n = points.length
  const out = []
  const step = (here, towards) => {
    const dx = towards[0] - here[0]
    const dy = towards[1] - here[1]
    const len = Math.hypot(dx, dy) || 1
    // Never eat more than 45% of an edge, or the chamfers from both ends of a
    // short stroke meet in the middle and punch a notch through it.
    const k = Math.min(cut, len * 0.45)
    return [here[0] + (dx / len) * k, here[1] + (dy / len) * k]
  }
  for (let i = 0; i < n; i++) {
    const here = points[i]
    // Walking the contour you arrive at a corner along the incoming edge, so the
    // point back toward `prev` comes first. Emitting the pair in that order
    // keeps the chamfered contour in the source contour's winding.
    out.push(step(here, points[(i - 1 + n) % n]), step(here, points[(i + 1) % n]))
  }
  return out
}

const area = (pts) => {
  let a = 0
  for (let i = 0, n = pts.length; i < n; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % n]
    a += x1 * y2 - x2 * y1
  }
  return a / 2
}

/** Outlines wind counter-clockwise, counters clockwise. Authoring every contour
 *  by hand in the right direction is a bug waiting to happen, so the direction
 *  is decided here rather than trusted from the tables above. */
const wind = (pts, ccw) => ((area(pts) < 0) === ccw ? [...pts].reverse() : pts)

const cache = new Map()
function glyphContours(ch) {
  if (!cache.has(ch)) {
    const g = GLYPHS[ch]
    cache.set(ch, g ? g.contours.map((c, i) => chamfer(wind(c, i === 0))) : [])
  }
  return cache.get(ch)
}

/** Every character in `text` has a glyph. A missing one falls through to the
 *  space advance, which reads as a kerning bug rather than as a missing letter,
 *  so anything the game sets in its own type is asserted against this in
 *  tools/checks.js rather than trusted. */
export const canSet = (text) => [...text.toUpperCase()].every((ch) => ch in GLYPHS)

/** Advance width of `text` in glyph units, including tracking between letters. */
export function measure(text, tracking = 10) {
  const s = text.toUpperCase()
  let w = 0
  for (let i = 0; i < s.length; i++) {
    w += (GLYPHS[s[i]] ?? GLYPHS[' ']).w + (i < s.length - 1 ? tracking : 0)
  }
  return w
}

/**
 * THREE.Shapes for `text`, scaled so the cap height is exactly `size` and the
 * line is centred on the origin. Feed them straight to ExtrudeGeometry — it
 * takes an array — and the whole word comes out as one draw call.
 */
export function shapesFor(text, { size = 1, tracking = 10 } = {}) {
  const s = text.toUpperCase()
  const k = size / CAP
  let pen = -(measure(s, tracking) / 2)
  const shapes = []
  for (const ch of s) {
    const glyph = GLYPHS[ch] ?? GLYPHS[' ']
    let shape = null
    glyphContours(ch).forEach((contour, i) => {
      const pts = contour.map(([x, y]) => new THREE.Vector2((pen + x) * k, (y - CAP / 2) * k))
      if (i === 0) {
        shape = new THREE.Shape(pts)
        shapes.push(shape)
      } else {
        shape.holes.push(new THREE.Path(pts))
      }
    })
    pen += glyph.w + tracking
  }
  return shapes
}

/** An extruded, chamfer-faceted word ready to stand in the world as signage. */
export function textGeometry(text, { size = 1, tracking = 10, depth = 0.12 } = {}) {
  const geo = new THREE.ExtrudeGeometry(shapesFor(text, { size, tracking }), {
    depth, bevelEnabled: true, bevelSize: depth * 0.28, bevelThickness: depth * 0.28, bevelSegments: 1, curveSegments: 1,
  })
  geo.computeVertexNormals()
  return geo
}

/** The same letterforms as an SVG path, for the DOM logo. SVG's y runs down, so
 *  the contour is flipped here and nowhere else. */
export function svgPathFor(text, tracking = 10) {
  const s = text.toUpperCase()
  let pen = 0
  const parts = []
  for (const ch of s) {
    const glyph = GLYPHS[ch] ?? GLYPHS[' ']
    for (const contour of glyphContours(ch)) {
      parts.push(contour.map(([x, y], i) => `${i ? 'L' : 'M'}${(pen + x).toFixed(1)} ${(CAP - y).toFixed(1)}`).join(' ') + 'Z')
    }
    pen += glyph.w + tracking
  }
  return { d: parts.join(' '), width: pen - tracking, height: CAP }
}

/** `<svg>` markup for a wordmark, sized to its own advance width. Used by the
 *  title card and the HUD's corner mark; nothing else should build this string. */
export function svgWordmark(text, { fill = 'currentColor', tracking = 10, className = '' } = {}) {
  const { d, width, height } = svgPathFor(text, tracking)
  return `<svg class="${className}" viewBox="0 0 ${width.toFixed(1)} ${height}" role="img" aria-label="${text}" fill="${fill}"><path d="${d}"/></svg>`
}
