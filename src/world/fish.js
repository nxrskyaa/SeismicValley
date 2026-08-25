import * as THREE from 'three'
import { bake, bakedMat, chamferBox } from '../core/kit.js'
import { C, UI } from '../core/palette.js'
import { LEVEL, N, WATER_LEVEL } from './grid.js'
import { rng } from '../core/rng.js'

/**
 * What lives in the water, and what the water does about it.
 *
 * Three things, all of which exist so that a lake reads as *inhabited* rather
 * than as a blue rectangle you are allowed to click on:
 *
 *   FISH     A school of small bodies swimming slow loops a little under the
 *            surface. The water is translucent, so they show through as moving
 *            shapes — which is the entire point, and why the fish are a solid
 *            colour with a pale belly rather than a detailed model nobody will
 *            ever see.
 *   RIPPLES  Expanding rings. One set drifts idly across the lake so the
 *            surface is never dead; the rest are fired by the float, the cast
 *            and the catch, which is how the player reads what the water is
 *            doing without a single UI element.
 *   MOTES    Drifting specks on the surface. Cheap, and they are what makes a
 *            still lake look wet.
 *
 * All three are instanced and pooled. A lake with two hundred loose meshes in
 * it costs more than the rest of the valley put together.
 */

const FISH_COUNT = 84
const RIPPLE_POOL = 40
const MOTE_COUNT = 220

/** One fish. A wedge body, a tail, and a pale belly — read from above through
 *  water, that is all there is room for. */
function fishGeometry(tone, belly) {
  // Sized to READ. At the game's default zoom one world unit is about thirty
  // pixels, so a realistically-scaled fish is six pixels of nothing. This one is
  // roughly a forearm long, which is wrong and which is the only size at which
  // the school is a thing the player can see happening.
  return bake([
    { geometry: chamferBox(0.26, 0.16, 0.56, 0.05), position: [0, 0, 0], color: tone },
    { geometry: chamferBox(0.18, 0.08, 0.5, 0.03), position: [0, -0.055, 0.01], color: belly },
    { geometry: chamferBox(0.04, 0.2, 0.24, 0.03), position: [0, 0.02, -0.37], color: tone },
    { geometry: chamferBox(0.22, 0.03, 0.14, 0.02), position: [0, 0.08, 0.03], color: belly },
  ])
}

/** A flat ring, lying in the XZ plane, one unit across. */
const RING = (() => {
  const g = new THREE.RingGeometry(0.4, 0.5, 20)
  g.rotateX(-Math.PI / 2)
  return g
})()

export class Water_Life {
  constructor(grid) {
    this.grid = grid
    this.group = new THREE.Group()
    this.group.name = 'water-life'
    this.surface = WATER_LEVEL * LEVEL + LEVEL * 0.5
    this.rand = rng(0xf15)

    /**
     * Where a fish can live: deep enough, and OPEN — every one of the eight
     * neighbours under water too.
     *
     * The open test is what keeps the school out of the river. A school circles
     * on a radius of one to three cells, and the river is four cells wide, so
     * without this half the fish spend their lives swimming through the bank.
     * It also concentrates them in the two pools, which is where the player is
     * going to stand.
     */
    this.cells = []
    for (let z = 2; z < N - 2; z++) {
      for (let x = 2; x < N - 2; x++) {
        if (grid.height[z * N + x] > WATER_LEVEL - 2) continue
        let open = true
        for (let dz = -1; dz <= 1 && open; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (grid.height[(z + dz) * N + x + dx] >= WATER_LEVEL) { open = false; break }
          }
        }
        if (open) this.cells.push([x, z])
      }
    }

    // --- the school --------------------------------------------------------
    const tones = [
      [C.fishA, C.fishBelly], [C.fishB, C.fishBelly], [C.fishC, C.fishBelly],
    ]
    this.schools = tones.map(([t, b]) => {
      const m = new THREE.InstancedMesh(fishGeometry(t, b), bakedMat({ transparent: true, opacity: 0.85 }), FISH_COUNT)
      m.count = 0
      m.frustumCulled = false
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      // Under the surface and under the water plane, so the water tints them.
      m.renderOrder = 3
      this.group.add(m)
      return m
    })

