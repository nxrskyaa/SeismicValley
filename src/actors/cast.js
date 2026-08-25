import * as THREE from 'three'
import { buildRocky } from './rocky.js'
import { buildPebble } from './pebble.js'
import { Sixteen } from './dog.js'
import { clamp, damp, rng } from '../core/rng.js'
import { GATE } from '../world/worldgen.js'

/**
 * THE CAST — and it is a short list, on purpose.
 *
 * You were the only person underground when the world was rolled back. The
 * survivors are scattered across the valley and **they do not know about each
 * other**. So there is no village, no market, no quest-giver and nobody to talk
 * to about the weather. An earlier pass put three villagers and a square in
 * here, and it quietly turned the game into something else: a valley with a
 * town in it is a valley that has already been recovered.
 *
 * What moves in the valley:
 *
 *   SIXTEEN   the survey dog. The only living thing besides you.
 *   ROCKY     not a person. A Loom construct — stone the lattice assembled,
 *             still walking because unlike everything the colony built he was
 *             IN the checkpoint. He stands at the relay on the north ridge and
 *             does not leave it.
 *   PEBBLES   smaller constructs, found sealed in geodes, which wake up if you
 *             break one open.
 *
 * Rocky exists in exactly one instance. He is an NPC and a landmark; he is not
 * the player, he has no family here, and he does not run a shop.
 */

/** The one construct. Everything about him is fixed except what he says. */
export const ROCKY = {
  id: 'rocky',
  name: 'Rocky',
  role: 'A Loom construct. Standing at the relay since before you woke up.',
  cut: 'rocky',
  chest: 'shard',
  height: 2.1,
  /** He does not wander. A landmark that moves is not a landmark. */
  at: GATE,
  face: 0,
  lines: [
    'You are the first thing to come up this ridge in forty days that the lattice did not put here.',
    'It takes apart what it has no record of. Register the structure, or do not build it.',
    'I am in the checkpoint. That is the only reason there is enough of me left to ask.',
    'The relay still carries her logs. It will not tell me what is in them, and I have asked.',
  ],
}

// --- Rocky, standing --------------------------------------------------------

class Construct {
  constructor(spec, grid, scene) {
    this.spec = spec
    this.grid = grid
    this.rig = buildRocky({ cut: spec.cut, chest: spec.chest, height: spec.height, outline: true })
    this.pos = new THREE.Vector2(spec.at.x + 0.5, spec.at.z + 0.5)
    this.facing = spec.face ?? 0
    this.near = Infinity
    this.line = 0
    this.rig.root.position.set(this.pos.x, grid.sampleY(this.pos.x, this.pos.y), this.pos.y)
    scene.add(this.rig.root)
  }

  update(dt, playerPos) {
    const here = new THREE.Vector3(this.pos.x, playerPos.y, this.pos.y)
    this.near = playerPos.distanceTo(here)

    // He turns to watch you well before you are close enough to speak to. That
    // long lead is most of what makes him feel like he was already there.
    if (this.near < 9) {
      const want = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.y)
      let d = want - this.facing
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      this.facing += d * Math.min(1, dt * 2.4)
    } else {
      this.facing = damp(this.facing, this.spec.face ?? 0, 1.2, dt)
    }

    this.rig.root.rotation.y = this.facing
    this.rig.anim.speed = 0
    this.rig.anim.pose = this.near < 4 ? 'wave' : 'idle'
    this.rig.anim.lookAt = this.near < 12 ? playerPos : null
    this.rig.update(dt)
  }

  speak() {
    const line = this.spec.lines[this.line % this.spec.lines.length]
    this.line++
    return { name: this.spec.name, role: this.spec.role, line }
  }
}

// --- pebbles ----------------------------------------------------------------

