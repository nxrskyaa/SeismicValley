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
  state.flags.add('met-rocky')
  const t3 = new Tutorial(state)
  assert(t3.finished && t3.step === null, 'a finished list stays finished')

  // --- what the pebbles do all day -----------------------------------------
  const { JOBS, findSpot } = await import('../src/actors/jobs.js')
  assert(JOBS.length >= 6, `there is more than one thing to do (${JOBS.length} jobs)`)
  assert(JOBS.every((j) => j.label && j.say), 'every job has a label and a line for the journal')
  assert(JOBS.filter((j) => j.follows).length === 1,
    'following the player is ONE job out of many, not the default state of the world')
  assert(JOBS.every((j) => j.follows || typeof j.pose === 'function'),
    'every job with a destination has something to do when it gets there')

  // The valley has to actually contain somewhere to do each of them. A job whose
  // predicate never matches is a pebble that walks to the map edge and stops.
  const homeless = JOBS.filter((j) => !j.follows && !findSpot(grid, j, 48, 48, 44)).map((j) => j.id)
  assert(homeless.length === 0, 'every job has somewhere in the valley to be done', homeless.join(', '))

  // Every step has to be reachable from something the game actually records.
  // A step whose predicate reads a counter nobody increments is a wall.
  const src = read(path.join(SRC, 'game/state.js')) + read(path.join(SRC, 'game/fishing.js')) + read(path.join(SRC, 'game/tutorial.js'))
  for (const k of ['tilled', 'sown', 'watered', 'chopped', 'caught', 'slept']) {
    assert(src.includes(`stats.${k}++`), `something in the game increments stats.${k}`)
  }
  assert(read(path.join(SRC, 'main.js')).includes("flags.add('met-rocky')"),
    'meeting Rocky is recorded, so the ridge step can complete')
}

// ---------------------------------------------------------- 6a. getting about --

console.log('\nmoving')
{
  const THREE = await import('three')
  const { generate, HOME } = await import('../src/world/worldgen.js')
  const { N, WATER_LEVEL, LEVEL } = await import('../src/world/grid.js')
  const { PlayerController, buildPlayer } = await import('../src/actors/player.js')

  const { grid } = generate(31337)

  /**
   * THE ONE THAT MADE THE MAP A MAZE.
   *
   * worldgen terraces at STEP = 2, so an ordinary terrace face is two levels.
   * The controller allowed a step up of one. Every terrace in the valley was
   * therefore a wall, falling off any ledge was a one-way trip, and walking into
   * a shelf read as broken collision rather than as a rule.
   */
  const gen = read(path.join(SRC, 'world/worldgen.js'))
  const player = read(path.join(SRC, 'actors/player.js'))
  const terraceStep = Number(/const STEP = (\d+)/.exec(gen)?.[1])
  const stepUp = Number(/const STEP_UP = (\d+)/.exec(player)?.[1])
  assert(terraceStep > 0 && stepUp >= terraceStep,
    `a body can climb an ordinary terrace (terrace ${terraceStep}, step-up ${stepUp})`)

  /**
   * THE ONE THAT DROWNED PEOPLE ON DRY LAND.
   *
   * sampleY blends the four corners under a position. It used to anchor on the
   * LOWEST of them, so standing on a rim four levels above a lake basin capped
   * every corner down to the basin and put the body at the bottom of the pond.
   * Nothing on land may ever sample below the waterline.
   */
  const surface = WATER_LEVEL * LEVEL + LEVEL * 0.5
  let sunk = null
  let worst = 0
  for (let z = 2; z < N - 2; z++) {
    for (let x = 2; x < N - 2; x++) {
      const floorY = grid.h(x, z) * LEVEL
      for (const [ox, oz] of [[0.5, 0.5], [0.05, 0.5], [0.95, 0.5], [0.5, 0.05], [0.5, 0.95], [0.95, 0.95]]) {
        const drop = floorY - grid.sampleY(x + ox, z + oz)
        if (drop > worst) { worst = drop; sunk = [x, z] }
      }
    }
  }
  /**
   * The blend's whole budget is ONE level — that is the slope it exists to
   * smooth, and approaching the lip of a single step legitimately walks you down
   * into the cell below. Anything past that is the anchor bug: capped to the
   * lowest of the four corners, a body on a rim above the lake was placed four
   * levels down at the bed, on dry land, under the water plane.
   */
  assert(worst <= LEVEL + 0.001, 'the height blend never drops a body more than one level',
    sunk && `cell ${sunk} drops ${worst.toFixed(2)}`)

  // Wading: water is always enterable, and a low bank is always climbable out of.
  let pond = null
  for (let z = HOME.z - 12; z < HOME.z + 14 && !pond; z++) {
    for (let x = HOME.x; x < HOME.x + 26; x++) if (grid.h(x, z) < WATER_LEVEL - 1) { pond = [x, z]; break }
  }
  assert(!!pond, 'the home pond exists to swim in')
  assert(grid.canWade(pond[0], pond[1], WATER_LEVEL + 4, 2), 'you can get into the water from the bank')
  assert(!grid.canStand(pond[0], pond[1], WATER_LEVEL + 4, 2), 'the dog still cannot')

  /**
   * And the loop that matters: walk off a bank, float, and get back out.
   *
   * A pond you can fall into and not climb out of is worse than a pond you
   * cannot enter, so this drives the real controller until it is back on land.
   */
  {
    const rig = buildPlayer('apprentice')
    const c = new PlayerController(grid, rig, pond[0] + 0.5, pond[1] + 0.5)
    const input = { move: new THREE.Vector3(), run: false, pressed: () => false }
    c.update(1 / 60, input, 0)
    assert(c.swimming, 'a body over water is swimming')
    // It rises to the surface over about half a second rather than snapping —
    // falling in should look like falling in.
    for (let f = 0; f < 120; f++) c.update(1 / 60, input, 0)
    assert(Math.abs(c.pos.y - (surface - 0.62)) < 0.12, 'it floats at the surface rather than sinking', c.pos.y.toFixed(2))

    // Try every direction; at least one has to get back onto dry land.
    let escaped = false
    for (const [mx, mz] of [[0, -1], [0, 1], [-1, 0], [1, 0], [-0.7, -0.7], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7]]) {
      const c2 = new PlayerController(grid, rig, pond[0] + 0.5, pond[1] + 0.5)
      const inp = { move: new THREE.Vector3(mx, 0, mz), run: false, pressed: () => false }
      for (let f = 0; f < 600; f++) {
        c2.update(1 / 60, inp, 0)
        if (!c2.swimming) { escaped = true; break }
      }
      if (escaped) break
    }
    assert(escaped, 'a body that falls in the water can get back out of it')
  }

  // Sliding: the per-axis test is what stops the player pinning against a wall.
  assert(/_free\(nx, this\.pos\.z, fromH, 'x'\)/.test(player) && /_free\(this\.pos\.x, nz, fromH, 'z'\)/.test(player),
    'collision is tested per axis, so a body slides along a wall instead of sticking')
}

