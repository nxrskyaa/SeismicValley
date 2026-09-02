import * as THREE from 'three'
import { buildRocky } from './rocky.js'
import { buildPebble } from './pebble.js'
import { Sixteen } from './dog.js'
import { clamp, damp, pick, rng } from '../core/rng.js'
import { findSpot, JOBS } from './jobs.js'
import { GATE, HOME } from '../world/worldgen.js'
import { N, P } from '../world/grid.js'
import { G } from '../core/palette.js'

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
 *   CONSTRUCTS  not people. Loom constructs — stone the lattice assembled,
 *             still walking because unlike everything the colony built they
 *             were IN the checkpoint. Five of them, each standing at a
 *             landmark and none of them leaving it.
 *   PEBBLES   smaller constructs, found sealed in geodes, which wake up if you
 *             break one open.
 *
 * None of them is the player, none of them runs a shop, and none of them is a
 * quest-giver. They are landmarks that talk.
 */

/**
 * THE CONSTRUCTS.
 *
 * There was exactly one of these, and one construct is not a population — the
 * valley read as empty with a single statue in it. The sheet has a whole family:
 * a big one, several small ones, different stone in each drawing.
 *
 * They do not break the premise. Rule 4 is that no other PEOPLE are left; these
 * are Loom constructs, stone the lattice assembled, and the reason they are
 * still walking is the same reason you are — they were inside the checkpoint
 * when it rolled back. A valley with five of them in it is still a valley with
 * nobody in it, which is the point, and it is a good deal less lonely to look at.
 *
 * Each stands at a landmark and does not wander. A landmark that moves is not a
 * landmark. What differs between them is the stone, the height, what they carry
 * on the chest, and what they have to say.
 *
 * `at` is a seed cell; the real position is the nearest standable ground to it,
 * so a construct can never end up in the river.
 */
export const CONSTRUCTS = [
  {
    id: 'rocky',
    // He is a checkpoint that survived. Mostly he watches the ridge.
    idle: ['guard', 'idle', 'work', 'guard'],
    sway: 0.7,
    name: 'Rocky',
    role: 'A Loom construct. Standing at the relay since before you woke up.',
    cut: 'rocky',
    /**
     * The MARK, not the crystal. Both are canon — the sheet has drawings of
     * each — but the adult carries the incised double-crescent in most of them
     * and the little ones carry the rose crystal.
     */
    chest: 'mark',
    height: 2.1,
    at: () => GATE,
    face: 0,
    lines: [
      'You are the first thing to come up this ridge in forty days that the lattice did not put here.',
      'It takes apart what it has no record of. Register the structure, or do not build it.',
      'I am in the checkpoint. That is the only reason there is enough of me left to ask.',
      'The relay still carries her logs. It will not tell me what is in them, and I have asked.',
    ],
  },
  {
    id: 'cairn',
    // Older and smaller, and never finished tidying the home terrace.
    idle: ['work', 'work', 'idle', 'guard'],
    sway: 1.15,
    name: 'Cairn',
    role: 'Smaller, and older than Rocky. Has not moved off the home terrace in forty days.',
    cut: 'cairn',
    chest: 'shard',
    height: 1.55,
    at: () => ({ x: HOME.x - 7, z: HOME.z - 9 }),
    face: Math.PI * 0.75,
    lines: [
      'You were down there a long time. I counted.',
      'Rocky says the lattice keeps a record. It kept me. It did not keep the orchard.',
      'The soil here is wrong and it has always been wrong. Plant anyway.',
    ],
  },
  {
    id: 'warden',
    // Barely shifts. Whatever it was set to guard, it is still guarding.
    idle: ['guard', 'guard', 'idle', 'guard'],
    sway: 0.4,
    name: 'Warden',
    role: 'The tallest of them, on the high ground, facing the weather.',
    cut: 'basalt',
    chest: 'mark',
    height: 2.6,
    at: (grid) => highestNear(grid, N * 0.3, N * 0.28),
    face: Math.PI * 1.15,
    lines: [
      'From here you can see every one of the passes, and nothing has come through any of them.',
      'I am not waiting for anybody. I am the thing that would see them.',
      'The weather still works. That is not nothing.',
    ],
  },
  {
    id: 'tide',
    // Faces the water and does very little else.
    idle: ['idle', 'idle', 'work', 'idle'],
    sway: 0.95,
    name: 'Tide',
    role: 'Stands in the shallows at the south lake and will not say why.',
    cut: 'sand',
    chest: 'shard',
    height: 1.8,
    at: (grid) => shoreNear(grid, Math.round(N * 0.72), Math.round(N * 0.78)),
    face: Math.PI * 0.25,
    lines: [
      'There is something under this lake that the rollback did not reach.',
      'No, I have not been in. I said I stand here.',
      'The water is the only part of the valley that was already like this.',
    ],
  },
  {
    id: 'ember',
    // Always in the middle of moving something that is already moved.
    idle: ['work', 'lift', 'work', 'idle'],
    sway: 1.3,
    name: 'Ember',
    role: 'Walks the fault, or would, if it ever finished counting.',
    cut: 'ember',
    chest: 'shard',
    height: 1.95,
    at: (grid) => scarNear(grid, Math.round(N * 0.55), Math.round(N * 0.55)),
    face: Math.PI * 1.6,
    lines: [
      'Nine hundred and six geodes along this line. I have opened none of them.',
      'They are eggs. You have worked that out by now.',
      'When one hatches near you, it is because it chose to.',
    ],
  },
]