    /**
     * Stocking, POOL BY POOL.
     *
     * Scattering the school uniformly over every open cell hands almost all of
     * it to whichever body of water is biggest — the southern lake is four times
     * the pond by area, so the pond next to the homestead came out with three
     * fish in it and read as empty. Each pool instead gets a floor of ten and
     * then its share of the rest, so a small pond is worth standing at.
     */
    this.pools = this.floodPools()
    this.fish = []
    const area = this.pools.reduce((n, p) => n + p.length, 0) || 1
    let i = 0
    for (const pool of this.pools) {
      const want = Math.min(pool.length * 2, Math.round(10 + (FISH_COUNT - 10 * this.pools.length) * (pool.length / area)))
      for (let k = 0; k < want && i < FISH_COUNT; k++, i++) {
        const [x, z] = pool[Math.floor(this.rand() * pool.length)]
        this.fish.push({
          school: i % this.schools.length,
          home: new THREE.Vector2(x + 0.5, z + 0.5),
          phase: this.rand() * Math.PI * 2,
          radius: 0.7 + this.rand() * 1.9,
          speed: 0.24 + this.rand() * 0.34,
          depth: 0.3 + this.rand() * 0.55,
          size: 0.8 + this.rand() * 0.6,
        })
      }
    }

    // --- ripples -----------------------------------------------------------
    this.rippleMesh = new THREE.InstancedMesh(
      RING,
      new THREE.MeshBasicMaterial({ color: new THREE.Color().setStyle(C.waterFoam, THREE.SRGBColorSpace), transparent: true, opacity: 0.5, depthWrite: false }),
      RIPPLE_POOL,
    )
    this.rippleMesh.count = 0
    this.rippleMesh.frustumCulled = false
    this.rippleMesh.renderOrder = 6
    this.rippleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.group.add(this.rippleMesh)
    this.ripples = []

