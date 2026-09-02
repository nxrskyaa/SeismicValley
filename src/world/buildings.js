import * as THREE from 'three'
import { applyWrappedLight, bake, bakedMat, chamferBox, COLUMN, FLARE, FLAT, glowMat, POINT, ROD, shardMat, stoneLump, TAPER, wedge } from '../core/kit.js'
import { markFacetGeometry, markFlatGeometry, markTexture, shardGeometry } from '../core/mark.js'
import { C, mix, shade, UI } from '../core/palette.js'
import { LEVEL } from './grid.js'

/**
 * The architecture of Seismic Valley.
 *
 * Everything built here is quarried from the same block as Rocky and cut by the
 * same rule, and one motif runs through all of it: **the lune arch**. Seismic's
 * mark is two crescents pinched at a narrow waist, and the shape between them —
 * the negative space, a tall opening that comes to a point — is a doorway. So
 * every door, window and gate in the valley is that opening, and the buildings
 * read as belonging to the mark without ever having the mark stamped on them.
 *
 * Structures are static, so each one is BAKED: authored as a list of kit parts,
 * flattened to a single vertex-coloured geometry, drawn in one call. A homestead
 * is forty blocks and one draw.
 */

// --- the lune arch ----------------------------------------------------------

/**
 * The opening: straight jambs, then two arcs that lean in and meet at a point.
 * The arcs are circles solved so they are tangent to the jambs where they leave
 * them — a pointed arch whose curve starts with a visible kink reads as a
 * mistake rather than as a style.
 */
export function luneArchShape(w = 1, h = 1.6, spring = 0.52) {
  const hw = w / 2
  const sy = h * spring // where the curve leaves the jamb
  const rise = h - sy
  // Circle through (hw, sy) and (0, h), tangent to the vertical at (hw, sy):
  // its centre sits on y = sy, so r follows from the apex condition.
  const r = (hw * hw + rise * rise) / (2 * hw)
  const cx = hw - r
  const a0 = 0 // (hw, sy) is at angle 0 from (cx, sy)
  const a1 = Math.atan2(rise, -cx)

  const s = new THREE.Shape()
  s.moveTo(-hw, 0)
  s.lineTo(hw, 0)
  s.lineTo(hw, sy)
  const seg = 12
  for (let i = 1; i <= seg; i++) {
    const a = a0 + (a1 - a0) * (i / seg)
    s.lineTo(cx + Math.cos(a) * r, sy + Math.sin(a) * r)
  }
  for (let i = seg - 1; i >= 1; i--) {
    const a = a0 + (a1 - a0) * (i / seg)
    s.lineTo(-(cx + Math.cos(a) * r), sy + Math.sin(a) * r)
  }
  s.lineTo(-hw, sy)
  s.closePath()
  return s
}

/** The arch as a solid slab — a tympanum, a niche back, a sign board. */
export function luneArch(w, h, depth = 0.12) {
  const geo = new THREE.ExtrudeGeometry(luneArchShape(w, h), {
    depth, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1, curveSegments: 1,
  })
  geo.computeVertexNormals()
  return geo
}

// --- masonry ----------------------------------------------------------------


const WALL_TONES = [UI.stone, UI.stoneMid, UI.stoneLit]
const DARK_TONES = [UI.stoneDeep, UI.stoneDark, UI.stoneMid]


/**
 * The roof tone, and the whole reason the house reads.
 *
 * A deep oxblood against pale plaster. Reference town builders put a saturated
 * roof on a pale body and the two masses never merge; this project had brown
 * walls under a brown roof and the building came out as one lump of stone. It
 * stays inside the Seismic warm band — separation is about VALUE and saturation,
 * not about leaving the palette.
 */
const ROOF_DEFAULT = '#8f4436'

/**
 * A plain plastered shell: four walls in one pale tone, with a stone base
 * course. The log-coursing routine is still used by the sheds and the crate,
 * where a stack of rough timbers is right; a dwelling is rendered instead of
 * built out of logs, and the difference is what makes it read as a HOUSE.
 */
function wallShell(parts, { w, d, h, doorW = 0, wall = UI.creamWarm }) {
  const base = 0.26
  parts.push({ geometry: chamferBox(w + 0.12, base, d + 0.12, 0.05), position: [0, base / 2 + 0.14, 0], color: UI.stoneMid })
  for (const [sx, sz, ww, dd] of [[0, -d / 2, w, 0.28], [0, d / 2, w, 0.28], [-w / 2, 0, 0.28, d], [w / 2, 0, 0.28, d]]) {
    parts.push({ geometry: chamferBox(ww, h - base, dd, 0.06), position: [sx, base + (h - base) / 2 + 0.14, sz], color: wall })
  }
  // Corner pilasters, a shade darker. Cheap, and they stop a big pale box
  // reading as a single flat plane from any angle.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push({ geometry: chamferBox(0.34, h - base, 0.34, 0.06), position: [sx * (w / 2 - 0.02), base + (h - base) / 2 + 0.14, sz * (d / 2 - 0.02)], color: shade(wall, 0.88) })
    }
  }
  if (doorW) {
    parts.push({ geometry: chamferBox(doorW + 0.1, h * 0.8, 0.34, 0.05), position: [0, 0.14 + h * 0.4, d / 2], color: UI.creamShade })
  }
}

