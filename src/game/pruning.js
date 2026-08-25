import { randInt, rng } from '../core/rng.js'

/**
 * PRUNING.
 *
 * The Loom did not finish. It rebooted into a partial state and it is still
 * working the rollback, slowly, at the pace of a machine with no deadline.
 * Every few nights it does a pass and **takes apart whatever it finds in the
 * valley that it has no record of.**
 *
 * The first time this happens to something you built, it happens without
 * warning, and you wake up to a rectangle of neatly stacked components where
 * your shed was.
 *
 * This is why the house tiers exist and why they are not cosmetic. Each tier
 * makes your homestead more **legible** to the Loom — the right footprint, the
 * right materials, a registration stake driven at the corner. A registered
 * structure survives a pruning night. An unregistered one does not.
 *
 * ## Why this and not an earthquake
 *
 * An earlier pass replaced this with a fault that tore up the terrain every few
 * days. It was a fine mechanic and it was the wrong one: it made the valley
 * hostile geology rather than an unfinished process, and it undid the thing the
 * setting is actually about. Pruning is not weather. It is a machine finishing
 * a job, and everything it takes it puts down in a neat pile, which is worse.
 *
 * Nothing here touches the height grid. The ground is not the Loom's problem.
 */

export const PHASE = { IDLE: 0, WARN: 1, PASS: 2, SETTLE: 3 }

const WARN_TIME = 2.4
const PASS_TIME = 2.0
const SETTLE_TIME = 1.4

/** What a structure gives back when it is taken apart. Not everything: the
 *  Loom returns raw components, and some of what you put in was labour. */
const SALVAGE = {
  homestead: { wood: 14, stone: 8 },
  crate: { wood: 6 },
  shed: { wood: 12, stone: 3 },
  kiln: { stone: 10, wood: 5 },
  well: { cutstone: 4, wood: 2 },
  vault: { cutstone: 12, shard: 1 },
}

/** Driving a stake is cheap. Remembering to is the game. */
export const STAKE_COST = { wood: 4, fibre: 3 }

export class PruningSystem {
  constructor(state, structures, camera, audio) {
    this.state = state
    /** Called with no arguments when the structure list changes. */
    this.structures = structures
    this.camera = camera
    this.audio = audio
    this.phase = PHASE.IDLE
    this.t = 0
    this.lastReport = null
  }

  get active() { return this.phase !== PHASE.IDLE }

  /** Nights until the next pass. Rocky at the relay reads this out. */
  nightsUntil() { return Math.max(0, this.state.nextPruning - this.state.day) }

  /** Called on each day rollover, before the player wakes. */
  checkDay() { return this.state.day >= this.state.nextPruning }

  /**
   * Take apart everything unregistered.
   *
   * Runs at the START of the morning, on the night that just passed, so the
   * player wakes to the result rather than watching it happen. That is the
   * whole horror of it: you were asleep, and it was tidy.
   */
  apply() {
    const s = this.state
    const r = rng((s.seed ^ (s.day * 2654435761)) >>> 0)
    const taken = []
    const returned = {}

    // The homestead is never pruned. It is where you sleep, and a game that can
    // delete your bed while you are in it is a game nobody finishes.
    const survivors = []
    for (const b of s.buildings) {
      if (b.kind === 'homestead' || b.kind === 'gate' || b.registered) {
        survivors.push(b)
        continue
      }
      taken.push(b)
      for (const [id, n] of Object.entries(SALVAGE[b.kind] ?? {})) {
        returned[id] = (returned[id] ?? 0) + n
      }
    }
    s.buildings = survivors

    for (const [id, n] of Object.entries(returned)) s.give(id, n)

    s.pruningsSeen++
    s.lastPruningDay = s.day
    s.nextPruning = s.day + 4 + randInt(r, 0, 3)

    this.lastReport = { taken: taken.map((b) => b.kind), returned }
    s.emit('pruning', { phase: 'pass', ...this.lastReport })

    if (taken.length) {
      s.addJournal(
        taken.length === 1
          ? `The Loom took the ${taken[0].kind} apart in the night. The components were stacked.`
          : `The Loom took ${taken.length} structures apart in the night. Everything was stacked.`,
      )
      s.say(`${taken.length} unregistered ${taken.length === 1 ? 'structure' : 'structures'} came apart.`, 'warn')
    } else if (s.buildings.some((b) => b.registered)) {
      s.addJournal('A pass went through. Everything was registered. Nothing moved.')
      s.say('A pass went through. Your stakes held.', 'good')
    }
    this.structures?.()
    return this.lastReport
  }

  /** Begin the sequence. `apply()` fires at the end of the warning. */
  start() {
    this.phase = PHASE.WARN
    this.t = 0
    this.state.emit('pruning', { phase: 'warn' })
    this.audio?.rumble(WARN_TIME + PASS_TIME, 0.22)
  }

  update(dt) {
    if (this.phase === PHASE.IDLE) return
    this.t += dt
    switch (this.phase) {
      case PHASE.WARN:
        if (this.t >= WARN_TIME) {
          this.phase = PHASE.PASS
          this.t = 0
          // A pass is not an earthquake. One short jolt, not a shake — the
          // ground is not what moved.
          this.camera.kick(0.34)
          this.audio?.prune()
          this.apply()
        }
        break
      case PHASE.PASS:
        if (this.t >= PASS_TIME) {
          this.phase = PHASE.SETTLE
          this.t = 0
        }
        break
      default:
        if (this.t >= SETTLE_TIME) {
          this.phase = PHASE.IDLE
          this.t = 0
          this.state.emit('pruning', { phase: 'done', ...this.lastReport })
        }
    }
  }
}
