import { CHUNKS, Grid, N, P, WATER_LEVEL } from './grid.js'
import { G } from '../core/palette.js'
import { chance, clamp, fbm, noise2, randInt, rng, smoothstep, shuffle } from '../core/rng.js'

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

/**
 * The two named places, both west of the river on purpose: a homestead the
 * river runs through is a homestead you cannot plant half of.
 *
 * There is no village. You were the only person underground when the world was
 * rolled back, and the survivors are scattered and do not know about each
 * other — so the map has your plot, and it has the relay on the north ridge
 * that was standing before any of it happened.
 */
export const HOME = { x: 34, z: 54 } // your plot
export const GATE = { x: 62, z: 20 } // the relay, and the one thing still standing on it

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
      const basin = 8.6 + smoothstep(0.62, 1.0, d) * 24
      // Low frequencies only. High-frequency terrain in a game whose whole verb
      // is "put a field here" reads as static: every cell a level off its
      // neighbour, no plateau big enough to farm, and a horizon that fizzes.
      const detail = (land(x * 0.016, z * 0.016) - 0.5) * 6.5 + (rough(x * 0.048, z * 0.048) - 0.5) * 1.2
      // The fault: a short, sharp step, not a slope. Everything on the far side
      // rides about two levels higher.
      const f = faultAt(x, z)
      const step = smoothstep(-2.2, 2.2, f) * 1.6
      raw[z * N + x] = basin + detail + step
    }
  }

  // Smoothing, before the quantiser and not after. Blurring integer levels only
  // ever produces more integer levels; blurring the float field is what actually
  // turns a fizzing surface into terraces with room to plant on.
  //
  // The river and the lake are carved AFTER this, further down, for the same
  // reason: three passes of blur over a freshly cut channel fills it back in
  // and the map comes out with a damp streak instead of a river.
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

  // River: a wandering channel cut top-to-bottom, widening as it falls. Held to
  // the eastern third so it never crosses a named place.
  let rx = N * 0.8
  for (let z = 0; z < N; z++) {
    rx += (land(z * 0.09, 4.5) - 0.5) * 2.2
    rx = clamp(rx, N * 0.58, N - 9)
    const width = 4.5 + (z / N) * 7
    for (let x = Math.floor(rx - width - 2); x <= Math.ceil(rx + width + 2); x++) {
      if (x < 0 || x >= N) continue
      const t = 1 - clamp(Math.abs(x - rx) / (width + 2), 0, 1)
      const cut = smoothstep(0, 1, t) * 14
      const i = z * N + x
      raw[i] = Math.min(raw[i], Math.max(2.4, raw[i] - cut))
    }
  }

  /**
   * THE TWO BODIES OF WATER.
   *
   * Flat-bottomed on purpose: a lake with a noisy floor reads as a puddle field
   * once the water plane is drawn over it.
   *
   *   The southern lake is the big one — the river falls into it, it is deep
   *   enough in the middle to hold the rare fish, and it is a destination.
   *   The home pond is a short walk east of the homestead. It exists because a
   *   fishing rod in the starting pack and the only water forty cells away is a
   *   mechanic the player finds out about on day nine.
   *
   * `bowl` cuts one: flat floor out to `flat`, then a shelved rim. The rim
   * matters — a cylinder cut into the terrain gives a swimming pool.
   */
  const bowl = (cx, cz, radius, floor, flat = 0.5) => {
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const d = Math.hypot(x - cx, z - cz) / radius
        if (d >= 1) continue
        const i = z * N + x
        raw[i] = Math.min(raw[i], floor + smoothstep(flat, 1, d) * 5)
      }
    }
  }
  bowl(N * 0.76, N * 0.84, 19, 3.1, 0.55)
  bowl(HOME.x + 13, HOME.z + 2, 8.5, 3.6, 0.42)

  /**
   * TERRACING, and this is the step that decides whether the valley reads as
   * landscape or as corduroy.
   *
   * Rounding a smooth height field to levels gives a smooth STAIRCASE: every
   * cell one level off its neighbour, all the way down every slope. No amount of
   * blurring or median filtering fixes that, because the median of a ramp is the
   * ramp — which is exactly what the first three attempts here proved.
   *
   * So the field is terraced BEFORE it is quantised. Inside each band of `STEP`
   * levels the value is pushed toward the band's floor or ceiling, so most of
   * the band comes out flat and the whole transition happens over a couple of
   * cells. The result is broad shelves separated by real walls, which is what the
   * reference is and what you can actually plant a field on.
   */
  const STEP = 2
  const HARD = 8 // exponent; at 3 the transition eats 60% of the band and nothing is flat
  const terrace = (v) => {
    const f = v / STEP
    const k = Math.floor(f)
    const t = f - k
    // Eased hard from both ends: about four-fifths of each band comes out dead
    // flat and the whole step happens across the middle fifth.
    const shaped = t < 0.5 ? ((t * 2) ** HARD) / 2 : 1 - (((1 - t) * 2) ** HARD) / 2
    return (k + shaped) * STEP
  }
  for (let i = 0; i < N * N; i++) raw[i] = terrace(raw[i])

  // Quantise. Nothing above this line knows about levels.
  for (let i = 0; i < N * N; i++) grid.height[i] = clamp(Math.round(raw[i]), 0, 40)

  // Median filter, twice. This is what turns a staircase into LANDSCAPE: a 3x3
  // median flattens the interior of a slope into a plateau while leaving a real
  // edge exactly where it was, so the valley comes out as broad flat shelves
  // separated by walls two and three levels tall — which is what the reference
  // is, and what a farming game needs, because you cannot plant a field on a
  // gradient of one-level steps.
  const win = new Int8Array(9)
  for (let pass = 0; pass < 1; pass++) {
    const src = Int8Array.from(grid.height)
    for (let z = 1; z < N - 1; z++) {
      for (let x = 1; x < N - 1; x++) {
        const i = z * N + x
        if (src[i] < WATER_LEVEL) continue
        let n = 0
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) win[n++] = src[i + dz * N + dx]
        // Insertion sort of nine values; a full sort call here costs more than
        // the filter it is serving.
        for (let a = 1; a < 9; a++) {
          const v = win[a]
          let b = a - 1
          while (b >= 0 && win[b] > v) { win[b + 1] = win[b]; b-- }
          win[b + 1] = v
        }
        grid.height[i] = win[4]
      }
    }
  }


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

  /**
   * Ramps.
   *
   * Terracing produces walls two and three levels tall, and a body may only step
   * UP one level — so without this the valley is a set of islands. Each pass
   * takes a cell sitting on a tall edge and drops it to an intermediate height,
   * and running it a few times carves scattered ramps down off every shelf.
   *
   * Scattered rather than regular on purpose: a ramp at every edge is a slope,
   * and the whole point of terracing was to stop having one.
   */
  // Two passes at one-in-ten. Any more and the ramps eat the terraces they were
  // supposed to be exceptions to — four passes at a third put the staircase
  // straight back and undid the whole terracing step above.
  for (let pass = 0; pass < 2; pass++) {
    for (let z = 1; z < N - 1; z++) {
      for (let x = 1; x < N - 1; x++) {
        const i = z * N + x
        const h = grid.height[i]
        if (h < WATER_LEVEL) continue
        const lo = Math.min(grid.height[i - 1], grid.height[i + 1], grid.height[i - N], grid.height[i + N])
        if (h - lo >= 2 && chance(r, 0.1)) grid.height[i] = h - 1
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
      // G.STONE, not G.ROCK. There is no ROCK key in the palette's ground table
      // and there never was, so this read `undefined`, every steep cell was
      // written as MEADOW, and the scatter below — which tests the SAME missing
      // key — never fired once. The valley shipped with no rocks in it at all,
      // which meant the pick had nothing to hit and stone could only be bought.
      else if (slope >= 2) g = G.STONE
      else if (m > 0.8 && h < 12) g = G.LOAM
      else if (patch(x * 0.13, z * 0.13) > 0.88) g = G.ASH
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
      if (near(HOME, 11) || near(GATE, 8)) continue

      const density = forest(x * 0.07, z * 0.07)
      if ((g === G.MEADOW || g === G.LOAM) && density > 0.42 && chance(r, 0.26 + (density - 0.42) * 0.5)) {
        grid.prop[i] = P.TREE
        grid.propData[i] = randInt(r, 0, SPECIES - 1)
      } else if (g === G.STONE && chance(r, 0.09)) {
        grid.prop[i] = P.ROCK
        grid.propData[i] = randInt(r, 0, 2)
      } else if (g === G.SCAR && chance(r, 0.15)) {
        // Geodes seed along the fault. They are the reason to walk it.
        grid.prop[i] = P.GEODE
        grid.propData[i] = randInt(r, 0, 3)
      } else if ((g === G.MEADOW || g === G.ASH) && chance(r, 0.075)) {
        grid.prop[i] = P.GRASS
        grid.propData[i] = randInt(r, 0, 3)
      }
    }
  }

  /**
   * THINNING THE FOREST.
   *
   * A canopy in this game is a cluster of 1.25-unit cubes spanning three cells,
   * so two trunks two cells apart do not read as two trees — they read as one
   * lumpy mass with two sticks under it, and five of them together read as a
   * hedge. The reference footage has nothing like that in it: its trees stand
   * apart with sky between them, and the gaps are as much of the look as the
   * trees are.
   *
   * Per-cell probability cannot produce that no matter what number you give it.
   * Poisson noise clumps — that is the definition of it — so the fix is not a
   * different density, it is a minimum distance.
   *
   * Dart throwing: walk the candidates in a SHUFFLED order and keep one only if
   * nothing already kept is within `GAP`. Shuffled, because a raster scan keeps
   * whatever is furthest north-west and lays the survivors out on a visible
   * diagonal lattice. The result is blue noise — even spacing, no lattice, and
   * no two canopies touching.
   */
  const GAP = 4
  const candidates = []
  for (let i = 0; i < N * N; i++) if (grid.prop[i] === P.TREE) candidates.push(i)
  shuffle(r, candidates)
  const kept = new Uint8Array(N * N)
  for (const i of candidates) {
    const x = i % N, z = (i - x) / N
    let clear = true
    for (let dz = -GAP; dz <= GAP && clear; dz++) {
      for (let dx = -GAP; dx <= GAP; dx++) {
        if (dx * dx + dz * dz > GAP * GAP) continue
        const nx = x + dx, nz = z + dz
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue
        if (kept[nz * N + nx]) { clear = false; break }
      }
    }
    if (clear) kept[i] = 1
    else grid.prop[i] = P.NONE
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
        // The pad FLATTENS the ground; it does not repaint it. Painting twenty
        // by eighteen cells of clay put a rose rectangle under the camera that
        // dominated every frame of play — the reference has nothing like it, and
        // the player is about to till whatever they want here anyway.
      }
    }
    return h
  }
  const homeH = pad(HOME, 20, 18)
  pad(GATE, 12, 12)

  grid.touchAll()
  return { grid, homeH, seed }
}

/** Every chunk index, for the first build. */
export const allChunks = () => Array.from({ length: CHUNKS * CHUNKS }, (_, i) => i)