// --- the buildings ----------------------------------------------------------

/**
 * The homestead, in four tiers.
 *
 * Each tier is the previous one plus something the player can point at: tier 2
 * adds the porch, tier 3 the upper storey and the kiln flue, tier 4 the tower
 * with the shard lantern. An upgrade that only changes a number in a panel is an
 * upgrade nobody remembers buying.
 */
export function homestead(tier = 1, opts = {}) {
  const t = Math.max(1, Math.min(4, tier))
  const w = opts.w ?? [4.4, 5.2, 6.0, 6.8][t - 1]
  const d = opts.d ?? [3.6, 4.2, 4.8, 5.4][t - 1]
  // Wall height, and it is deliberately LOW relative to the roof — see below.
  const h = opts.h ?? [1.95, 2.15, 2.85, 3.05][t - 1]
  const ROOF = opts.roof ?? ROOF_DEFAULT
  const ROOF_DARK = opts.roofDark ?? shade(ROOF, 0.62)
  const WALL = opts.wall ?? UI.creamWarm
  const parts = []

  // Plinth. Every building in the valley stands on one, because the ground
  // moves and a wall that starts at soil level reads as sinking into it.
  parts.push({ geometry: chamferBox(w + 0.5, 0.28, d + 0.5, 0.07), position: [0, 0.14, 0], color: UI.stoneDark })

  // --- the walls -------------------------------------------------------------
  // PALE, and that is the change. They used to be the same brown family as the
  // roof and the whole building read as one lump of stone.
  const panes = []
  wallShell(parts, { w, d, h, doorW: 1.3, wall: WALL })

  /**
   * WINDOWS AS A ROW, not as one feature.
   *
   * Small dark panes in light frames, evenly spaced along both long faces. A
   * building with one window has a window; a building with a row of them has
   * floors, and the eye reads the storeys off the spacing without being told.
   */
  const cols = Math.max(2, Math.round((w - 1.9) / 1.15))
  const rows = t >= 3 ? 2 : 1
  for (let r = 0; r < rows; r++) {
    const y = h * (rows === 1 ? 0.52 : 0.34 + r * 0.4)
    for (let c = 0; c < cols; c++) {
      const x = (c - (cols - 1) / 2) * ((w - 1.5) / Math.max(1, cols - 1))
      // Skip the middle of the front row: that is where the door is.
      const overDoor = r === 0 && Math.abs(x) < 0.85
      for (const side of [1, -1]) {
        if (side === 1 && overDoor) continue
        parts.push({ geometry: chamferBox(0.62, 0.72, 0.1, 0.03), position: [x, y, side * (d / 2 + 0.15)], color: UI.creamDeep })
        parts.push({ geometry: chamferBox(0.44, 0.54, 0.06, 0.02), position: [x, y, side * (d / 2 + 0.2)], color: UI.stoneShadow })
        panes.push({ at: [x, y, side * (d / 2 + 0.23)], size: [0.4, 0.5], rot: side === 1 ? 0 : Math.PI })
      }
    }
  }
  // And one on each gable end.
  for (const side of [-1, 1]) {
    parts.push({ geometry: chamferBox(0.1, 0.62, 0.52, 0.03), position: [side * (w / 2 + 0.15), h * 0.52, 0], color: UI.creamDeep })
    parts.push({ geometry: chamferBox(0.06, 0.44, 0.36, 0.02), position: [side * (w / 2 + 0.2), h * 0.52, 0], color: UI.stoneShadow })
    panes.push({ at: [side * (w / 2 + 0.23), h * 0.52, 0], size: [0.32, 0.4], rot: side * Math.PI / 2 })
  }

  // --- the doorway -----------------------------------------------------------
  // The lune arch is the game's own motif and it stays: a recessed dark reveal
  // with a lighter surround, and the mark cut into the lintel above it.
  parts.push({ geometry: luneArch(1.3, h * 0.74, 0.1), position: [0, 0.28, d / 2 + 0.06], color: UI.stoneShadow })
  parts.push({ geometry: luneArch(1.52, h * 0.8, 0.14), position: [0, 0.24, d / 2 - 0.02], color: UI.creamDeep })
  parts.push({ geometry: chamferBox(1.8, 0.3, 0.36, 0.06), position: [0, h * 0.8 + 0.3, d / 2], color: UI.stonePale })
  parts.push({ geometry: markFlatGeometry(), position: [0, h * 0.8 + 0.3, d / 2 + 0.2], scale: [0.34, 0.34, 1], color: UI.stoneDeep })
  panes.push({ at: [0, h * 0.36, d / 2 + 0.14], size: [0.9, h * 0.6], rot: 0 })

  /**
   * THE ROOF, which is now the building.
   *
   * Half the height and overhanging the walls by a fifth of a metre on every
   * side. That proportion is the single biggest thing separating a house that
   * reads as a house from a box with a lid: the eye finds the roof first, and a
   * roof that stops flush at the wall reads as a lid.
   *
   * A saturated tone against pale walls, for the same reason — one colour for
   * the roof and one for the body, far apart, so the two masses never merge.
   */
  const roofH = h * 0.62
  const eave = 0.38
  parts.push({ geometry: wedge(w + eave * 2, roofH, d + eave * 2), position: [0, h, 0], color: ROOF })
  // The ridge beam, and the two eave boards. Trim in the wall colour, which is
  // what ties the roof back to the body instead of letting it float.
  parts.push({ geometry: chamferBox(w + eave * 2 + 0.2, 0.16, 0.2, 0.04), position: [0, h + roofH + 0.02, 0], color: ROOF_DARK })
  for (const side of [-1, 1]) {
    parts.push({ geometry: chamferBox(w + eave * 1.2, 0.14, 0.18, 0.035), position: [0, h + 0.06, side * (d / 2 + eave)], color: UI.creamWarm })
  }

  /**
   * DORMERS. Two, on the front pitch.
   *
   * They break the roof plane, and a roof this size needs breaking or it is a
   * tent. Each is a small box with its own little wedge on top, pushed far
   * enough forward that it clears the slope.
   */
  const dormerN = 2
  for (let i = 0; i < dormerN; i++) {
    const x = dormerN === 1 ? 0 : (i - 0.5) * w * 0.5
    const y = h + roofH * 0.30
    const z = d * 0.5 - roofH * 0.42
    parts.push({ geometry: chamferBox(0.86, 0.62, 0.8, 0.05), position: [x, y, z], color: UI.creamWarm })
    parts.push({ geometry: wedge(1.02, 0.42, 0.94), position: [x, y + 0.31, z], color: ROOF })
    parts.push({ geometry: chamferBox(0.42, 0.4, 0.06, 0.02), position: [x, y + 0.02, z + 0.42], color: UI.stoneShadow })
    panes.push({ at: [x, y + 0.02, z + 0.46], size: [0.38, 0.36], rot: 0 })
  }

  // --- the chimney -----------------------------------------------------------
  parts.push({ geometry: chamferBox(0.5, roofH * 0.95 + 0.5, 0.5, 0.06), position: [w / 2 - 0.85, h + roofH * 0.55, -d / 4], color: UI.stoneMid })
  parts.push({ geometry: chamferBox(0.66, 0.16, 0.66, 0.04), position: [w / 2 - 0.85, h + roofH * 1.05 + 0.28, -d / 4], color: UI.stoneDark })

  if (t >= 2) {
    // Porch: two posts and a canopy over the door.
    for (const side of [-1, 1]) {
      parts.push({ geometry: COLUMN, position: [side * (w / 2 - 0.5), 0.95, d / 2 + 1.05], scale: [0.2, 1.9, 0.2], color: C.trunk })
    }
    parts.push({ geometry: wedge(w - 0.4, 0.5, 1.7), position: [0, 1.9, d / 2 + 0.6], color: ROOF })
    parts.push({ geometry: chamferBox(w + 0.2, 0.2, 0.2, 0.05), position: [0, 0.2, d / 2 + 1.25], color: UI.stoneDark })
  }
  if (t >= 4) {
    // The tower and its shard lantern — visible from the ridge, which is the
    // point of it.
    parts.push({ geometry: chamferBox(1.5, 2.4, 1.5, 0.1), position: [-w / 2 + 0.7, h + 1.2, -d / 4], color: UI.creamShade })
    parts.push({ geometry: wedge(1.9, 0.8, 1.9), position: [-w / 2 + 0.7, h + 2.4, -d / 4], color: ROOF })
    parts.push({ geometry: shardGeometry(), position: [-w / 2 + 0.7, h + 3.15, -d / 4], scale: [0.42, 0.55, 0.34], color: UI.rose })
  }
  return {
    geometry: bake(parts),
    footprint: [Math.ceil(w) + 2, Math.ceil(d) + 3],
    height: h + roofH,
    panes,
    lamp: [0, h * 0.5, d / 2 + 0.6],
  }
}

