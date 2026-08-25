import { N, P, WATER_LEVEL } from '../world/grid.js'
import { G } from '../core/palette.js'

/**
 * WHAT A PEBBLE DOES ALL DAY.
 *
 * The valley has three moving things in it and two of them are constructs, so
 * "the NPCs stand near the house" is not a small complaint — it is most of what
 * the world does while you are not looking at it.
 *
 * The fix is not more characters. It is that each pebble picks a JOB at dawn,
 * walks somewhere specific to do it, and does something you can read from thirty
 * metres up. A job is three things:
 *
 *   WANT   a predicate on a cell. Not "somewhere over there" — a shore, a
 *          standing tree, a rock, the scar, a ridge with a view. Which is why
 *          they end up scattered: the valley's own features do the spacing, and
 *          they do it better than a minimum-distance rule would.
 *   POSE   what the body does once it arrives, driven by one phase value.
 *   SAY    a line for the journal, so the day has a record in it.
 *
 * ## Why they do not follow you
 *
 * They used to. A pebble within twenty-six metres would path to two and a half
 * metres behind the player and stay there, which meant that in practice every
 * pebble you had ever hatched was standing in your garden in a clump. Following
 * is now ONE job out of eight, rolled like any other — so it still happens, it
 * is a nice surprise when it does, and it is not the default state of the world.
 */

const inBounds = (x, z) => x > 1 && z > 1 && x < N - 2 && z < N - 2

/** A cell that is dry land you can put a small stone person on. */
const dry = (grid, x, z) => inBounds(x, z) && !grid.isWater(x, z) && grid.prop[z * N + x] !== P.TREE

/** Is any of the eight neighbours water? Used for shore jobs — the pebble wants
 *  to be NEXT to the water, not in it. */
function beside(grid, x, z, test) {
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue
      if (inBounds(x + dx, z + dz) && test(grid, x + dx, z + dz)) return true
    }
  }
  return false
}

export const JOBS = [
  {
    id: 'shore',
    label: 'sitting at the water',
    say: 'sat at the water all afternoon and did not do anything else',
    want: (grid, x, z) => dry(grid, x, z) && beside(grid, x, z, (g, a, b) => g.isWater(a, b)),
    // Sits low, rocks slowly, head tipped down at the water.
    pose: (rig, t) => {
      rig.anim.speed = 0
      rig.body.position.y = -0.12
      rig.body.rotation.z = Math.sin(t * 0.7) * 0.05
      rig.head.rotation.x = 0.35 + Math.sin(t * 0.5) * 0.06
      rig.armL.rotation.x = -0.5
      rig.armR.rotation.x = -0.5
    },
  },
  {
    id: 'tree',
    label: 'listening to a tree',
    say: 'spent the day with one ear against a trunk',
    want: (grid, x, z) => dry(grid, x, z) && beside(grid, x, z, (g, a, b) => g.prop[b * N + a] === P.TREE),
    // Leans in, one arm up against the trunk, very still.
    pose: (rig, t) => {
      rig.anim.speed = 0
      rig.body.rotation.x = 0.16
      rig.head.rotation.z = 0.4
      rig.armR.rotation.x = -1.5
      rig.armL.rotation.x = -0.1 + Math.sin(t * 0.4) * 0.04
    },
  },
  {
    id: 'rock',
    label: 'tapping on a rock',
    say: 'tapped the same rock for six hours and will not say why',
    want: (grid, x, z) => dry(grid, x, z) && beside(grid, x, z, (g, a, b) => g.prop[b * N + a] === P.ROCK),
    // The one job with a beat in it. Two taps and a pause, forever.
    pose: (rig, t) => {
      rig.anim.speed = 0
      const beat = (t * 2.1) % 3
      const swing = beat < 1 ? Math.sin(beat * Math.PI) : 0
      rig.armR.rotation.x = -0.5 - swing * 1.2
      rig.armL.rotation.x = -0.3
      rig.body.position.y = swing * 0.03
      rig.head.rotation.x = 0.2
    },
  },
  {
    id: 'scar',
    label: 'walking the fault',
    say: 'walked the fault line end to end, again',
    // The scarred band along the fault, not a geode: geodes get broken open and
    // a job whose destination the player can delete is a job that stops working
    // on day three.
    want: (grid, x, z) => dry(grid, x, z) && grid.ground[z * N + x] === G.SCAR,
    // Does not stop. Paces a short beat back and forth.
    pose: (rig, t) => {
      rig.anim.speed = 0.5
      rig.body.rotation.y = Math.sin(t * 0.5) * 2.6
    },
  },
  {
    id: 'ridge',
    label: 'looking at the weather',
    say: 'stood on the high ground watching the weather come in',
    want: (grid, x, z) => dry(grid, x, z) && grid.height[z * N + x] > WATER_LEVEL + 7,
    // Faces out, head up, arms down. The one that reads as somebody thinking.
    pose: (rig, t) => {
      rig.anim.speed = 0
      rig.head.rotation.x = -0.28
      rig.body.rotation.y = Math.sin(t * 0.11) * 0.5
      rig.armL.rotation.x = rig.armR.rotation.x = 0.05
    },
  },
  {
    id: 'sun',
    label: 'sitting in the sun',
    say: 'sat in the grass in the middle of the afternoon and did nothing at all',
    want: (grid, x, z) => dry(grid, x, z) && !beside(grid, x, z, (g, a, b) => g.prop[b * N + a] !== P.NONE),
    /**
     * Sitting back on its hands, breathing.
     *
     * Not lying flat. The body group's origin is at the FEET, so a rotation big
     * enough to lay the figure down swings the head through the ground and out
     * the other side — the first version of this pose was a pebble buried to the
     * shoulders. Fifty degrees is as far back as this rig goes.
     */
    pose: (rig, t) => {
      rig.anim.speed = 0
      const b = Math.sin(t * 0.9) * 0.03
      rig.body.position.y = -0.2
      rig.body.rotation.x = -0.55
      rig.body.scale.set(1 + b, 1 - b, 1 + b)
      rig.armL.rotation.x = 0.9
      rig.armR.rotation.x = 0.9
      rig.head.rotation.x = 0.25
    },
  },
  {
    id: 'stack',
    label: 'building something small',
    say: 'built a cairn out of six stones and knocked it down',
    want: (grid, x, z) => dry(grid, x, z) && grid.height[z * N + x] <= WATER_LEVEL + 3,
    // Crouched, both arms working, the whole body bobbing with the effort.
    pose: (rig, t) => {
      rig.anim.speed = 0
      const w = Math.sin(t * 2.4)
      rig.body.position.y = -0.14 + Math.abs(w) * 0.03
      rig.body.rotation.x = 0.3
      rig.armL.rotation.x = -1.1 + w * 0.5
      rig.armR.rotation.x = -1.1 - w * 0.5
      rig.head.rotation.x = 0.45
    },
  },
  {
    id: 'follow',
    label: 'following you around',
    say: 'followed me around all day for no reason it was willing to give',
    // No `want` — this one is handled specially, because its destination moves.
    follows: true,
    pose: null,
  },
]

