import * as THREE from 'three'
import { bake, bakedMat, chamferBox, COLUMN, FLAT, POINT, shardMat, stoneLump, TAPER } from '../core/kit.js'
import { C, shade, sunlit, UI } from '../core/palette.js'
import { shardGeometry } from '../core/mark.js'
import { LEVEL, N, P } from './grid.js'

/**
 * Everything standing on the ground that is not a crop, a building or a body.
 *
 * All of it is instanced. A valley with nine hundred trees, four hundred rocks
 * and two thousand tufts of grass in it is either eleven draw calls or three
 * thousand three hundred, and the difference is entirely whether the geometry
 * was baked up front. So each kind is authored ONCE as a little assembly of kit
 * parts, `bake()` flattens it into a single vertex-coloured geometry, and every
 * copy in the world is a matrix in an instance buffer.
 *
 * The whole set is rebuilt from the grid whenever the prop layer changes. That
 * sounds wasteful and is not: the scan is 9216 array reads and the upload is a
 * few hundred kilobytes, which costs less than a millisecond and happens when a
 * tree falls, not every frame.
 */

const TREE_KINDS = 3
const ROCK_KINDS = 3
const GRASS_KINDS = 4

// A deterministic per-cell hash, so a tree keeps its rotation and its height
// across a save, a reload and a remesh.
function cellRand(x, z, salt = 0) {
  let h = (Math.imul(x + 1, 0x27d4eb2d) ^ Math.imul(z + 1, 0x165667b1) ^ Math.imul(salt + 1, 0x9e3779b9)) >>> 0
  h = Math.imul(h ^ (h >>> 15), h | 1)
  h ^= h + Math.imul(h ^ (h >>> 7), h | 61)
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296
}

// --- authored kinds ---------------------------------------------------------

/**
 * The three trees.
 *
 * The reference's trees are one shape and it is not a cone: a **thin, tall,
 * rectangular trunk** in plum, carrying a **flat cluster of large cubes** — a
 * slab of canopy three to five cells across and about one cell thick, sitting
 * on top like a table. There is nothing tapered about them, no branching, and
 * no cone.
 *
 * An earlier pass built them as stacked hex prisms narrowing to a point, which
 * is what a conifer looks like and is not what is in the footage. That single
 * silhouette was doing as much damage as the palette was, because trees are the
 * only vertical thing in a world of flat plateaus and they set its whole read.
 *
 * The three kinds differ by CANOPY PLAN and height, not by colour: a compact
 * plus, a wide ragged blob, and a small dense square.
 */

/** Cube-cluster canopy plans, on a cell grid. Offsets are in canopy cubes. */
const CANOPY_PLANS = [
  // Compact plus, one cube of relief.
  [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]],
  // Wide and ragged, the commonest in the footage.
  [[0, 0, 0], [1, 0, 0], [2, 0, 0], [-1, 0, 0], [0, 0, 1], [1, 0, 1], [-1, 0, -1], [0, 0, -1], [1, 1, 0], [0, 1, 1]],
  // Small and dense.
  [[0, 0, 0], [1, 0, 0], [0, 0, 1], [1, 0, 1], [0, 1, 0]],
]

function treeGeometry(kind) {
  const plan = CANOPY_PLANS[kind % CANOPY_PLANS.length]
  const cube = 0.92 // one canopy cube, in world units
  const trunkH = [3.4, 2.9, 2.4][kind % 3]
  const tone = [C.canopyA, C.canopyB, C.canopyC][kind % 3]
  const parts = [
    // The trunk is a BOX and it is thin. A tapered prism reads as a conifer.
    { geometry: chamferBox(0.42, trunkH, 0.42, 0.04), position: [0, trunkH / 2, 0], color: kind === 1 ? C.trunkDark : C.trunk },
  ]
  for (const [dx, dy, dz] of plan) {
    // Two tones inside one canopy, split by height, so the slab has a lit top
    // and a shaded underside without needing a second light.
    const col = dy > 0 ? sunlit(tone, 0.35) : tone
    parts.push({
      geometry: chamferBox(cube, cube, cube, 0.05),
      position: [dx * cube * 0.94, trunkH + cube * (0.2 + dy * 0.86), dz * cube * 0.94],
      color: col,
    })
  }
  return bake(parts)
}

function rockGeometry(kind) {
  const seeds = [7, 41, 93]
  const scale = [0.62, 0.95, 1.35][kind]
  return bake([
    { geometry: stoneLump(seeds[kind], { radius: 0.52, height: 0.8, jitter: 0.26 }), position: [0, 0.34 * scale, 0], scale: [scale, scale * 0.86, scale], color: UI.stone },
    { geometry: stoneLump(seeds[kind] + 3, { radius: 0.3, height: 0.4, jitter: 0.2 }), position: [0.22 * scale, 0.16 * scale, -0.18 * scale], scale: scale * 0.8, color: shade(UI.stone, 0.5) },
  ])
}