/**
 * THE RIDGE GATE — Rocky's post.
 *
 * Two monoliths cut as half-lunes, facing each other across the path so the gap
 * between them IS the mark at building scale. Nothing about it is decorated;
 * the shape is the decoration.
 */
/**
 * THE ROOFS OF THE OLD STREET.
 *
 * Four tones, so a row of houses is a row of houses rather than one house
 * stamped four times. All of them sit in the warm band and all of them are far
 * enough from the pale plaster that the two masses never merge — which is the
 * whole lesson of the reference town: saturated roof, pale body, no exceptions.
 */
export const COTTAGE_ROOFS = ['#8f4436', '#6d5a86', '#4f6b62', '#a8703a']

/**
 * A COTTAGE. The same building as the homestead, smaller and in somebody
 * else's colours.
 *
 * These are the colony's, and they are EMPTY. A tidy street of houses with
 * nobody in any of them says more about what happened here than another ruin
 * would: the rollback did not knock anything down, it simply removed everyone.
 */
export function cottage(variant = 0) {
  const v = Math.abs(Math.round(variant)) % 4
  return homestead(1, {
    w: [3.6, 4.0, 3.4, 4.4][v],
    d: [3.0, 3.2, 3.0, 3.4][v],
    h: [1.75, 1.9, 1.65, 2.0][v],
    roof: COTTAGE_ROOFS[v],
    wall: [UI.creamWarm, UI.parchment, UI.cream, UI.creamShade][v],
  })
}

