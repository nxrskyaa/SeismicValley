import * as THREE from 'three'
import { CHUNK, Grid, LEVEL, N } from './grid.js'
import { G, GROUND, GROUND_KEYS } from '../core/palette.js'
import { applyWrappedLight } from '../core/kit.js'

/**
 * Chunk meshing.
 *
 * One quad per cell top, plus a banded cliff face wherever a neighbour sits
 * lower. The bands are the entire look of the valley: a cliff is not one colour
 * stretched down its face, it is a thin accent stratum, a thicker rust stratum
 * and then body rock, so a terrace reads as sedimentary rather than as a
 * staircase somebody painted brown.
 *
 * Two things here are load-bearing and both were learned the hard way:
 *
 * 1. **Winding.** three.js treats counter-clockwise-from-the-front as the front
 *    face. Every quad below is emitted accordingly. Get it backwards and you do
 *    not see a culling bug, you see "the lighting is broken" — because what you
 *    are actually looking at is the inside of the world.
 * 2. **Vertex colour space.** THREE.Color parses a hex as sRGB and stores it
 *    linear, and the buffer wants the linear numbers. Writing the raw hex bytes
 *    into the attribute instead produces a valley that is correct in shape and
 *    about 40% too bright in every mid-tone.
 */

// Stratum thicknesses in world units, read down from the top of a face.
//
// A level is 1.0 units, so these two together take about a third of a riser and
// the body takes the rest — which is what the reference shows: a dappled green
// lip, a band of rust under it, then pale rock all the way down.
/**
 * Per-face tints, baked into the vertex colour on top of the real lighting.
 *
 * Velion's numbers. Nothing here is textured, so this small extra separation is
 * what keeps a cube reading as a cube when the sun is low and the haze is thick.
 */
/**
 * Raised together, and the GAP between them is untouched.
 *
 * Measured against the footage: there, a wall face renders at 86% of the top it
 * sits under. Here it was 66% — the risers were a quarter darker than the thing
 * being described, which is why the terraces read as a bright shelf over a dark
 * slab and why the whole valley looked like flat colour with piping on it.
 *
 * The eight per cent between the two directions is the part that matters and it
 * is unchanged; both ends simply moved up. See `GROUND_WRAP` for the other half
 * of the correction.
 */
const FACE_X = 0.985
const FACE_Z = 0.905

/**
 * THE STRATA ON AN EXPOSED WALL, and they sit at the BOTTOM of it.
 *
 * Velion's `Palette.gd` documents the accent as "a ~0.10u band directly under
 * the surface" with the rust under that, and this project ported that reading
 * faithfully: two hairlines at the top of every riser and a long plain body
 * beneath them. `CLAUDE.md` is explicit that Velion "is close but not the same
 * thing" and that the FOOTAGE is the target, so the footage was measured rather
 * than remembered.
 *
 * Classifying every pixel of four frames and walking columns down through them,
 * 188 of 227 clean ground-to-ground crossings read
 *
 *     ground > PALE BODY > SAGE > RUST > ground
 *
 * — body on top, the colour at the base. Over 743 sampled walls the split is
 * body 41%, sage 20%, rust 39.5%, against this project's 68 / 14 / 18 stacked
 * the other way up. That single inversion is most of why the terraces read as a
 * bright shelf with a thin trim over a dark slab instead of as banded rock, and
 * why the whole valley felt like flat colour with piping on it.
 *
 * Fractions of ONE level, anchored to the foot of the wall: a three-level cliff
 * is pale rock with a stained base, not a cliff that is 40% rust.
 */
const SAGE = 0.20
const RUST = 0.395

/**
 * How far a band's edge wanders, per face.
 *
 * The measured boundaries are ragged — moss and mineral staining, not paint —
 * and a perfectly level line across a whole terrace is the single most
 * mechanical thing in the frame. Deterministic from the cell, so a chunk
 * remeshes to the same edge every time.
 */
const BAND_JITTER = 0.055
const wobble = (x, z, salt) => {
  const n = Math.sin((x * 12.9898 + z * 78.233 + salt * 37.719)) * 43758.5453
  return (n - Math.floor(n)) - 0.5
}

// Scratch colour, reused — building a THREE.Color per vertex allocates roughly
// 200k objects for one full remesh of the valley.
const col = new THREE.Color()
const LINEAR = {}
function linear(hex) {
  let v = LINEAR[hex]
  if (!v) {
    col.setStyle(hex, THREE.SRGBColorSpace)
    v = LINEAR[hex] = [col.r, col.g, col.b]
  }
  return v
}

