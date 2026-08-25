import * as THREE from 'three'
import { buildRocky } from './rocky.js'
import { buildPebble } from './pebble.js'
import { buildPlayer } from './player.js'
import { bake, bakedMat, chamferBox, COLUMN, FLAT, TAPER } from '../core/kit.js'
import { C } from '../core/palette.js'
import { clamp, damp, rng } from '../core/rng.js'
import { GATE, HOME, VILLAGE, YARD } from '../world/worldgen.js'
import { LEVEL } from '../world/grid.js'

/**
 * THE CAST.
 *
 * Six standing characters and however many pebbles the player has hatched, all
 * driven from one update. Two decisions worth stating:
 *
 * **Rocky is not one character, he is five.** The reference sheet shows the same
 * golem holding a flag, holding flowers, cheering on a headland, working a heavy
 * bag and pressing two dumbbells. Rather than pick one and throw the rest away,
 * each drawing became a member of his family with a job in the valley — same
 * rig, different cut, different chest mark, different idle. That is why the
 * mascot reads as a PEOPLE rather than as a logo with legs.
 *
 * **Nobody pathfinds.** Every character has a post and a leash length, and
 * wanders inside it on a slow random walk clamped to the height grid. A farming
 * game does not need A*: it needs villagers who are reliably findable, and a
 * villager who can path anywhere is a villager who is never where you left them.
 */

/** Who stands where, and what they are. */
export const ROSTER = [
  {
    id: 'rocky', name: 'Rocky', kind: 'golem', cut: 'rocky', chest: 'mark',
    at: GATE, leash: 0, height: 2.5, pose: 'idle', face: 0,
    role: 'Keeper of the Ridge Gate',
    lines: [
      'The fault is a clock. You cannot argue with a clock, you can only be somewhere else when it strikes.',
      'Stack the stone. It does not have to be pretty. It has to be a stack.',
      'I was here before the valley was a valley. It was a hill with an opinion.',
    ],
  },
  {
    id: 'cairn', name: 'Cairn', kind: 'golem', cut: 'cairn', chest: 'shard',
    at: { x: HOME.x + 6, z: HOME.z - 6 }, leash: 3, height: 2.1, pose: 'work', face: 2.6,
    role: "Rocky's sister. She raises the stones.",
    lines: [
      'A cairn is not a wall. It does not stop the ground. It tells the ground it is being watched.',
      'Six paces at first. Twelve if you feed it shards. You will want twelve.',
      'Put one where the soil is best, not where the house is. The house can be rebuilt.',
    ],
  },
  {
    id: 'flint', name: 'Flint', kind: 'golem', cut: 'ember', chest: 'mark',
    at: YARD, leash: 2, height: 2.0, pose: 'guard', prop: 'bag', face: 1.57,
    role: 'Works the bag at the yard, all day, every day.',
    lines: [
      'Two hundred and eleven. Two hundred and twelve.',
      'You want stronger arms, come back at dawn. You want stronger STONE, talk to Cairn.',
      'The bag never moves first. Neither should you.',
    ],
  },
  {
    id: 'bloom', name: 'Bloom', kind: 'golem', cut: 'sand', chest: 'mark',
    at: { x: VILLAGE.x + 4, z: VILLAGE.z + 4 }, leash: 5, height: 1.85, pose: 'idle', prop: 'bouquet', face: 0.4,
    role: 'Carries flowers to people who did not ask for them.',
    lines: [
      'These are for you. No, I am not going to explain. Take them.',
      'Duskflax opens for one hour a day. I have been standing here for four.',
      'A valley that only grows food is a valley that has given up on something.',
    ],
  },
  { id: 'marn', name: 'Marn', kind: 'human', look: 'marn', at: { x: VILLAGE.x - 3, z: VILLAGE.z }, leash: 4,
    role: 'Keeps the crate. Keeps the ledger.',
    lines: ['Leave it in the crate. It goes out overnight and the coin is in your pocket by breakfast.', 'Prices are what they are. I do not set them, the ridge does.'] },
  { id: 'odile', name: 'Odile', kind: 'human', look: 'odile', at: { x: VILLAGE.x + 2, z: VILLAGE.z - 3 }, leash: 4,
    role: 'Sells seed. Buys anything.',
    lines: ['Seed for the season only. Sowing out of season is how people learn what a season is.', 'I will take glass melon at any price you name. Within reason. Name a reasonable one.'] },
  { id: 'tace', name: 'Tace', kind: 'human', look: 'tace', at: { x: VILLAGE.x, z: VILLAGE.z + 4 }, leash: 6,
    role: 'Reads the fault. Badly, but earlier than anyone else.',
    lines: ['Three days. Maybe four. It has been three days for two weeks.', 'Find a Surveyor pebble and you will not need me. I am at peace with that.'] },
]

