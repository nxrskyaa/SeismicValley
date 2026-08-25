import { CHUNKS, Grid, N, P, WATER_LEVEL } from './grid.js'
import { G } from '../core/palette.js'
import { chance, clamp, fbm, noise2, randInt, rng, smoothstep } from '../core/rng.js'

/**
 * Making a valley.
 *
 * The shape is deliberately not "noise, then threshold". A farming game needs a
 * readable stage, so the terrain is composed of four things that each do one
 * job, and noise only ever perturbs them:
 *
 *   BASIN   a broad bowl, so the map has a middle and the eye knows where to go
 *   RIDGES  a hard rise at the border, so the world ends in rock rather than in
 *           a horizon you can walk off
 *   FAULT   one diagonal crease across the whole valley — Seismic Valley is on a
 *           fault and the fault should be visible from the first frame
 *   RIVER   a carved channel from the north ridge to the southern lake
 *
 * Heights are quantised to integer levels at the very end. Quantising earlier
 * makes every later operation fight the staircase it just created.
 */

// The four named places, all west of the river on purpose: a homestead the
// river runs through is a homestead you cannot plant half of.
export const HOME = { x: 34, z: 54 } // the player's plot
export const VILLAGE = { x: 26, z: 28 } // the three villagers
export const GATE = { x: 62, z: 20 } // Rocky's post, sitting on the fault
export const YARD = { x: 46, z: 40 } // the training yard