function stumpGeometry() {
  return bake([
    { geometry: COLUMN, position: [0, 0.22, 0], scale: [0.66, 0.44, 0.66], color: C.trunkDark },
    { geometry: FLAT, position: [0, 0.44, 0], scale: [0.6, 0.06, 0.6], color: C.canopyDead },
  ])
}

function saplingGeometry() {
  return bake([
    { geometry: TAPER, position: [0, 0.24, 0], scale: [0.11, 0.48, 0.11], color: C.trunk },
    { geometry: TAPER, position: [0, 0.5, 0], scale: [0.5, 0.4, 0.5], color: C.canopyA },
  ])
}

function grassGeometry(kind) {
  // Tiny pale specks, not tufts. The footage scatters a few small stones and a
  // couple of thin blades per cell — at any distance it reads as texture on the
  // ground rather than as vegetation, and a field of proper grass tufts buries
  // the flat plateaus that are the whole point of the look.
  const parts = []
  const stones = 2 + (kind % 3)
  for (let i = 0; i < stones; i++) {
    const a = cellRand(kind * 17, i, 21) * Math.PI * 2
    const r = 0.1 + cellRand(i, kind, 23) * 0.32
    const sz = 0.07 + cellRand(kind, i, 29) * 0.06
    parts.push({
      geometry: chamferBox(sz * 2, sz, sz * 1.7, sz * 0.3),
      position: [Math.cos(a) * r, sz * 0.5, Math.sin(a) * r],
      rotation: [0, a, 0],
      color: i % 2 ? C.grassDry : C.stoneProp,
    })
  }
  if (kind % 2 === 0) {
    for (let i = 0; i < 2; i++) {
      const a = cellRand(i, kind, 31) * Math.PI * 2
      const r = 0.06 + cellRand(kind, i, 37) * 0.2
      parts.push({
        geometry: TAPER,
        position: [Math.cos(a) * r, 0.12, Math.sin(a) * r],
        scale: [0.05, 0.24, 0.05],
        rotation: [Math.sin(a) * 0.2, a, Math.cos(a) * 0.2],
        color: C.grass,
      })
    }
  }
  return bake(parts)
}

/**
 * A fissure: the ground torn open along the fault. Drawn as a shallow inverted
 * wedge of ink-dark rock rather than a hole, because an actual hole in a height
 * grid means either a second mesh layer or a lie about the collision — and the
 * lie is what players fall through.
 */
function fissureGeometry() {
  return bake([
    { geometry: POINT, position: [0, 0.03, 0], scale: [0.9, 0.06, 0.62], color: '#bfb1bb' },
    { geometry: POINT, position: [0.1, 0.07, 0.06], scale: [0.5, 0.06, 0.3], color: UI.ink },
  ])
}

// --- the set ----------------------------------------------------------------

/** Every instanced kind, in the order the instance buffers are laid out. */
const KINDS = [
  ...Array.from({ length: TREE_KINDS }, (_, i) => ({ key: `tree${i}`, prop: P.TREE, data: i, max: 900, build: () => treeGeometry(i), shadow: true })),
  ...Array.from({ length: ROCK_KINDS }, (_, i) => ({ key: `rock${i}`, prop: P.ROCK, data: i, max: 500, build: () => rockGeometry(i), shadow: true })),
  ...Array.from({ length: GRASS_KINDS }, (_, i) => ({ key: `grass${i}`, prop: P.GRASS, data: i, max: 900, build: () => grassGeometry(i), shadow: false })),
  { key: 'stump', prop: P.STUMP, data: null, max: 200, build: stumpGeometry, shadow: true },
  { key: 'sapling', prop: P.SAPLING, data: null, max: 200, build: saplingGeometry, shadow: true },
  { key: 'fissure', prop: P.FISSURE, data: null, max: 500, build: fissureGeometry, shadow: false },
]

