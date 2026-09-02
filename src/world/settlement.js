import { KINDS } from './buildings.js'
import { Grid, N, P } from './grid.js'
import { G } from '../core/palette.js'
import { GATE, HOME } from './worldgen.js'
import { isRestorable, openPlot, plotFor } from '../game/colony.js'

/**
 * WHERE EVERYTHING STANDS.
 *
 * Split out of the game's boot so the layout can be TESTED. The first street
 * was written as a loop of `put(...)` calls with hand-picked coordinates, and
 * the houses went through each other: cottages were spaced five cells apart and
 * their footprints are seven, so every neighbour overlapped its neighbour by two
 * and the whole row shared walls. Nothing caught it because a capture of two
 * houses occupying the same ground looks like a street until you walk into it.
 *
 * The fix is not better coordinates. It is that a building CLAIMS a rectangle
 * and a claim that intersects an existing one is refused — so a layout is
 * correct by construction rather than by arithmetic done in my head. Anything
 * refused is reported rather than silently dropped, because a plan that quietly
 * loses half its buildings is worse than one that fails.
 *
 * `tools/overlap.mjs buildings` runs this against three seeds and asserts no
 * two claims intersect.
 */

/** Cells of clear ground left between one footprint and the next. */
const VERGE = 2

/**
 * A claim on the ground. Buildings are placed from a CENTRE, so the rectangle is
 * the footprint centred on it, grown by the verge on every side.
 */
function claim(kind, level, x, z) {
  const [fw, fd] = KINDS[kind](level).footprint
  return {
    kind,
    level,
    x,
    z,
    x0: x - fw / 2 - VERGE, x1: x + fw / 2 + VERGE,
    z0: z - fd / 2 - VERGE, z1: z + fd / 2 + VERGE,
    // The footprint itself, without the verge — what the overlap test measures.
    fw,
    fd,
  }
}

const hits = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0

/**
 * Plan the valley's structures.
 *
 * Returns `{ placed, refused }`. Nothing here touches the grid — the caller
 * levels the ground and writes the props — so this is pure and can be run in a
 * test without a renderer.
 */
export function planSettlement(grid) {
  const placed = []
  const refused = []

  /**
   * Put `kind` as near (x, z) as it will fit.
   *
   * Rings outward rather than sliding along one axis: a one-axis search was
   * refusing five of thirteen buildings on two seeds out of three, because a
   * spot blocked by the street has nowhere to go along the street. Rings find
   * the nearest free ground in any direction, which is what "as near as it
   * fits" actually means.
   */
  const put = (kind, x, z, level = 1) => {
    for (let r = 0; r < 20; r++) {
      // Every cell on the ring, nearest first. r = 0 is the wanted spot itself.
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (r > 0 && Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
          const cx = Math.round(x + dx)
          const cz = Math.round(z + dz)
          if (cx < 7 || cz < 7 || cx > N - 8 || cz > N - 8) continue
          if (grid.isWater(cx, cz)) continue
          const c = claim(kind, level, cx, cz)
          if (placed.some((p) => hits(p, c))) continue
          placed.push(c)
          return c
        }
      }
    }
    refused.push(kind)
    return null
  }

  // --- yours ----------------------------------------------------------------
  put('homestead', HOME.x, HOME.z - 5, 1)
  put('crate', HOME.x + 6, HOME.z + 1)

  // --- the Loom's -----------------------------------------------------------
  put('gate', GATE.x, GATE.z)

  /**
   * THE OLD STREET.
   *
   * A row of the colony's cottages either side of a path. They are empty and
   * they stay empty: rule 4 is not bent by this, there are no villagers in them
   * and there never will be. A tidy street with nobody in it says more about
   * what happened here than a ruin would.
   *
   * Spacing comes from the footprints rather than from a guess — nine cells,
   * which is a seven-cell cottage plus its verge. The two frontages are eight
   * cells apart across the path, which is wide enough that a house on one side
   * cannot reach a house on the other.
   */
  const STREET_Z = HOME.z - 16
  const SPACING = 9
  for (let i = 0; i < 8; i++) {
    const x = HOME.x - 16 + i * SPACING
    const side = i % 2 === 0 ? -1 : 1
    put('cottage', x, STREET_Z + side * 6, i % 4)
  }

  // The works, set back off the street behind the houses.
  put('well', HOME.x - 3, STREET_Z, 1)
  put('kiln', HOME.x + 12, STREET_Z + 14, 1)
  put('shed', HOME.x - 22, STREET_Z + 13, 1)

  /**
   * THE SEISMIC RELAY, at the head of the street: on the axis, at the end,
   * facing down the row. Everything else in the valley is somebody's building;
   * this one is the lattice's.
   */
  put('relay', HOME.x + 30, STREET_Z, 1)
  put('vault', HOME.x + 30, STREET_Z + 14, 1)
  put('waymark', HOME.x + 20, STREET_Z, 1)
  put('waymark', HOME.x - 24, STREET_Z, 1)

  return { placed, refused, streetZ: STREET_Z }
}

