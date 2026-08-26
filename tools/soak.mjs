#!/usr/bin/env node
/**
 * The soak.
 *
 *   node tools/soak.mjs             -> three seeds, three simulated minutes each
 *   node tools/soak.mjs 9 600       -> nine seeds, six hundred seconds each
 *
 * `checks.js` asserts things I already knew to look for. This does the opposite:
 * it runs the real player controller, the real dog, real pebbles and the real
 * fishing rod against a real generated valley, feeds them randomised input for a
 * few simulated minutes, and watches a set of INVARIANTS that should hold no
 * matter what happens.
 *
 * The invariants are chosen to catch the class of bug that never throws:
 *
 *   NaN            a position that stops being a number. Nothing errors; the
 *                  body simply vanishes and the camera follows it to nowhere.
 *   OUT OF BOUNDS  anything outside the grid.
 *   TUNNELLING     a body that moved further in one frame than its own top
 *                  speed allows. That is a teleport, and a teleport through a
 *                  wall is how a character ends up inside terrain.
 *   INSIDE ROCK    a body whose Y is below the ground it is standing on. This
 *                  is the one that produced the screenshots of the settler
 *                  embedded in a terrace.
 *   SHEER CLIMBS   an agent that walked up more than it is allowed to. Pebbles
 *                  had no height test at all and strolled up eight-level cliffs.
 *   STRANDING      the dog left far behind with no way back. She cannot swim, so
 *                  the moment the player learned to, she could be cut off by a
 *                  river and press against the bank until the end of the save.
 *   DEADLOCK       a player who cannot move in ANY direction. A valley you can
 *                  get wedged in is worse than one you cannot enter.
 *
 * Exits non-zero on the first violation, with the seed and frame to reproduce.
 */

import * as THREE from 'three'
import { generate, HOME } from '../src/world/worldgen.js'

const SEEDS = Number(process.argv[2] || 3)
const SECONDS = Number(process.argv[3] || 180)
const DT = 1 / 30

console.log(`soaking ${SEEDS} valleys for ${SECONDS}s each\n`)
const fails = []
const note = (seed, frame, what, detail) => {
  fails.push(`seed ${seed} @ frame ${frame}: ${what}${detail ? ` — ${detail}` : ''}`)
  console.error(`  FAIL  seed ${seed} @ frame ${frame}: ${what}${detail ? `\n        ${detail}` : ''}`)
}

const finite = (v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z ?? 0)

