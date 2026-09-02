import { CROP_ORDER } from './crops.js'
import { item } from './items.js'
import { Grid, N } from '../world/grid.js'

/**
 * THE STREET, AND PUTTING IT BACK.
 *
 * This is the game's direction, and until it existed there wasn't one. The
 * valley shipped with a goal written only in comments — recover species onto the
 * chip — a progress bar reading `Manifest 0 / 406` against twelve crops that
 * existed, ten of which had no seed and so could never be planted at all, and a
 * material (`cutstone`) that nothing in the world produced, which quietly made
 * two of the four buildable structures and both homestead upgrades impossible.
 * There was no ending anywhere in the code. `tools/economy.mjs` asserts all of
 * that can never come back.
 *
 * ## Why the street
 *
 * Because it was already standing there, finished, for free. The generator laid
 * out eight cottages, a well, a kiln, a shed, a vault and the relay, handed them
 * to the player complete on day one, and then `BUILD_COST` asked them to build a
 * kiln and a well of their own. The things you were meant to work toward were
 * already scenery. Starting them DERELICT costs nothing in new systems and turns
 * the whole street into the to-do list the game was missing.
 *
 * ## It does not repopulate
 *
 * Rule 4 holds: you are alone, and the cottages stay empty. What comes back into
 * them is the Manifest — species, not people. That is the point of the ending
 * and it is why the relay is last.
 *
 * ## The chain
 *
 * The order is not a suggested order, it is forced by what each repair costs:
 *
 *   cottages  wood, stone, fibre     — chop and mine, available on day one
 *   kiln      stone, wood            — and the kiln is what makes CUTSTONE
 *   well      stone, wood
 *   shed      wood, fibre
 *   vault     cutstone, ashglass     — needs the kiln first
 *   relay     cutstone, hardwood     — needs the kiln and an ironbark
 *
 * So the player is walked from chopping trees to firing stone to opening the
 * seed vault to lighting the relay, without a quest-giver saying any of it.
 * Rule 2 — found, not given — survives.
 */

/** Cells of plot a restored cottage opens, and how far it sits off the wall. */
const PLOT_W = 5
const PLOT_D = 4
const PLOT_GAP = 1

/**
 * What each repair costs, and what it gives back.
 *
 * `opens` is a plot of tillable ground. `unlocks` is a capability the rest of
 * the game reads by name — nothing here reaches into other systems, so this
 * table stays a description of the design rather than a pile of side effects.
 */
export const RESTORE = {
  cottage: {
    cost: { wood: 12, stone: 5, fibre: 6 },
    opens: true,
    label: 'cottage',
    note: 'A roof, and four courses of wall. The plot behind it can be worked again.',
  },
  kiln: {
    cost: { stone: 22, wood: 10 },
    unlocks: 'fire',
    label: 'the kiln',
    note: 'Stone fires down to cut stone. Everything left on the street needs it.',
  },
  well: {
    cost: { stone: 16, wood: 6 },
    unlocks: 'water',
    label: 'the well',
    note: 'Water without walking to the river, and it reaches the whole bed.',
  },
  shed: {
    cost: { wood: 22, fibre: 12 },
    unlocks: 'stock',
    label: 'the shed',
    note: 'Somewhere dry to keep seed. What you have recovered, you keep.',
  },
  vault: {
    cost: { cutstone: 14, ashglass: 3 },
    unlocks: 'seed',
    label: 'the seed vault',
    note: 'Four hundred and six went in. What is left of them is in the soil outside.',
  },
  relay: {
    cost: { cutstone: 20, hardwood: 10, resin: 6 },
    unlocks: 'relay',
    label: 'the relay',
    note: 'It can send once. What it sends is the chip.',
  },
}

/** The kinds that start ruined. Waymarks, the gate, the crate and your own
 *  homestead are not the colony's and are not part of this. */
export const DERELICT_KINDS = Object.keys(RESTORE)

/** A price, written the way the prompt says it out loud: "12 wood, 5 stone". */
export function costText(cost) {
  return Object.entries(cost).map(([id, n]) => `${n} ${item(id).name.toLowerCase()}`).join(', ')
}

export const isRestorable = (kind) => Object.hasOwn(RESTORE, kind)

/**
 * The ground a restored cottage opens up.
 *
 * Placed on the far side of the building FROM THE STREET, so the plots face out
 * and the street itself stays a street. A cottage on the north verge grows north.
 */
export function plotFor(building, streetZ) {
  const away = building.z >= streetZ ? 1 : -1
  const depth = building.fd ?? 7
  const z0 = building.z + away * (Math.ceil(depth / 2) + PLOT_GAP)
  return {
    x0: building.x - Math.floor(PLOT_W / 2),
    x1: building.x + Math.floor(PLOT_W / 2),
    z0: away > 0 ? z0 : z0 - (PLOT_D - 1),
    z1: away > 0 ? z0 + (PLOT_D - 1) : z0,
  }
}

/** Open a plot in the grid. Water and standing props are left alone — a plot is
 *  ground you are ALLOWED to work, not ground that has been cleared for you. */
export function openPlot(grid, rect) {
  let opened = 0
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      if (!Grid.inBounds(x, z) || grid.isWater(x, z)) continue
      grid.plot[z * N + x] = 1
      opened++
    }
  }
  return opened
}

/** How far along the street is. The number the HUD shows, and the one the
 *  ending waits on. */
export function restoreProgress(state) {
  const all = state.buildings.filter((b) => isRestorable(b.kind))
  return { done: all.filter((b) => !b.derelict).length, total: all.length }
}

/** Everything still ruined, nearest first — what the journal nags about. */
export function stillDerelict(state) {
  return state.buildings.filter((b) => isRestorable(b.kind) && b.derelict)
}

/**
 * Which species the player can currently get seed for.
 *
 * Before the vault, only what they have already carried through to a harvest —
 * which is why harvesting returns seed, and why the first two species are handed
 * out at the start. After the vault, all of them: that is what a seed vault is,
 * and it is the single biggest thing restoring the street gives back.
 */
export function availableSpecies(state) {
  if (state.unlocked?.has('seed')) return [...CROP_ORDER]
  return CROP_ORDER.filter((id) => state.recovered.has(id))
}
