import { G } from '../core/palette.js'

/**
 * The valley, as numbers.
 *
 * One integer height per cell, one world unit across, half a unit per level.
 * Nothing here knows about three.js: the mesher reads this, the player clamps to
 * it, the tremor rewrites it and the save file is very nearly a copy of it. That
 * separation is what makes a tremor cheap — it edits an Int8Array and marks a
 * handful of chunks dirty, rather than touching geometry.
 *
 * Every layer is a typed array of length N*N indexed `z * N + x`. Typed arrays
 * rather than an array of cell objects because the save file is a base64 of
 * exactly these bytes, and because 9216 little objects is 9216 chances for the
 * garbage collector to stutter during a chunk rebuild.
 */

export const N = 96 // cells per side
export const LEVEL = 0.5 // world units per height level
export const CHUNK = 16
export const CHUNKS = N / CHUNK
export const WATER_LEVEL = 6 // in levels, not units

/** What is standing on a cell. One byte, so the layer stays a Uint8Array. */
export const P = {
  NONE: 0,
  TREE: 1,
  SAPLING: 2,
  STUMP: 3,
  ROCK: 4,
  GRASS: 5,
  GEODE: 6,
  FISSURE: 7,
  CAIRN: 8,
  BUILDING: 9, // footprint reservation; the structure itself lives in state.buildings
  CRATE: 10,
  POST: 11,
}

/** Props you can walk through. Everything else blocks. */
export const WALKABLE_PROP = new Set([P.NONE, P.GRASS, P.FISSURE])

export class Grid {
  constructor() {
    this.n = N
    this.height = new Int8Array(N * N)
    this.ground = new Uint8Array(N * N)
    this.tilled = new Uint8Array(N * N)
    this.wet = new Uint8Array(N * N)
    this.crop = new Uint8Array(N * N) // index into CROP_ORDER + 1; 0 is bare
    this.grown = new Uint8Array(N * N) // watered days accumulated
    this.prop = new Uint8Array(N * N)
    this.propData = new Uint8Array(N * N) // species, growth stage, or geode contents
    /** Chunk indices waiting to be remeshed. A Set, so the same edit landing
     *  twice in one frame does not queue two rebuilds of the same chunk. */
    this.dirty = new Set()
  }

  static inBounds(x, z) { return x >= 0 && z >= 0 && x < N && z < N }
  idx(x, z) { return z * N + x }

  // --------------------------------------------------------------- height --

  h(x, z) {
    if (!Grid.inBounds(x, z)) return 0
    return this.height[z * N + x]
  }
  /** World-space Y of a cell's surface. */
  y(x, z) { return this.h(x, z) * LEVEL }

  setH(x, z, v) {
    if (!Grid.inBounds(x, z)) return
    const i = z * N + x
    const next = Math.max(0, Math.min(40, Math.round(v)))
    if (this.height[i] === next) return
    this.height[i] = next
    this.touch(x, z)
  }

  /** Bilinear surface height under a float position, so the player walks up a
   *  terrace smoothly instead of popping half a unit at every cell boundary. */
  sampleY(fx, fz) {
    const x = Math.floor(fx), z = Math.floor(fz)
    const tx = fx - x, tz = fz - z
    const a = this.h(x, z), b = this.h(x + 1, z), c = this.h(x, z + 1), d = this.h(x + 1, z + 1)
    // Only blend across a seam the player could actually walk — a one-level step
    // is a slope, a two-level step is a cliff and must stay a hard edge or the
    // player floats up the face of it.
    const lo = Math.min(a, b, c, d)
    const cap = (v) => (v - lo > 1 ? lo : v)
    const A = cap(a), B = cap(b), Cc = cap(c), D = cap(d)
    return ((A + (B - A) * tx) * (1 - tz) + (Cc + (D - Cc) * tx) * tz) * LEVEL
  }

  // --------------------------------------------------------------- layers --

  get(layer, x, z) { return Grid.inBounds(x, z) ? this[layer][z * N + x] : 0 }
  set(layer, x, z, v) {
    if (!Grid.inBounds(x, z)) return
    const i = z * N + x
    if (this[layer][i] === v) return
    this[layer][i] = v
    this.touch(x, z)
  }