// ----------------------------------------------------------- 6a2. the forest --

console.log('\nthe forest')
{
  const { generate } = await import('../src/world/worldgen.js')
  const { N, P } = await import('../src/world/grid.js')

  /**
   * A canopy spans three cells, so two trunks two cells apart are one lumpy mass
   * with two sticks under it. Per-cell probability cannot avoid that at any
   * density — Poisson noise clumps by definition — so the generator thins to a
   * minimum distance. This is that distance, measured.
   */
  for (const seed of [1, 77, 4242]) {
    const { grid } = generate(seed)
    const trees = []
    for (let i = 0; i < N * N; i++) if (grid.prop[i] === P.TREE) { const x = i % N; trees.push([x, (i - x) / N]) }
    let closest = Infinity
    for (let a = 0; a < trees.length; a++) {
      for (let b = a + 1; b < trees.length; b++) {
        const d = Math.hypot(trees[a][0] - trees[b][0], trees[a][1] - trees[b][1])
        if (d < closest) closest = d
      }
    }
    assert(trees.length > 60, `seed ${seed} still has a forest (${trees.length} trees)`)
    assert(closest >= 3.5, `seed ${seed} has sky between its canopies (closest trunks ${closest.toFixed(1)} cells)`)
  }
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
  // --- the whole loop, driven ------------------------------------------------
  //
  // The rod, the line and the float are three.js objects, but the state machine
  // is not, so it can be run headless at a fixed timestep. This is the only way
  // to prove that a cast actually reaches a fish rather than merely compiling.
  {
    const THREE = await import('three')
    const { CATCH, Fishing, STATE } = await import('../src/game/fishing.js')
    const { Water_Life } = await import('../src/world/fish.js')
    const { GameState } = await import('../src/game/state.js')
    const { generate, HOME } = await import('../src/world/worldgen.js')

    const { grid } = generate(4242)
    const state = new GameState(grid, 4242)
    const player = { holdR: new THREE.Group(), anim: { use: 0 } }
    const life = new Water_Life(grid)
    const rod = new Fishing(state, grid, player, life)

    // Stand on the bank of the home pond, facing the water.
    let stand = null
    for (let z = HOME.z - 12; z < HOME.z + 14 && !stand; z++) {
      for (let x = HOME.x; x < HOME.x + 26; x++) {
        if (grid.isWater(x, z) || !grid.canStand(x, z, grid.h(x, z))) continue
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (grid.isWater(x + dx * 2, z + dz * 2)) { stand = [x + 0.5, z + 0.5, Math.atan2(dx, dz)]; break }
        }
        if (stand) break
      }
    }
    assert(!!stand, 'there is a bank to stand on at the home pond')

    const pos = new THREE.Vector3(stand[0], grid.sampleY(stand[0], stand[1]), stand[1])
    const facing = stand[2]
    assert(!!rod.aim(pos, facing), 'the cast finds open water from the bank')

    state.hotbar[state.slot] = 'rod'
    assert(rod.press(pos, facing, 12) === 'cast', 'pressing once casts')

    // Run the clock. Strike on the frame the float goes under; nine seconds is
    // longer than the worst case wait plus the bite window.
    let struck = false
    let saw = new Set()
    for (let f = 0; f < 900; f++) {
      rod.update(1 / 60, pos, facing, 12)
      saw.add(rod.phase)
      if (rod.phase === STATE.BITE && !struck) {
        struck = true
        rod.press(pos, facing, 12)
      }
      if (rod.phase === STATE.LANDED) break
    }
    assert(saw.has(STATE.WAIT), 'the float waits')
    assert(saw.has(STATE.NIBBLE), 'a nibble comes before the bite')
    assert(struck, 'a bite happens inside fifteen seconds of casting')
    assert(rod.phase === STATE.LANDED, 'striking the bite lands the fish')
    assert(state.stats.caught === 1, 'the catch is counted')
    assert(!!rod.lastCatch && state.has(rod.lastCatch.id, 1), 'the catch is in the pack', rod.lastCatch?.id)

    // And missing it costs the fish, not the cast.
    const rod2 = new Fishing(state, grid, player, life)
    rod2.press(pos, facing, 12)
    let missed = false
    for (let f = 0; f < 1800; f++) {
      rod2.update(1 / 60, pos, facing, 12)
      if (rod2.phase === STATE.BITE) missed = true
      if (missed && rod2.phase === STATE.WAIT) break
    }
    assert(missed && rod2.phase === STATE.WAIT, 'missing the bite loses the fish and keeps the line out')
    assert(state.stats.caught === 1, 'a missed bite catches nothing')

    // --- the rod left in the water -------------------------------------------
    // It has to land fish with NO input at all, and go straight back in, or it
    // is not unattended fishing, it is fishing with one fewer key press.
    const rod3 = new Fishing(state, grid, player, life)
    rod3.press(pos, facing, 12)
    rod3.toggle()
    assert(rod3.patient, 'E sets the rod down')
    const before = state.stats.caught
    let recast = 0
    let wasLanded = false
    for (let f = 0; f < 7200; f++) {
      rod3.update(1 / 60, pos, facing, 12)
      if (rod3.phase === STATE.LANDED) wasLanded = true
      else if (wasLanded && rod3.phase === STATE.WAIT) { recast++; wasLanded = false }
    }
    assert(state.stats.caught - before >= 2, 'a rod left in the water keeps catching', `${state.stats.caught - before}`)
    assert(recast >= 2, 'and casts itself again each time', `${recast}`)
    assert(rod3.phase !== STATE.IDLE, 'and never quietly stops')

    // The trade: nothing that only bites after dark bites for somebody who is
    // not there. Rolled a few hundred times so this is a rule, not a run of luck.
    const nocturnal = new Set(CATCH.filter((c) => c.night).map((c) => c.id))
    let leaked = 0
    for (let i = 0; i < 600; i++) if (nocturnal.has(rod3.roll(4, 23).id)) leaked++
    assert(leaked === 0, 'an unattended rod never lands the rare fish', `${leaked} in 600`)
    rod3.patient = false
    let found = 0
    for (let i = 0; i < 600; i++) if (nocturnal.has(rod3.roll(4, 23).id)) found++
    assert(found > 0, 'but somebody watching the float at night does', `${found} in 600`)

    life.dispose()
  }
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