/**
 * Per-cell value jitter — deliberately almost nothing.
 *
 * A wide range here looks like "texture" in a close-up and like a CHECKERBOARD
 * across a plateau, because every cell gets an independent value and the eye
 * assembles them into a grid. The reference's ground is flat, single-toned, and
 * carries its detail in scattered props instead. A range of a few percent is
 * enough to stop large flats banding and small enough that no pattern forms.
 */
function grain(x, z) {
  let h = (Math.imul(x, 0x27d4eb2d) ^ Math.imul(z, 0x165667b1)) >>> 0
  h = Math.imul(h ^ (h >>> 15), h | 1)
  return 0.985 + (((h ^ (h >>> 14)) >>> 0) / 4294967296) * 0.03
}

/**
 * Build one chunk's ground geometry. Returns a BufferGeometry positioned in
 * world space (not chunk-local), so the chunk mesh itself sits at the origin and
 * nothing has to keep a chunk offset in sync with the data.
 */
export function meshChunk(grid, cx, cz) {
  const pos = []
  const nor = []
  const rgb = []

  const push = (v, n, c) => {
    for (const p of v) pos.push(p[0], p[1], p[2])
    for (let i = 0; i < v.length; i++) nor.push(n[0], n[1], n[2])
    for (let i = 0; i < v.length; i++) rgb.push(c[0], c[1], c[2])
  }
  // A quad as two triangles, in the winding its caller already chose.
  const quad = (a, b, c, d, n, colour) => push([a, b, c, a, c, d], n, colour)

  const x0 = cx * CHUNK, z0 = cz * CHUNK

  for (let z = z0; z < z0 + CHUNK; z++) {
    for (let x = x0; x < x0 + CHUNK; x++) {
      const i = z * N + x
      const h = grid.height[i]
      const bands = GROUND[GROUND_KEYS[grid.ground[i]]]
      const y = h * LEVEL
      const g = grain(x, z)

      // -- top --------------------------------------------------------------
      // Cheap contact shading: a cell hemmed in by taller neighbours sits in a
      // hollow and should read darker. Four samples, not eight; the diagonal
      // pair adds a cost nobody can see at this camera distance.
      let occ = 0
      if (grid.h(x - 1, z) > h) occ++
      if (grid.h(x + 1, z) > h) occ++
      if (grid.h(x, z - 1) > h) occ++
      if (grid.h(x, z + 1) > h) occ++
      /**
       * FURROWS.
       *
       * Worked ground was a flat brown slab — a field only because the colour
       * said so. A ploughed field is rows, and at one quad per cell the way to
       * get rows is to alternate the top tone on a two-cell period along one
       * axis. Six per cent either way: enough to read as furrows from the play
       * camera, small enough that it never becomes a stripe pattern the eye
       * follows instead of the crop standing in it.
       *
       * Only worked ground gets it. Alternating the meadow would be the
       * checkerboard `grain` above exists to avoid.
       */
      const worked = grid.ground[i] === G.TILLED || grid.ground[i] === G.WET
      const furrow = worked ? (z % 2 === 0 ? 1.06 : 0.94) : 1
      /**
       * `occ` is the hollow a cell sits in; `shade` is what STANDS on it — a
       * canopy, a wall, a rock. Both multiply the top tone, and the second is
       * the one that stops the meadow reading as a single flat sheet with
       * objects pasted on. See `world/occlusion.js` for where the 0.87 floor
       * comes from.
       */
      const k = g * furrow * (1 - occ * 0.055) * grid.shade[i]
      const top = linear(bands[0])
      const topCol = [top[0] * k, top[1] * k, top[2] * k]
      quad([x, y, z + 1], [x + 1, y, z + 1], [x + 1, y, z], [x, y, z], [0, 1, 0], topCol)

      // -- cliff faces ------------------------------------------------------
      // Only ever drawn on the DOWNHILL side. Emitting both sides of a seam
      // doubles the triangle count and z-fights along every terrace edge.
      face(-1, 0)
      face(1, 0)
      face(0, -1)
      face(0, 1)

      function face(dx, dz) {
        const nx = x + dx, nz = z + dz
        // Off the edge of the world, drop to sea floor so the valley has a rim
        // rather than a hole you can see the skybox through.
        const nh = Grid.inBounds(nx, nz) ? grid.height[nz * N + nx] : 0
        if (nh >= h) return
        const yTop = h * LEVEL
        const yBot = nh * LEVEL
        /**
         * Built from the FOOT of the wall upward — rust, then sage, then
         * whatever height is left is body. The old loop ran the other way and
         * put both bands under the lip.
         */
        const rustT = LEVEL * RUST + wobble(x, z, dx * 3 + dz * 7) * BAND_JITTER
        const sageT = LEVEL * SAGE + wobble(x, z, dx * 11 + dz * 5 + 1) * BAND_JITTER
        const rustTop = Math.min(yTop, yBot + Math.max(0.04, rustT))
        const sageTop = Math.min(yTop, rustTop + Math.max(0.04, sageT))
        // band index into `bands`: 3 body, 1 sage accent, 2 rust.
        const slices = [[3, yTop, sageTop], [1, sageTop, rustTop], [2, rustTop, yBot]]
        let cursor = yTop
        for (const [band, top, bottom] of slices) {
          if (top - bottom <= 1e-6) continue
          const next = bottom
          cursor = top
          const c = linear(bands[band])
          /**
           * A BAKED TINT PER FACE DIRECTION, ported from Velion.
           *
           * The two wall orientations get DIFFERENT constants — 0.93 across X
           * and 0.855 across Z — and that asymmetry is the whole point. At a
           * forty-five degree camera you see both sets of risers at once, and
           * with one shared tint they merge into a single grey band and the
           * terraces stop reading as steps. Eight per cent apart is enough to
           * separate a face that turns away from you from one that turns
           * toward you, at every hour, before any lighting is involved.
           *
           * Baked rather than lit, because the sun moves and this distinction
           * must not: it is what tells you which way the ground is going.
           */
          const facing = dx !== 0 ? FACE_X : FACE_Z
          const shadeK = g * facing * (band === 3 ? 1 : 1.04)
          const colour = [c[0] * shadeK, c[1] * shadeK, c[2] * shadeK]
          emit(dx, dz, next, cursor, colour)
        }
      }

      function emit(dx, dz, yb, yt, colour) {
        if (dx === 1) quad([x + 1, yb, z + 1], [x + 1, yb, z], [x + 1, yt, z], [x + 1, yt, z + 1], [1, 0, 0], colour)
        else if (dx === -1) quad([x, yb, z], [x, yb, z + 1], [x, yt, z + 1], [x, yt, z], [-1, 0, 0], colour)
        else if (dz === 1) quad([x, yb, z + 1], [x + 1, yb, z + 1], [x + 1, yt, z + 1], [x, yt, z + 1], [0, 0, 1], colour)
        else quad([x + 1, yb, z], [x, yb, z], [x, yt, z], [x + 1, yt, z], [0, 0, -1], colour)
      }
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(rgb, 3))
  geo.computeBoundingSphere()
  return geo
}

/**
 * The single material every chunk shares.
 *
 * Flat shading is off: the normals above are already per-face constants, so
 * flatShading would only re-derive what is already correct and cost a normal
 * pass. Vertex colours carry the whole palette, which is why the valley is one
 * draw call per chunk and not one per material.
 */
/**
 * How far light wraps around a riser before it stops.
 *
 * At 0.42 a face turned away from the sun kept about a tenth of the key, so
 * every riser on the shaded side of the valley crushed toward ambient and the
 * terracing this file exists to produce went with it. The measured target is a
 * wall at 86% of its own top; two thirds of the shortfall was here and the rest
 * was in the face tints.
 *
 * This is the honest knob for it — it lifts surfaces turned AWAY from the sun
 * and barely touches the ones facing it, which is exactly the shape of the
 * error. Turning the ambient up instead would have lifted the tops as well and
 * flattened the very contrast being repaired.
 *
 * It is high, and deliberately so. The terrace read in this project does not
 * come from the dynamic light — `FACE_X` and `FACE_Z` are BAKED, and their eight
 * per cent gap separates the two wall directions before a lamp is involved, at
 * every hour. That is what makes it safe to soften the sun here: the shape
 * information does not live in it.
 */
export const GROUND_WRAP = 0.85

export function groundMaterial() {
  // Wrapped, or every riser facing away from the sun crushes into one dark mass
  // and the terracing this whole file exists to produce stops being visible.
  return applyWrappedLight(new THREE.MeshLambertMaterial({ vertexColors: true, dithering: true }), GROUND_WRAP)
}