export class Props {
  constructor(grid) {
    this.grid = grid
    this.group = new THREE.Group()
    this.group.name = 'props'
    this.material = bakedMat()
    this.dirty = true

    this.meshes = KINDS.map((k) => {
      const mesh = new THREE.InstancedMesh(k.build(), this.material, k.max)
      mesh.name = k.key
      mesh.count = 0
      mesh.castShadow = k.shadow
      mesh.receiveShadow = true
      mesh.frustumCulled = false // instances are spread over the whole map
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      this.group.add(mesh)
      return mesh
    })

    // Geodes are the one prop that needs a second material — the shard in them
    // is the only thing in the valley that glows — so they get their own pair of
    // instanced meshes sharing one transform pass.
    this.geodeShell = new THREE.InstancedMesh(
      bake([
        { geometry: stoneLump(17, { radius: 0.5, height: 0.62, jitter: 0.3 }), position: [0, 0.3, 0], scale: [1, 1, 1], color: UI.stoneDeep },
        { geometry: stoneLump(29, { radius: 0.3, height: 0.34, jitter: 0.22 }), position: [-0.24, 0.16, 0.2], scale: 0.9, color: UI.stoneDark },
      ]),
      this.material,
      300,
    )
    this.geodeShard = new THREE.InstancedMesh(shardGeometry(), shardMat(), 300)
    for (const m of [this.geodeShell, this.geodeShard]) {
      m.count = 0
      m.castShadow = true
      m.frustumCulled = false
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      this.group.add(m)
    }
    this.geodeShell.receiveShadow = true

    // prop id -> [kind index by variant]. Built once so the per-cell scan is a
    // pair of array reads rather than a findIndex over every kind.
    this.byProp = {}
    KINDS.forEach((k, i) => {
      ;(this.byProp[k.prop] ||= []).push(i)
    })

    /** Where every geode ended up, so their shards can be spun per frame without
     *  rescanning the grid. Rotating the InstancedMesh itself would swing all of
     *  them around the world origin instead of each about its own. */
    this.geodes = []

    this._m = new THREE.Matrix4()
    this._q = new THREE.Quaternion()
    this._e = new THREE.Euler()
    this._p = new THREE.Vector3()
    this._s = new THREE.Vector3()
    this._t = 0
  }

  /** Rescan the grid. Cheap; call it whenever the prop layer might have moved. */
  rebuild() {
    const counts = new Array(KINDS.length).fill(0)
    const { grid } = this
    this.geodes.length = 0

    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const i = z * N + x
        const prop = grid.prop[i]
        if (prop === P.NONE) continue
        const y = grid.height[i] * LEVEL
        const yaw = cellRand(x, z, 1) * Math.PI * 2
        const lean = (cellRand(x, z, 2) - 0.5) * 0.09
        const size = 0.84 + cellRand(x, z, 3) * 0.34

        if (prop === P.GEODE) {
          if (this.geodes.length >= 300) continue
          this._place(this.geodeShell, this.geodes.length, x, y, z, yaw, 0, size)
          this.geodes.push({ x, y: y + 0.34 * size, z, size: size * 0.44, yaw })
          continue
        }

        const variants = this.byProp[prop]
        if (!variants) continue
        const ki = variants[grid.propData[i] % variants.length]
        if (counts[ki] >= KINDS[ki].max) continue
        this._place(this.meshes[ki], counts[ki]++, x, y, z, yaw, lean, size)
      }
    }

    KINDS.forEach((k, i) => {
      this.meshes[i].count = counts[i]
      this.meshes[i].instanceMatrix.needsUpdate = true
    })
    this.geodeShell.count = this.geodes.length
    this.geodeShard.count = this.geodes.length
    this.geodeShell.instanceMatrix.needsUpdate = true
    this.dirty = false
  }

  _place(mesh, index, x, y, z, yaw, lean, size) {
    this._e.set(lean, yaw, lean * 0.6)
    this._q.setFromEuler(this._e)
    this._p.set(x + 0.5, y, z + 0.5)
    this._s.setScalar(size)
    this._m.compose(this._p, this._q, this._s)
    mesh.setMatrixAt(index, this._m)
  }

  update(dt) {
    if (this.dirty) this.rebuild()
    // The shards turn and bob. It is the only motion in an otherwise static
    // field and it is what makes a geode read as worth walking to. Three hundred
    // matrix composes a frame is nothing; three hundred draw calls would not be.
    this._t += dt
    for (let i = 0; i < this.geodes.length; i++) {
      const g = this.geodes[i]
      const phase = this._t * 0.7 + i * 1.7
      this._e.set(0.28, g.yaw + this._t * 0.5, 0.12)
      this._q.setFromEuler(this._e)
      this._p.set(g.x + 0.5, g.y + Math.sin(phase) * 0.045, g.z + 0.5)
      this._s.setScalar(g.size)
      this._m.compose(this._p, this._q, this._s)
      this.geodeShard.setMatrixAt(i, this._m)
    }
    if (this.geodes.length) this.geodeShard.instanceMatrix.needsUpdate = true
  }

  dispose() {
    for (const m of [...this.meshes, this.geodeShell, this.geodeShard]) {
      m.geometry.dispose()
      m.dispose()
    }
    this.material.dispose()
    this.group.clear()
  }
}
