import * as THREE from 'three'
import { chamferBox, stoneMat } from '../core/kit.js'
import { C } from '../core/palette.js'
import { damp, rng } from '../core/rng.js'

/**
 * SIXTEEN.
 *
 * Her collar tag is worn down to two characters. She is a survey dog — one of
 * the line bred to walk ahead of the sowers and smell whether the crust had
 * taken — which is why she still digs things up and drops them at your feet
 * without being asked.
 *
 * There were forty of her.
 *
 * She is the only other living thing in the valley, and that is the whole
 * reason she matters: a world with nobody in it needs exactly one presence, and
 * one is a different number from four.
 *
 * ## The two thresholds
 *
 * Following uses a start distance and a stop distance, not one distance. With a
 * single threshold she flips between "close in" and "wander" on alternate
 * frames whenever she happens to be sitting right on it, and the direction flip
 * reads as a shiver. That bug shipped once and was reported as "anjing gemetar".
 */

const FOLLOW_STOP = 2.2 // close enough; stop closing
const FOLLOW_START = 3.4 // drifted out; start closing again
const FOLLOW_MAX = 5.0 // too far; run
const SPEED = 4.4
/** Past this she is considered out of reach; past `LOST_PATIENCE` seconds of
 *  that, she catches up off-screen rather than standing at a river forever. */
const LOST_RANGE = 16
const LOST_PATIENCE = 9

const DIG_INTERVAL = 42

export function buildSixteen() {
  const MAT = {
    coat: stoneMat(C.dogCoat),
    dark: stoneMat(C.dogDark),
    collar: stoneMat(C.dogCollar),
    tag: stoneMat('#c8a24e'),
  }

  const root = new THREE.Group()
  root.name = 'sixteen'
  const parts = { root }

  const box = (parent, [w, h, d], mat, at) => {
    const m = new THREE.Mesh(chamferBox(w, h, d, Math.min(w, h, d) * 0.22), mat)
    m.position.set(at[0], at[1] - h * 0.5, at[2])
    m.castShadow = true
    m.receiveShadow = true
    parent.add(m)
    return m
  }

  const body = new THREE.Group()
  root.add(body)
  parts.body = body

  box(body, [0.3, 0.26, 0.56], MAT.coat, [0, 0.36, 0])
  box(body, [0.32, 0.1, 0.4], MAT.dark, [0, 0.3, -0.04])
  // Head, muzzle, ears.
  const head = new THREE.Group()
  head.position.set(0, 0.34, 0.24)
  body.add(head)
  parts.head = head
  box(head, [0.26, 0.24, 0.24], MAT.coat, [0, 0.12, 0.1])
  box(head, [0.14, 0.12, 0.14], MAT.dark, [0, 0.06, 0.22])
  box(head, [0.07, 0.1, 0.05], MAT.dark, [-0.09, 0.26, 0.06])
  box(head, [0.07, 0.1, 0.05], MAT.dark, [0.09, 0.26, 0.06])
  // The collar, and the tag worn down to two characters.
  box(body, [0.28, 0.06, 0.2], MAT.collar, [0, 0.42, 0.22])
  box(body, [0.05, 0.06, 0.02], MAT.tag, [0, 0.37, 0.32])

  parts.legs = []
  for (let i = 0; i < 4; i++) {
    const pivot = new THREE.Group()
    pivot.position.set(i % 2 === 0 ? -0.1 : 0.1, 0.26, i < 2 ? 0.18 : -0.18)
    body.add(pivot)
    box(pivot, [0.09, 0.26, 0.09], MAT.dark, [0, 0, 0])
    parts.legs.push(pivot)
  }

  const tail = new THREE.Group()
  tail.position.set(0, 0.44, -0.28)
  body.add(tail)
  parts.tail = tail
  box(tail, [0.07, 0.24, 0.07], MAT.coat, [0, 0.22, -0.02])

  return parts
}

/**
 * Where she goes.
 *
 * She keeps a loose distance, sits when you stop, and will not go near the
 * south jetty. She will not tell you why for a long time.
 */
export class Sixteen {
  constructor(grid, scene, at) {
    this.grid = grid
    this.rig = buildSixteen()
    this.pos = new THREE.Vector2(at[0], at[1])
    this.facing = 0
    this.speed = 0
    this.rand = rng(0x16)
    this.closing = false
    this.sit = 0
    this.wander = new THREE.Vector2()
    this.wanderTimer = 0
    this.digTimer = DIG_INTERVAL
    this.phase = 0
    /** How long she has been unable to close the gap. See `update`. */
    this.lostFor = 0
    scene.add(this.rig.root)
  }

  /** The one place in the valley she refuses. */
  static JETTY = new THREE.Vector2(24, 92)
  static JETTY_KEEPOUT = 9

