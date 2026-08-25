import * as THREE from 'three'
import { CHUNK, CHUNKS } from './grid.js'
import { groundMaterial, meshChunk } from './mesher.js'

/**
 * The valley's geometry, and the queue that keeps it honest.
 *
 * A chunk is remeshed when the data under it changes — a hoe stroke, a felled
 * tree, a tremor. Rebuilds are BUDGETED rather than immediate: a tremor can
 * dirty thirty chunks in one frame, and rebuilding thirty chunks in one frame is
 * a visible half-second stall at exactly the moment the player is meant to be
 * watching the ground move. Two per frame clears any realistic burst inside a
 * quarter of a second and nobody sees a hitch.
 */
export class Terrain {
  constructor(grid) {
    this.grid = grid
    this.group = new THREE.Group()
    this.group.name = 'terrain'
    this.material = groundMaterial()
    this.meshes = new Array(CHUNKS * CHUNKS).fill(null)
    this.budget = 2
  }

  /** Build (or rebuild) one chunk in place, disposing whatever it replaces.
   *  Not disposing is the classic voxel leak: the GPU keeps every version of
   *  every chunk you ever tilled and the tab dies after twenty minutes. */
  build(ci) {
    const cx = ci % CHUNKS
    const cz = Math.floor(ci / CHUNKS)
    const geo = meshChunk(this.grid, cx, cz)
    const existing = this.meshes[ci]
    if (existing) {
      existing.geometry.dispose()
      existing.geometry = geo
      return
    }
    const mesh = new THREE.Mesh(geo, this.material)
    mesh.castShadow = false // ground casting onto ground is noise, and it is expensive
    mesh.receiveShadow = true
    mesh.name = `chunk-${cx}-${cz}`
    mesh.userData.chunk = ci
    this.meshes[ci] = mesh
    this.group.add(mesh)
  }

  /** Everything, now. Only the first frame and a load should call this. */
  rebuildAll() {
    for (let i = 0; i < CHUNKS * CHUNKS; i++) this.build(i)
    this.grid.dirty.clear()
  }

  /** Drain a few dirty chunks. Call once per frame. */
  update() {
    if (!this.grid.dirty.size) return
    let n = this.budget
    for (const ci of this.grid.dirty) {
      this.grid.dirty.delete(ci)
      this.build(ci)
      if (--n <= 0) break
    }
  }

  /** Flush the whole queue immediately — used after a tremor resolves, where the
   *  player is looking straight at the changed ground and a chunk arriving two
   *  frames late reads as a hole. */
  flush() {
    for (const ci of this.grid.dirty) this.build(ci)
    this.grid.dirty.clear()
  }

  /** Chunk-space bounds of a mesh, for anything that needs to know what a chunk
   *  covers without recomputing the arithmetic. */
  static chunkOrigin(ci) {
    return [(ci % CHUNKS) * CHUNK, Math.floor(ci / CHUNKS) * CHUNK]
  }

  dispose() {
    for (const m of this.meshes) if (m) m.geometry.dispose()
    this.material.dispose()
    this.group.clear()
  }
}
