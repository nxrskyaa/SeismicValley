import { Grid, N, P } from './grid.js'

/**
 * THE SOFT SHADOW EVERYTHING STANDS IN.
 *
 * The valley had no shadow of any kind under a tree, a house or a body, so the
 * whole world read as flat sheets of ground with objects pasted onto them, and
 * the meadow — the largest thing on screen by far — was a single unvarying tone
 * from edge to edge.
 *
 * `CLAUDE.md` said the reference had no cast shadows anywhere in it, and that
 * was too strong a reading. Sampled: ground pixels in the reference footage have
 * two clear modes, lit at 188 and shaded at 164 — a multiplier of **0.87** — and
 * the falloff between them is gradual over several cells. There are no hard
 * directional shadows, which is why the shadow map stays off; there is plainly a
 * soft occlusion under every canopy.
 *
 * ## Why it is baked into the ground and not rendered
 *
 * A blob quad per tree is hundreds of transparent draws laid over the terrain,
 * sorted every frame, z-fighting on terrace lips. The world is an integer grid
 * and the mesher already writes vertex colours — so the shadow is a multiplier
 * folded into those. No draw calls, no sorting, no z-fighting, and it terraces
 * correctly for free because it IS the terrain.
 *
 * The mesher samples this field at the CORNERS of each cell rather than at its
 * centre, and neighbouring quads share those corners, so what the GPU draws is a
 * continuous gradient. Sampling per cell — which is how this shipped — gave the
 * right values and the wrong picture: a mosaic of one-cell squares, because a
 * flat quad forty pixels across shows a 2% step as an edge.
 *
 * Things that move cannot use this and get a real quad instead; there are five
 * of them, not five hundred.
 */

/** The darkest a shaded cell may get. Measured off the reference footage. */
export const SHADE_FLOOR = 0.87

/** How much occlusion one source deposits, and how far it reaches, in cells. */
const SOURCES = {
  [P.TREE]: { weight: 1.0, radius: 2 },
  [P.STUMP]: { weight: 0.3, radius: 1 },
  [P.ROCK]: { weight: 0.45, radius: 1 },
  [P.GEODE]: { weight: 0.4, radius: 1 },
  [P.BUILDING]: { weight: 1.0, radius: 2 },
}

/**
 * Compute the occlusion field for a grid.
 *
 * Two passes: deposit, then blur. The blur is what makes it read as a shadow
 * rather than as a stain the shape of the footprint — the reference's falloff
 * runs over about three cells, so a pair of cheap box passes is plenty.
 */
export function computeShade(grid, buildings = []) {
  const acc = new Float32Array(N * N)

  const deposit = (cx, cz, weight, radius) => {
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = cx + dx
        const z = cz + dz
        if (!Grid.inBounds(x, z)) continue
        // Round falloff. A square deposit reads as a box even after blurring.
        const d = Math.hypot(dx, dz)
        if (d > radius + 0.5) continue
        acc[z * N + x] += weight * (1 - d / (radius + 1))
      }
    }
  }

  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const src = SOURCES[grid.prop[z * N + x]]
      if (src) deposit(x, z, src.weight, src.radius)
    }
  }

  /**
   * Buildings occlude across their whole footprint, not just the one cell the
   * prop layer marks. A cottage is seven cells across and a single-cell shadow
   * under the middle of it looks like a stain on the floor.
   */
  for (const b of buildings) {
    const fw = Math.max(1, Math.floor((b.fw ?? 4) / 2))
    const fd = Math.max(1, Math.floor((b.fd ?? 4) / 2))
    for (let dz = -fd; dz <= fd; dz++) {
      for (let dx = -fw; dx <= fw; dx++) deposit(b.x + dx, b.z + dz, 0.5, 1)
    }
  }

  // --- blur ------------------------------------------------------------------
  const blurred = boxBlur(boxBlur(acc))

  const shade = new Float32Array(N * N)
  for (let i = 0; i < shade.length; i++) {
    // `acc` is unbounded — a tree in a stand gets deposits from its neighbours
    // too — so it is squashed rather than clamped, which keeps a dense wood
    // darker than a lone tree without ever going past the measured floor.
    /**
     * The gain is solved, not chosen.
     *
     * At 1.1 the deepest cell in a generated valley came out at 0.928 — the
     * squash saturates slowly, so the 0.87 floor measured off the footage was
     * never actually reached and every shadow was a little over half the depth
     * it was supposed to be. 3.2 puts a dense stand on the floor and leaves a
     * lone tree around 0.90, which is the shape the footage has.
     */
    const t = 1 - Math.exp(-blurred[i] * 3.2)
    shade[i] = 1 - (1 - SHADE_FLOOR) * t
  }
  return shade
}

/** Separable box blur, radius 1, on an N x N field. */
function boxBlur(src) {
  const tmp = new Float32Array(N * N)
  const out = new Float32Array(N * N)
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const a = src[z * N + Math.max(0, x - 1)]
      const b = src[z * N + x]
      const c = src[z * N + Math.min(N - 1, x + 1)]
      tmp[z * N + x] = (a + b + c) / 3
    }
  }
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const a = tmp[Math.max(0, z - 1) * N + x]
      const b = tmp[z * N + x]
      const c = tmp[Math.min(N - 1, z + 1) * N + x]
      out[z * N + x] = (a + b + c) / 3
    }
  }
  return out
}
