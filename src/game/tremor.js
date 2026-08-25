import { G } from '../core/palette.js'
import { chance, clamp, randInt, rng, smoothstep } from '../core/rng.js'
import { N, P, WATER_LEVEL } from '../world/grid.js'

/**
 * THE TREMOR.
 *
 * This is the thing that makes Seismic Valley a different game from every other
 * farming game, so it is worth saying plainly what it is for: **it takes the
 * ground away and gives it back changed.**
 *
 * Every few days the fault moves. A band of the valley along the fault line
 * lifts or drops a level, the ground there scars over, fissures open, and geodes
 * are pushed up out of them. Any crop caught in the band and NOT standing inside
 * a cairn's calm field is destroyed.
 *
 * That single rule is the whole economy. Farming near the fault is where the
 * geodes and the good soil are; farming far from it is safe and poor. A cairn
 * buys you the first at the price of the second, and the game is the long
 * negotiation between those.
 *
 * The tremor RESOLVES over about four seconds, in three beats — a warning, the
 * shock, and the settle — because a valley that changes between two frames reads
 * as a bug and a valley that changes over four seconds reads as an earthquake.
 */

export const PHASE = { IDLE: 0, WARN: 1, SHOCK: 2, SETTLE: 3 }

/** A stable 0..1 per cell. Used for the ragged edge of the shock band, so the
 *  same tremor applied twice produces the same coastline. */
function cellNoise(x, z) {
  let h = (Math.imul(x + 3, 0x27d4eb2d) ^ Math.imul(z + 11, 0x165667b1)) >>> 0
  h = Math.imul(h ^ (h >>> 15), h | 1)
  h ^= h + Math.imul(h ^ (h >>> 7), h | 61)
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296
}

const WARN_TIME = 2.2
const SHOCK_TIME = 2.4
const SETTLE_TIME = 1.6

export class TremorSystem {
  constructor(state, terrain, props, cropView, camera, audio) {
    this.state = state
    this.terrain = terrain
    this.props = props
    this.cropView = cropView
    this.camera = camera
    this.audio = audio
    this.phase = PHASE.IDLE
    this.t = 0
    this.pending = null
    this.lastReport = null
  }

  get active() { return this.phase !== PHASE.IDLE }

  /** Days until the next one. The forecast the Ridge Gate and a Surveyor read. */
  daysUntil() { return Math.max(0, this.state.nextTremor - this.state.day) }

  /** Called on each day rollover. Returns true if one is due today. */
  checkDay() {
    const s = this.state
    if (s.day < s.nextTremor) return false
    return true
  }

  /** Begin. The grid is not touched until the shock lands. */
  start() {
    const s = this.state
    const seed = (s.seed ^ (s.day * 2654435761)) >>> 0
    const r = rng(seed)
    // Where along the fault, and how wide. A tremor that always hits the same
    // band is a tremor you build one cairn for and then ignore forever.
    // The epicentre is measured ALONG the fault, in the fault's own coordinate,
    // and this is the part that is easy to get wrong: `(x + z) / 2` looks like a
    // diagonal coordinate and is not one. On a fault running at this angle it
    // only spans about twenty of its ninety-six units, so most epicentres drawn
    // that way land outside the valley entirely and the tremor moves nothing at
    // all — silently, because zero cells is a perfectly valid loop result.
    const along = (r() * 2 - 1) * N * 0.55
    const half = 7 + s.tremorMag * 3.5 + r() * 5
    const lift = chance(r, 0.5) ? 1 : -1
    this.pending = { r, along, half, lift, mag: s.tremorMag }
    this.phase = PHASE.WARN
    this.t = 0
    s.emit('tremor', { phase: 'warn', mag: s.tremorMag })
    this.audio?.rumble(WARN_TIME + SHOCK_TIME, 0.35)
    return this.pending
  }