  update(dt, playerPos, onDig) {
    const g = this.grid
    const to = new THREE.Vector2(playerPos.x - this.pos.x, playerPos.z - this.pos.y)
    const dist = to.length()

    /**
     * THE LEASH.
     *
     * She cannot swim and she cannot climb more than two levels, and the player
     * can now do both. That combination strands her: swim the river once and she
     * is on the far bank pressing into the water for the rest of the save. The
     * soak found her sixty-seven cells behind and still walking at a wall.
     *
     * There is no pathfinder here and there should not be — she is one Vector2
     * and a wish direction, and a navmesh for a dog is the wrong three hundred
     * lines. So: if she has been out of reach for twelve seconds, she catches up
     * off-screen. Twelve seconds is long enough that it never fires while she is
     * merely taking the long way round a shelf, and short enough that a player
     * who crossed water does not have time to notice she is gone.
     */
    this.lostFor = dist > LOST_RANGE ? this.lostFor + dt : 0
    if (this.lostFor > LOST_PATIENCE) {
      const [tx, tz] = g.nearestStandable(Math.round(playerPos.x), Math.round(playerPos.z), 14)
      // `nearestStandable` falls back to the cell it was handed, and the cell it
      // was handed is the player's — which, now that the player swims, is
      // regularly the middle of a river. Landing her there would replace a dog
      // stuck on a bank with a dog stuck in a lake. If there is nowhere dry
      // nearby she waits; the player will be back on land in a moment.
      if (!g.isWater(tx, tz)) {
        this.pos.set(tx + 0.5, tz + 0.5)
        this.lostFor = 0
        this.closing = false
        this.sit = 0
        return this.update(dt, playerPos, onDig)
      }
      this.lostFor = LOST_PATIENCE * 0.8
    }

    // Hysteresis. See the header.
    if (dist > FOLLOW_MAX) this.closing = true
    else if (dist < FOLLOW_STOP) this.closing = false
    else if (dist > FOLLOW_START) this.closing = true

    const wish = new THREE.Vector2()
    if (this.closing) {
      wish.copy(to).normalize().multiplyScalar(dist > FOLLOW_MAX ? 1 : 0.55)
      this.sit = 0
    } else {
      this.wanderTimer -= dt
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 1.2 + this.rand() * 2.2
        if (this.rand() < 0.34) {
          this.wander.set(0, 0)
          this.sit = 1.5 + this.rand() * 2.5
        } else {
          const a = this.rand() * Math.PI * 2
          this.wander.set(Math.cos(a) * 0.42, Math.sin(a) * 0.42)
        }
      }
      this.sit = Math.max(0, this.sit - dt)
      if (this.sit <= 0) wish.copy(this.wander)
    }

    // The jetty. Pushed away rather than blocked, so she curves off it instead
    // of walking into an invisible wall and vibrating against it.
    const fromJetty = new THREE.Vector2(this.pos.x - Sixteen.JETTY.x, this.pos.y - Sixteen.JETTY.y)
    const jd = fromJetty.length()
    if (jd < Sixteen.JETTY_KEEPOUT) {
      wish.addScaledVector(fromJetty.normalize(), (1 - jd / Sixteen.JETTY_KEEPOUT) * 1.6)
    }

    const mag = wish.length()
    if (mag > 0.02) {
      wish.divideScalar(mag)
      const step = SPEED * Math.min(1, mag) * dt
      const nx = this.pos.x + wish.x * step
      const nz = this.pos.y + wish.y * step
      const cx = Math.floor(nx), cz = Math.floor(nz)
      if (!g.isWater(cx, cz) && Math.abs(g.h(cx, cz) - g.h(Math.floor(this.pos.x), Math.floor(this.pos.y))) <= 2) {
        this.pos.set(nx, nz)
      }
      this.facing = Math.atan2(wish.x, wish.y)
    }
    this.speed = damp(this.speed, mag > 0.02 ? Math.min(1, mag) : 0, 8, dt)

    // She finds things. Roughly every forty seconds, and only while she is
    // actually moving around rather than sitting on your foot.
    this.digTimer -= dt * (this.speed > 0.1 ? 1 : 0.2)
    if (this.digTimer <= 0) {
      this.digTimer = DIG_INTERVAL * (0.7 + this.rand() * 0.6)
      onDig?.(Math.floor(this.pos.x), Math.floor(this.pos.y))
    }

    // --- animation ---------------------------------------------------------
    this.phase += dt * (5 + this.speed * 7)
    const s = this.speed
    const sitting = this.sit > 0 && s < 0.05
    for (let i = 0; i < 4; i++) {
      const lead = i < 2 ? 1 : -1
      const side = i % 2 === 0 ? 1 : -1
      this.rig.legs[i].rotation.x = Math.sin(this.phase + (lead * side > 0 ? 0 : Math.PI)) * 0.7 * s
    }
    // Sitting drops the back end and lifts the head. Two rotations; it is the
    // cheapest possible pose and it reads instantly from any angle.
    this.rig.body.rotation.x = damp(this.rig.body.rotation.x, sitting ? 0.34 : 0, 6, dt)
    this.rig.body.position.y = damp(this.rig.body.position.y, sitting ? -0.12 : Math.abs(Math.sin(this.phase)) * 0.03 * s, 6, dt)
    this.rig.head.rotation.x = damp(this.rig.head.rotation.x, sitting ? -0.3 : -0.05, 6, dt)
    // The tail runs faster than the legs and never stops. It is most of what
    // makes her read as pleased to be there.
    this.rig.tail.rotation.z = Math.sin(this.phase * 2.4) * (0.4 + s * 0.4)
    this.rig.tail.rotation.x = -0.5

    this.rig.root.position.set(this.pos.x, g.sampleY(this.pos.x, this.pos.y), this.pos.y)
    this.rig.root.rotation.y = damp(this.rig.root.rotation.y, this.facing, 10, dt)
  }
}