/**
 * Write a plan into the grid: level each plot, clear what the forest dropped on
 * it, cut the path, and register the building.
 */
export function buildSettlement(state, grid) {
  const plan = planSettlement(grid)
  // Plots are measured relative to the street, so the state has to remember
  // where it ran long after the generator has finished.
  state.streetZ = plan.streetZ

  // One height for the whole street, so a row of houses is a row and not a
  // staircase.
  const [rx, rz] = grid.nearestStandable(HOME.x, plan.streetZ)
  const rowH = grid.h(rx, rz)

  for (const c of plan.placed) {
    const pad = c.kind === 'gate' || c.kind === 'waymark' ? 0 : 1
    const near = Math.abs(c.z - plan.streetZ) < 12 && c.kind !== 'gate'
    for (let dz = -Math.ceil(c.fd / 2) - pad; dz <= Math.ceil(c.fd / 2) + pad; dz++) {
      for (let dx = -Math.ceil(c.fw / 2) - pad; dx <= Math.ceil(c.fw / 2) + pad; dx++) {
        const nx = c.x + dx
        const nz = c.z + dz
        if (!Grid.inBounds(nx, nz) || grid.isWater(nx, nz)) continue
        if (near) grid.setH(nx, nz, rowH)
        if (grid.get('prop', nx, nz) === P.TREE) grid.set('prop', nx, nz, P.NONE)
      }
    }
    /**
     * THE COLONY'S BUILDINGS START RUINED.
     *
     * They used to be handed over finished on day one — eight cottages, a well,
     * a kiln, a shed, a vault and the relay, all free — while `BUILD_COST` asked
     * the player to build a kiln and a well of their own. Everything the game
     * wanted you to work toward was already standing as scenery, which is most
     * of why it had no perceivable direction. Derelict, the same street IS the
     * direction. See `game/colony.js`.
     *
     * The footprint travels with the record because the plot a cottage opens is
     * measured off it, and nothing else at repair time knows how big it was.
     */
    state.buildings.push({
      kind: c.kind, level: c.level, x: c.x, z: c.z, registered: true,
      derelict: isRestorable(c.kind), fw: c.fw, fd: c.fd,
    })
    grid.set('prop', c.x, c.z, P.BUILDING)
  }

  /**
   * YOUR OWN GROUND, open from the start.
   *
   * Tilling is now confined to plots, and every other plot is behind a cottage
   * that has to be repaired first — so without this the player cannot hoe a
   * single square on day one and the tutorial's third step is impossible. The
   * homestead's plot is the one piece of the valley that is yours already.
   */
  const home = plan.placed.find((c) => c.kind === 'homestead')
  if (home) openPlot(grid, plotFor({ ...home, z: home.z }, plan.streetZ))

  // The path down the middle, once the plots are level.
  for (let x = HOME.x - 28; x <= HOME.x + 34; x++) {
    for (let dz = -1; dz <= 1; dz++) {
      const nz = plan.streetZ + dz
      if (!Grid.inBounds(x, nz) || grid.isWater(x, nz)) continue
      grid.setH(x, nz, rowH)
      grid.set('ground', x, nz, G.LOAM)
      if (grid.get('prop', x, nz) === P.TREE) grid.set('prop', x, nz, P.NONE)
    }
  }
  return plan
}