/**
 * THE SEISMIC RELAY — the one building that carries the brand.
 *
 * A monument rather than a dwelling: a stepped stone mass, a tall lune arch cut
 * clean through it, and the mark set into the head of the arch in its own five
 * facets. The crystal on the finial is the only lit thing in the valley that is
 * not somebody's window.
 *
 * It is the Loom's, not yours. Everything about it is squarer, taller and more
 * deliberate than the houses — the houses were built by people and this was
 * assembled by the lattice, and the silhouette should say so before any text
 * does.
 */
export function relay() {
  const parts = []
  const w = 5.2
  const d = 3.4
  const h = 5.6

  // A three-step plinth. The steps are the thing that reads as ceremony.
  for (let i = 0; i < 3; i++) {
    const k = 1 - i * 0.12
    parts.push({
      geometry: chamferBox((w + 1.8) * k, 0.3, (d + 1.8) * k, 0.06),
      position: [0, 0.15 + i * 0.3, 0],
      color: i === 2 ? UI.stoneMid : UI.stoneDark,
    })
  }

  // Two piers and a lintel: the gap between them IS the arch.
  for (const side of [-1, 1]) {
    parts.push({ geometry: chamferBox(1.5, h, d, 0.12), position: [side * (w / 2 - 0.15), h / 2 + 0.9, 0], color: UI.stone })
    parts.push({ geometry: chamferBox(1.7, 0.36, d + 0.2, 0.08), position: [side * (w / 2 - 0.15), h + 0.72, 0], color: UI.stonePale })
    // A vertical seam of darker stone down each pier, so a five-metre face is
    // not one flat plane.
    parts.push({ geometry: chamferBox(0.34, h - 0.8, 0.06, 0.03), position: [side * (w / 2 - 0.15), h / 2 + 0.9, d / 2 + 0.02], color: UI.stoneDeep })
  }
  parts.push({ geometry: chamferBox(w + 1.4, 0.8, d + 0.4, 0.12), position: [0, h + 1.3, 0], color: UI.stoneDeep })
  parts.push({ geometry: chamferBox(w + 1.0, 0.3, d + 0.1, 0.07), position: [0, h + 1.85, 0], color: UI.stoneMid })

  // The arch, cut through, with a dark reveal behind it.
  parts.push({ geometry: luneArch(2.5, 4.2, 0.4), position: [0, 1.0, -0.2], color: UI.stoneShadow })
  parts.push({ geometry: luneArch(2.9, 4.6, 0.3), position: [0, 0.9, d / 2 - 0.1], color: UI.stoneLit })

  // The finial: a stepped cap and the crystal above it.
  parts.push({ geometry: FLARE, position: [0, h + 2.3, 0], scale: [2.2, 0.7, 2.0], color: UI.stonePale })

  return {
    geometry: bake(parts),
    footprint: [8, 6],
    height: h + 3.4,
    // The mark, in its own five facets, on the lintel. Not a stencil: this is
    // the one building in the valley that carries the brand rather than
    // referring to it.
    facetMark: { at: [0, h + 1.3, d / 2 + 0.25], scale: 1.5 },
    shardAt: [0, h + 3.1, 0],
    shardScale: 0.62,
    lamp: [0, h + 3.1, 0],
    panes: [{ at: [0, 2.6, d / 2 + 0.22], size: [1.9, 3.0], rot: 0 }],
  }
}

export function ridgeGate() {
  const parts = []
  for (const side of [-1, 1]) {
    parts.push({ geometry: chamferBox(1.1, 4.6, 1.1, 0.14), position: [side * 2.0, 2.3, 0], color: UI.stoneLit })
    parts.push({ geometry: chamferBox(1.35, 0.4, 1.35, 0.09), position: [side * 2.0, 0.2, 0], color: UI.stoneDark })
    parts.push({ geometry: chamferBox(1.3, 0.36, 1.3, 0.08), position: [side * 2.0, 4.66, 0], color: UI.stonePale })
    // The half-lune: a crescent of stone leaning in toward its twin.
    parts.push({ geometry: TAPER, position: [side * 1.45, 3.3, 0], scale: [0.55, 2.6, 0.9], color: UI.stonePale })
  }
  // The lintel, and the mark hung under it.
  parts.push({ geometry: chamferBox(5.4, 0.5, 1.0, 0.1), position: [0, 5.1, 0], color: UI.stoneDeep })
  parts.push({ geometry: chamferBox(4.4, 0.34, 0.5, 0.07), position: [0, 4.66, 0.3], color: UI.stoneShadow })
  parts.push({ geometry: markFlatGeometry(), position: [0, 4.66, 0.58], scale: [1.6, 1.6, 1], color: UI.creamDeep })
  // Steps up to it.
  for (let i = 0; i < 3; i++) {
    parts.push({ geometry: chamferBox(5.2 - i * 0.5, 0.22, 1.0, 0.05), position: [0, 0.11 + i * 0.2, 2.2 - i * 0.7], color: i % 2 ? UI.stoneMid : UI.stone })
  }
  return { geometry: bake(parts), footprint: [7, 7], height: 5.6 }
}