class PebbleAgent {
  constructor(data, grid, scene) {
    this.data = data
    this.grid = grid
    this.rig = buildPebble({ trait: data.trait, size: 0.5 })
    this.pos = new THREE.Vector2(data.x, data.z)
    this.goal = new THREE.Vector2(data.x, data.z)
    this.rand = rng((data.name?.charCodeAt(0) ?? 7) * 7919)
    this.wait = this.rand() * 3
    this.speed = 0
    this.facing = 0
    scene.add(this.rig.root)
  }

  update(dt, playerPos, night) {
    const g = this.grid
    // At night they sit down where they are and sleep, which is both correct and
    // the only chance the player gets to see the pose from the reference sheet.
    this.rig.anim.sleeping = night
    if (!night) {
      const toPlayer = new THREE.Vector2(playerPos.x - this.pos.x, playerPos.z - this.pos.y)
      const dist = toPlayer.length()
      if (dist > 3.5 && dist < 26) {
        this.goal.set(playerPos.x, playerPos.z).addScaledVector(toPlayer.normalize(), -2.4)
      } else {
        this.wait -= dt
        if (this.wait <= 0) {
          const a = this.rand() * Math.PI * 2
          this.goal.set(
            clamp(this.pos.x + Math.cos(a) * 3, 1, g.n - 2),
            clamp(this.pos.y + Math.sin(a) * 3, 1, g.n - 2),
          )
          this.wait = 1.5 + this.rand() * 4
        }
      }
      const d = this.goal.clone().sub(this.pos)
      const len = d.length()
      if (len > 0.15) {
        d.divideScalar(len)
        const cx = Math.floor(this.pos.x + d.x * 0.4)
        const cz = Math.floor(this.pos.y + d.y * 0.4)
        if (!g.isWater(cx, cz)) {
          this.pos.addScaledVector(d, Math.min(len, 3.1 * dt))
          this.facing = Math.atan2(d.x, d.y)
        }
        this.speed = damp(this.speed, 1, 8, dt)
      } else {
        this.speed = damp(this.speed, 0, 8, dt)
      }
    } else {
      this.speed = 0
    }

    this.data.x = this.pos.x
    this.data.z = this.pos.y
    this.rig.anim.speed = this.speed
    this.rig.root.position.set(this.pos.x, g.sampleY(this.pos.x, this.pos.y), this.pos.y)
    this.rig.root.rotation.y = this.facing
    this.rig.update(dt)
  }
}

// --- the whole cast ---------------------------------------------------------

export class Cast {
  constructor(scene, grid, state, playerAt) {
    this.scene = scene
    this.grid = grid
    this.state = state
    this.rocky = new Construct(ROCKY, grid, scene)
    this.sixteen = new Sixteen(grid, scene, [playerAt[0] + 1.4, playerAt[1] + 1.2])
    this.pebbles = []
    this.t = 0
    this.syncPebbles()
    state.on('pebble', () => this.syncPebbles())
  }

  syncPebbles() {
    for (const data of this.state.pebbles) {
      if (!this.pebbles.some((p) => p.data === data)) {
        this.pebbles.push(new PebbleAgent(data, this.grid, this.scene))
      }
    }
  }

  update(dt, playerPos, hour) {
    this.t += dt
    const night = hour < 5.6 || hour > 21
    this.rocky.update(dt, playerPos)
    this.sixteen.update(dt, playerPos, (x, z) => this.state.dogFound(x, z))
    for (const p of this.pebbles) p.update(dt, playerPos, night)
  }

  /** Whoever is within reach, or null. Rocky is the only thing you can talk to. */
  nearest(playerPos, range = 3) {
    return this.rocky.near < range ? this.rocky : null
  }

  /** What Rocky says about the next pruning — the one piece of information the
   *  relay exists to give you. */
  forecast(daysUntil) {
    if (daysUntil <= 0) return 'Tonight. Whatever is not registered comes apart before morning.'
    if (daysUntil === 1) return 'Tomorrow night. Drive a stake, or move what you care about.'
    if (daysUntil <= 3) return `${daysUntil} nights. It works to a schedule, not to a mood.`
    return 'Not for a while. That is when people build the things they lose.'
  }
}

export { Construct, PebbleAgent }