await (async () => {
  const { N, WATER_LEVEL, LEVEL } = await import('../src/world/grid.js')
  const { PlayerController, buildPlayer } = await import('../src/actors/player.js')
  const { Cast } = await import('../src/actors/cast.js')
  const { GameState } = await import('../src/game/state.js')
  const { Water_Life } = await import('../src/world/fish.js')
  const { Fishing, STATE: FSTATE } = await import('../src/game/fishing.js')
  const { PruningSystem } = await import('../src/game/pruning.js')
  const { KIND, ITEMS, item } = await import('../src/game/items.js')
  const { MANIFEST_TOTAL } = await import('../src/game/story.js')

  for (let s = 0; s < SEEDS; s++) {
    const seed = 1000 + s * 7919
    const { grid } = generate(seed)
    const state = new GameState(grid, seed)
    const scene = new THREE.Group()
    const rig = buildPlayer('apprentice')
    const [sx, sz] = grid.nearestStandable(HOME.x, HOME.z + 3)
    const control = new PlayerController(grid, rig, sx + 0.5, sz + 0.5)
    const cast = new Cast(scene, grid, state, [sx + 0.5, sz + 0.5])
    const life = new Water_Life(grid)
    const fishing = new Fishing(state, grid, rig, life)
    const pruning = new PruningSystem(state, () => {}, null, null)

    // Three pebbles, so the job system is actually exercised.
    for (let i = 0; i < 3; i++) state.hatchPebble(sx + i * 2, sz + 2)

    const input = { move: new THREE.Vector3(), run: false, _p: new Set(), pressed(k) { return this._p.has(k) } }
    let rand = seed
    const rnd = () => { rand = (rand * 1103515245 + 12345) & 0x7fffffff; return rand / 0x7fffffff }

    const prev = { player: control.pos.clone(), dog: cast.sixteen.pos.clone(), pebbles: cast.pebbles.map((p) => p.pos.clone()) }
    let strandedFor = 0
    let wedgedFor = 0
    let hour = 6.4

    const frames = Math.round(SECONDS / DT)
    for (let f = 0; f < frames; f++) {
      // Randomised input, held for a stretch at a time so the body actually
      // travels rather than jittering on the spot.
      if (f % 40 === 0) {
        const a = rnd() * Math.PI * 2
        input.move.set(Math.cos(a), 0, Math.sin(a)).multiplyScalar(rnd() < 0.15 ? 0 : 1)
        input.run = rnd() < 0.4
      }
      input._p.clear()
      if (rnd() < 0.02) input._p.add('jump')

      hour = (hour + DT * (10 / 60 / 6.5)) % 24
      state.hour = hour
      state.day = 1 + Math.floor(f / (frames / 3))

      control.update(DT, input, (f / 400) % (Math.PI * 2))
      cast.update(DT, control.pos, hour)
      life.update(DT, { day: 1 })
      fishing.update(DT, control.pos, control.facing, hour)
      pruning.update(DT)

      /**
       * The action layer, hammered.
       *
       * Randomised tool use on whatever tile happens to be in front, a rod that
       * casts and strikes, a night's sleep every so often, and a save/load round
       * trip in the middle. None of it is trying to play well — it is trying to
       * reach states a careful player never would.
       */
      const [tx, tz] = control.target
      if (f % 7 === 0) {
        // Keep the rod out while a line is in the water — switching slots puts
        // the rod away, which is correct behaviour and would mean this loop
        // never actually landed a fish.
        if (fishing.phase === FSTATE.IDLE) state.slot = Math.floor(rnd() * 8)
        const held = state.held
        if (held === 'rod') {
          if (fishing.phase === FSTATE.IDLE) fishing.press(control.pos, control.facing, hour)
          else if (fishing.phase === FSTATE.BITE) fishing.press(control.pos, control.facing, hour)
          else if (rnd() < 0.05) fishing.toggle()
        } else if (held === 'hoe') state.till(tx, tz)
        else if (held === 'can') { state.waterTile(tx, tz) || state.refill() }
        else if (held === 'axe') state.chop(tx, tz)
        else if (held === 'pick') state.mine(tx, tz)
        else if (held && item(held).kind === KIND.SEED) state.sow(tx, tz, held)
        state.harvest(tx, tz)
      }
      state.playerCell = control.cell
      if (f % 331 === 0) state.build(rnd() < 0.5 ? 'shed' : 'cairn', tx, tz)
      if (f % 1200 === 1199) state.sleep()
      if (f === Math.floor(frames / 2)) {
        // A save/load round trip mid-run. Anything the save drops shows up as a
        // broken invariant on the far side rather than as a bug report.
        const blob = JSON.parse(JSON.stringify(state.toJSON()))
        if (!state.load(blob)) note(seed, f, 'the save would not load back')
      }

      // --- the clock ---------------------------------------------------------
      if (!(state.hour >= 0 && state.hour < 24)) { note(seed, f, 'the clock left the day', String(state.hour)); break }
      if (!Number.isInteger(state.day) || state.day < 1) { note(seed, f, 'the calendar broke', String(state.day)); break }
      if (state.season < 0 || state.season > 3) { note(seed, f, 'the season left the year', String(state.season)); break }

      // --- unbounded growth --------------------------------------------------
      // Every one of these is appended to and never trimmed by the game loop, so
      // a leak here is a session that gets slower the longer it is played.
      if (state.journal.length > 400) { note(seed, f, 'the journal is growing without bound', String(state.journal.length)); break }
      if (life.ripples.length > 64) { note(seed, f, 'the ripple pool is leaking', String(life.ripples.length)); break }
      if (state.buildings.length > 200) { note(seed, f, 'the building list is growing without bound', String(state.buildings.length)); break }

      // --- the tackle --------------------------------------------------------
      if (!finite(fishing.floatPos)) { note(seed, f, 'the float position stopped being a number'); break }

      // --- the ledger --------------------------------------------------------
      if (state.coin < 0) { note(seed, f, 'coin went negative', String(state.coin)); break }
      if (!Number.isFinite(state.coin)) { note(seed, f, 'coin stopped being a number'); break }
      if (state.water < 0 || state.stamina < -0.01) { note(seed, f, 'a vital went negative', `water ${state.water} stamina ${state.stamina.toFixed(2)}`); break }
      if (state.recovered.size > MANIFEST_TOTAL) { note(seed, f, 'the Manifest overflowed'); break }
      let badBag = null
      for (const [id, n] of state.bag) {
        if (!ITEMS[id]) badBag = `unknown item "${id}"`
        else if (!Number.isFinite(n) || n < 0) badBag = `${id} x ${n}`
      }
      if (badBag) { note(seed, f, 'the pack holds something impossible', badBag); break }
      if (state.hotbar.length !== 8) { note(seed, f, 'the hotbar changed length', String(state.hotbar.length)); break }
      const ghost = state.hotbar.find((id) => id && !ITEMS[id])
      if (ghost) { note(seed, f, 'the hotbar holds an item that does not exist', ghost); break }

      // --- NaN and bounds ----------------------------------------------------
      if (!finite(control.pos)) { note(seed, f, 'the player position stopped being a number'); break }
      if (control.pos.x < 0 || control.pos.z < 0 || control.pos.x >= N || control.pos.z >= N) {
        note(seed, f, 'the player left the grid', `${control.pos.x.toFixed(1)}, ${control.pos.z.toFixed(1)}`)
        break
      }

      // --- tunnelling --------------------------------------------------------
      // Top speed is RUN; anything past a generous multiple of it in one frame
      // is a teleport, and a teleport is how a body ends up inside a wall.
      const moved = Math.hypot(control.pos.x - prev.player.x, control.pos.z - prev.player.z)
      if (moved > 7.0 * DT * 1.6) { note(seed, f, 'the player teleported', `${moved.toFixed(2)} units in one frame`); break }
      prev.player.copy(control.pos)

      // --- inside rock -------------------------------------------------------
      if (!control.swimming) {
        const floor = grid.h(Math.floor(control.pos.x), Math.floor(control.pos.z)) * LEVEL
        if (control.pos.y < floor - LEVEL - 0.05) {
          note(seed, f, 'the player is inside the ground', `y ${control.pos.y.toFixed(2)} under floor ${floor.toFixed(2)}`)
          break
        }
      } else {
        const surface = WATER_LEVEL * LEVEL + LEVEL * 0.5
        if (control.pos.y < surface - 2) { note(seed, f, 'the player sank', control.pos.y.toFixed(2)); break }
      }

      // --- sheer climbs ------------------------------------------------------
      let climbed = null
      cast.pebbles.forEach((p, i) => {
        const a = prev.pebbles[i]
        if (!finite(p.pos)) climbed = `pebble ${i} position is NaN`
        const dh = grid.h(Math.floor(p.pos.x), Math.floor(p.pos.y)) - grid.h(Math.floor(a.x), Math.floor(a.y))
        // Only a step between ADJACENT cells counts; a re-roll of the job can
        // legitimately move the goal, not the body.
        const step = Math.hypot(p.pos.x - a.x, p.pos.y - a.y)
        if (step < 1.5 && dh > 2) climbed = `pebble ${i} climbed ${dh} levels in one step`
        a.copy(p.pos)
      })
      if (climbed) { note(seed, f, 'an agent walked up a cliff', climbed); break }

      // --- stranding ---------------------------------------------------------
      const dogAway = Math.hypot(cast.sixteen.pos.x - control.pos.x, cast.sixteen.pos.y - control.pos.z)
      strandedFor = dogAway > 22 ? strandedFor + DT : 0
      if (strandedFor > 25) {
        note(seed, f, 'the dog has been stranded for 25 seconds', `${dogAway.toFixed(1)} cells away`)
        break
      }

      // --- deadlock ----------------------------------------------------------
      // Can the body move at ALL? Tested every second, against eight headings.
      if (f % 30 === 0) {
        let anyFree = false
        const fromH = control.swimming ? WATER_LEVEL : grid.h(Math.floor(control.pos.x), Math.floor(control.pos.z))
        for (let k = 0; k < 8 && !anyFree; k++) {
          const a = (k / 8) * Math.PI * 2
          const nx = control.pos.x + Math.cos(a) * 0.5
          const nz = control.pos.z + Math.sin(a) * 0.5
          if (control._free(nx, control.pos.z, fromH, 'x') || control._free(control.pos.x, nz, fromH, 'z')) anyFree = true
        }
        wedgedFor = anyFree ? 0 : wedgedFor + 1
        if (wedgedFor > 3) {
          const px = Math.floor(control.pos.x), pz = Math.floor(control.pos.z)
          const rows = []
          for (let dz = -2; dz <= 2; dz++) {
            let row = ''
            for (let dx = -2; dx <= 2; dx++) {
              row += `${grid.h(px + dx, pz + dz)}/${grid.prop[(pz + dz) * N + px + dx]} `
            }
            rows.push(row)
          }
          note(seed, f, 'the player is wedged and cannot move in any direction',
            `at ${control.pos.x.toFixed(2)},${control.pos.z.toFixed(2)} swimming=${control.swimming} | ` + rows.join(' | '))
          break
        }
      }
    }

    life.dispose()
    console.log(`  seed ${seed}: ${frames} frames, ${state.stats.caught} caught, ${cast.pebbles.length} pebbles`)
  }
})()

console.log(fails.length ? `\n${fails.length} invariant(s) broken\n` : '\nno invariants broken\n')
process.exit(fails.length ? 1 : 0)
