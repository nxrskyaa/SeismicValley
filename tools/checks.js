#!/usr/bin/env node
/**
 * The self-test.
 *
 * These are the promises the project makes, and they are exactly the promises
 * that rot silently if nothing watches them. Every one of the first six failed
 * at least once during the rebuild, which is why they are assertions and not
 * comments:
 *
 *   1. THE COLOURWAY IS SPLIT. Seismic's brown-and-cream is the INTERFACE. The
 *      world has Velion's washed palette and is exempt. Collapsing the two is
 *      how the valley turned into sepia mud once already.
 *   2. THE CAMERA IS ORTHOGRAPHIC, on 45-degree yaws. A perspective lens makes
 *      the terraces read as generic low-poly.
 *   3. YOU ARE ALONE. Exactly one human look exists. A second one means a
 *      villager crept back in and the premise is gone.
 *   4. NO NETWORK ASSETS. Nothing in src/ fetches a file at runtime.
 *   5. THE RIG RULE. No mesh in src/actors takes both a Z-axis prism and a
 *      rotation, because three composes T*R*S and the result is a silent stub.
 *   6. THE STORY RULES. Four lines maximum per fragment, tags in order.
 *   7. THE GAME LOOP WORKS, end to end, headless.
 *
 * Plain node, no test runner. `npm run check`.
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

// --------------------------------------------------- 1. the split palette --

console.log('\ncolourway')
{
  const src = read(path.join(SRC, 'core/palette.js'))
  const uiBlock = src.slice(src.indexOf('export const UI = {'), src.indexOf('export const M = {'))
  assert(uiBlock.length > 200, 'the UI block is where it is expected to be')

  const hexes = [...uiBlock.matchAll(/'#([0-9a-f]{6})'/gi)].map((m) => m[1])
  const toHue = (hex) => {
    const r = parseInt(hex.slice(0, 2), 16) / 255
    const g = parseInt(hex.slice(2, 4), 16) / 255
    const b = parseInt(hex.slice(4, 6), 16) / 255
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
    if (d < 0.02) return { hue: null, sat: 0 }
    let h
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    return { hue: (((h * 60) % 360) + 360) % 360, sat: d / max }
  }
  // Rose is the brand mark and is the ONE hue outside the earth band. The band
  // wraps through zero: the darkest warm tones sit a few degrees into red.
  // Seismic's crystal. Vivid magenta, and the one hue in the interface palette
  // that is deliberately outside the earth band — it is the brand mark.
  const ROSE = ['e0479b', 'b02f7a', 'f487c4']
  const strays = []
  for (const hex of hexes) {
    if (ROSE.includes(hex.toLowerCase())) continue
    const { hue, sat } = toHue(hex)
    if (hue === null || sat < 0.06) continue
    if (!(hue >= 352 || hue <= 64)) strays.push(`#${hex} (hue ${hue.toFixed(0)}°)`)
  }
  assert(hexes.length >= 14, `UI palette parsed (${hexes.length} colours)`)
  assert(strays.length === 0, 'every interface colour is Seismic brown-to-cream, or the rose mark', strays.join(', '))

  // And the world is NOT held to that band — it is Velion's washed palette and
  // has to be allowed its lavender water and pink canopies.
  const worldBlock = src.slice(src.indexOf('export const C = {'), src.indexOf('export const UI = {'))
  const cool = [...worldBlock.matchAll(/'#([0-9a-f]{6})'/gi)]
    .map((m) => toHue(m[1]))
    .filter((h) => h.hue !== null && h.sat > 0.1 && h.hue > 180 && h.hue < 300)
  assert(cool.length >= 3, `the world keeps its cool hues (${cool.length} found — water, canopies, the settler's jacket)`)
}

// ----------------------------------------------------------- 2. the camera --

console.log('\ncamera')
{
  const src = read(path.join(SRC, 'world/camera.js'))
  const main = read(path.join(SRC, 'main.js'))
  const gridSrc = read(path.join(SRC, 'world/grid.js'))
  assert(/PITCH = -37/.test(src), "the pitch is Velion's -37 degrees")
  assert(/YAWS = \[45, 135, 225, 315\]/.test(src), 'the yaws are diagonal (45/135/225/315), not axis-aligned')
  // Measured off the reference: the character stands about an eighth of the
  // frame height, which at 1.72 units tall puts the vertical span near 13.
  assert(/SIZE_DEFAULT = 13/.test(src), 'the default orthographic size is 13')
  // A level is a WALL, not a curb. At half a unit every terrace edge is a kerb
  // and the whole map flattens into a pattern instead of a landscape.
  assert(/export const LEVEL = 1\.0/.test(gridSrc), 'one height level is one world unit')
  // The reference has no cast shadows at all. A directional shadow immediately
  // reads as a heavier, more realistic game than this one is.
  assert(/shadowMap\.enabled = false/.test(main), 'no cast shadows')
  assert(/OrthographicCamera/.test(main), 'the game builds an orthographic camera')
  assert(!/PerspectiveCamera/.test(main), 'no perspective camera anywhere in main')
}

// ------------------------------------------------------- 2b. the controls --

console.log('controls')
{
  // W must move the player along the direction the camera is looking, and S
  // against it. The obvious camera-relative rotation is 90 degrees off for this
  // rig, and at the default 45-degree yaw that reads as reversed controls.
  const YAW = (45 * Math.PI) / 180
  const cos = Math.cos(YAW)
  const sin = Math.sin(YAW)
  // The rig sits at focus + (sin yaw, *, cos yaw) * d and looks back at it.
  const fwd = [-Math.sin(YAW), -Math.cos(YAW)]
  const resolve = (m) => [m.x * cos + m.z * sin, -m.x * sin + m.z * cos]
  const dot = (v) => v[0] * fwd[0] + v[1] * fwd[1]

  const player = read(path.join(SRC, 'actors/player.js'))
  assert(/const mx = input\.move\.x \* cos \+ input\.move\.z \* sin/.test(player)
    && /const mz = -input\.move\.x \* sin \+ input\.move\.z \* cos/.test(player),
  'the controller uses the rotation that matches this camera')

  assert(dot(resolve({ x: 0, z: -1 })) > 0.99, 'W walks toward where the camera is looking')
  assert(dot(resolve({ x: 0, z: 1 })) < -0.99, 'S walks away from it')
  assert(Math.abs(dot(resolve({ x: -1, z: 0 }))) < 0.01, 'A is perpendicular')
  assert(Math.abs(dot(resolve({ x: 1, z: 0 }))) < 0.01, 'D is perpendicular')
  // Left really is left. With +Y up, left = up x forward = (fz, -fx), so the
  // test is `fwd.z*a.x - fwd.x*a.z`. Getting that sign backwards is how you end
  // up "fixing" a controller that was already correct.
  const a = resolve({ x: -1, z: 0 })
  assert(fwd[1] * a[0] - fwd[0] * a[1] > 0.99, 'A is the LEFT perpendicular, not the right one')
}

// ------------------------------------------------------------ 3. you alone --

console.log('the premise')
{
  const player = read(path.join(SRC, 'actors/player.js'))
  const looks = player.slice(player.indexOf('export const LOOKS = {'))
  const entries = [...looks.matchAll(/^\s{2}(\w+):\s*\{/gm)].map((m) => m[1])
  assert(entries.length === 1, `exactly one human look exists (${entries.join(', ') || 'none'})`)

  const cast = read(path.join(SRC, 'actors/cast.js'))
  assert(!/VILLAGE/.test(cast), 'the cast does not reference a village')
  const world = read(path.join(SRC, 'world/worldgen.js'))
  assert(!/export const VILLAGE/.test(world), 'the generator does not place a village')
  assert(/Sixteen/.test(cast), 'Sixteen is in the cast')
}

// ------------------------------------------------------- 4. no net assets --

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
    for (const [re, what] of banned) if (re.test(body)) hits.push(`${path.relative(ROOT, file)}: ${what}`)
  }
  assert(hits.length === 0, 'nothing in src/ loads a file at runtime', hits.join('\n        '))
  const assets = FILES.filter((f) => /\.(png|jpg|jpeg|gif|webp|glb|gltf|fbx|obj|mp3|ogg|wav|ttf|otf|woff2?)$/i.test(f))
  assert(assets.length === 0, 'src/ contains no binary assets', assets.map((f) => path.relative(ROOT, f)).join(', '))
}

// --------------------------------------------------------- 5. the rig rule --

console.log('\nrig rule')
{
  const hits = []
  for (const file of FILES.filter((f) => f.includes(`actors${path.sep}`))) {
    read(file).split('\n').forEach((line, i) => {
      if (/\b(FLAT|POINT|DISC)\b/.test(line) && /rotation:/.test(line)) {
        hits.push(`${path.relative(ROOT, file)}:${i + 1}`)
      }
    })
  }
  assert(hits.length === 0, 'no Z-axis prism in a rig is given a rotation', hits.join(', '))
}

// ------------------------------------------------------- 6. the story rules --

console.log('\nstory delivery')
{
  const { TAGS, LOGS, MANIFEST_TOTAL } = await import('../src/game/story.js')
  const longTag = TAGS.find((t) => t.lines.length > 4)
  const longLog = LOGS.find((l) => l.lines.length > 4)
  assert(!longTag, 'no soil-tag runs past four lines', longTag && `tag ${longTag.id}`)
  assert(!longLog, 'no log runs past four lines', longLog && `log ${longLog.id}`)
  assert(TAGS.length >= 10 && LOGS.length >= 10, `there is enough of both (${TAGS.length} tags, ${LOGS.length} logs)`)
  assert(MANIFEST_TOTAL === 406, 'the Manifest lists four hundred and six species')
  // The mundane before the cosmic: the first tags are about drainage.
  const early = TAGS.slice(0, 3).map((t) => t.lines.join(' ')).join(' ').toLowerCase()
  assert(/clay|drainage|row four/.test(early), 'the first tags are complaints about soil, not prophecy')
  assert(LOGS.every((l, i) => i === 0 || l.id > LOGS[i - 1].id), 'logs are authored in order so shuffling them is the game\'s choice')
  // The prologue is the one piece of writing here that could have gotten away
  // with breaking the four-line rule, so it is the one most worth asserting.
  const { CARDS } = await import('../src/ui/prologue.js')
  const longCard = CARDS.findIndex((c) => c.lines.length > 4)
  assert(longCard === -1, 'no prologue card runs past four lines', longCard >= 0 && `card ${longCard + 1}`)
  assert(CARDS.length <= 6, `the cold open is short (${CARDS.length} cards)`)
  const opener = CARDS[0].lines.join(' ').toLowerCase()
  assert(!/loom|manifest|rollback|colony/.test(opener),
    'the first card does not explain the setting -- that is what the soil is for')
}

// ----------------------------------------------------- 6d. the first morning --

console.log('\nthe first morning')
{
  const { STEPS, Tutorial } = await import('../src/game/tutorial.js')
  const { GameState } = await import('../src/game/state.js')
  const { generate } = await import('../src/world/worldgen.js')
  const { STARTING_HOTBAR } = await import('../src/game/items.js')

  assert(STEPS.length >= 5 && STEPS.length <= 8, `the list is a morning, not a manual (${STEPS.length} jobs)`)
  const ids = STEPS.map((s) => s.id)
  for (const need of ['chop', 'fish', 'sow']) {
    assert(ids.includes(need), `the first morning covers ${need}`)
  }

  // Every key a step names has to be the slot that item is actually in. This is
  // the failure that makes a tutorial actively worse than none: telling the
  // player to press 6 for a seed when 6 is the rod.
  const slotOf = (id) => STARTING_HOTBAR.indexOf(id) + 1
  const keyed = { chop: slotOf('axe'), till: slotOf('hoe'), sow: slotOf('seed_grubwort'), water: slotOf('can'), fish: slotOf('rod') }
  for (const [id, slot] of Object.entries(keyed)) {
    const step = STEPS.find((x) => x.id === id)
    assert(step && slot > 0 && step.keys.includes(`<kbd>${slot}</kbd>`),
      `the ${id} step names the slot the tool is really in (${slot})`)
  }

  const { grid } = generate(77)
  const state = new GameState(grid, 77)
  const t = new Tutorial(state)
  assert(t.step?.id === STEPS[0].id, 'a fresh valley starts at the first job')

  // A save already past a job starts past it. Nobody who has farmed for six days
  // wants to be told which key the hoe is on.
  state.stats.walked = 40
  state.stats.chopped = 3
  const t2 = new Tutorial(state)
  assert(t2.step?.id === 'till', 'a save that is already past a job starts past it', t2.step?.id)

  for (const k of Object.keys(state.stats)) state.stats[k] = 99
  const t3 = new Tutorial(state)
  assert(t3.finished && t3.step === null, 'a finished list stays finished')
}

// ------------------------------------------------------------ 6b. the water --

console.log('\nwater')
{
  const { generate, HOME } = await import('../src/world/worldgen.js')
  const { N, WATER_LEVEL } = await import('../src/world/grid.js')
  const { CATCH } = await import('../src/game/fishing.js')
  const { STARTING_HOTBAR, ITEMS } = await import('../src/game/items.js')

  // The rod has to be IN THE PACK. A fishing system the player has to buy a rod
  // to find out about is a fishing system most players never see.
  assert(STARTING_HOTBAR.includes('rod'), 'the rod is in the starting hotbar')
  const orphan = CATCH.map((c) => c.id).filter((id) => !ITEMS[id])
  assert(orphan.length === 0, 'everything in the catch table is a real item', orphan.join(', '))

  const { grid } = generate(4242)
  // Two pools, and one of them within a short walk of the homestead — the whole
  // point of carving the second one.
  let nearHome = 0
  for (let z = HOME.z - 12; z < HOME.z + 14; z++) {
    for (let x = HOME.x; x < HOME.x + 26; x++) if (grid.height[z * N + x] < WATER_LEVEL) nearHome++
  }
  assert(nearHome > 60, 'there is fishable water within sight of the homestead', `${nearHome} cells`)

  // The bed texture is a DataTexture indexed by grid position, and a flat
  // PlaneGeometry's own uv runs the other way in Z. Sampling by uv drew the lake
  // mirrored across the map and left the real basin dry; this is that bug.
  const water = readFileSync(path.join(SRC, 'world/water.js'), 'utf8')
  assert(/texture2D\(uBed,\s*bedUv\)/.test(water) && /vWorld\.x,\s*vWorld\.z/.test(water),
    'the water samples its bed from world position, not from the plane uv')
  assert(water.includes('<colorspace_fragment>'),
    'the water converts to the output colour space — linear straight out renders as tar')
}

// ------------------------------------------------------------ 6c. the wind --

console.log('the wind')
{
  const { DRIFT, WIND, applyWindSway } = await import('../src/world/weather.js')
  const { SEASON_NAMES } = await import('../src/game/crops.js')

  const missing = SEASON_NAMES.filter((n) => !DRIFT[n])
  assert(missing.length === 0, 'every season has something in the air', missing.join(', '))
  assert(WIND.value.isVector4, 'the field is one packed vec4')

  // Everything that stands in the valley has to bend in the SAME wind. Two
  // things blowing different ways is worse than neither of them moving.
  for (const f of ['world/props.js', 'world/cropView.js']) {
    assert(/applyWindSway\(bakedMat\(/.test(read(path.join(SRC, f))), `${f} sways`)
  }

  // The patch is idempotent, because a material that gets it twice compiles a
  // shader with two sway blocks and doubles the amplitude silently.
  const mat = { userData: {}, needsUpdate: false }
  applyWindSway(mat)
  const first = mat.onBeforeCompile
  applyWindSway(mat)
  assert(mat.onBeforeCompile === first, 'the sway patch is idempotent')
}

// --------------------------------------------------------- 7. the game loop --

console.log('\ngameplay')
{
  const { generate, HOME } = await import('../src/world/worldgen.js')
  const { GameState, STAKE_COST } = await import('../src/game/state.js')
  const { PruningSystem } = await import('../src/game/pruning.js')
  const { CROPS, SEASON_NAMES, SEASON_DAYS } = await import('../src/game/crops.js')
  const { P, N } = await import('../src/world/grid.js')
  const { canSet } = await import('../src/core/wordmark.js')
  const { markShapes } = await import('../src/core/mark.js')

  assert(SEASON_NAMES.join() === 'Thaw,Longlight,Rust,Still', 'the seasons are the operations calendar')
  assert(SEASON_DAYS === 21, 'a season is twenty-one days')

  const { grid } = generate(1234)
  const state = new GameState(grid, 1234)

  let plot = null
  for (let z = HOME.z - 7; z < HOME.z + 7 && !plot; z++) {
    for (let x = HOME.x - 7; x < HOME.x + 7; x++) if (grid.canTill(x, z)) { plot = [x, z]; break }
  }
  assert(!!plot, 'the homestead pad has tillable ground on it')
  const [px, pz] = plot ?? [HOME.x, HOME.z]

  assert(state.till(px, pz) === 'swing', 'hoe breaks ground')
  assert(grid.get('tilled', px, pz) === 1, 'the tile is now tilled')
  assert(state.till(px, pz) === null, 'the same tile cannot be tilled twice')

  // Soil-tags come up while hoeing, in order.
  const fragments = []
  state.on('fragment', (f) => fragments.push(f))
  state.tagsFound = 0
  state.findTag(px, pz)
  assert(fragments.length === 1 && fragments[0].from === 'Marit Flavyn', 'hoeing turns up a soil-tag')
  assert(/row four/i.test(fragments[0].lines.join(' ')), 'and the first one is the one about row four')
  state.findLog()
  assert(fragments.length === 2 && fragments[1].from === 'Odenne Var', 'the relay gives up a log')

  const inSeason = Object.values(CROPS).find((c) => c.seasons.includes(state.season))
  state.give(`seed_${inSeason.id}`, 2)
  assert(state.sow(px, pz, `seed_${inSeason.id}`) === 'swing', `sow ${inSeason.id}`)
  const outOfSeason = Object.values(CROPS).find((c) => !c.seasons.includes(state.season))
  state.give(`seed_${outOfSeason.id}`, 1)
  state.till(px + 1, pz)
  assert(state.sow(px + 1, pz, `seed_${outOfSeason.id}`) === null, 'an out-of-season seed is refused')
  assert(state.count(`seed_${outOfSeason.id}`) === 1, 'a refused seed is not consumed')

  const water0 = state.water
  assert(state.waterTile(px, pz) === 'pour', 'watering works')
  assert(state.water === water0 - 1, 'the can loses a charge')

  const grown0 = grid.get('grown', px, pz)
  state.weather = 'CLEAR'
  state.sleep()
  assert(grid.get('grown', px, pz) === grown0 + 1, 'a watered crop grows one day')
  assert(grid.get('wet', px, pz) === 0, 'water evaporates overnight')

  grid.set('grown', px, pz, 99)
  const manifest0 = state.manifestCount
  assert(state.harvest(px, pz) === 'swing', 'a ripe crop can be harvested')
  assert(state.count(inSeason.id) > 0, 'harvesting puts the crop in the pack')
  assert(state.manifestCount === manifest0 + 1, 'and writes one line back onto the Manifest')
  grid.set('crop', px, pz, 0)
  grid.set('tilled', px, pz, 1)
  state.sow(px, pz, `seed_${inSeason.id}`)
  grid.set('grown', px, pz, 99)
  state.harvest(px, pz)
  assert(state.manifestCount === manifest0 + 1, 'the same species does not count twice')

  state.till(px + 2, pz)
  state.weather = 'RAIN'
  state.sleep()
  assert(grid.get('wet', px + 2, pz) === 1, 'rain waters a tilled tile for free')

  let tree = null
  for (let i = 0; i < N * N && !tree; i++) if (grid.prop[i] === P.TREE) tree = [i % N, Math.floor(i / N)]
  assert(!!tree, 'the valley generated trees')
  if (tree) {
    const wood0 = state.count('wood')
    assert(state.chop(tree[0], tree[1]) === 'swing', 'a tree can be felled')
    assert(state.count('wood') > wood0, 'felling yields wood')
    assert(grid.get('prop', tree[0], tree[1]) === P.STUMP, 'a felled tree leaves a stump')
  }

  const pebbles0 = state.pebbles.length
  for (let n = 0; n < 80 && state.pebbles.length === pebbles0; n++) {
    grid.set('prop', px + 4, pz, P.GEODE)
    state.mine(px + 4, pz)
  }
  assert(state.pebbles.length > pebbles0, 'geodes eventually wake a pebble')

  // --- the pruning ---------------------------------------------------------
  state.give('wood', 60)
  state.give('stone', 60)
  state.give('fibre', 30)
  assert(state.build('shed', px + 6, pz) === 'swing', 'a shed can be built')
  const shed = state.buildings.find((b) => b.kind === 'shed')
  assert(shed && shed.registered === false, 'and it is NOT registered when it is built')

  assert(state.build('kiln', px + 6, pz + 4) === 'swing', 'a kiln can be built')
  const kiln = state.buildings.find((b) => b.kind === 'kiln')
  assert(state.canAfford(STAKE_COST), 'a stake is affordable')
  assert(state.stake(kiln), 'a stake can be driven')
  assert(kiln.registered === true, 'and the structure goes into the record')
  assert(!state.stake(kiln), 'a registered structure cannot be staked twice')

  // The homestead and the crate are placed by the generator, not by build(), so
  // the fixture stands them up the same way it does — registered, because they
  // were there when the rollback ran.
  state.buildings.push({ kind: 'homestead', level: 1, x: HOME.x, z: HOME.z - 5, registered: true })
  state.buildings.push({ kind: 'crate', level: 1, x: HOME.x + 4, z: HOME.z + 1, registered: true })

  const pruning = new PruningSystem(state, null, { kick() {} }, null)
  state.nextPruning = state.day
  assert(pruning.checkDay(), 'a pass comes due on its night')
  const before = state.count('wood')
  const report = pruning.apply()
  assert(report.taken.includes('shed'), 'the pass takes the unregistered shed apart')
  assert(!report.taken.includes('kiln'), 'and goes around the staked kiln')
  assert(state.buildings.some((b) => b.kind === 'kiln'), 'the kiln is still standing')
  assert(!state.buildings.some((b) => b.kind === 'shed'), 'the shed is not')
  assert(state.buildings.some((b) => b.kind === 'homestead'), 'the homestead is never taken — it is where you sleep')
  assert(state.count('wood') > before, 'and the components are stacked where it stood')
  assert(state.buildings.some((b) => b.kind === 'crate'), 'the shipping crate you started with is never taken')
  assert(state.nextPruning > state.day, 'the next pass is scheduled')

  // --- economy and save ----------------------------------------------------
  state.give('wood', 10)
  const coin0 = state.coin
  assert(state.ship('wood', 5), 'items can go in the crate')
  state.sleep()
  assert(state.coin > coin0, 'the crate pays out overnight')

  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  }
  assert(state.save(), 'the game saves')
  const peeked = GameState.peek()
  assert(!!peeked, 'the save can be read back')

  const { grid: g2 } = generate(1234)
  const s2 = new GameState(g2, 1234)
  assert(s2.load(peeked), 'the save loads onto a fresh valley')
  assert(s2.day === state.day, 'the day survives the round trip')
  assert(s2.manifestCount === state.manifestCount, 'the Manifest survives the round trip')
  assert(s2.tagsFound === state.tagsFound, 'the tags found survive the round trip')
  assert(s2.buildings.filter((b) => b.registered).length === state.buildings.filter((b) => b.registered).length,
    'the record of what is registered survives the round trip')
  let same = true
  for (let i = 0; i < N * N; i++) if (g2.height[i] !== grid.height[i] || g2.crop[i] !== grid.crop[i]) { same = false; break }
  assert(same, 'every cell of the grid survives the round trip')

  const { grid: a } = generate(999)
  const { grid: b } = generate(999)
  let identical = true
  for (let i = 0; i < N * N; i++) if (a.height[i] !== b.height[i] || a.prop[i] !== b.prop[i]) { identical = false; break }
  assert(identical, 'the same seed generates the same valley')

  // --- typography and the mark ---------------------------------------------
  const strings = ['SEISMIC VALLEY', 'THAW', 'LONGLIGHT', 'RUST', 'STILL', 'MANIFEST', 'THE LOOM']
  const missing = strings.filter((t) => !canSet(t))
  assert(missing.length === 0, 'every string the game sets in its own type has glyphs', missing.join(', '))

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
  const xs = pts.map((q) => q.x)
  assert(Math.max(...xs) < 0, 'the left lune stays left of the axis — the mark has a gap at its waist')
}

console.log(`\n${checks - failures}/${checks} checks passed\n`)
process.exit(failures ? 1 : 0)