  /** Mark the chunk under (x, z) — and any chunk whose border quads read this
   *  cell — for a rebuild. Forgetting the neighbours leaves a seam of stale
   *  cliff faces exactly one cell wide along every chunk boundary. */
  touch(x, z) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK)
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, nz = cz + dz
        if (nx >= 0 && nz >= 0 && nx < CHUNKS && nz < CHUNKS) this.dirty.add(nz * CHUNKS + nx)
      }
    }
  }
  touchAll() { for (let i = 0; i < CHUNKS * CHUNKS; i++) this.dirty.add(i) }

  // ---------------------------------------------------------------- rules --

  isWater(x, z) { return this.h(x, z) < WATER_LEVEL }
  /** Standing water is reachable for a refill from any adjacent land cell. */
  nearWater(x, z, r = 1) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) if (this.isWater(x + dx, z + dz)) return true
    }
    return false
  }

  canTill(x, z) {
    if (!Grid.inBounds(x, z) || this.isWater(x, z)) return false
    if (this.prop[z * N + x] !== P.NONE) return false
    if (this.tilled[z * N + x]) return false
    const g = this.ground[z * N + x]
    return g === G.MEADOW || g === G.LOAM || g === G.ASH
  }

  /** Can a body stand here? The one rule the whole movement system is built on:
   *  you may step UP exactly one level, and fall as far as you like. That makes
   *  "you cannot climb that" read as a rule rather than as a collision bug, and
   *  it keeps movement free of a physics engine entirely. */
  canStand(x, z, fromH) {
    if (!Grid.inBounds(x, z)) return false
    if (this.isWater(x, z)) return false
    if (!WALKABLE_PROP.has(this.prop[z * N + x])) return false
    return this.height[z * N + x] - fromH <= 1
  }

  /** Nearest standing cell to (x, z), spiralling out. Used to place anything the
   *  generator wanted at a spot that turned out to be water or rock. */
  nearestStandable(x, z, max = 12) {
    for (let r = 0; r <= max; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
          const nx = x + dx, nz = z + dz
          if (!Grid.inBounds(nx, nz)) continue
          if (this.isWater(nx, nz)) continue
          if (this.prop[nz * N + nx] !== P.NONE) continue
          return [nx, nz]
        }
      }
    }
    return [x, z]
  }

  /** Flatten and clear a rectangle — what a building footprint needs before it
   *  can be placed, and what a homestead upgrade does to make room. */
  flatten(x0, z0, w, d, h) {
    for (let z = z0; z < z0 + d; z++) {
      for (let x = x0; x < x0 + w; x++) {
        if (!Grid.inBounds(x, z)) continue
        this.setH(x, z, h)
        this.set('prop', x, z, P.NONE)
        this.set('crop', x, z, 0)
        this.set('tilled', x, z, 0)
      }
    }
  }

  /** Average height of a footprint, so a building sits ON the ground rather than
   *  demanding the ground come to it. */
  averageH(x0, z0, w, d) {
    let sum = 0, n = 0
    for (let z = z0; z < z0 + d; z++) {
      for (let x = x0; x < x0 + w; x++) {
        if (!Grid.inBounds(x, z)) continue
        sum += this.height[z * N + x]
        n++
      }
    }
    return n ? Math.round(sum / n) : 0
  }

  // ----------------------------------------------------------------- save --

  /** The layers as one flat byte string. Height is signed but never negative in
   *  practice, so it round-trips through Uint8 without a bias term. */
  serialize() {
    const layers = ['height', 'ground', 'tilled', 'wet', 'crop', 'grown', 'prop', 'propData']
    const out = new Uint8Array(layers.length * N * N)
    layers.forEach((k, i) => out.set(new Uint8Array(this[k].buffer, this[k].byteOffset, N * N), i * N * N))
    let s = ''
    for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode.apply(null, out.subarray(i, i + 0x8000))
    return btoa(s)
  }

  deserialize(b64) {
    const bin = atob(b64)
    const layers = ['height', 'ground', 'tilled', 'wet', 'crop', 'grown', 'prop', 'propData']
    if (bin.length !== layers.length * N * N) return false
    const raw = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i)
    layers.forEach((k, i) => {
      const view = new Uint8Array(this[k].buffer, this[k].byteOffset, N * N)
      view.set(raw.subarray(i * N * N, (i + 1) * N * N))
    })
    this.touchAll()
    return true
  }
}
