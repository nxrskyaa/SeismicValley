import * as THREE from 'three'
import { buildRocky } from './rocky.js'
import { buildPebble } from './pebble.js'
import { Sixteen } from './dog.js'
import { clamp, damp, pick, rng } from '../core/rng.js'
import { findSpot, JOBS } from './jobs.js'
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
    this.t = 0
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
    this.rig.anim.lookAt = this.near < 12 ? playerPos : null

    /**
     * What he does when nobody is watching.
     *
     * He has been at this relay for forty days and he is not a statue, so left
     * alone he cycles between working on it, standing guard over it, and doing
     * nothing at all. The cycle is slow — nineteen seconds a beat — because a
     * landmark that changes pose every three seconds stops being a landmark and
     * starts being a loop.
     *
     * Anything close overrides it: a wave when you are within talking distance,
     * a guard stance when you are on the ridge but not yet at him.
     */
    this.t += dt
    if (this.near < 4) this.rig.anim.pose = 'wave'
    else if (this.near < 11) this.rig.anim.pose = 'guard'
    else this.rig.anim.pose = ['work', 'idle', 'guard', 'idle'][Math.floor(this.t / 19) % 4]
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
    this.rand = rng((data.name?.charCodeAt(0) ?? 7) * 7919 + (data.x | 0) * 31 + (data.z | 0))
    this.speed = 0
    this.facing = 0
    this.t = this.rand() * 40
    this.job = null
    this.phase = 'idle'
    this.settle = 0
    this.day = -1
    /** Held still for a capture. Nothing else sets it. */
    this.pinned = false
    scene.add(this.rig.root)
  }

  /**
   * A new job, at dawn.
   *
   * The spot is searched for from a point a good way OUT from wherever the
   * pebble slept, not from the pebble itself — otherwise every job it ever takes
   * is within a few cells of the last one and it spends its life in one corner
   * of a field. Fifteen to thirty cells is roughly "somewhere else in the
   * valley" at this map size.
   */
  pickJob() {
    const a = this.rand() * Math.PI * 2
    const r = 15 + this.rand() * 15
    const sx = clamp(Math.round(this.pos.x + Math.cos(a) * r), 3, this.grid.n - 4)
    const sz = clamp(Math.round(this.pos.y + Math.sin(a) * r), 3, this.grid.n - 4)

    // Three tries at a job with a real destination, then fall back to following
    // — which is the one job that can never fail to find somewhere to be.
    for (let i = 0; i < 3; i++) {
      const job = pick(this.rand, JOBS)
      if (job.follows) continue
      const spot = findSpot(this.grid, job, sx, sz, 26, this.day, this.rand)
      if (spot) {
        this.job = job
        this.goal.set(spot[0] + 0.5, spot[1] + 0.5)
        this.phase = 'travel'
        return
      }
    }
    this.job = JOBS.find((j) => j.follows)
    this.phase = 'travel'
  }

  update(dt, playerPos, night, day) {
    const g = this.grid
    this.t += dt

    // The rig accumulates whatever the last pose left on it, and a pose is not
    // guaranteed to touch every channel. Reset the ones only a pose ever writes.
    const rig = this.rig
    rig.body.rotation.x = 0
    rig.body.rotation.y = 0
    rig.head.rotation.z = 0

    if (night) {
      // They sit down where they are and sleep, which is both correct and the
      // only chance the player gets to see the pose from the reference sheet.
      rig.anim.sleeping = true
      this.speed = 0
      this.job = null
      this.phase = 'idle'
      this.commit()
      return
    }
    rig.anim.sleeping = false

    if (this.pinned) {
      this.speed = 0
      rig.anim.speed = 0
      rig.update(dt)
      this.commit()
      return
    }

    if (day !== this.day) {
      this.day = day
      this.pickJob()
    }
    if (!this.job) this.pickJob()

    // Following has a destination that walks away, so it is re-aimed every
    // frame; everything else has a fixed spot and is aimed once.
    if (this.job.follows) {
      const to = new THREE.Vector2(playerPos.x - this.pos.x, playerPos.z - this.pos.y)
      const dist = to.length()
      if (dist > 3) this.goal.set(playerPos.x, playerPos.z).addScaledVector(to.normalize(), -2.2)
      else this.goal.copy(this.pos)
    }

    const d = this.goal.clone().sub(this.pos)
    const len = d.length()
    if (len > 0.35) {
      d.divideScalar(len)
      /**
       * They obey the terrain, and until the soak ran they did not.
       *
       * This tested for water and NOTHING else — no height rule at all — so a
       * pebble whose job was up on a ridge simply walked up the face of it. The
       * soak caught one climbing sixteen levels in a single step, which is a
       * sheer cliff, in front of the player, in the middle of the day.
       *
       * Same rule as the dog now: water blocks, and so does anything more than
       * two levels up. When the direct line is blocked they slide sideways along
       * it rather than stopping — a pebble vibrating against a wall for a whole
       * afternoon is worse than one that takes the long way round.
       */
      const here = g.h(Math.floor(this.pos.x), Math.floor(this.pos.y))
      const step = Math.min(len, 3.1 * dt)
      const ahead = (vx, vz) => g.canStand(
        Math.floor(this.pos.x + vx * 0.5), Math.floor(this.pos.y + vz * 0.5), here, 2,
      )
      if (ahead(d.x, d.y)) {
        this.pos.addScaledVector(d, step)
      } else if (ahead(-d.y, d.x)) {
        this.pos.x += -d.y * step
        this.pos.y += d.x * step
      } else if (ahead(d.y, -d.x)) {
        this.pos.x += d.y * step
        this.pos.y += -d.x * step
      } else {
        // Boxed in. Give up on this job and take another one tomorrow rather
        // than standing here pushing at a wall.
        this.goal.copy(this.pos)
      }
      this.facing = Math.atan2(d.x, d.y)
      this.speed = damp(this.speed, 1, 8, dt)
      this.phase = 'travel'
      this.settle = 0
    } else {
      this.speed = damp(this.speed, 0, 8, dt)
      // A beat of standing still before the job starts. Snapping from a walk
      // straight into a pose reads as a teleport into a different animation.
      this.settle += dt
      if (this.settle > 0.6) this.phase = 'work'
    }

    rig.anim.speed = this.speed
    rig.update(dt)
    // The pose runs AFTER the rig's own animation, because it is overriding it.
    if (this.phase === 'work' && this.job.pose) this.job.pose(rig, this.t)
    this.commit()
  }

  commit() {
    const g = this.grid
    this.data.x = this.pos.x
    this.data.z = this.pos.y
    this.data.job = this.job?.id ?? null
    this.rig.root.position.set(this.pos.x, g.sampleY(this.pos.x, this.pos.y), this.pos.y)
    this.rig.root.rotation.y = this.facing
  }

  /** What it is doing, for the HUD and the journal. */
  get doing() { return this.job?.label ?? 'asleep' }
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
    for (const p of this.pebbles) p.update(dt, playerPos, night, this.state.day)
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