/** The kiln: a tapered stack with a hot mouth. Where stone becomes brick and
 *  ash glass, and the one warm light in the valley after dark. */
export function kiln() {
  const parts = [
    { geometry: chamferBox(2.4, 0.36, 2.4, 0.08), position: [0, 0.18, 0], color: UI.stoneDark },
    { geometry: FLARE, position: [0, 1.1, 0], scale: [2.2, 1.9, 2.2], color: UI.stone },
    { geometry: TAPER, position: [0, 2.4, 0], scale: [1.5, 1.0, 1.5], color: UI.stoneMid },
    { geometry: FLAT, position: [0, 2.95, 0], scale: [1.0, 0.2, 1.0], color: UI.stoneDark },
    { geometry: luneArch(0.8, 1.0, 0.3), position: [0, 0.32, 0.72], color: UI.stoneShadow },
    { geometry: chamferBox(1.2, 0.22, 0.3, 0.05), position: [0, 1.4, 0.78], color: UI.stonePale },
  ]
  return { geometry: bake(parts), footprint: [4, 4], height: 3.1, glow: [0, 0.7, 0.9] }
}

/** The quarry shed: posts, a roof, and a lot of stone stacked under it. */
export function shed() {
  const parts = [
    { geometry: chamferBox(4.6, 0.24, 3.4, 0.06), position: [0, 0.12, 0], color: UI.stoneDark },
  ]
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push({ geometry: COLUMN, position: [sx * 1.9, 1.15, sz * 1.35], scale: [0.24, 2.3, 0.24], color: C.trunk })
    }
  }
  parts.push({ geometry: wedge(5.4, 0.9, 4.0), position: [0, 2.3, 0], color: UI.stoneDeep })
  parts.push({ geometry: chamferBox(5.6, 0.12, 0.16, 0.035), position: [0, 2.34, 2.0], color: UI.creamShade })
  // The stock: three lumps of cut stone, which is what tells you what the shed
  // is for without a sign on it.
  parts.push({ geometry: stoneLump(3, { radius: 0.5, height: 0.7 }), position: [-1.1, 0.47, -0.5], color: UI.stoneMid })
  parts.push({ geometry: stoneLump(9, { radius: 0.42, height: 0.6 }), position: [-0.4, 0.42, -0.9], color: UI.stone })
  parts.push({ geometry: chamferBox(1.1, 0.5, 0.8, 0.06), position: [1.2, 0.37, -0.4], color: UI.stoneLit })
  return { geometry: bake(parts), footprint: [6, 5], height: 3.2 }
}

/** The vault: where the shards go. Low, domed, and shut. */
export function vault() {
  const parts = [
    { geometry: chamferBox(3.8, 0.34, 3.4, 0.08), position: [0, 0.17, 0], color: UI.stoneDark },
    { geometry: chamferBox(3.2, 1.5, 2.8, 0.12), position: [0, 1.05, 0], color: UI.stone },
    { geometry: TAPER, position: [0, 2.0, 0], scale: [3.0, 0.9, 2.7], color: UI.stoneMid },
    { geometry: FLAT, position: [0, 2.5, 0], scale: [1.2, 0.24, 1.2], color: UI.stonePale },
    { geometry: luneArch(0.9, 1.3, 0.24), position: [0, 0.34, 1.42], color: UI.stoneShadow },
    { geometry: chamferBox(1.3, 0.24, 0.3, 0.05), position: [0, 1.72, 1.46], color: UI.stoneLit },
    { geometry: shardGeometry(), position: [0, 1.98, 1.5], scale: [0.3, 0.4, 0.22], color: UI.rose },
  ]
  return { geometry: bake(parts), footprint: [5, 5], height: 2.6 }
}

/**
 * A CAIRN — the thing the whole game is about building.
 *
 * A stack of cut blocks, narrowing, with a shard at the top. Each level adds a
 * course and widens the calm field it holds. It is deliberately the plainest
 * structure in the valley: it has to read instantly at any distance and from
 * any angle, because the player will be judging distances to it all game.
 */
export function cairn(level = 1) {
  const n = 2 + Math.max(1, Math.min(4, level))
  const parts = [{ geometry: chamferBox(1.5, 0.2, 1.5, 0.05), position: [0, 0.1, 0], color: UI.stoneDark }]
  let y = 0.2
  for (let i = 0; i < n; i++) {
    const t = i / n
    const s = 1.15 - t * 0.55
    const hgt = 0.38 - t * 0.08
    parts.push({
      geometry: chamferBox(s, hgt, s * 0.9, 0.06),
      position: [0, y + hgt / 2, 0],
      rotation: [0, (i % 2 ? 1 : -1) * 0.13, 0],
      color: [UI.stone, UI.stoneLit, UI.stoneMid, UI.stoneDeep][i % 4],
    })
    y += hgt
  }
  parts.push({ geometry: FLAT, position: [0, y + 0.06, 0], scale: [0.5, 0.12, 0.5], color: UI.stonePale })
  return { geometry: bake(parts), footprint: [2, 2], height: y + 0.5, shardAt: [0, y + 0.34, 0], shardScale: 0.24 + level * 0.03 }
}