// --- props characters hold --------------------------------------------------

function bouquet() {
  const parts = [{ geometry: COLUMN, position: [0, 0.16, 0], scale: [0.05, 0.32, 0.05], color: C.shrubDeep }]
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    const r = 0.09 + (i % 3) * 0.04
    parts.push({ geometry: TAPER, position: [Math.cos(a) * r * 0.5, 0.3, Math.sin(a) * r * 0.5], scale: [0.035, 0.3, 0.035], rotation: [Math.sin(a) * 0.4, a, Math.cos(a) * 0.4], color: C.shrub })
    parts.push({ geometry: FLAT, position: [Math.cos(a) * r, 0.44, Math.sin(a) * r], scale: [0.13, 0.05, 0.13], color: [C.rose, C.creamDeep, C.stoneLit, C.roseGlow][i % 4] })
  }
  return new THREE.Mesh(bake(parts), bakedMat())
}

function heavyBag() {
  const parts = [
    { geometry: chamferBox(0.16, 0.1, 0.16, 0.03), position: [0, 2.5, 0], color: C.stoneDark },
    { geometry: COLUMN, position: [0, 1.75, 0], scale: [0.52, 1.4, 0.52], color: C.creamShade },
    { geometry: FLAT, position: [0, 1.16, 0], scale: [0.5, 0.1, 0.5], color: C.stoneDeep },
    { geometry: FLAT, position: [0, 2.4, 0], scale: [0.44, 0.1, 0.44], color: C.stoneDeep },
  ]
  // The frame it hangs from.
  for (const side of [-1, 1]) {
    parts.push({ geometry: COLUMN, position: [side * 1.1, 1.3, 0], scale: [0.16, 2.6, 0.16], color: C.trunk })
  }
  parts.push({ geometry: chamferBox(2.5, 0.16, 0.2, 0.04), position: [0, 2.6, 0], color: C.trunk })
  return new THREE.Mesh(bake(parts), bakedMat())
}

// --- one character ----------------------------------------------------------

class Character {
  constructor(spec, grid, scene) {
    this.spec = spec
    this.grid = grid
    this.rand = rng((spec.id.charCodeAt(0) * 7919) ^ 0x1234)
    this.rig = spec.kind === 'golem'
      ? buildRocky({ cut: spec.cut, chest: spec.chest, height: spec.height, outline: true })
      : buildPlayer(spec.look)
    this.home = new THREE.Vector2(spec.at.x + 0.5, spec.at.z + 0.5)
    this.pos = new THREE.Vector2(this.home.x, this.home.y)
    this.goal = new THREE.Vector2(this.home.x, this.home.y)
    // Which way they stand when nobody is watching. Rocky faces down the valley
    // out of the gate, because a keeper with his back to the road is a statue.
    this.facing = spec.face ?? 0
    this.wait = this.rand() * 4
    this.speed = 0
    this.line = 0
    scene.add(this.rig.root)

    if (spec.prop === 'bouquet') {
      const b = bouquet()
      b.scale.setScalar(1.5)
      b.castShadow = true
      this.rig.holdR?.add(b)
    } else if (spec.prop === 'bag') {
      this.bag = heavyBag()
      this.bag.position.set(spec.at.x + 2.2, grid.h(spec.at.x, spec.at.z) * LEVEL, spec.at.z + 0.5)
      this.bag.castShadow = true
      this.bag.receiveShadow = true
      scene.add(this.bag)
    }
  }

