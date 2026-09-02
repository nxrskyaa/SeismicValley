#!/usr/bin/env node
/**
 * Does the body move smoothly, or does it snap?
 *
 * "Naik dan turun area terasa kasar, seperti masuk ke dalam kotak dan
 * terpental" — climbing and dropping between terraces reads as jolting into a
 * box and bouncing off it. That is a complaint about MOTION, and motion is the
 * one thing a screenshot cannot show, so it never had a test.
 *
 * The world is an integer height grid: standing on a terrace one level up means
 * the collision y really does jump a whole unit in a single frame. That is
 * correct and must stay correct — what the player watches is `renderY`, the
 * picture, and the picture is what has to be continuous. So this walks a body
 * over a staircase at a fixed timestep and measures the largest jump the
 * PICTURE makes in one frame.
 *
 *   node tools/motion.mjs
 */

import * as THREE from 'three'
import { Grid, LEVEL, N } from '../src/world/grid.js'
import { PlayerController, buildPlayer } from '../src/actors/player.js'

let bad = 0
const fail = (what, detail) => { bad++; console.error(`  FAIL  ${what}${detail ? `\n        ${detail}` : ''}`) }
const ok = (what) => console.log(`  ok    ${what}`)

const DT = 1 / 60
/**
 * A single frame may move the picture by this much and no more.
 *
 * At 60fps a body walking at about 4 units/second covers 0.07 of a unit per
 * frame, so anything past a tenth of a level is the picture teleporting rather
 * than travelling. A full-level pop reads as the bounce being complained about.
 */
const MAX_STEP = LEVEL * 0.1

/** A flight of stairs across the middle of an otherwise flat valley. */
function staircase() {
  const grid = new Grid()
  grid.height.fill(4)
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      /**
       * Up in single steps, then a run of drops on the far side.
       *
       * Both directions have to be walked. Climbing exercises the smoothing;
       * FALLING exercises the landing, and the landing is where the body can
       * report itself airborne on the very frame it touches down.
       */
      let h = 4
      if (x > 40 && x <= 64) h = 4 + Math.min(6, Math.floor((x - 40) / 4))
      else if (x > 64) h = Math.max(1, 10 - Math.floor((x - 64) / 3) * 2)
      grid.height[z * N + x] = h
    }
  }
  return grid
}

// The same shape the game hands the controller: a move vector, a run flag, and
// a pressed-this-frame set. Walking due east, never running, never jumping.
const input = {
  move: new THREE.Vector3(1, 0, 0),
  run: false,
  pressed() { return false },
}

const grid = staircase()
const rig = buildPlayer('apprentice')
const control = new PlayerController(grid, rig, 36.5, 48.5)

let worst = 0
let worstAt = null
let prev = control.renderY ?? control.pos.y
let wasGrounded = control.onGround
let landedButAirborne = 0
let fell = 0

/**
 * Long enough to climb the flight and walk back down the far side, and no
 * longer. At a walk this covers x=36 to about x=76; running on would take the
 * body off the edge of the grid, where it falls forever and the airborne count
 * stops meaning anything.
 */
for (let f = 0; f < 620 && control.pos.x < 78; f++) {
  control.update(DT, input, 0)
  const y = control.renderY ?? control.pos.y
  const d = Math.abs(y - prev)

  /**
   * Only while the body is WALKING, both before and after the step.
   *
   * A body in mid-air is falling, and a fall is supposed to be fast — an
   * earlier version of this budget policed gravity and reported a legitimate
   * 10 u/s drop as a defect. The smoothing regime is the one under test: while
   * the feet are down, the picture may only ever move at the climb rate.
   */
  if (wasGrounded && control.onGround) {
    if (d > worst) { worst = d; worstAt = [control.pos.x.toFixed(1), control.pos.y.toFixed(2)] }
  } else fell++
  prev = y
  wasGrounded = control.onGround

  /**
   * The body is resting exactly on the ground and yet reports being in the air.
   *
   * That combination is what makes the picture snap: `renderY` is only smoothed
   * while `onGround`, so a single frame of a false airborne reading on the frame
   * of LANDING hands the player a hard cut instead of a step.
   */
  const groundY = grid.sampleY(control.pos.x, control.pos.z)
  if (!control.swimming && !control.onGround && Math.abs(control.pos.y - groundY) < 1e-6) landedButAirborne++
}

if (landedButAirborne) {
  fail('the body reports being airborne while resting on the ground',
    `${landedButAirborne} frames — every one of them cuts the picture instead of smoothing it`)
} else ok('a body standing on the ground is never reported as airborne')

if (worst > MAX_STEP) {
  fail('the picture jumps between frames',
    `${worst.toFixed(3)} in one frame at x=${worstAt?.[0]}, against a ${MAX_STEP.toFixed(3)} budget`)
} else ok(`the climb is continuous (worst frame ${worst.toFixed(3)}, budget ${MAX_STEP.toFixed(3)})`)

// A staircase nobody ever left the ground on would pass the budget trivially.
if (fell < 10) fail('the walk never left the ground', `${fell} airborne frames — the drops are not being exercised`)
else ok(`and the drops were actually walked (${fell} airborne frames)`)

console.log(bad ? `\n  ${bad} problem(s)\n` : '\n  smooth\n')
process.exit(bad ? 1 : 0)