/** Kept for anything that still wants the one by name. */
export const ROCKY = CONSTRUCTS[0]

/** The highest standable cell near a seed point — where a lookout would stand. */
function highestNear(grid, sx, sz) {
  let best = null
  let bestH = -1
  for (let z = Math.max(2, sz - 16); z < Math.min(N - 2, sz + 16); z++) {
    for (let x = Math.max(2, sx - 16); x < Math.min(N - 2, sx + 16); x++) {
      const h = grid.h(x, z)
      if (h > bestH && !grid.isWater(x, z) && grid.prop[z * N + x] === P.NONE) { bestH = h; best = { x, z } }
    }
  }
  return best ?? { x: Math.round(sx), z: Math.round(sz) }
}

/** Dry ground with water within two cells of it. */
function shoreNear(grid, sx, sz) {
  for (let r = 1; r < 26; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
        const x = sx + dx
        const z = sz + dz
        if (x < 2 || z < 2 || x >= N - 2 || z >= N - 2) continue
        if (grid.isWater(x, z) || grid.prop[z * N + x] !== P.NONE) continue
        if (grid.nearWater(x, z, 2)) return { x, z }
      }
    }
  }
  return { x: sx, z: sz }
}

/** The scarred band along the fault. */
function scarNear(grid, sx, sz) {
  for (let r = 1; r < 40; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
        const x = sx + dx
        const z = sz + dz
        if (x < 2 || z < 2 || x >= N - 2 || z >= N - 2) continue
        if (grid.isWater(x, z) || grid.prop[z * N + x] !== P.NONE) continue
        if (grid.ground[z * N + x] === G.SCAR) return { x, z }
      }
    }
  }
  return { x: sx, z: sz }
}

// --- Rocky, standing --------------------------------------------------------

/** A stable 0..1 from a name. Deterministic, so a construct animates the same
 *  way on every run and in every capture — `Math.random()` here would make the
 *  screenshot harness produce a different pose every time it ran. */
function hashId(id) {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 10000) / 10000
}

class Construct {
  constructor(spec, grid, scene) {
    this.spec = spec
    this.grid = grid
    /**
     * A clock of its own, derived from the name so it is the same every run.
     *
     * Every construct used to start at t=0 and run at one rate, so the whole
     * cast breathed in unison and changed pose on the same frame — five stone
     * figures doing one animation. `tools/idle.mjs` fails if any two of them
     * ever move alike again.
     */
    const h = hashId(spec.id)
    this.rig = buildRocky({
      cut: spec.cut, chest: spec.chest, height: spec.height, outline: true,
      phase: h * 37.4,
      // Bigger constructs move slower. Rocky at 2.1 units runs near 0.85, the
      // small ones nearer 1.15, which is most of what makes them read as
      // different bodies rather than one body at different scales.
      tempo: 1.25 - spec.height * 0.19 + (h - 0.5) * 0.12,
      // How much this one moves at rest. A warden barely shifts; a small
      // construct fidgets.
      sway: spec.sway ?? (0.6 + h * 0.9),
    })
    this.dwell = 15 + h * 11
    this.beat = spec.idle ?? ['work', 'idle', 'guard', 'idle']
    const seed = typeof spec.at === 'function' ? spec.at(grid) : spec.at
    const [cx, cz] = grid.nearestStandable(seed.x, seed.z, 18)
    this.pos = new THREE.Vector2(cx + 0.5, cz + 0.5)
    this.facing = spec.face ?? 0
    this.near = Infinity
    this.line = 0
    // Offset too, so the pose cycles do not line up either.
    this.t = hashId(spec.id) * 61
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
    else this.rig.anim.pose = this.beat[Math.floor(this.t / this.dwell) % this.beat.length]
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
    this.constructs = CONSTRUCTS.map((spec) => new Construct(spec, grid, scene))
    // The one at the relay, for anything that wants him by name.
    this.rocky = this.constructs[0]
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
    for (const c of this.constructs) c.update(dt, playerPos)
    this.sixteen.update(dt, playerPos, (x, z) => this.state.dogFound(x, z))
    for (const p of this.pebbles) p.update(dt, playerPos, night, this.state.day)
  }

  /** The nearest construct within reach, or null. Five of them now, so this
   *  picks the closest rather than assuming there is only one. */
  nearest(playerPos, range = 3) {
    let best = null
    for (const c of this.constructs) {
      if (c.near < range && (!best || c.near < best.near)) best = c
    }
    return best
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