  /**
   * Apply the shock to the grid.
   *
   * Height changes are feathered to zero at the band's edge. A hard-edged band
   * leaves two parallel cliffs across the valley that look like somebody dragged
   * a rectangle over it — which is exactly what happened, and the feather is the
   * only thing that hides it.
   */
  apply() {
    const s = this.state
    const { r, along, half, lift, mag } = this.pending
    const g = this.grid ?? s.grid

    // The fault, in the same coefficients the generator used. (0.86, 0.51) is
    // already unit length, so `across` is a true perpendicular distance and
    // `along` is a true distance up the fault — no normalising needed.
    const mid = (N - 1) / 2
    const across = (x, z) => (x - mid) * 0.86 + (z - mid) * 0.51
    const down = (x, z) => (z - mid) * 0.86 - (x - mid) * 0.51

    let raised = 0, lost = 0, saved = 0, fissures = 0, geodes = 0

    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const i = z * N + x
        const d = Math.abs(across(x, z))
        if (d > half) continue
        const axis = Math.abs(down(x, z) - along)
        if (axis > half * 2.4) continue

        const strength = (1 - smoothstep(half * 0.35, half, d)) * (1 - smoothstep(half * 1.4, half * 2.4, axis))
        if (strength < 0.12) continue
        if (g.height[i] < WATER_LEVEL) continue

        const calm = s.calmAt(x, z)
        // A deterministic per-cell value, used to ragged the EDGE of the band.
        // Deciding each cell with a fresh `r()` instead produces a checkerboard
        // — half the cells in the band lift and half do not, and the result
        // reads as static rather than as ground that moved.
        const jitter = cellNoise(x, z)

        // Ground moves as one piece. Inside a calm field it does not move at
        // all — that is what the cairn is FOR, and it has to be legible from
        // the very first tremor.
        if (!calm && strength > 0.3 + jitter * 0.34) {
          g.height[i] = clamp(g.height[i] + lift, WATER_LEVEL, 38)
          raised++
          if (g.ground[i] !== G.TILLED && g.ground[i] !== G.WET && strength > 0.42 + jitter * 0.2) g.ground[i] = G.SCAR
        }

        // Crops. This is the loss the player actually feels.
        if (g.crop[i]) {
          if (calm) saved++
          else if (r() < strength * 0.85) {
            g.crop[i] = 0
            g.grown[i] = 0
            g.tilled[i] = 0
            g.ground[i] = G.SCAR
            lost++
          }
        }

        // What the fault gives back.
        if (!calm && g.prop[i] === P.NONE && r() < strength * 0.06) {
          g.prop[i] = P.GEODE
          g.propData[i] = randInt(r, 0, 3)
          geodes++
        } else if (!calm && g.prop[i] === P.NONE && r() < strength * 0.1) {
          g.prop[i] = P.FISSURE
          fissures++
        } else if (!calm && g.prop[i] === P.TREE && r() < strength * 0.14) {
          // A tree comes down, and leaves its wood on the ground as a stump.
          g.prop[i] = P.STUMP
        }
      }
    }

    g.touchAll()
    this.terrain.flush()
    this.props.dirty = true
    this.cropView.dirty = true

    s.tremorsSurvived++
    s.lastTremorDay = s.day
    // The next one is further off but bigger. The valley does not get easier;
    // it gets more spaced out and more expensive to be caught by.
    s.nextTremor = s.day + 4 + randInt(r, 0, 3) + Math.floor(s.tremorsSurvived / 3)
    s.tremorMag = Math.min(4, 1 + Math.floor(s.tremorsSurvived / 2))

    this.lastReport = { raised, lost, saved, fissures, geodes, mag }
    s.emit('tremor', { phase: 'shock', ...this.lastReport })
    s.addJournal(
      lost
        ? `The fault moved. ${lost} plants lost${saved ? `, ${saved} held by cairns` : ''}.`
        : `The fault moved. Nothing was standing where it went.`,
    )
    if (saved && lost === 0) s.say(`The cairns held. ${saved} plants standing.`, 'good')
    else if (lost) s.say(`${lost} plants lost to the fault.`, 'warn')
    if (geodes) s.say(`${geodes} geodes pushed up along the scar.`, 'good')
    return this.lastReport
  }

  update(dt) {
    if (this.phase === PHASE.IDLE) return
    this.t += dt
    const s = this.state
    switch (this.phase) {
      case PHASE.WARN:
        // A slow build, so the player has time to look up from the soil.
        this.camera.kick(dt * 0.5 * (this.t / WARN_TIME))
        if (this.t >= WARN_TIME) {
          this.phase = PHASE.SHOCK
          this.t = 0
          this.grid = s.grid
          this.camera.kick(0.9 + this.pending.mag * 0.16)
          this.audio?.quake(this.pending.mag)
          this.apply()
        }
        break
      case PHASE.SHOCK:
        this.camera.kick(dt * 2.2 * (1 - this.t / SHOCK_TIME))
        if (this.t >= SHOCK_TIME) {
          this.phase = PHASE.SETTLE
          this.t = 0
        }
        break
      default:
        if (this.t >= SETTLE_TIME) {
          this.phase = PHASE.IDLE
          this.t = 0
          s.emit('tremor', { phase: 'done', ...this.lastReport })
        }
    }
  }

  /** How hard the ground is shaking, 0..1 — for the HUD and any effect that
   *  wants to react without knowing about phases. */
  get intensity() {
    if (this.phase === PHASE.WARN) return (this.t / WARN_TIME) * 0.3
    if (this.phase === PHASE.SHOCK) return 1 - this.t / SHOCK_TIME
    if (this.phase === PHASE.SETTLE) return (1 - this.t / SETTLE_TIME) * 0.2
    return 0
  }
}
