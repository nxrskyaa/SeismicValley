#!/usr/bin/env node
/**
 * Can everything the game asks you to pay for actually be paid for?
 *
 * A cost table is a promise. `HOME_COST` says the homestead reaches tier 3 and
 * `BUILD_COST` says you can raise a well, and neither is true if nothing in the
 * valley produces what they ask for — the game advertises a progression the
 * player cannot reach, and nothing throws, nothing fails a test, and the only
 * symptom is that the direction of the whole game quietly stops making sense.
 *
 * That is exactly what had happened: `cutstone` had no producer anywhere. Two of
 * the four buildable structures and both homestead upgrades were unreachable.
 *
 *   node tools/economy.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { BUILD_COST, HOME_COST, STAKE_COST } from '../src/game/state.js'
import { CROP_ORDER, TREES } from '../src/game/crops.js'

let bad = 0
const fail = (what, detail) => { bad++; console.error(`  FAIL  ${what}${detail ? `\n        ${detail}` : ''}`) }
const ok = (what) => console.log(`  ok    ${what}`)

/** Every .js under src/, so a producer cannot hide in a file this tool forgot. */
function sources(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) sources(p, out)
    else if (name.endsWith('.js')) out.push(readFileSync(p, 'utf8'))
  }
  return out
}
const src = sources('src').join('\n')

/**
 * What the valley can produce.
 *
 * Literal `give('x')` calls, plus the two places items are handed out from a
 * TABLE rather than by name — tree drops and a crop harvest — which a grep for
 * string literals cannot see.
 */
const produced = new Set()
for (const m of src.matchAll(/\bgive\(\s*'([a-z_]+)'/g)) produced.add(m[1])
for (const t of Object.values(TREES)) for (const id of Object.keys(t.drops)) produced.add(id)
for (const id of CROP_ORDER) produced.add(id)
// Coin is not an item and is never `give`n; it is added directly by selling and
// by filling a request.
if (/\bcoin\s*\+=/.test(src)) produced.add('coin')

const TABLES = { STAKE_COST: { stake: STAKE_COST }, BUILD_COST }
HOME_COST.forEach((c, i) => { if (c) (TABLES.HOME_COST ??= {})[`tier ${i + 1}`] = c })

for (const [table, entries] of Object.entries(TABLES)) {
  for (const [name, cost] of Object.entries(entries)) {
    const missing = Object.keys(cost).filter((id) => !produced.has(id))
    if (missing.length) fail(`${table}.${name} cannot be paid`, `nothing in the valley produces: ${missing.join(', ')}`)
    else ok(`${table}.${name} is reachable`)
  }
}

/**
 * AND CAN YOU EVER PLANT THE THING?
 *
 * The Manifest is the progress bar, and a species only reaches it by being
 * carried through to a harvest — so a crop whose seed has no source is a line
 * that can never be written. The valley shipped with fourteen seeds of two
 * species, no shop, and no seed returned by harvesting: ten of the twelve crops
 * were unplantable, the farming loop ended after fourteen plantings, and the
 * bar's true ceiling was two of four hundred and six.
 */
const seedSources = new Set()
for (const m of src.matchAll(/\bgive\(\s*'seed_([a-z_]+)'/g)) seedSources.add(m[1])
// Seeds handed out from a table rather than by name, which a literal scan misses.
const fromTable = /\bgive\(\s*seedFor\(/.test(src) || /\bgive\(\s*`seed_\$\{/.test(src)

const unplantable = CROP_ORDER.filter((id) => !seedSources.has(id))
if (fromTable) ok('seeds are handed out from a table, so every species has a route')
else if (unplantable.length) {
  fail(
    `${unplantable.length} of ${CROP_ORDER.length} species can never be planted`,
    `no seed source for: ${unplantable.join(', ')}`
  )
} else ok('every species has a seed source')


console.log(bad ? `\n  ${bad} unreachable — the game promises what it cannot deliver\n` : '\n  every cost is payable\n')
process.exit(bad ? 1 : 0)