  update(dt, playerPos, t) {
    const g = this.grid
    const spec = this.spec

    if (spec.leash > 0) {
      this.wait -= dt
      if (this.wait <= 0 && this.pos.distanceTo(this.goal) < 0.25) {
        // Pick a new spot inside the leash. Rejected if it is water or a cliff,
        // rather than clamped — clamping walks everyone into the same corner.
        const a = this.rand() * Math.PI * 2
        const r = this.rand() * spec.leash
        const nx = clamp(this.home.x + Math.cos(a) * r, 1, g.n - 2)
        const nz = clamp(this.home.y + Math.sin(a) * r, 1, g.n - 2)
        const cx = Math.floor(nx), cz = Math.floor(nz)
        if (!g.isWater(cx, cz) && Math.abs(g.h(cx, cz) - g.h(Math.floor(this.pos.x), Math.floor(this.pos.y))) <= 2) {
          this.goal.set(nx, nz)
        }
        this.wait = 3 + this.rand() * 7
      }
      const d = this.goal.clone().sub(this.pos)
      const len = d.length()
      if (len > 0.12) {
        d.divideScalar(len)
        const step = Math.min(len, 1.5 * dt)
        this.pos.addScaledVector(d, step)
        this.facing = Math.atan2(d.x, d.y)
        this.speed = damp(this.speed, 0.55, 6, dt)
      } else {
        this.speed = damp(this.speed, 0, 6, dt)
      }
    }

    // Face the player when they are close enough to talk to. Everyone in the
    // valley does this and it is most of what makes them feel awake.
    const near = playerPos.distanceTo(new THREE.Vector3(this.pos.x, playerPos.y, this.pos.y))
    if (near < 4.5 && this.speed < 0.1) {
      const want = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.y)
      let d = want - this.facing
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      this.facing += d * Math.min(1, dt * 4)
    }
    this.near = near

    const y = g.sampleY(this.pos.x, this.pos.y)
    this.rig.root.position.set(this.pos.x, y, this.pos.y)
    this.rig.root.rotation.y = this.facing
    this.rig.anim.speed = this.speed
    if (this.rig.anim.pose !== undefined) {
      this.rig.anim.pose = near < 4.5 && this.speed < 0.05 && this.spec.kind === 'golem' && this.spec.pose === 'idle'
        ? 'wave'
        : this.spec.pose ?? 'idle'
      this.rig.anim.lookAt = near < 7 ? playerPos : null
    }
    this.rig.update(dt)

    if (this.bag) {
      // The bag answers the punches. One sine driven off the same clock the
      // guard pose is on, so they are in phase without being wired together.
      this.bag.rotation.x = Math.sin(t * 3.1) * 0.09
      this.bag.rotation.z = Math.cos(t * 2.7) * 0.05
    }
  }

  /** What they say when you press E. Cycles, so a second press is a second line
   *  rather than the same one again — the cheapest possible depth. */
  speak() {
    const lines = this.spec.lines ?? ['...']
    const line = lines[this.line % lines.length]
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
    this.wait = Math.random() * 3
    this.speed = 0
    this.facing = 0
    scene.add(this.rig.root)
  }

  update(dt, playerPos, night) {
    const g = this.grid
    // At night they sit down where they are and sleep, which is both correct
    // and the only chance the player gets to see the lotus pose from the sheet.
    this.rig.anim.sleeping = night
    if (!night) {
      // Follow the player at a polite distance; wander when the player is far.
      const toPlayer = new THREE.Vector2(playerPos.x, playerPos.z).sub(this.pos)
      const dist = toPlayer.length()
      if (dist > 3.5 && dist < 26) {
        this.goal.copy(new THREE.Vector2(playerPos.x, playerPos.z)).addScaledVector(toPlayer.normalize(), -2.4)
      } else {
        this.wait -= dt
        if (this.wait <= 0) {
          const a = Math.random() * Math.PI * 2
          this.goal.set(
            clamp(this.pos.x + Math.cos(a) * 3, 1, g.n - 2),
            clamp(this.pos.y + Math.sin(a) * 3, 1, g.n - 2),
          )
          this.wait = 1.5 + Math.random() * 4
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
  constructor(scene, grid, state) {
    this.scene = scene
    this.grid = grid
    this.state = state
    this.characters = ROSTER.map((spec) => new Character(spec, grid, scene))
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
    for (const c of this.characters) c.update(dt, playerPos, this.t)
    for (const p of this.pebbles) p.update(dt, playerPos, night)
  }

  /** The nearest character within reach, or null. */
  nearest(playerPos, range = 2.6) {
    let best = null
    let bestD = range
    for (const c of this.characters) {
      if (c.near < bestD) {
        bestD = c.near
        best = c
      }
    }
    return best
  }

  /** Rocky's line about the fault, which is the one piece of information the
   *  gate exists to give you. */
  forecast(daysUntil, mag) {
    if (daysUntil <= 0) return 'It goes today. Get behind a cairn or get away from the scar.'
    if (daysUntil === 1) return 'Tomorrow. I can feel it in the plinth.'
    if (daysUntil <= 3) return `${daysUntil} days. Magnitude reads about ${mag}. Plan for it.`
    return 'Quiet for now. Quarry while it is quiet.'
  }
}

export { Character, PebbleAgent }