export function generate(seed) {
  const grid = new Grid()
  const r = rng(seed)
  const land = fbm(seed + 11, 5)
  const rough = fbm(seed + 23, 3)
  const moist = fbm(seed + 37, 3)
  const patch = noise2(seed + 53)
  const mid = (N - 1) / 2

  // ------------------------------------------------------------- heights --
  // Built as floats and quantised once, at the bottom.
  const raw = new Float32Array(N * N)
  // Where the fault runs: a straight line through the map, angled so it crosses
  // the homestead's horizon rather than sitting parallel to the camera.
  const faultAt = (x, z) => (x - mid) * 0.86 + (z - mid) * 0.51 + (land(x * 0.03, z * 0.03) - 0.5) * 26

  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      // Radial term, on the longer of the two axes so the valley is a bowl and
      // not an ellipse squashed into the map's aspect.
      const d = Math.max(Math.abs(x - mid), Math.abs(z - mid)) / mid
      const basin = 7.6 + smoothstep(0.44, 1.0, d) * 16
      // Low frequencies only. High-frequency terrain in a game whose whole verb
      // is "put a field here" reads as static: every cell a level off its
      // neighbour, no plateau big enough to farm, and a horizon that fizzes.
      const detail = (land(x * 0.034, z * 0.034) - 0.5) * 8.4 + (rough(x * 0.075, z * 0.075) - 0.5) * 1.5
      // The fault: a short, sharp step, not a slope. Everything on the far side
      // rides about two levels higher.
      const f = faultAt(x, z)
      const step = smoothstep(-2.2, 2.2, f) * 2.6
      raw[z * N + x] = basin + detail + step
    }
  }

  // River: a wandering channel cut top-to-bottom, widening as it falls. Held to
  // the eastern third so it never crosses a named place.
  let rx = N * 0.8
  for (let z = 0; z < N; z++) {
    rx += (land(z * 0.09, 4.5) - 0.5) * 2.2
    rx = clamp(rx, N * 0.58, N - 9)
    const width = 2.1 + (z / N) * 4.4
    for (let x = Math.floor(rx - width - 2); x <= Math.ceil(rx + width + 2); x++) {
      if (x < 0 || x >= N) continue
      const t = 1 - clamp(Math.abs(x - rx) / (width + 2), 0, 1)
      const cut = smoothstep(0, 1, t) * 7.5
      const i = z * N + x
      raw[i] = Math.min(raw[i], Math.max(2.4, raw[i] - cut))
    }
  }

  // The southern lake the river runs into. Flat-bottomed on purpose: a lake with
  // a noisy floor reads as a puddle field once the water plane is drawn over it.
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const d = Math.hypot(x - N * 0.78, z - N * 0.85) / 15
      if (d < 1) {
        const i = z * N + x
        raw[i] = Math.min(raw[i], 3.1 + smoothstep(0.55, 1, d) * 5)
      }
    }
  }

  // Smoothing, before the quantiser and not after. Blurring integer levels only
  // ever produces more integer levels; blurring the float field is what actually
  // turns a fizzing surface into terraces with room to plant on.
  const blur = new Float32Array(N * N)
  for (let pass = 0; pass < 2; pass++) {
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        let sum = 0, n = 0
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, nz = z + dz
            if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue
            sum += raw[nz * N + nx] * (dx === 0 && dz === 0 ? 3 : 1)
            n += dx === 0 && dz === 0 ? 3 : 1
          }
        }
        blur[z * N + x] = sum / n
      }
    }
    raw.set(blur)
  }

  // Quantise. Nothing above this line knows about levels.
  for (let i = 0; i < N * N; i++) grid.height[i] = clamp(Math.round(raw[i]), 0, 40)

  // Despeckle. A cell one level above every neighbour is a pimple and a cell one
  // level below every neighbour is a pit; both are quantiser artefacts rather
  // than landscape, and both cost four cliff quads apiece to draw.
  for (let pass = 0; pass < 2; pass++) {
    for (let z = 1; z < N - 1; z++) {
      for (let x = 1; x < N - 1; x++) {
        const i = z * N + x
        const h = grid.height[i]
        if (h < WATER_LEVEL) continue
        const a = grid.height[i - 1], b = grid.height[i + 1], c = grid.height[i - N], d = grid.height[i + N]
        const hi = Math.max(a, b, c, d), lo = Math.min(a, b, c, d)
        if (h > hi) grid.height[i] = hi
        else if (h < lo) grid.height[i] = lo
      }
    }
  }

  // Terrace pass: soften any step of three or more, because a valley made
  // entirely of unclimbable walls is a maze. Seeded, so the same valley comes
  // back the same way.
  for (let pass = 0; pass < 2; pass++) {
    for (let z = 1; z < N - 1; z++) {
      for (let x = 1; x < N - 1; x++) {
        const i = z * N + x
        const h = grid.height[i]
        if (h < WATER_LEVEL) continue
        const lo = Math.min(grid.height[i - 1], grid.height[i + 1], grid.height[i - N], grid.height[i + N])
        if (h - lo >= 3 && chance(r, 0.6)) grid.height[i] = h - 1
      }
    }
  }

  // ------------------------------------------------------------- surfaces --
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const i = z * N + x
      const h = grid.height[i]
      const slope = Math.max(
        Math.abs(h - grid.h(x - 1, z)), Math.abs(h - grid.h(x + 1, z)),
        Math.abs(h - grid.h(x, z - 1)), Math.abs(h - grid.h(x, z + 1)),
      )
      const m = moist(x * 0.06, z * 0.06)
      let g
      if (h < WATER_LEVEL) g = G.SHORE
      else if (h === WATER_LEVEL || (h === WATER_LEVEL + 1 && grid.nearWater(x, z))) g = G.SHORE
      else if (slope >= 2) g = G.ROCK
      else if (m > 0.62 && h < 12) g = G.LOAM
      else if (patch(x * 0.17, z * 0.17) > 0.755) g = G.ASH
      else g = G.MEADOW
      grid.ground[i] = g
      // The fault itself is scarred ground: a one-cell band of burnt rock that
      // makes the crease legible from the ridge.
      if (Math.abs(faultAt(x, z)) < 0.9 && h >= WATER_LEVEL) grid.ground[i] = G.SCAR
    }
  }

  // ---------------------------------------------------------------- props --
  const forest = fbm(seed + 71, 3)
  const SPECIES = 3
  for (let z = 2; z < N - 2; z++) {
    for (let x = 2; x < N - 2; x++) {
      const i = z * N + x
      const g = grid.ground[i]
      if (grid.height[i] < WATER_LEVEL) continue
      const near = (p, rad) => Math.abs(x - p.x) < rad && Math.abs(z - p.z) < rad
      if (near(HOME, 11) || near(VILLAGE, 9) || near(GATE, 7) || near(YARD, 7)) continue

      const density = forest(x * 0.07, z * 0.07)
      if ((g === G.MEADOW || g === G.LOAM) && density > 0.58 && chance(r, (density - 0.58) * 1.5)) {
        grid.prop[i] = P.TREE
        grid.propData[i] = randInt(r, 0, SPECIES - 1)
      } else if (g === G.ROCK && chance(r, 0.09)) {
        grid.prop[i] = P.ROCK
        grid.propData[i] = randInt(r, 0, 2)
      } else if (g === G.SCAR && chance(r, 0.06)) {
        // Geodes seed along the fault. They are the reason to walk it.
        grid.prop[i] = P.GEODE
        grid.propData[i] = randInt(r, 0, 3)
      } else if ((g === G.MEADOW || g === G.ASH) && chance(r, 0.16)) {
        grid.prop[i] = P.GRASS
        grid.propData[i] = randInt(r, 0, 3)
      }
    }
  }

  // ------------------------------------------------------------ clearings --
  // Every named place gets a flat pad. Doing this after props means a pad also
  // clears whatever the forest pass dropped on it.
  const pad = (p, w, d) => {
    const x0 = p.x - (w >> 1), z0 = p.z - (d >> 1)
    // Never below the waterline plus two: a clearing that averages out at the
    // river's level is a clearing you cannot stand in.
    const h = Math.max(WATER_LEVEL + 2, grid.averageH(x0, z0, w, d))
    for (let z = z0; z < z0 + d; z++) {
      for (let x = x0; x < x0 + w; x++) {
        if (!Grid.inBounds(x, z)) continue
        const i = z * N + x
        // Feather the edge so a pad does not sit in the valley like a table.
        const edge = Math.min(x - x0, x0 + w - 1 - x, z - z0, z0 + d - 1 - z)
        grid.height[i] = edge >= 1 ? h : Math.round((grid.height[i] + h) / 2)
        grid.prop[i] = P.NONE
        if (grid.ground[i] !== G.SCAR) grid.ground[i] = edge >= 1 ? G.LOAM : grid.ground[i]
      }
    }
    return h
  }
  const homeH = pad(HOME, 20, 18)
  pad(VILLAGE, 16, 14)
  pad(GATE, 12, 12)
  pad(YARD, 12, 12)

  grid.touchAll()
  return { grid, homeH, seed }
}

/** Every chunk index, for the first build. */
export const allChunks = () => Array.from({ length: CHUNKS * CHUNKS }, (_, i) => i)