// ---------------------------------------------------- 7c. the touch controls --
//
// The pads only exist on a coarse pointer, so nothing else here ever sees them
// and they shipped laid out at fixed pixel offsets measured on a wide window.
// On a 412-point phone — the only device that ever draws them — they overlapped
// each other, the hotbar, the audio toggles and the hint line, all at once.

console.log('\nthe touch controls')
{
  const { PADS, PAD_PLACE, padScale } = await import('../src/ui/touch.js')
  const input = read(path.join(SRC, 'core/input.js'))
  const main = read(path.join(SRC, 'main.js'))

  // A pad wired to an action nothing reads is a button that does nothing.
  const dead = PADS.filter((p) => !input.includes(`'${p.action}'`)).map((p) => p.label)
  assert(dead.length === 0, 'every pad fires an action the game knows about', dead.join(', '))

  // Build, on a device with no keyboard. Without a pad for it the stakes, the
  // cairns and the whole registration mechanic were unreachable on a phone.
  assert(PADS.some((p) => p.action === 'build'), 'there is a pad for building')
  assert(main.includes("input.pressed('build')"), 'and something reads it')

  // No two pads may touch. Measured, not eyeballed.
  let tightest = Infinity
  let pair = null
  for (let a = 0; a < PADS.length; a++) {
    for (let b = a + 1; b < PADS.length; b++) {
      const d = Math.hypot(PAD_PLACE[a][0] - PAD_PLACE[b][0], PAD_PLACE[a][1] - PAD_PLACE[b][1])
      const gap = d - PADS[a].r - PADS[b].r
      if (gap < tightest) { tightest = gap; pair = `${PADS[a].label}/${PADS[b].label}` }
    }
  }
  assert(tightest >= 10, 'no two pads overlap', `${pair} are ${tightest.toFixed(1)} points apart`)

  // The cluster has to fit beside the stick on the narrowest phone worth
  // supporting. 320 points is an iPhone SE in portrait.
  const NARROW = 320
  const sc = padScale(NARROW)
  const cluster = (Math.max(...PAD_PLACE.map((q, k) => -q[0] + PADS[k].r)) + 58) * sc
  const stickEdge = 24 + 2 * 62 * sc
  assert(cluster + stickEdge < NARROW, 'the cluster and the stick both fit on a 320pt screen',
    `${Math.round(cluster)}pt of pads + ${Math.round(stickEdge)}pt of stick`)

  // And every instruction has a touch translation, or a phone is told to press
  // keys it does not have.
  const { STEPS } = await import('../src/game/tutorial.js')
  const { translate } = await import('../src/ui/keycaps.js')
  const untranslated = STEPS
    .filter((step) => /<kbd>/.test(translate(step.keys)))
    .map((step) => step.id)
  assert(untranslated.length === 0, 'every key the first morning names has a pad label',
    untranslated.join(', '))
}