    // --- surface motes -----------------------------------------------------
    const motePos = new Float32Array(MOTE_COUNT * 3)
    this.moteHome = []
    for (let i = 0; i < MOTE_COUNT; i++) {
      const c = this.cells.length ? this.cells[Math.floor(this.rand() * this.cells.length)] : [N / 2, N / 2]
      this.moteHome.push([c[0] + this.rand(), c[1] + this.rand(), this.rand() * Math.PI * 2])
      motePos[i * 3] = c[0]
      motePos[i * 3 + 1] = this.surface + 0.02
      motePos[i * 3 + 2] = c[1]
    }
    const moteGeo = new THREE.BufferGeometry()
    moteGeo.setAttribute('position', new THREE.Float32BufferAttribute(motePos, 3))
    this.motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({
      color: new THREE.Color().setStyle(C.waterFoam, THREE.SRGBColorSpace),
      size: 0.14, sizeAttenuation: true, transparent: true, opacity: 0.7, depthWrite: false,
    }))
    this.motes.frustumCulled = false
    this.motes.renderOrder = 7
    this.group.add(this.motes)

    this._m = new THREE.Matrix4()
    this._q = new THREE.Quaternion()
    this._e = new THREE.Euler()
    this._p = new THREE.Vector3()
    this._s = new THREE.Vector3()
    this._t = 0
    this._idleRipple = 0
  }

  /** Split the open cells into connected bodies of water, so each can be
   *  stocked on its own. Plain flood fill over the open set. */
  floodPools() {
    const key = (x, z) => z * N + x
    const open = new Set(this.cells.map(([x, z]) => key(x, z)))
    const pools = []
    while (open.size) {
      const first = open.values().next().value
      const stack = [first]
      open.delete(first)
      const pool = []
      while (stack.length) {
        const i = stack.pop()
        const x = i % N, z = (i - x) / N
        pool.push([x, z])
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const j = key(x + dx, z + dz)
          if (open.has(j)) { open.delete(j); stack.push(j) }
        }
      }
      // A three-cell puddle is not a pool and stocking it looks like a bug.
      if (pool.length >= 8) pools.push(pool)
    }
    return pools.sort((a, b) => b.length - a.length)
  }

  /** Is there fishable water at this cell? */
  fishableAt(x, z) { return this.grid.height[z * N + x] <= WATER_LEVEL - 1 }

  /** Fire a ring. `strength` scales how far it grows and how long it lasts. */
  ripple(x, z, strength = 1) {
    if (this.ripples.length >= RIPPLE_POOL) this.ripples.shift()
    this.ripples.push({ x, z, t: 0, life: 0.9 + strength * 0.7, max: 0.5 + strength * 1.5 })
  }

  /** A cast or a landed fish: a tight burst of rings. */
  splash(x, z, strength = 1) {
    this.ripple(x, z, strength)
    for (let i = 0; i < 2; i++) {
      setTimeout(() => this.ripple(x + (this.rand() - 0.5) * 0.4, z + (this.rand() - 0.5) * 0.4, strength * 0.6), 90 * (i + 1))
    }
  }

  /** How many fish are circling within `r` of a point — the fishing system reads
   *  this to decide how fast a bite comes. */
  densityAt(x, z, r = 6) {
    let n = 0
    for (const f of this.fish) {
      if ((f.home.x - x) ** 2 + (f.home.y - z) ** 2 < r * r) n++
    }
    return n
  }

  update(dt, sky) {
    this._t += dt
    const counts = new Array(this.schools.length).fill(0)

    for (const f of this.fish) {
      const a = f.phase + this._t * f.speed
      const x = f.home.x + Math.cos(a) * f.radius
      const z = f.home.y + Math.sin(a) * f.radius
      // Only draw a fish that is still over water — the loop can carry one over
      // a shoal, and a fish swimming through a beach is memorable for the wrong
      // reason.
      const cx = Math.floor(x), cz = Math.floor(z)
      if (cx < 0 || cz < 0 || cx >= N || cz >= N || !this.fishableAt(cx, cz)) continue
      const mesh = this.schools[f.school]
      const i = counts[f.school]
      if (i >= FISH_COUNT) continue
      counts[f.school]++

      // Facing is the tangent of the circle, and the body rolls slightly into
      // the turn. Two lines, and without them a fish reads as a floating brick.
      this._e.set(Math.sin(this._t * 2 + f.phase) * 0.12, a + Math.PI / 2, Math.sin(a * 2) * 0.14)
      this._q.setFromEuler(this._e)
      this._p.set(x, this.surface - f.depth + Math.sin(this._t * 1.3 + f.phase) * 0.06, z)
      this._s.setScalar(f.size)
      this._m.compose(this._p, this._q, this._s)
      mesh.setMatrixAt(i, this._m)
    }
    this.schools.forEach((m, i) => {
      m.count = counts[i]
      m.instanceMatrix.needsUpdate = true
      // Fish go down at night. They are not visible in the dark anyway, and it
      // is the cheapest possible reason for the lake to feel different at 22:00.
      m.material.opacity = 0.25 + sky.day * 0.62
    })

    // Idle rings, so the surface is never completely dead.
    this._idleRipple -= dt
    if (this._idleRipple <= 0 && this.cells.length) {
      this._idleRipple = 0.35 + this.rand() * 1.1
      const [x, z] = this.cells[Math.floor(this.rand() * this.cells.length)]
      this.ripple(x + 0.5, z + 0.5, 0.35)
    }

    let r = 0
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const rp = this.ripples[i]
      rp.t += dt
      if (rp.t >= rp.life) {
        this.ripples.splice(i, 1)
        continue
      }
      const k = rp.t / rp.life
      this._e.set(0, 0, 0)
      this._q.setFromEuler(this._e)
      this._p.set(rp.x, this.surface + 0.03, rp.z)
      this._s.setScalar(0.2 + k * rp.max * 2)
      this._m.compose(this._p, this._q, this._s)
      this.rippleMesh.setMatrixAt(r++, this._m)
    }
    this.rippleMesh.count = r
    this.rippleMesh.instanceMatrix.needsUpdate = true
    this.rippleMesh.material.opacity = 0.45 * (0.4 + sky.day * 0.6)

    // Motes drift on a slow lissajous — no two on the same path, and none of
    // them ever leaves the water it started on.
    const pos = this.motes.geometry.attributes.position
    for (let i = 0; i < MOTE_COUNT; i++) {
      const [hx, hz, ph] = this.moteHome[i]
      pos.setXYZ(
        i,
        hx + Math.sin(this._t * 0.16 + ph) * 0.7,
        this.surface + 0.02 + Math.sin(this._t * 0.9 + ph) * 0.015,
        hz + Math.cos(this._t * 0.11 + ph * 1.7) * 0.7,
      )
    }
    pos.needsUpdate = true
    this.motes.material.opacity = 0.2 + sky.day * 0.45
  }

  dispose() {
    for (const m of this.schools) {
      m.geometry.dispose()
      m.material.dispose()
      m.dispose()
    }
    this.rippleMesh.geometry.dispose()
    this.rippleMesh.material.dispose()
    this.rippleMesh.dispose()
    this.motes.geometry.dispose()
    this.motes.material.dispose()
    this.group.clear()
  }
}

/** The colours the school is painted in — kept next to the fish so a new
 *  species is one line here and one entry in the catch table. */
export const FISH_TONES = { a: C.fishA, b: C.fishB, c: C.fishC, belly: C.fishBelly, rod: UI.stoneDeep }