/** The shipping crate. Everything you leave in it is sold overnight. */
export function crate() {
  const parts = [
    { geometry: chamferBox(1.7, 1.0, 1.2, 0.06), position: [0, 0.5, 0], color: C.trunk },
    { geometry: chamferBox(1.78, 0.16, 1.28, 0.04), position: [0, 0.98, 0], color: UI.stoneDeep },
    { geometry: chamferBox(1.78, 0.16, 1.28, 0.04), position: [0, 0.12, 0], color: UI.stoneDeep },
    { geometry: chamferBox(0.16, 1.04, 1.28, 0.04), position: [-0.85, 0.5, 0], color: UI.stoneDark },
    { geometry: chamferBox(0.16, 1.04, 1.28, 0.04), position: [0.85, 0.5, 0], color: UI.stoneDark },
    { geometry: markFlatGeometry(), position: [0, 0.56, 0.61], scale: [0.62, 0.62, 1], color: UI.creamShade },
  ]
  return { geometry: bake(parts), footprint: [2, 2], height: 1.1 }
}

/** The well. Water without walking to the river, once you have built it. */
export function well() {
  const parts = [
    { geometry: COLUMN, position: [0, 0.42, 0], scale: [1.8, 0.84, 1.8], color: UI.stone },
    { geometry: COLUMN, position: [0, 0.86, 0], scale: [1.5, 0.1, 1.5], color: UI.stoneShadow },
    { geometry: COLUMN, position: [0, 0.88, 0], scale: [1.86, 0.12, 1.86], color: UI.stoneLit },
  ]
  for (const side of [-1, 1]) {
    parts.push({ geometry: COLUMN, position: [side * 0.7, 1.5, 0], scale: [0.16, 1.4, 0.16], color: C.trunk })
  }
  parts.push({ geometry: chamferBox(2.0, 0.14, 0.5, 0.04), position: [0, 2.24, 0], color: UI.stoneDeep })
  parts.push({ geometry: ROD, position: [0, 2.1, 0], scale: [0.1, 1.5, 0.1], rotation: [0, 0, Math.PI / 2], color: UI.stoneDark })
  return { geometry: bake(parts), footprint: [3, 3], height: 2.4 }
}

/**
 * The flag from the first reference drawing: a pole on the ridge with the mark
 * on black. The cloth is a strip of plane that is displaced per frame — a
 * hundred vertices, which is cheaper than the shader compile it would take to
 * do it on the GPU, and legible at the only distance anyone will see it from.
 */
export function flagpole() {
  const group = new THREE.Group()
  const mast = bake([
    { geometry: COLUMN, position: [0, 2.6, 0], scale: [0.13, 5.2, 0.13], color: UI.stoneDeep },
    { geometry: chamferBox(0.6, 0.24, 0.6, 0.06), position: [0, 0.12, 0], color: UI.stoneDark },
    { geometry: POINT, position: [0, 5.34, 0], scale: [0.26, 0.34, 0.26], color: UI.stonePale },
  ])
  const mastMesh = new THREE.Mesh(mast, applyWrappedLight(bakedMat()))
  mastMesh.castShadow = true
  group.add(mastMesh)

  const cloth = new THREE.PlaneGeometry(1.9, 1.15, 14, 6)
  cloth.translate(0.95, 0, 0)
  const flag = new THREE.Mesh(
    cloth,
    new THREE.MeshLambertMaterial({ map: markTexture({ ink: UI.cream, ground: UI.ink, size: 256, scale: 0.62 }), side: THREE.DoubleSide }),
  )
  flag.position.set(0.06, 4.5, 0)
  flag.castShadow = true
  group.add(flag)

  const base = cloth.attributes.position.array.slice()
  let t = 0
  return {
    group,
    height: 5.7,
    update(dt) {
      t += dt
      const pos = cloth.attributes.position
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3]
        const y = base[i * 3 + 1]
        // Amplitude grows with distance from the mast: cloth pinned along one
        // edge cannot flap at the pin, and a flag that does reads as a sheet of
        // paper someone is shaking.
        const k = x / 1.9
        pos.setZ(i, Math.sin(x * 3.4 - t * 6) * 0.22 * k + Math.sin(y * 2.1 + t * 3.4) * 0.07 * k)
        pos.setY(i, y + Math.sin(x * 2.6 - t * 5.2) * 0.06 * k)
      }
      pos.needsUpdate = true
      cloth.computeVertexNormals()
    },
  }
}

