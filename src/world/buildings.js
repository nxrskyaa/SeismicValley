import * as THREE from 'three'
import { bake, bakedMat, chamferBox, COLUMN, FLARE, FLAT, glowMat, POINT, ROD, shardMat, stoneLump, TAPER, wedge } from '../core/kit.js'
import { markFlatGeometry, markTexture, shardGeometry } from '../core/mark.js'
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

/** One course of blocks along X. Courses are offset half a block from the one
 *  below by the caller, which is the only thing separating masonry from a
 *  stack of identical bars. */
function course(parts, { y, z, x0, x1, h, d, tone, seed = 0, gap = 0.045 }) {
  const span = x1 - x0
  const n = Math.max(1, Math.round(span / 0.62))
  const bw = span / n
  for (let i = 0; i < n; i++) {
    const k = ((Math.sin((seed + i * 3.7 + y * 11.3) * 12.9898) * 43758.5453) % 1 + 1) % 1
    parts.push({
      geometry: chamferBox(bw - gap, h - gap, d, 0.045),
      position: [x0 + bw * (i + 0.5), y + h / 2, z],
      color: k < 0.33 ? tone[0] : k < 0.72 ? tone[1] : tone[2],
    })
  }
}

const WALL_TONES = [UI.stone, UI.stoneMid, UI.stoneLit]
const DARK_TONES = [UI.stoneDeep, UI.stoneDark, UI.stoneMid]

