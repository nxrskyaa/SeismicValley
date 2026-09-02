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
/**
 * World units per height level.
 *
 * ONE, not a half. In the reference a single terrace step is a wall about as
 * tall as a cell is wide — you read the plateau edges as real drops from across
 * the valley. At 0.5 every riser is a curb and the whole map flattens into a
 * pattern rather than a landscape.
 */
export const LEVEL = 1.0
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
    /**
     * GROUND YOU ARE ALLOWED TO WORK.
     *
     * Without this, `canTill` said yes to any meadow, loam or ash tile in the
     * whole valley — measured, sixty-five per cent of the land, four thousand
     * four hundred tiles. When everywhere is a farm, nowhere is, and the street
     * and the homestead meant nothing because you could just as well hoe the
     * ridge. A plot is opened by restoring the cottage it belongs to.
     */
    this.plot = new Uint8Array(N * N)
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

  /**
   * Bilinear surface height under a float position, so a body walks up a slope
   * smoothly instead of popping at every cell boundary.
   *
   * The blend is anchored on the cell the body is ACTUALLY IN. Neighbours within
   * one level of it blend; anything further is ignored and the seam stays a hard
   * edge.
   *
   * The first version anchored on the LOWEST of the four corners instead, and
   * that is a different thing entirely: standing on a rim four levels above a
   * lake basin, every corner capped down to the basin and the player was placed
   * at the bottom of the pond — on dry land, under the water plane, apparently
   * drowning. Anchoring on `here` cannot do that, because `here` is the ground
   * they are standing on by definition.
   */
  sampleY(fx, fz) {
    /**
     * THE EXACT CELL HEIGHT. No blend.
     *
     * This used to bilinearly blend the four corners under the body, and that is
     * wrong for this world: the mesher draws FLAT tops and VERTICAL faces, so
     * there is no ramp anywhere for a blended height to follow. Standing on the
     * boundary between a cell and a neighbour one level down, the body was
     * placed halfway between them — half buried in a step that is actually a
     * sheer face. That is the "ground clips through when you move".
     *
     * The collision surface has to be the surface that is DRAWN. So this returns
     * the cell's own height and nothing else, and the smoothing that used to
     * live here now lives in the rig: `PlayerController` damps the RENDERED y
     * toward this, which looks the same on a slope and cannot bury anything,
     * because what is damped is the picture rather than the collision.
     */
    return this.h(Math.floor(fx), Math.floor(fz)) * LEVEL
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
    if (!this.plot[z * N + x]) return false
    const g = this.ground[z * N + x]
    return g === G.MEADOW || g === G.LOAM || g === G.ASH
  }

  /** Can a body stand here? The one rule the whole movement system is built on:
   *  you may step UP exactly one level, and fall as far as you like. That makes
   *  "you cannot climb that" read as a rule rather than as a collision bug, and
   *  it keeps movement free of a physics engine entirely. */
  canStand(x, z, fromH, maxUp = 1) {
    if (!Grid.inBounds(x, z)) return false
    if (this.isWater(x, z)) return false
    if (!WALKABLE_PROP.has(this.prop[z * N + x])) return false
    return this.height[z * N + x] - fromH <= maxUp
  }

  /**
   * Like `canStand`, but for a body that can SWIM.
   *
   * The player can; the dog and the pebbles cannot, which is why this is a
   * second method rather than a flag on the first one. Water is always enterable
   * and the land rule is unchanged, so the only thing that decides whether you
   * can haul yourself out of a pond is how high the bank is.
   */
  canWade(x, z, fromH, maxUp = 1) {
    if (!Grid.inBounds(x, z)) return false
    if (!WALKABLE_PROP.has(this.prop[z * N + x])) return false
    if (this.height[z * N + x] < WATER_LEVEL) return true
    return this.height[z * N + x] - fromH <= maxUp
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
