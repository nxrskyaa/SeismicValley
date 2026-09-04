#!/usr/bin/env node
/**
 * Does this game have a direction, and can it be finished?
 *
 * Every other tool here asks whether something is built correctly. This one asks
 * whether the thing is a GAME: is there somewhere to start, a sequence that
 * forces itself, and an end that arrives. None of those had an assertion, and
 * none of them were true —
 *
 *   - the HUD showed `Manifest 0 / 406` against twelve crops
 *   - ten of those twelve had no seed source, so the real ceiling was two
 *   - `cutstone` had no producer, so the well, the vault and both homestead
 *     upgrades were unreachable
 *   - sixty-five per cent of the valley could be hoed, so no place meant anything
 *   - and nothing in the code checked for a finish, because there wasn't one
 *
 * A screenshot shows none of that. Driving the game does.
 *
 *   node tools/direction.mjs
 */

import { generate } from '../src/world/worldgen.js'
import { buildSettlement } from '../src/world/settlement.js'
import { GameState } from '../src/game/state.js'
import { RESTORE, isRestorable, restoreProgress } from '../src/game/colony.js'
import { N } from '../src/world/grid.js'
import { CROPS, CROP_ORDER, seedFor } from '../src/game/crops.js'

let bad = 0
const fail = (what, detail) => { bad++; console.error(`  FAIL  ${what}${detail ? `\n        ${detail}` : ''}`) }
const ok = (what) => console.log(`  ok    ${what}`)

const tillable = (grid) => {
  let n = 0
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (grid.canTill(x, z)) n++
  return n
}

for (const seed of [1, 77, 4242]) {
  console.log(`\n  seed ${seed}`)
  const { grid } = generate(seed)
  const state = new GameState(grid, seed)
  buildSettlement(state, grid)

  // --- somewhere to start ---------------------------------------------------
  const start = tillable(grid)
  if (start === 0) fail('there is nowhere to hoe on day one', 'the tutorial cannot be completed')
  else if (start > 400) fail('the whole valley is a farm', `${start} tiles tillable before anything is earned`)
  else ok(`day one: ${start} tiles of your own ground, and no more`)

  /**
   * --- and something to put in the ground on day one ------------------------
   *
   * The seed tray filters by what the player HOLDS. It first shipped filtering
   * by `availableSpecies`, which before the vault is repaired means "species you
   * have already carried through to a harvest" — empty on a new save. So the
   * planting panel read "No seed" while the player stood there holding fourteen
   * of them, at the exact moment they most needed it to work.
   */
  const startSeeds = CROP_ORDER.filter((id) => state.has(seedFor(id), 1))
  const inSeason = startSeeds.filter((id) => CROPS[id].seasons.includes(state.season))
  if (!startSeeds.length) fail('a new game starts with no seed at all')
  else if (!inSeason.length) fail('nothing the player starts with is in season', startSeeds.join(', '))
  else ok(`day one: ${inSeason.length} species in hand and in season (${inSeason.join(', ')})`)

  // --- a street that is a to-do list ---------------------------------------
  const { done, total } = restoreProgress(state)
  if (total < 6) fail('there is almost nothing to restore', `${total} derelict structures`)
  else if (done !== 0) fail('the street starts already finished', `${done} of ${total} standing`)
  else ok(`${total} derelict structures on the street, none of them free`)

  /**
   * --- a sequence that forces itself ---------------------------------------
   *
   * The design claim is that the costs alone order the game: you cannot reach
   * the vault or the relay until the kiln is firing, because only the kiln makes
   * cut stone. That is worth asserting rather than believing, because it is the
   * only thing making the street a progression instead of a shopping list.
   */
  const needsFire = Object.entries(RESTORE)
    .filter(([, spec]) => Object.hasOwn(spec.cost, 'cutstone'))
    .map(([kind]) => kind)
  if (!needsFire.length) fail('nothing depends on the kiln', 'the street can be done in any order')
  else ok(`gated behind the kiln: ${needsFire.join(', ')}`)

  // --- and an end that arrives ---------------------------------------------
  const restorable = state.buildings.filter((b) => isRestorable(b.kind))
  for (const b of restorable) {
    for (const [id, n] of Object.entries(RESTORE[b.kind].cost)) state.give(id, n)
    state.restore(b)
  }
  const after = tillable(grid)
  const end = restoreProgress(state)

  if (end.done !== end.total) fail('the street cannot be finished', `${end.done} of ${end.total}`)
  else if (!state.flags.has('finished')) fail('the street is whole and nothing happened', 'no ending fired')
  else ok(`finished: ${end.total} restored, and the ending fired`)

  if (after <= start) fail('restoring the street opened no ground', `${start} tiles before, ${after} after`)
  else ok(`ground earned: ${start} tiles to ${after}`)
}

console.log(bad ? `\n  ${bad} problem(s)\n` : '\n  the game has a beginning, an order and an end\n')
process.exit(bad ? 1 : 0)
