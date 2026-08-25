import * as THREE from 'three'
import { chamferBox, glowMat, stoneMat } from '../core/kit.js'
import { C, UI } from '../core/palette.js'
import { damp, randRange, rng } from '../core/rng.js'
import { LEVEL, N, WATER_LEVEL } from '../world/grid.js'

/**
 * FISHING.
 *
 * The rod is a real object in the player's hand, the line is real geometry
 * running from its tip to a float that is really floating on the water, and the
 * bite is a thing you can miss. None of that is decoration: a fishing minigame
 * where the tackle is implied and the catch is a dice roll is a menu with a
 * progress bar on it.
 *
 * ## The loop
 *
 *   IDLE     rod held across the body
 *   CAST     the float flies out on an arc and lands; a splash goes out
 *   WAIT     the float bobs. How long you wait depends on how many fish are
 *            actually circling nearby — the school is not decoration either
 *   NIBBLE   two small dips and a tick of sound. A warning, not the bite
 *   BITE     the float goes UNDER and the rod bends. About a second and a half
 *            to press the key
 *   REEL     the float races back, the line goes taut
 *   LANDED   the fish comes out of the water and into the pack
 *
 * Miss the bite and the float pops back up and the wait starts again — the line
 * does not reset, because losing the fish and losing the cast are different
 * disappointments and only one of them is fair.
 */

export const STATE = { IDLE: 0, CAST: 1, WAIT: 2, NIBBLE: 3, BITE: 4, REEL: 5, LANDED: 6 }

const CAST_TIME = 0.62
const BITE_WINDOW = 1.45
const REEL_TIME = 0.7
const CAST_RANGE = 4.6

/**
 * What is in the water.
 *
 * `weight` is drawn against the sum, `depth` is the minimum water depth it will
 * hold in, and `night` doubles the weight after dark. The junk entry is there on
 * purpose: a table where every outcome is a reward is a table with no tension.
 */
export const CATCH = [
  { id: 'silverfin', weight: 34, depth: 1, value: 22 },
  { id: 'ashcarp', weight: 26, depth: 1, value: 30 },
  { id: 'glasseye', weight: 16, depth: 2, value: 58, night: true },
  { id: 'loomfish', weight: 4, depth: 3, value: 180, night: true },
  { id: 'riverboot', weight: 12, depth: 1, value: 1 },
  { id: 'fibre', weight: 8, depth: 1, value: 2 },
]

/** The rod, as a real object. Parented into the player's hand socket. */
export function buildRod() {
  const MAT = {
    pole: stoneMat('#8a6a44'),
    grip: stoneMat('#3a2b33'),
    ring: stoneMat(UI.stoneLit),
  }
  const root = new THREE.Group()
  root.name = 'rod'
  const pole = new THREE.Mesh(chamferBox(0.045, 1.5, 0.045, 0.012), MAT.pole)
  pole.position.set(0, 0.72, 0)
  root.add(pole)
  const grip = new THREE.Mesh(chamferBox(0.06, 0.26, 0.06, 0.015), MAT.grip)
  grip.position.set(0, 0.13, 0)
  root.add(grip)
  const reel = new THREE.Mesh(chamferBox(0.11, 0.11, 0.07, 0.02), MAT.ring)
  reel.position.set(0.05, 0.3, 0)
  root.add(reel)
  // The tip, in the rod's own space. The line is drawn from here.
  const tip = new THREE.Object3D()
  tip.position.set(0, 1.46, 0)
  root.add(tip)
  return { root, tip, pole }
}

