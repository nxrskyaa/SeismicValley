import * as THREE from 'three'
import { bake, bakedMat, COLUMN, FLAT, POINT, shardMat, stoneLump, TAPER } from '../core/kit.js'
import { C, shade, UI } from '../core/palette.js'
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
 * Ridgepine is a spire, Bellwood is a canopy, Ironbark is a fist. They differ in
 * SILHOUETTE first and colour second — a forest whose species are told apart by
 * hue is a forest that becomes one species the moment the sun goes down.
 */
function treeGeometry(kind) {
  if (kind === 0) {
    // Ridgepine — narrow, stacked, tallest thing in the valley.
    const parts = [
      { geometry: TAPER, position: [0, 1.1, 0], scale: [0.34, 2.2, 0.34], color: C.trunk },
      { geometry: TAPER, position: [0, 2.0, 0], scale: [1.9, 1.5, 1.9], color: C.canopyC },
      { geometry: TAPER, position: [0, 2.9, 0], scale: [1.5, 1.3, 1.5], color: C.canopyA },
      { geometry: TAPER, position: [0, 3.7, 0], scale: [1.0, 1.1, 1.0], color: C.canopyB },
    ]
    return bake(parts)
  }
  if (kind === 1) {
    // Bellwood — a short trunk under a wide, slightly lopsided crown. The offset
    // on the upper plate is what stops a row of them reading as a stamp.
    return bake([
      { geometry: COLUMN, position: [0, 0.75, 0], scale: [0.42, 1.5, 0.42], color: C.trunkDark },
      { geometry: POINT, position: [0, 1.75, 0], scale: [2.6, 1.1, 2.6], color: C.canopyA },
      { geometry: FLAT, position: [0.18, 2.35, -0.12], scale: [2.0, 0.8, 2.0], color: C.canopyB },
      { geometry: FLAT, position: [-0.22, 1.5, 0.16], scale: [1.7, 0.6, 1.7], color: C.canopyC },
    ])
  }
  // Ironbark — squat, thick, dark. Worth four days of felling and it looks it.
  return bake([
    { geometry: COLUMN, position: [0, 0.85, 0], scale: [0.62, 1.7, 0.62], color: C.trunkDark },
    { geometry: COLUMN, position: [0.3, 1.5, 0.1], scale: [0.24, 0.9, 0.24], rotation: [0, 0, -0.5], color: C.trunkDark },
    { geometry: POINT, position: [0, 2.1, 0], scale: [2.2, 1.3, 2.2], color: C.canopyC },
    { geometry: POINT, position: [0.35, 1.75, 0.2], scale: [1.3, 0.8, 1.3], color: C.canopyDead },
  ])
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
  const parts = []
  // Six to nine blades, short and broad. The first pass used three tall thin
  // ones and a field of them read as a field of pins rather than of grass.
  const blades = 6 + (kind % 4)
  for (let i = 0; i < blades; i++) {
    const a = cellRand(kind * 13, i, 5) * Math.PI * 2
    const r = 0.08 + cellRand(i, kind, 9) * 0.3
    const hgt = 0.16 + cellRand(kind, i, 3) * 0.17
    const lean = 0.24 + cellRand(i, kind, 11) * 0.3
    parts.push({
      geometry: TAPER,
      position: [Math.cos(a) * r, hgt / 2, Math.sin(a) * r],
      scale: [0.13, hgt, 0.13],
      rotation: [Math.sin(a) * lean, a, Math.cos(a) * lean],
      color: i % 3 === 0 ? C.grassDry : i % 3 === 1 ? C.grass : C.shrub,
    })
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