/** Everything a placed structure needs, keyed by the id the save file stores. */
/**
 * THE WAYMARKER — the mark, at landscape scale.
 *
 * The Seismic mark is two lunes facing each other across a gap, and the gate on
 * the ridge already builds it out of two monoliths. This is the same idea small
 * enough to stand anywhere: a pair of cut stones set a stride apart, so the GAP
 * between them is the logo. Nothing about it is decorated — the negative space
 * is the whole design, which is also true of the mark itself.
 *
 * They exist because the brand was in exactly two places in the entire valley:
 * the gate lintel and the shipping crate. A game named after a company that you
 * can cross end to end without seeing its mark is not carrying the brand, it is
 * mentioning it.
 */
export function waymark(level = 1) {
  const parts = []
  const h = [2.0, 2.6][Math.min(1, level - 1)]
  for (const side of [-1, 1]) {
    parts.push({ geometry: chamferBox(0.5, h, 0.56, 0.09), position: [side * 0.66, h / 2 + 0.12, 0], color: UI.stoneLit })
    // The half-lune, leaning in toward its twin: the horn of the mark, cut in
    // stone. It is the reason this is a waymarker and not two posts.
    parts.push({ geometry: TAPER, position: [side * 0.46, h * 0.6, 0], scale: [0.4, h * 0.78, 0.62], color: UI.stonePale })
    parts.push({ geometry: chamferBox(0.72, 0.22, 0.78, 0.06), position: [side * 0.66, 0.11, 0], color: UI.stoneDark })
  }
  /**
   * The mark goes on a LINTEL, not on a sill.
   *
   * At this camera the ground plane is heavily foreshortened, so anything laid
   * low reads as a smear and anything below knee height is behind whatever is in
   * front of it. Up on a bar across the two stones it is at eye level, facing
   * the way the player walks, and legible from the far side of the field —
   * which is the entire job.
   */
  parts.push({ geometry: chamferBox(1.9, 0.3, 0.42, 0.07), position: [0, h + 0.28, 0], color: UI.stoneDeep })
  parts.push({ geometry: chamferBox(1.5, 0.24, 0.2, 0.05), position: [0, h + 0.02, 0.14], color: UI.stoneShadow })
  parts.push({ geometry: markFlatGeometry(), position: [0, h + 0.28, 0.24], scale: [0.34, 0.34, 1], color: UI.creamDeep })
  return { geometry: bake(parts), footprint: [4, 3], height: h + 0.4 }
}

/**
 * WHAT IS LEFT OF ONE OF THE COLONY'S BUILDINGS.
 *
 * The street used to be handed over finished on day one, which is most of the
 * reason the game had no perceivable direction: everything you were meant to
 * work toward was already standing as scenery. Derelict, the same street reads
 * as a to-do list from across the valley — and it has to READ as one, because a
 * building that is merely a bit darker is a building the player walks past.
 *
 * So a ruin is its own mesh rather than the finished building squashed: wall
 * stubs at the corners and along the courses, broken to different heights,
 * with the rubble that came off them lying inside the footprint. Deterministic
 * from the footprint, so a given building looks the same every time the scene
 * is rebuilt.
 */
export function ruin(kind, footprint = [6, 5]) {
  const [fw, fd] = footprint
  const w = fw - 1.4
  const d = fd - 1.4
  const parts = [
    // The slab it stood on. This is what survives, always.
    /**
     * The slab reads as GROUND, not as a hole.
     *
     * At `stoneDark` the footprints came out as flat brown rectangles from the
     * camera's pitch — the eye read them as pits dug in the meadow rather than
     * as floors somebody laid, and a street of them looked like damage to the
     * terrain instead of buildings waiting to be put back.
     */
    { geometry: chamferBox(w + 0.5, 0.18, d + 0.5, 0.05), position: [0, 0.09, 0], color: mix(UI.stone, UI.stoneDeep, 0.3) },
  ]

  /** A stub of wall, broken off at `h`. */
  const stub = (x, z, sw, sd, h, tone) =>
    parts.push({ geometry: chamferBox(sw, h, sd, 0.05), position: [x, 0.18 + h / 2, z], color: tone })

  // Four corners, none of them the same height — an even row of stumps reads as
  // a foundation someone laid, not as something that fell down.
  const hs = [0.95, 0.5, 0.72, 0.34]
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
  corners.forEach(([sx, sz], i) => {
    // Alternating tones so the corners separate from each other and from the
    // slab. One tone across the whole ruin flattened it into a single mass.
    stub(sx * w / 2, sz * d / 2, 0.55, 0.55, hs[i], i % 2 ? UI.creamShade : UI.stoneLit)
  })

  // A course still standing along one long wall, and a gap where the rest went.
  stub(-w / 6, -d / 2, w * 0.5, 0.38, 0.42, UI.creamWarm)
  stub(w / 2, d / 6, 0.38, d * 0.4, 0.3, UI.stoneMid)

  // The rubble. Off-centre and uneven, because a tidy pile reads as storage.
  const spots = [[-0.6, 0.3, 0.5], [0.8, -0.5, 0.38], [0.1, 0.9, 0.3], [-1.1, -0.8, 0.26]]
  for (const [rx, rz, r] of spots) {
    parts.push({
      geometry: stoneLump(Math.round((rx + 2) * 7 + (rz + 2) * 3), { radius: r, height: r * 1.1 }),
      position: [rx, 0.18 + r * 0.5, rz],
      color: mix(UI.stoneMid, UI.creamShade, 0.35),
    })
  }

  // The relay keeps its mast even in pieces — it is the thing on the skyline
  // that tells you the street is not finished.
  if (kind === 'relay') {
    parts.push({ geometry: COLUMN, position: [0.2, 1.5, -0.3], scale: [0.22, 3.0, 0.22], color: UI.stoneDeep })
    parts.push({ geometry: chamferBox(0.9, 0.16, 0.5, 0.04), position: [0.2, 2.9, -0.3], color: UI.stoneMid })
  }

  return { geometry: bake(parts), footprint, height: kind === 'relay' ? 3.2 : 1.2, derelict: true }
}