export class Fishing {
  /**
   * @param state   the game state, for the catch
   * @param grid    for water depth
   * @param player  the rig, so the rod can live in its hand
   * @param life    the Water_Life, for ripples and fish density
   * @param audio   optional
   */
  constructor(state, grid, player, life, audio) {
    this.state = state
    this.grid = grid
    this.player = player
    this.life = life
    this.audio = audio
    this.rand = rng(0xba17)
    this.phase = STATE.IDLE
    this.t = 0
    this.surface = WATER_LEVEL * LEVEL + LEVEL * 0.5

    this.group = new THREE.Group()
    this.group.name = 'tackle'

    this.rod = buildRod()
    this.rod.root.visible = false
    // Held in the right hand, angled forward across the body.
    player.holdR.add(this.rod.root)
    this.rod.root.rotation.set(-0.5, 0, 0.18)

    // The float. Two blocks and it is instantly readable at this camera height:
    // a red top half and a pale bottom half, so the moment it goes under is
    // unmistakable.
    this.float = new THREE.Group()
    const top = new THREE.Mesh(chamferBox(0.13, 0.11, 0.13, 0.03), glowMat('#d94f4f', 0.9))
    top.position.y = 0.055
    const bot = new THREE.Mesh(chamferBox(0.12, 0.09, 0.12, 0.03), stoneMat(C.waterFoam))
    bot.position.y = -0.04
    this.float.add(top, bot)
    this.float.visible = false
    this.group.add(this.float)

    // The line. A two-point strip rebuilt each frame — it is two vertices, and
    // a TubeGeometry here would rebuild a hundred triangles a frame for a
    // thread nobody can see the thickness of.
    const lineGeo = new THREE.BufferGeometry()
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3))
    this.line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xf2ece0, transparent: true, opacity: 0.75 }))
    this.line.frustumCulled = false
    this.line.visible = false
    this.group.add(this.line)

    this.target = new THREE.Vector3()
    this.floatPos = new THREE.Vector3()
    this.tipWorld = new THREE.Vector3()
    this.bob = 0
    this.lastCatch = null
  }

  get active() { return this.phase !== STATE.IDLE }
  get holding() { return this.state.held === 'rod' }

  /** Where the float would land: straight ahead, out to open water. Returns null
   *  if there is nothing castable in front of the player. */
  aim(pos, facing) {
    for (let d = 1.6; d <= CAST_RANGE; d += 0.5) {
      const x = pos.x + Math.sin(facing) * d
      const z = pos.z + Math.cos(facing) * d
      const cx = Math.floor(x), cz = Math.floor(z)
      if (cx < 1 || cz < 1 || cx >= N - 1 || cz >= N - 1) break
      if (this.grid.height[cz * N + cx] <= WATER_LEVEL - 1) return new THREE.Vector3(x, this.surface, z)
    }
    return null
  }

  /** Depth of water under the float, in levels. Deeper water holds better fish. */
  depthAt(v) {
    const cx = Math.floor(v.x), cz = Math.floor(v.z)
    return WATER_LEVEL - this.grid.height[cz * N + cx]
  }

  /**
   * The one input. Cast if idle, strike if biting, reel in otherwise — one key
   * for the whole loop, because a fishing minigame with a control scheme is a
   * fishing minigame nobody finishes.
   */
  press(pos, facing, hour) {
    if (!this.holding) return null
    switch (this.phase) {
      case STATE.IDLE: {
        const spot = this.aim(pos, facing)
        if (!spot) return 'nowater'
        this.target.copy(spot)
        this.floatPos.copy(pos).setY(pos.y + 1.2)
        this.phase = STATE.CAST
        this.t = 0
        this.float.visible = true
        this.line.visible = true
        this.hour = hour
        this.audio?.cast?.()
        return 'cast'
      }
      case STATE.BITE:
        this.phase = STATE.REEL
        this.t = 0
        this.audio?.reel?.()
        return 'strike'
      case STATE.WAIT:
      case STATE.NIBBLE:
        this.reset()
        return 'reelin'
      default:
        return null
    }
  }

  reset() {
    this.phase = STATE.IDLE
    this.t = 0
    this.float.visible = false
    this.line.visible = false
  }

  /** Draw one from the table, filtered by depth and weighted by the clock. */
  roll(depth, hour) {
    const night = hour < 6 || hour > 19
    const pool = CATCH.filter((c) => depth >= c.depth)
    let total = 0
    for (const c of pool) total += c.weight * (c.night && night ? 2 : 1)
    let r = this.rand() * total
    for (const c of pool) {
      r -= c.weight * (c.night && night ? 2 : 1)
      if (r <= 0) return c
    }
    return pool[0] ?? CATCH[0]
  }

  update(dt, pos, facing, hour) {
    // The rod only exists while it is in your hand.
    this.rod.root.visible = this.holding
    if (!this.holding && this.phase !== STATE.IDLE) this.reset()
    if (this.phase === STATE.IDLE) {
      this.line.visible = false
      this.float.visible = false
      return
    }

    this.t += dt
    const A = this.player.anim

    switch (this.phase) {
      case STATE.CAST: {
        // A real arc: lerp along the ground and add a parabola on top of it.
        const k = Math.min(1, this.t / CAST_TIME)
        this.floatPos.lerpVectors(
          new THREE.Vector3(pos.x, pos.y + 1.2, pos.z),
          this.target,
          k,
        )
        this.floatPos.y += Math.sin(k * Math.PI) * 1.5
        A.use = Math.max(A.use, 1 - k) // the arm stays through the throw
        if (k >= 1) {
          this.phase = STATE.WAIT
          this.t = 0
          this.floatPos.copy(this.target)
          // How long the fish take depends on how many are actually here.
          const near = this.life.densityAt(this.target.x, this.target.z, 7)
          this.wait = randRange(this.rand, 2.4, 8) / (1 + near * 0.16)
          this.life.splash(this.target.x, this.target.z, 1)
          this.audio?.splash?.()
        }
        break
      }
      case STATE.WAIT:
        this.bob = Math.sin(this.t * 2.2) * 0.03
        if (this.t >= this.wait) {
          this.phase = STATE.NIBBLE
          this.t = 0
          this.audio?.nibble?.()
        }
        break
      case STATE.NIBBLE:
        // Two quick dips. The tell, not the bite.
        this.bob = -Math.abs(Math.sin(this.t * 11)) * 0.1
        this.life.ripple(this.floatPos.x, this.floatPos.z, 0.25)
        if (this.t >= 0.6) {
          this.phase = STATE.BITE
          this.t = 0
          this.audio?.bite?.()
        }
        break
      case STATE.BITE:
        // Under. Not bobbing — gone.
        this.bob = -0.22 - Math.sin(this.t * 7) * 0.05
        if (this.t >= BITE_WINDOW) {
          // Missed it. The line stays out; only the fish is lost.
          this.phase = STATE.WAIT
          this.t = 0
          this.wait = randRange(this.rand, 3, 7)
          this.life.ripple(this.floatPos.x, this.floatPos.z, 0.8)
          this.state.say('It let go.', 'warn')
        }
        break
      case STATE.REEL: {
        const k = Math.min(1, this.t / REEL_TIME)
        this.floatPos.lerp(new THREE.Vector3(pos.x, pos.y + 1.1, pos.z), Math.min(1, dt * 9))
        this.bob = 0
        if (k >= 1) {
          this.phase = STATE.LANDED
          this.t = 0
          const c = this.roll(this.depthAt(this.target), this.hour ?? hour)
          this.lastCatch = c
          this.state.give(c.id, 1)
          this.state.stats.caught++
          this.life.splash(this.target.x, this.target.z, 1.4)
          this.audio?.landed?.()
          this.state.onCatch?.(c)
        }
        break
      }
      default:
        if (this.t >= 0.5) this.reset()
    }

    // --- the tackle, drawn ---------------------------------------------------
    this.float.position.copy(this.floatPos)
    if (this.phase === STATE.WAIT || this.phase === STATE.NIBBLE || this.phase === STATE.BITE) {
      this.float.position.y = this.surface + this.bob
    }
    this.float.rotation.z = damp(this.float.rotation.z, this.bob * 1.6, 8, dt)

    this.rod.tip.getWorldPosition(this.tipWorld)
    const p = this.line.geometry.attributes.position
    p.setXYZ(0, this.tipWorld.x, this.tipWorld.y, this.tipWorld.z)
    p.setXYZ(1, this.float.position.x, this.float.position.y, this.float.position.z)
    p.needsUpdate = true
    this.line.geometry.computeBoundingSphere()

    // The rod bends when something is on it. One rotation on the pole, and it
    // is the whole difference between "a stick" and "a fishing rod".
    const bend = this.phase === STATE.BITE ? 0.5 : this.phase === STATE.REEL ? 0.34 : 0
    this.rod.pole.rotation.x = damp(this.rod.pole.rotation.x, bend, 9, dt)
  }

  /** What the HUD should say right now. */
  hint() {
    switch (this.phase) {
      case STATE.IDLE: return null
      case STATE.CAST: return null
      case STATE.WAIT: return '<b>F</b> — reel in'
      case STATE.NIBBLE: return 'something is down there…'
      case STATE.BITE: return '<b>F</b> — strike!'
      case STATE.REEL: return 'reeling…'
      default: return null
    }
  }
}