/** Four walls of coursed masonry, with a gap left for a door on +Z. */
function walls(parts, { w, d, h, doorW = 0, tone = WALL_TONES, courseH = 0.32 }) {
  const rows = Math.max(1, Math.round(h / courseH))
  const ch = h / rows
  for (let r = 0; r < rows; r++) {
    const y = r * ch
    const off = r % 2 ? 0.31 : 0
    // back and sides
    course(parts, { y, z: -d / 2, x0: -w / 2, x1: w / 2, h: ch, d: 0.26, tone, seed: r + off })
    for (const side of [-1, 1]) {
      const sideParts = []
      course(sideParts, { y, z: 0, x0: -d / 2, x1: d / 2, h: ch, d: 0.26, tone, seed: r + 5 + off })
      for (const p of sideParts) {
        parts.push({ ...p, position: [side * (w / 2), p.position[1], p.position[0]], rotation: [0, Math.PI / 2, 0] })
      }
    }
    // front, split around the doorway
    const dh = doorW / 2
    if (doorW && y < h * 0.62) {
      course(parts, { y, z: d / 2, x0: -w / 2, x1: -dh, h: ch, d: 0.26, tone, seed: r + 9 + off })
      course(parts, { y, z: d / 2, x0: dh, x1: w / 2, h: ch, d: 0.26, tone, seed: r + 13 + off })
    } else {
      course(parts, { y, z: d / 2, x0: -w / 2, x1: w / 2, h: ch, d: 0.26, tone, seed: r + 9 + off })
    }
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
export function homestead(tier = 1) {
  const t = Math.max(1, Math.min(4, tier))
  const w = [4.4, 5.2, 6.0, 6.8][t - 1]
  const d = [3.6, 4.2, 4.8, 5.4][t - 1]
  const h = [1.9, 2.1, 3.0, 3.2][t - 1]
  const parts = []

  // Plinth — every building in the valley stands on one, because the ground
  // moves and a wall that starts at soil level reads as sinking into it.
  parts.push({ geometry: chamferBox(w + 0.5, 0.28, d + 0.5, 0.07), position: [0, 0.14, 0], color: UI.stoneDark })
  walls(parts, { w, d, h, doorW: 1.2 })

  // Doorway: the lune arch, recessed, with a dark reveal behind it.
  parts.push({ geometry: luneArch(1.2, h * 0.62, 0.1), position: [0, 0.28, d / 2 + 0.06], color: UI.stoneShadow })
  parts.push({ geometry: luneArch(1.42, h * 0.68, 0.14), position: [0, 0.24, d / 2 - 0.02], color: UI.stoneLit })
  // The lintel stone, with the mark cut into it.
  parts.push({ geometry: chamferBox(1.7, 0.34, 0.34, 0.06), position: [0, h * 0.68 + 0.34, d / 2], color: UI.stonePale })

  // Roof: a wedge, and a ridge beam that overhangs. The overhang is what stops
  // it reading as a lid.
  parts.push({ geometry: wedge(w + 0.7, 1.15, d + 0.7), position: [0, h, 0], color: UI.stoneDeep })
  parts.push({ geometry: chamferBox(w + 0.9, 0.14, 0.18, 0.04), position: [0, h + 1.16, 0], color: UI.stoneDark })
  parts.push({ geometry: chamferBox(w + 0.85, 0.12, 0.16, 0.035), position: [0, h + 0.06, d / 2 + 0.36], color: UI.creamShade })
  parts.push({ geometry: chamferBox(w + 0.85, 0.12, 0.16, 0.035), position: [0, h + 0.06, -d / 2 - 0.36], color: UI.creamShade })

  // Windows, as lune arches in cream — the only cream on the building, so they
  // are what your eye finds from across the valley.
  for (const side of [-1, 1]) {
    parts.push({ geometry: luneArch(0.52, 0.8, 0.1), position: [side * (w / 2 + 0.02), h * 0.28, 0], rotation: [0, side * Math.PI / 2, 0], color: UI.creamDeep })
  }

  if (t >= 2) {
    // Porch: two posts and a canopy.
    for (const side of [-1, 1]) {
      parts.push({ geometry: COLUMN, position: [side * (w / 2 - 0.4), 1.05, d / 2 + 1.1], scale: [0.22, 2.1, 0.22], color: C.trunk })
    }
    parts.push({ geometry: chamferBox(w - 0.5, 0.16, 1.5, 0.05), position: [0, 2.16, d / 2 + 0.6], color: UI.stoneDeep })
    parts.push({ geometry: chamferBox(w + 0.2, 0.2, 0.2, 0.05), position: [0, 0.2, d / 2 + 1.3], color: UI.stoneDark })
  }
  if (t >= 3) {
    // Flue, for the kiln that got built into the house.
    parts.push({ geometry: chamferBox(0.62, 1.5, 0.62, 0.08), position: [w / 2 - 0.9, h + 0.9, -d / 4], color: UI.stoneMid })
    parts.push({ geometry: chamferBox(0.78, 0.18, 0.78, 0.05), position: [w / 2 - 0.9, h + 1.72, -d / 4], color: UI.stoneDark })
  }
  if (t >= 4) {
    // The tower and its shard lantern — visible from the ridge, which is the
    // point of it.
    parts.push({ geometry: chamferBox(1.5, 2.4, 1.5, 0.1), position: [-w / 2 + 0.7, h + 1.2, -d / 4], color: UI.stone })
    parts.push({ geometry: FLARE, position: [-w / 2 + 0.7, h + 2.55, -d / 4], scale: [1.9, 0.44, 1.9], color: UI.stoneDeep })
    parts.push({ geometry: shardGeometry(), position: [-w / 2 + 0.7, h + 3.1, -d / 4], scale: [0.42, 0.55, 0.34], color: UI.rose })
  }
  return { geometry: bake(parts), footprint: [Math.ceil(w) + 2, Math.ceil(d) + 3], height: h }
}

/**
 * THE RIDGE GATE — Rocky's post.
 *
 * Two monoliths cut as half-lunes, facing each other across the path so the gap
 * between them IS the mark at building scale. Nothing about it is decorated;
 * the shape is the decoration.
 */
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
  const mastMesh = new THREE.Mesh(mast, bakedMat())
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
export const KINDS = {
  homestead: (lv) => homestead(lv),
  gate: () => ridgeGate(),
  kiln: () => kiln(),
  shed: () => shed(),
  vault: () => vault(),
  cairn: (lv) => cairn(lv),
  crate: () => crate(),
  well: () => well(),
}

/**
 * A placed structure in the scene: the baked mesh, plus the few things that
 * cannot be baked because they move or glow.
 */
export function placeStructure(kind, level, grid, x, z) {
  const built = KINDS[kind](level)
  const group = new THREE.Group()
  group.name = kind
  const mesh = new THREE.Mesh(built.geometry, bakedMat())
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