export const KINDS = {
  waymark: (lv) => waymark(lv),
  homestead: (lv) => homestead(lv),
  gate: () => ridgeGate(),
  kiln: () => kiln(),
  shed: () => shed(),
  vault: () => vault(),
  cairn: (lv) => cairn(lv),
  crate: () => crate(),
  well: () => well(),
  cottage: (lv) => cottage(lv),
  relay: () => relay(),
}

/**
 * A placed structure in the scene: the baked mesh, plus the few things that
 * cannot be baked because they move or glow.
 */
export function placeStructure(kind, level, grid, x, z, derelict = false) {
  // A ruin is a different mesh, not a dimmed one — see `ruin` above.
  const built = derelict ? ruin(kind, KINDS[kind](level).footprint) : KINDS[kind](level)
  const group = new THREE.Group()
  group.name = kind
  const mesh = new THREE.Mesh(built.geometry, applyWrappedLight(bakedMat()))
  mesh.castShadow = true
  mesh.receiveShadow = true
  group.add(mesh)

  if (built.shardAt) {
    const shard = new THREE.Mesh(shardGeometry(), shardMat())
    shard.position.set(...built.shardAt)
    shard.scale.setScalar(built.shardScale ?? 0.26)
    shard.castShadow = true
    group.add(shard)
    group.userData.shard = shard
  }
  /**
   * WINDOWS AFTER DARK.
   *
   * Night was a flat blue wash over the whole valley — technically a night, and
   * nothing in it to look at. The camera sits at thirty-seven degrees and in
   * close shots there is no sky in frame at all, so stars cannot help: whatever
   * makes night worth being out in has to be on the GROUND.
   *
   * These are unlit quads sitting a hair proud of each window and the door, off
   * by day and faded up after dusk. One material per building so the whole set
   * animates with a single opacity, and `glowMat` is a basic material — a window
   * that is dimmed by the same darkness it is supposed to be pushing back is not
   * a lit window.
   */
  if (built.facetMark) {
    // The brand, in its own tones, rather than a one-colour stencil.
    const g = new THREE.Group()
    for (const geo of markFacetGeometry()) g.add(new THREE.Mesh(geo, bakedMat()))
    g.position.set(...built.facetMark.at)
    g.scale.setScalar(built.facetMark.scale ?? 1)
    group.add(g)
  }
  if (built.panes?.length) {
    const paneMat = glowMat(C.fireMid, 1)
    paneMat.transparent = true
    paneMat.opacity = 0
    const panes = new THREE.Group()
    for (const pane of built.panes) {
      const q = new THREE.Mesh(FLAT, paneMat)
      q.position.set(...pane.at)
      q.rotation.y = pane.rot ?? 0
      q.scale.set(pane.size[0], pane.size[1], 0.04)
      panes.add(q)
    }
    group.add(panes)
    group.userData.panes = paneMat
  }
  if (built.lamp) {
    const lamp = new THREE.PointLight(new THREE.Color().setStyle(C.ember, THREE.SRGBColorSpace), 0, 9, 2)
    lamp.position.set(...built.lamp)
    group.add(lamp)
    group.userData.lamp = lamp
  }

  if (built.glow) {
    const light = new THREE.PointLight(new THREE.Color().setStyle(C.ember, THREE.SRGBColorSpace), 0, 7, 2)
    light.position.set(...built.glow)
    group.add(light)
    group.userData.glow = light
    const mouth = new THREE.Mesh(FLAT, glowMat(C.fireMid, 1))
    mouth.position.set(built.glow[0], built.glow[1] - 0.2, built.glow[2] - 0.06)
    mouth.scale.set(0.62, 0.8, 0.05)
    group.add(mouth)
    group.userData.mouth = mouth
  }

  group.position.set(x + 0.5, grid.h(x, z) * LEVEL, z + 0.5)
  group.userData.kind = kind
  group.userData.level = level
  group.userData.cell = [x, z]
  group.userData.height = built.height
  group.userData.footprint = built.footprint
  return group
}

/** Tones exported for anything else that wants to match the masonry. */
export const MASONRY = { light: WALL_TONES, dark: DARK_TONES, mortar: mix(UI.stoneDark, UI.ink, 0.4), shadow: shade(UI.stone, 1) }