export const JOB_IDS = JOBS.map((j) => j.id)

/**
 * Where each job CAN be done, indexed once a day.
 *
 * The first version of this sampled rings outward from a seed cell and took the
 * first match. It read well and it did not work: rocks cover about half a per
 * cent of the map and geodes rather less, so a sparse ring sample missed them
 * almost every time, three tries failed, and every pebble fell through to
 * following the player — which is precisely the behaviour the whole system was
 * built to stop. It failed *quietly*, as the good ones do.
 *
 * So: one full scan per job, cached for the day. That is nine thousand cells and
 * eight neighbour tests per job, once per fifteen real minutes, against a search
 * that has to succeed or the valley goes back to feeling empty.
 */
const CACHE = new WeakMap()

export function jobSites(grid, job, day = 0) {
  let byGrid = CACHE.get(grid)
  if (!byGrid || byGrid.day !== day) {
    byGrid = { day, map: new Map() }
    CACHE.set(grid, byGrid)
  }
  let sites = byGrid.map.get(job.id)
  if (sites) return sites
  sites = []
  if (job.want) {
    for (let z = 2; z < N - 2; z++) {
      for (let x = 2; x < N - 2; x++) if (job.want(grid, x, z)) sites.push([x, z])
    }
  }
  byGrid.map.set(job.id, sites)
  return sites
}

/**
 * Somewhere to do `job`, preferring spots near the seed cell.
 *
 * Nearest-of-a-random-handful rather than strictly nearest: strictly nearest
 * sends every pebble that rolls "rock" to the same rock, and a pebble that walks
 * sixty cells past four identical trees looks broken. Sampling twelve and taking
 * the closest gets both.
 */
export function findSpot(grid, job, sx, sz, maxRadius = 26, day = 0, rand = Math.random) {
  const sites = jobSites(grid, job, day)
  if (!sites.length) return null
  let best = null
  let bestD = Infinity
  const tries = Math.min(12, sites.length)
  for (let i = 0; i < tries; i++) {
    const c = sites[Math.floor(rand() * sites.length)]
    const d = (c[0] - sx) ** 2 + (c[1] - sz) ** 2
    if (d < bestD) { bestD = d; best = c }
  }
  // Too far to be worth walking to is still better than not going at all, but
  // only if there is genuinely nothing closer — hence the wide fallback.
  if (best && bestD > (maxRadius * 3) ** 2) return null
  return best
}