// ------------------------------------------------------------- 8. the soak --
//
// A short run of the real thing. `tools/soak.mjs` drives the player, the dog,
// the pebbles and the rod against a generated valley with randomised input and
// watches invariants that should hold no matter what happens: NaN, tunnelling,
// bodies inside rock, agents up cliffs, the dog stranded, the player wedged,
// lists that grow without bound. Every one of those is a bug that never throws,
// which is why nothing else in this file caught any of them.
//
// Two valleys and ninety seconds, so it stays inside a normal check run. The
// full sweep is `npm run soak`.

console.log('\nthe soak')
{
  const { execFileSync } = await import('node:child_process')
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'tools/soak.mjs'), '2', '90'], { stdio: 'pipe' })
    ok('two valleys survive ninety seconds of randomised play')
  } catch (e) {
    const out = String(e.stdout ?? e)
    fail('two valleys survive ninety seconds of randomised play',
      out.split('\n').filter((l) => l.includes('FAIL') || l.trim().startsWith('at ')).join('; ') || out.slice(0, 300))
  }
}

// -------------------------------------------------- 7b. what the interface reads --

console.log('\nthe interface')
{
  const { unknownStateReads } = await import('./ui-reads.mjs')
  const { GameState } = await import('../src/game/state.js')
  const { generate } = await import('../src/world/worldgen.js')
  const { grid } = generate(5)
  const unknown = unknownStateReads(SRC, new GameState(grid, 5))
  assert(unknown.length === 0, 'every state field the interface reads exists', unknown.join(', '))
}

// ------------------------------------------------------------- 8. the soak --
//
// A short run of the real thing. `tools/soak.mjs` drives the player, the dog,
// the pebbles and the rod against a generated valley with randomised input and
// watches invariants that should hold no matter what happens: NaN, tunnelling,
// bodies inside rock, agents up cliffs, the dog stranded, the player wedged,
// lists that grow without bound. Every one of those is a bug that never throws,
// which is why nothing else in this file caught any of them.
//
// Two valleys and ninety seconds, so it stays inside a normal check run. The
// full sweep is `npm run soak`.

console.log('\nthe soak')
{
  const { execFileSync } = await import('node:child_process')
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'tools/soak.mjs'), '2', '90'], { stdio: 'pipe' })
    ok('two valleys survive ninety seconds of randomised play')
  } catch (e) {
    const out = String(e.stdout ?? e)
    fail('two valleys survive ninety seconds of randomised play',
      out.split('\n').filter((l) => l.includes('FAIL')).join('; ') || out.slice(0, 300))
  }
}

console.log(`\n${checks - failures}/${checks} checks passed\n`)
process.exit(failures ? 1 : 0)
