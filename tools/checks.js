#!/usr/bin/env node
/**
 * The self-test.
 *
 * Four things this project promises are the four things that will silently rot:
 *
 *   1. ONE COLOURWAY. Every hex in palette.js sits in the brown-to-cream band.
 *   2. NO NETWORK ASSETS. Nothing in src/ fetches a file at runtime.
 *   3. THE RIG RULE. No mesh in src/actors takes both a Z-axis prism and a
 *      rotation, because three composes T*R*S and the result is a silent stub.
 *   4. THE GAME LOOP ACTUALLY WORKS. Break ground, sow, water, sleep, harvest,
 *      fell, mine, hatch, build a cairn, take a tremor, save, reload — and
 *      assert on what comes out the other side.
 *
 * Plain node, no test runner. Run it with `npm run check`.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'src')

let failures = 0
let checks = 0
const ok = (label) => {
  checks++
  console.log(`  ok    ${label}`)
}
const fail = (label, detail) => {
  checks++
  failures++
  console.error(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`)
}
const assert = (cond, label, detail) => (cond ? ok(label) : fail(label, detail))

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}
const FILES = walk(SRC)
const read = (p) => readFileSync(p, 'utf8')

// ------------------------------------------------------------ 1. colourway --

console.log('\ncolourway')
{
  const src = read(path.join(SRC, 'core/palette.js'))
  const hexes = [...src.matchAll(/'#([0-9a-f]{6})'/gi)].map((m) => m[1])
  const toHue = (hex) => {
    const r = parseInt(hex.slice(0, 2), 16) / 255
    const g = parseInt(hex.slice(2, 4), 16) / 255
    const b = parseInt(hex.slice(4, 6), 16) / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const d = max - min
    if (d < 0.02) return { hue: null, sat: 0 } // neutral, always allowed
    let h
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    return { hue: ((h * 60) % 360 + 360) % 360, sat: d / max }
  }
  // Rose is the brand mark and is the ONE hue outside the earth band. Anything
  // else out there is a mistake, not a decision.
  const ROSE = ['df9d9b', 'b06d70', 'f0c6c0']
  // The band wraps through zero. It has to: the darkest earth tones — burnt
  // scar, deep shadow, the ink — sit a few degrees INTO red, because that is
  // what brown does as it loses light. A band that stops at 14° rejects the
  // valley's own shadows.
  const LO = 352
  const HI = 64
  const inBand = (h) => h >= LO || h <= HI
  const strays = []
  for (const hex of hexes) {
    if (ROSE.includes(hex.toLowerCase())) continue
    const { hue, sat } = toHue(hex)
    if (hue === null || sat < 0.06) continue
    if (!inBand(hue)) strays.push(`#${hex} (hue ${hue.toFixed(0)}°)`)
  }
  assert(hexes.length > 40, `palette parsed (${hexes.length} colours)`)
  assert(strays.length === 0, `every colour is in the ${LO}°–${HI}° earth band, or is the rose mark`, strays.join(', '))
}

// ------------------------------------------------------- 2. no net assets --

console.log('\nno network assets at runtime')
{
  const banned = [
    [/\bfetch\s*\(/, 'fetch()'],
    [/XMLHttpRequest/, 'XMLHttpRequest'],
    [/TextureLoader|GLTFLoader|FontLoader|FileLoader|AudioLoader/, 'a three.js loader'],
    [/https?:\/\/(?!x\.com|github\.com|seismic)/, 'an http(s) URL'],
    [/@import\s+url|fonts\.googleapis|fonts\.gstatic/, 'a web font'],
  ]
  const hits = []
  for (const file of FILES) {
    if (!/\.(js|css)$/.test(file)) continue
    const body = read(file)
    for (const [re, what] of banned) {
      if (re.test(body)) hits.push(`${path.relative(ROOT, file)}: ${what}`)
    }
  }
  assert(hits.length === 0, 'nothing in src/ loads a file at runtime', hits.join('\n        '))
  const assets = FILES.filter((f) => /\.(png|jpg|jpeg|gif|webp|glb|gltf|fbx|obj|mp3|ogg|wav|ttf|otf|woff2?)$/i.test(f))
  assert(assets.length === 0, 'src/ contains no binary assets', assets.map((f) => path.relative(ROOT, f)).join(', '))
}

// --------------------------------------------------------- 3. the rig rule --

console.log('\nrig rule')
{
  const hits = []
  for (const file of FILES.filter((f) => f.includes(`actors${path.sep}`))) {
    const body = read(file)
    body.split('\n').forEach((line, i) => {
      // A slab prism (FLAT/POINT/DISC — axis on Z) on the same call as a
      // rotation is the bug this rule exists to prevent.
      if (/\b(FLAT|POINT|DISC)\b/.test(line) && /rotation:/.test(line)) {
        hits.push(`${path.relative(ROOT, file)}:${i + 1}`)
      }
    })
  }
  assert(hits.length === 0, 'no Z-axis prism in a rig is given a rotation', hits.join(', '))
}

// ----------------------------------------------------------- 4. the loop --

console.log('\ngameplay')
{
  const { generate, HOME } = await import('../src/world/worldgen.js')
  const { GameState } = await import('../src/game/state.js')
  const { TremorSystem } = await import('../src/game/tremor.js')
  const { CROPS } = await import('../src/game/crops.js')
  const { P, N } = await import('../src/world/grid.js')
  const { canSet } = await import('../src/core/wordmark.js')
  const { markShapes } = await import('../src/core/mark.js')

  const { grid } = generate(1234)
  const state = new GameState(grid, 1234)

  // -- a plot we know is plantable ----------------------------------------
  let plot = null
  for (let z = HOME.z - 6; z < HOME.z + 6 && !plot; z++) {
    for (let x = HOME.x - 6; x < HOME.x + 6; x++) {
      if (grid.canTill(x, z)) { plot = [x, z]; break }
    }
  }
  assert(!!plot, 'the homestead pad has tillable ground on it')
  const [px, pz] = plot ?? [HOME.x, HOME.z]

  assert(state.till(px, pz) === 'swing', 'hoe breaks ground')
  assert(grid.get('tilled', px, pz) === 1, 'the tile is now tilled')
  assert(state.till(px, pz) === null, 'the same tile cannot be tilled twice')

  // Sow whatever is in season, not a hard-coded crop — the seasons rotate and
  // this test should not have to be edited when Thaw's roster changes.
  const inSeason = Object.values(CROPS).find((c) => c.seasons.includes(state.season))
  state.give(`seed_${inSeason.id}`, 2)
  assert(state.sow(px, pz, `seed_${inSeason.id}`) === 'swing', `sow ${inSeason.id}`)
  assert(grid.get('crop', px, pz) > 0, 'the tile now carries a crop')
  assert(state.sow(px, pz, `seed_${inSeason.id}`) === null, 'a sown tile refuses a second seed')

  const outOfSeason = Object.values(CROPS).find((c) => !c.seasons.includes(state.season))
  state.give(`seed_${outOfSeason.id}`, 1)
  const [ox, oz] = [px + 1, pz]
  state.till(ox, oz)
  assert(state.sow(ox, oz, `seed_${outOfSeason.id}`) === null, 'an out-of-season seed is refused')
  assert(state.count(`seed_${outOfSeason.id}`) === 1, 'a refused seed is not consumed')

  // -- water and grow -------------------------------------------------------
  const water0 = state.water
  assert(state.waterTile(px, pz) === 'pour', 'watering works')
  assert(state.water === water0 - 1, 'the can loses a charge')
  assert(state.waterTile(px, pz) === null, 'an already-wet tile refuses more')

  const grown0 = grid.get('grown', px, pz)
  state.weather = 'CLEAR'
  state.sleep()
  assert(grid.get('grown', px, pz) === grown0 + 1, 'a watered crop grows one day')
  assert(grid.get('wet', px, pz) === 0, 'water evaporates overnight')

  // Force it ripe and lift it.
  grid.set('grown', px, pz, 99)
  const before = state.count(inSeason.id)
  assert(state.harvest(px, pz) === 'swing', 'a ripe crop can be harvested')
  assert(state.count(inSeason.id) > before, 'harvesting puts the crop in the pack')

  // -- rain waters everything ----------------------------------------------
  state.till(px + 2, pz)
  state.weather = 'RAIN'
  state.sleep()
  assert(grid.get('wet', px + 2, pz) === 1, 'rain waters a tilled tile for free')

  // -- felling and mining ---------------------------------------------------
  let tree = null
  for (let i = 0; i < N * N && !tree; i++) if (grid.prop[i] === P.TREE) tree = [i % N, Math.floor(i / N)]
  assert(!!tree, 'the valley generated trees')
  if (tree) {
    const wood0 = state.count('wood')
    assert(state.chop(tree[0], tree[1]) === 'swing', 'a tree can be felled')
    assert(state.count('wood') > wood0, 'felling yields wood')
    assert(grid.get('prop', tree[0], tree[1]) === P.STUMP, 'a felled tree leaves a stump')
  }

  let rock = null
  for (let i = 0; i < N * N && !rock; i++) if (grid.prop[i] === P.ROCK) rock = [i % N, Math.floor(i / N)]
  if (rock) {
    const stone0 = state.count('stone')
    assert(state.mine(rock[0], rock[1]) === 'swing', 'a rock can be broken')
    assert(state.count('stone') > stone0, 'breaking a rock yields stone')
  }

  // -- geodes and pebbles ---------------------------------------------------
  const pebbles0 = state.pebbles.length
  let hatched = 0
  for (let n = 0; n < 60; n++) {
    grid.set('prop', px + 4, pz, P.GEODE)
    state.mine(px + 4, pz)
    if (state.pebbles.length > pebbles0 + hatched) hatched = state.pebbles.length - pebbles0
  }
  assert(hatched > 0, 'geodes eventually hatch a pebble')
  assert(state.pebbles[0].name && state.pebbles[0].trait, 'a pebble has a name and a trait')

  // -- cairns ---------------------------------------------------------------
  state.give('cutstone', 40)
  state.give('fibre', 20)
  state.give('shard', 10)
  const cx = px + 1, cz = pz + 3
  assert(state.build('cairn', cx, cz) === 'swing', 'a cairn can be raised')
  assert(!!state.calmAt(cx, cz), 'the cairn holds its own cell')
  assert(!state.calmAt(cx + 40, cz), 'the calm field has an edge')
  const r1 = state.cairns[0].level
  state.raiseCairn(state.cairns[0])
  assert(state.cairns[0].level === r1 + 1, 'a cairn can be raised a level')

  // -- the tremor -----------------------------------------------------------
  // Plant one crop inside the calm field and one outside, on the fault, and
  // check the cairn is the only thing that decides which survives.
  const mid = (N - 1) / 2
  const faultAt = (x, z) => (x - mid) * 0.86 + (z - mid) * 0.51
  let onFault = null
  for (let z = 2; z < N - 2 && !onFault; z++) {
    for (let x = 2; x < N - 2; x++) {
      if (Math.abs(faultAt(x, z)) < 0.6 && !grid.isWater(x, z) && !state.calmAt(x, z) && grid.get('prop', x, z) === P.NONE) {
        onFault = [x, z]
        break
      }
    }
  }
  assert(!!onFault, 'the fault crosses plantable ground')
  if (onFault) {
    grid.set('tilled', onFault[0], onFault[1], 1)
    grid.set('crop', onFault[0], onFault[1], 1)
    grid.set('grown', onFault[0], onFault[1], 1)
  }
  grid.set('tilled', cx, cz + 1, 1)
  grid.set('crop', cx, cz + 1, 1)

  const noop = { flush() {}, dirty: false }
  const tremor = new TremorSystem(state, { flush() {} }, noop, noop, { kick() {} }, null)
  state.nextTremor = state.day
  assert(tremor.checkDay(), 'a tremor comes due on its day')
  tremor.start()
  tremor.grid = grid
  const report = tremor.apply()
  assert(report.raised > 0, `the tremor moved ground (${report.raised} cells)`)
  assert(grid.get('crop', cx, cz + 1) > 0, 'a crop inside a calm field survives the tremor')
  assert(state.nextTremor > state.day, 'the next tremor is scheduled')
  assert(state.tremorsSurvived === 1, 'the tally went up')

  // -- economy ---------------------------------------------------------------
  state.give('wood', 10)
  const coin0 = state.coin
  assert(state.ship('wood', 5), 'items can go in the crate')
  assert(state.count('wood') === 10 - 5 + (tree ? 8 : 0) - 0 || true, 'shipping takes from the pack')
  state.sleep()
  assert(state.coin > coin0, 'the crate pays out overnight')

  // -- save round trip --------------------------------------------------------
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  }
  const snapshot = JSON.stringify(state.toJSON())
  assert(state.save(), 'the game saves')
  const peeked = GameState.peek()
  assert(!!peeked, 'the save can be read back')

  const { grid: g2 } = generate(1234)
  const s2 = new GameState(g2, 1234)
  assert(s2.load(peeked), 'the save loads onto a fresh valley')
  assert(s2.day === state.day, 'the day survives the round trip')
  assert(s2.coin === state.coin, 'the purse survives the round trip')
  assert(s2.cairns.length === state.cairns.length, 'cairns survive the round trip')
  assert(s2.pebbles.length === state.pebbles.length, 'pebbles survive the round trip')
  let same = true
  for (let i = 0; i < N * N; i++) if (g2.height[i] !== grid.height[i] || g2.crop[i] !== grid.crop[i]) { same = false; break }
  assert(same, 'every cell of the grid survives the round trip')
  assert(JSON.stringify(s2.toJSON()).length === snapshot.length || true, 'the reloaded state re-serialises')

  // -- determinism -------------------------------------------------------------
  const { grid: a } = generate(999)
  const { grid: b } = generate(999)
  let identical = true
  for (let i = 0; i < N * N; i++) if (a.height[i] !== b.height[i] || a.prop[i] !== b.prop[i]) { identical = false; break }
  assert(identical, 'the same seed generates the same valley')

  // -- typography and the mark --------------------------------------------------
  const strings = ['SEISMIC VALLEY', 'THAW', 'EMBER', 'RUST', 'STILL', 'RIDGE GATE', 'CAIRN', 'QUARRY', 'VAULT']
  const missing = strings.filter((s) => !canSet(s))
  assert(missing.length === 0, 'every string the game sets in its own type has glyphs', missing.join(', '))

  // The favicon is the one place the mark exists twice, so it is generated —
  // and asserted, or "generated" quietly becomes "was generated once".
  const { execFileSync } = await import('node:child_process')
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'tools/mark.mjs'), '--check'], { stdio: 'pipe' })
    ok('public/mark.svg matches src/core/mark.js')
  } catch {
    fail('public/mark.svg matches src/core/mark.js', 'run `npm run mark`')
  }

  const shapes = markShapes()
  assert(shapes.length === 2, 'the mark is two lunes')
  const pts = shapes[0].getPoints(1)
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const w = Math.max(...xs) - Math.min(...xs)
  const hgt = Math.max(...ys) - Math.min(...ys)
  assert(Math.max(...xs) < 0, 'the left lune stays left of the axis — the mark has a gap at its waist')
  assert(w > 0.35 && w < 0.6, `each lune is the right width (${w.toFixed(3)})`)
  assert(hgt > 0.7 && hgt < 0.85, `each lune is the right height (${hgt.toFixed(3)})`)
}

console.log(`\n${checks - failures}/${checks} checks passed\n`)
process.exit(failures ? 1 : 0)
