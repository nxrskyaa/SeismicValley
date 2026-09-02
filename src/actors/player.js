import * as THREE from 'three'
import { chamferBox, contactShadow, stoneMat } from '../core/kit.js'
import { C, UI } from '../core/palette.js'
import { clamp, damp } from '../core/rng.js'
import { Grid, LEVEL, N, WATER_LEVEL } from '../world/grid.js'

/**
 * The settler, and how they move.
 *
 * ## The rig
 *
 * Eleven plates on pivot nodes, animated by arithmetic. No skeleton and no
 * animation clips: a walk cycle is four sines and it costs nothing, and the
 * moment you add a skeleton you have added an exporter, a file format and a
 * loader to a project whose entire point is that it has none of those.
 *
 * The settler is deliberately NOT a golem. Rocky's people are stone; the player
 * is a person in a cream field coat, and keeping that difference visible is what
 * makes the golems read as characters rather than as reskinned player models.
 *
 * ## The movement
 *
 * No physics engine. The body is clamped to the height grid: a drop is
 * unrestricted, a step up is legal to `STEP_UP` levels, and water is swum
 * rather than blocked.
 *
 * Those two numbers are the whole navigation design and both were wrong. The
 * step-up was one level against terrain terraced at two, which made every shelf
 * in the valley a wall and every ledge a one-way drop; and water was solid, so a
 * pond you fell into — off a rim that `sampleY` was placing you below anyway —
 * had no way out of it. Getting stuck reads as broken collision, not as a rule,
 * and it is the fastest way to make a player stop believing in a world.
 */

const WALK = 4.2
const RUN = 7.0
const SWIM = 2.6
const RADIUS = 0.3

/**
 * How far up a body can scramble in one step.
 *
 * **Two, and it has to be two.** The terrain is terraced at `STEP = 2` in
 * worldgen, so every ordinary terrace in the valley is a two-level face. With
 * this at 1 — which is what it was — the player could not climb a single one of
 * them: the whole map was a maze of walls with a few generated ramps through it,
 * falling off any ledge was a one-way trip, and walking into a terrace read as
 * the collision being broken rather than as a rule.
 *
 * The big walls are still walls. `HARD = 8` faces are four times this and no
 * amount of walking gets you up one.
 */
const STEP_UP = 2

/**
 * The scramble is INSTANT, and it has to be.
 *
 * Rate-limiting the rise looked better in theory — a two-level climb taking a
 * fifth of a second reads as hauling yourself up rather than as a pop. In
 * practice it means the body spends that fifth of a second below the floor of
 * the cell it is standing in, which is to say *inside the terrace*, which is
 * exactly the bug this whole pass started with. The soak caught it on all three
 * seeds within a minute.
 *
 * So the Y snaps, and the smoothing happens where it cannot clip anything: the
 * camera rig already damps its focus, so the world slides instead of jumping,
 * and the rig gets a squash impulse so the body reads as taking the step.
 */

/** Where the body floats. Half-submerged, so the cap is always out of water. */
/**
 * How fast the PICTURE may climb, in units per second.
 *
 * Not how fast the body moves — the body teleports a whole level, because the
 * world is an integer height grid and that is what standing on a terrace means.
 * This is the rate the rendered body is allowed to catch up at.
 */
const CLIMB_RATE = 5.5

const SWIM_DEPTH = 0.62

/**
 * Wardrobe.
 *
 * One entry, and that is the point. There is nobody else alive in the valley —
 * the survivors are scattered and do not know about each other — so a second
 * human look would be a lie about the setting.
 *
 * The blue cap and the tan belt are the only saturated colours a person is
 * allowed to be against a washed-out world. They are how you find yourself in a
 * wide shot.
 */
export const LOOKS = {
  apprentice: {
    cap: '#7ba8c4', capDark: '#3d6b74',
    shirt: '#e8e0d0', sleeve: '#5f9ec4',
    belt: '#d9a05a', skin: C.skin,
    trouser: '#3a4468', boot: '#1c1e2a',
  },
}

/**
 * The settler.
 *
 * **Everything is a box.** Not a tapered prism, not a hex plate, not a sphere —
 * hard rectangular voxels, the way the reference draws them. And the
 * proportions are a chibi's, not a person's: roughly three heads tall, with a
 * head as wide as the shoulders and legs that are a third of the figure.
 *
 * An earlier pass built a 1.72-unit adult out of hex prisms with tapered limbs
 * and a brimmed hat. It was a perfectly decent little farmer and it was the
 * wrong one — at this camera height the player is a hundred pixels tall, and at
 * that size proportion and silhouette are the ONLY things that read.
 *
 * Measured off the footage, as fractions of total height:
 *
 *   head   1.06 → 1.55  (0.62 wide — as wide as the shoulders)
 *   torso  0.58 → 1.10  (cream front panel, blue sleeves either side)
 *   legs   0.12 → 0.60  (navy)
 *   boots  0.00 → 0.17
 */
export function buildPlayer(lookKey = 'apprentice') {
  const look = typeof lookKey === 'string' ? (LOOKS[lookKey] ?? LOOKS.apprentice) : lookKey
  const MAT = {
    cap: stoneMat(look.cap),
    capDark: stoneMat(look.capDark),
    shirt: stoneMat(look.shirt),
    sleeve: stoneMat(look.sleeve),
    belt: stoneMat(look.belt),
    skin: stoneMat(look.skin),
    trouser: stoneMat(look.trouser),
    boot: stoneMat(look.boot),
    eye: stoneMat(UI.ink),
    hair: stoneMat(look.hair ?? '#3b2b22'),
  }

  const root = new THREE.Group()
  root.name = 'player'
  const parts = { root, materials: MAT }
  // The patch of shadow the body stands in. See `contactShadow` in core/kit —
  // the root already sits at ground level, so it needs no per-frame update.
  const shadow = contactShadow(0.52)
  if (shadow) root.add(shadow)

  /** One box. The only primitive this rig uses. */
  const box = (parent, [w, h, d], at, mat, cut = 0.03) => {
    const m = new THREE.Mesh(chamferBox(w, h, d, cut), mat)
    m.position.set(...at)
    parent.add(m)
    return m
  }
  const pivot = (parent, at, key) => {
    const g = new THREE.Group()
    g.position.set(...at)
    parent.add(g)
    // Named as well as recorded, so a joint can be identified from the scene
    // graph alone — by the inspector, and by `tools/overlap.mjs seams`, which
    // otherwise reports that something has floated off without saying what.
    if (key) { parts[key] = g; g.name = key }
    return g
  }

  const body = pivot(root, [0, 0, 0], 'body')

  // --- legs ----------------------------------------------------------------
  for (const side of [-1, 1]) {
    const L = side < 0 ? 'L' : 'R'
    const thigh = pivot(body, [side * 0.13, 0.6, 0], `thigh${L}`)
    box(thigh, [0.2, 0.44, 0.22], [0, -0.22, 0], MAT.trouser)
    const shin = pivot(thigh, [0, -0.44, 0], `shin${L}`)
    // Seated on the trouser hem, not 0.005 below it. Both offsets here closed by
    // exactly the gap `tools/overlap.mjs seams` measured, once `chamferBox`
    // stopped inflating every plate into its neighbour.
    const foot = pivot(shin, [0, -0.015, 0], `foot${L}`)
    box(foot, [0.23, 0.15, 0.32], [0, -0.06, 0.04], MAT.boot)
  }

  // --- torso ---------------------------------------------------------------
  const chest = pivot(body, [0, 0.58, 0], 'chest')
  box(chest, [0.5, 0.5, 0.34], [0, 0.25, 0.02], MAT.shirt)
  for (const side of [-1, 1]) {
    box(chest, [0.12, 0.5, 0.36], [side * 0.21, 0.25, 0], MAT.sleeve)
  }
  // The satchel strap. One band, and it is the only warm colour on the figure.
  box(chest, [0.52, 0.11, 0.37], [0, 0.13, 0.01], MAT.belt)

  /**
   * WHAT YOU CARRY ON YOUR BACK.
   *
   * Customisation at this camera is a question of what is visible from
   * thirty-seven degrees above and behind, and the answer is: the top of the
   * head, the shoulders, and the back. Colour choices alone left every settler
   * the same silhouette, which is what "very little customisation" means when
   * the figure is a hundred pixels tall — you cannot see a face, so a face is
   * not what to offer.
   */
  switch (look.pack ?? 'satchel') {
    case 'satchel':
      box(chest, [0.34, 0.3, 0.16], [0, 0.22, -0.24], MAT.belt, 0.03)
      box(chest, [0.34, 0.06, 0.17], [0, 0.34, -0.245], MAT.capDark)
      break
    case 'roll':
      // A bedroll across the shoulders. Reads as a horizontal bar from above,
      // which is the most distinct thing on this list at a glance.
      box(chest, [0.56, 0.15, 0.15], [0, 0.4, -0.22], MAT.shirt, 0.06)
      box(chest, [0.1, 0.16, 0.16], [0.24, 0.4, -0.22], MAT.belt, 0.05)
      box(chest, [0.1, 0.16, 0.16], [-0.24, 0.4, -0.22], MAT.belt, 0.05)
      break
    case 'basket':
      box(chest, [0.36, 0.42, 0.2], [0, 0.3, -0.26], MAT.capDark, 0.03)
      box(chest, [0.4, 0.07, 0.24], [0, 0.5, -0.26], MAT.belt)
      break
    default:
      break
  }

  // --- head ----------------------------------------------------------------
  // Big, and wider than it is tall. The cap IS the head; there is no separate
  // skull under it at this size.
  const head = pivot(chest, [0, 0.5, 0], 'head')

  /**
   * THE HEAD IS THE SILHOUETTE.
   *
   * From directly above — which is most of what this camera shows of a person —
   * the head is the whole figure. So this is where the shape choices go, and
   * every one of them has to be legible as an OUTLINE and not as a detail: a
   * brim is a disc, a hood is a longer back, bare is a smaller crown. The old
   * rig had one head and offered a choice of what colour it was.
   */
  const gear = look.headgear ?? 'cap'
  const crown = gear === 'bare' || gear === 'band' ? MAT.hair : MAT.cap
  const crownH = gear === 'bare' || gear === 'band' ? 0.38 : 0.42
  box(head, [0.62, crownH, 0.52], [0, 0.21, 0], crown, 0.04)

  switch (gear) {
    case 'cap':
      // The roll at the back of the crown — the one piece of asymmetry, and
      // what tells you which way the figure is facing from directly above.
      box(head, [0.32, 0.16, 0.24], [0, 0.44, -0.14], MAT.capDark)
      break
    case 'hood':
      // Carries down over the neck and out past the shoulders, so it reads as
      // a hood from above rather than as a taller cap.
      box(head, [0.5, 0.34, 0.26], [0, 0.3, -0.24], MAT.capDark, 0.05)
      box(head, [0.66, 0.2, 0.2], [0, 0.02, -0.16], MAT.capDark, 0.05)
      break
    case 'brim':
      /**
       * ABOVE THE FACE, and no wider than the shoulders.
       *
       * It shipped at 0.92 x 0.86 sitting at y 0.10 — which is INSIDE the head
       * block, below the top of the face — so it read as a slab driven through
       * the middle of the character, and it made the head as wide as the whole
       * torso (1.00x, against 0.81x for the cap). A hat wider than the shoulders
       * stops being clothing and becomes a prop the figure is standing under.
       *
       * Now it sits just clear of the face plate, which tops out at 0.23.
       */
      box(head, [0.8, 0.05, 0.72], [0, 0.28, 0], MAT.capDark, 0.09)
      box(head, [0.56, 0.07, 0.48], [0, 0.33, 0], MAT.cap, 0.03)
      break
    case 'band':
      // On the forehead, not over the eyes. At y 0.15 it ran straight across
      // them and read as a blindfold with eyes painted on it.
      box(head, [0.64, 0.08, 0.55], [0, 0.29, 0], MAT.cap, 0.02)
      break
    default:
      // Bare: a short fringe, so the front of the head is not a blank block.
      box(head, [0.5, 0.1, 0.08], [0, 0.3, 0.24], MAT.hair, 0.02)
      break
  }
  // The face itself, tagged alongside the eyes so the look check knows which
  // pieces are the FACE and which are things put in front of it.
  parts.face = box(head, [0.44, 0.2, 0.05], [0, 0.13, 0.26], MAT.skin)
  // Recorded, because `tools/overlap.mjs looks` needs to know where the face is
  // to check that no hat has been put across it.
  parts.eyes = []
  for (const side of [-1, 1]) {
    parts.eyes.push(box(head, [0.07, 0.07, 0.03], [side * 0.1, 0.16, 0.29], MAT.eye, 0.01))
  }

  // --- arms ----------------------------------------------------------------
  for (const side of [-1, 1]) {
    const L = side < 0 ? 'L' : 'R'
    const arm = pivot(chest, [side * 0.31, 0.44, 0], `arm${L}`)
    box(arm, [0.15, 0.28, 0.18], [0, -0.14, 0], MAT.sleeve)
    const fore = pivot(arm, [0, -0.28, 0], `fore${L}`)
    box(fore, [0.14, 0.2, 0.17], [0, -0.1, 0], MAT.sleeve)
    box(fore, [0.15, 0.1, 0.17], [0, -0.24, 0], MAT.skin)
    const hold = pivot(fore, [0, -0.28, 0.06], `hold${L}`)
    hold.rotation.x = -0.4
  }

  const A = { t: 0, speed: 0, swing: 0, use: 0, useKind: 'swing', carry: null, rod: false, swimming: false, step: 0, footfall: false, gait: 0, _gait: 0 }
  parts.anim = A
  parts.height = 1.55

  parts.update = (dt) => {
    A.t += dt
    const s = A.speed
    /**
     * THE WALK PHASE IS INTEGRATED, NOT MULTIPLIED.
     *
     * This was `A.t * (7.2 + s * 2.4)` — a product of elapsed time and a
     * frequency that depends on speed. Change the speed and the whole phase
     * jumps: at sixty seconds in, going from walk to run shifts it by sixty
     * times 2.4, which is a hundred and forty-four radians in one frame. And
     * `speed` is damped, so it moves EVERY frame you are accelerating or
     * stopping — the legs were snapping to a new position continuously any time
     * the player changed pace, which is most of the time.
     *
     * Accumulating dt times the current frequency makes a frequency change
     * continuous by construction: the phase can never jump, whatever the speed
     * does. The dog and the pebbles already did it this way.
     */
    A.gait += dt * (7.2 + s * 2.4)
    const gait = A.gait

    /**
     * FOOTFALLS, off the gait rather than off a timer.
     *
     * The legs swing on `sin(gait)`, so a foot is down every time that crosses
     * zero — twice a cycle, once per foot. Reading the crossing means the sound
     * lands on the frame the foot lands, at whatever speed the body is moving,
     * with no second clock to drift against it. A footstep timer that runs at a
     * fixed interval is audibly wrong the moment anybody sprints.
     */
    A.footfall = false
    if (s > 0.08 && !A.swimming) {
      const half = Math.floor(gait / Math.PI)
      if (half !== A._gait) {
        A._gait = half
        A.footfall = true
      }
    } else if (A.swimming) {
      // A stroke, at the stroke rate, so swimming is not silent either.
      const stroke = Math.floor(A.t * 3.1 / Math.PI)
      if (stroke !== A._gait) {
        A._gait = stroke
        A.footfall = true
      }
    } else {
      A._gait = Math.floor(gait / Math.PI)
    }

    // Stubby legs swing less than long ones or the figure looks like it is
    // running on the spot.
    parts.thighL.rotation.x = Math.sin(gait) * 0.5 * s
    parts.thighR.rotation.x = -Math.sin(gait) * 0.5 * s
    /**
     * The knees bend, and they only bend one way.
     *
     * The shin pivots have been in this rig from the start and nothing ever
     * rotated them, so the legs swung as rigid sticks from the hip — which is
     * most of what made the walk read as a puppet. `max(0, -sin)` bends the
     * knee only on the back half of the stride, which is what a knee does; a
     * plain sine bends it forwards through the middle of the step.
     */
    parts.shinL.rotation.x = Math.max(0, -Math.sin(gait - 0.6)) * 0.75 * s
    parts.shinR.rotation.x = Math.max(0, Math.sin(gait - 0.6)) * 0.75 * s
    parts.footL.rotation.x = -parts.thighL.rotation.x * 0.3 - parts.shinL.rotation.x * 0.5
    parts.footR.rotation.x = -parts.thighR.rotation.x * 0.3 - parts.shinR.rotation.x * 0.5
    // The bob runs at DOUBLE the stride, because it peaks once per foot. At
    // stride frequency it reads as a limp.
    parts.body.position.y = Math.abs(Math.sin(gait)) * 0.045 * s
    parts.chest.rotation.y = Math.sin(gait) * 0.08 * s
    // The head counter-rotates a little, so the cap stays level while the body
    // turns under it. It is two lines and it is most of the life in the walk.
    parts.head.rotation.y = -parts.chest.rotation.y * 0.6
    parts.head.rotation.z = Math.sin(gait) * 0.03 * s
    parts.body.rotation.x = A.swimming ? 0.42 : s * 0.05

    // The scramble squash. One impulse, decayed — it is what turns an instant
    // two-level step into something the body appears to have done on purpose.
    A.step = Math.max(0, A.step - dt * 4)
    if (A.step > 0) {
      const k = Math.sin(A.step * Math.PI)
      parts.body.scale.set(1 + k * 0.12, 1 - k * 0.16, 1 + k * 0.12)
      parts.body.position.y -= k * 0.09
    } else {
      parts.body.scale.set(1, 1, 1)
    }

    A.use = Math.max(0, A.use - dt * 2.6)
    const u = A.use
    if (u > 0) {
      // A chop is an over-the-shoulder arc; a pour is a held tilt. Same channel,
      // different curve, so one number drives both.
      const curve = A.useKind === 'pour'
        ? -1.3 - Math.sin(Math.min(1, u) * Math.PI) * 0.3
        : -2.4 + Math.cos(u * Math.PI * 1.3) * 2.6
      parts.armR.rotation.x = curve
      parts.armL.rotation.x = curve * 0.4
      parts.foreR.rotation.x = A.useKind === 'pour' ? -0.5 : -0.7 + u * 0.5
      parts.chest.rotation.x = A.useKind === 'pour' ? 0.05 : 0.2 * (1 - u)
    } else {
      const swing = Math.sin(gait) * 0.55 * s
      parts.armL.rotation.x = swing
      parts.armR.rotation.x = -swing
      parts.armL.rotation.z = 0.06
      parts.armR.rotation.z = -0.06
      parts.foreL.rotation.x = -0.1
      parts.foreR.rotation.x = -0.1
      parts.chest.rotation.x = 0
      if (A.swimming) {
        // Treading water: the body tips forward, the arms sweep out of phase
        // and the legs stop entirely. Two lines, and without them a swimming
        // figure is a walking figure standing in a hole.
        const stroke = A.t * 3.1
        parts.body.rotation.x = 0.42
        parts.armL.rotation.x = -0.9 + Math.sin(stroke) * 0.8
        parts.armR.rotation.x = -0.9 + Math.sin(stroke + Math.PI) * 0.8
        parts.armL.rotation.z = 0.5
        parts.armR.rotation.z = -0.5
        parts.foreL.rotation.x = parts.foreR.rotation.x = -0.5
        parts.thighL.rotation.x = Math.sin(stroke * 0.8) * 0.25
        parts.thighR.rotation.x = -Math.sin(stroke * 0.8) * 0.25
        parts.head.rotation.x = -0.3
      } else if (A.rod) {
        // Holding a rod is not holding a hoe. The right arm comes up and across
        // so the pole clears the shoulder, and the left comes in to steady it —
        // without the second hand the figure reads as carrying a stick.
        parts.armR.rotation.x = -0.62 - swing * 0.2
        parts.armR.rotation.z = -0.2
        parts.foreR.rotation.x = -0.34
        parts.armL.rotation.x = -0.34 + swing * 0.2
        parts.armL.rotation.z = 0.3
        parts.foreL.rotation.x = -0.5
      }
    }
  }

  /** Play a use animation. `kind` picks the curve, not the tool. */
  parts.play = (kind = 'swing') => {
    A.useKind = kind
    A.use = 1
  }

  return parts
}

/**
 * The controller.
 *
 * Movement is resolved on each axis separately, which is what lets the player
 * slide along a cliff face instead of sticking to it — the classic "walk into a
 * corner and stop dead" is a single combined test.
 */
export class PlayerController {
  constructor(grid, rig, x, z) {
    this.grid = grid
    this.rig = rig
    this.pos = new THREE.Vector3(x, grid.sampleY(x, z), z)
    this.facing = 0
    this.vy = 0
    this.onGround = true
    this.speed = 0
    this.swimming = false
    this.swimT = 0
  }

  /** The cell the player is standing on. */
  get cell() { return [Math.floor(this.pos.x), Math.floor(this.pos.z)] }

  /** The cell in front of them — the one every tool acts on. Half a unit ahead
   *  rather than a whole one, so you till the tile you are looking at and not
   *  the one past it. */
  get target() {
    const fx = this.pos.x + Math.sin(this.facing) * 0.85
    const fz = this.pos.z + Math.cos(this.facing) * 0.85
    return [Math.floor(fx), Math.floor(fz)]
  }

  /**
   * Can a body of RADIUS occupy this spot?
   *
   * Tested at points on the circle rather than at its centre, or the player's
   * shoulders clip walls — but only at the points on the axis being MOVED
   * along, which is the difference between sliding down a wall and sticking to
   * it. Testing all four for both axes means that once you are within RADIUS of
   * a wall, the offset point on the wall side fails for the x-move AND the
   * z-move, and you are pinned in place until you back away. That is what
   * "keeps getting stuck on walls" was.
   */
  _free(x, z, fromH, axis) {
    const pts = axis === 'x'
      ? [[RADIUS, 0], [-RADIUS, 0]]
      : axis === 'z'
        ? [[0, RADIUS], [0, -RADIUS]]
        : [[RADIUS, 0], [-RADIUS, 0], [0, RADIUS], [0, -RADIUS]]
    for (const [ox, oz] of [[0, 0], ...pts]) {
      const cx = Math.floor(x + ox)
      const cz = Math.floor(z + oz)
      if (!Grid.inBounds(cx, cz)) return false
      if (!this.grid.canWade(cx, cz, fromH, STEP_UP)) return false
    }
    return true
  }

  /**
   * THE ESCAPE HATCH.
   *
   * A collision test must never make an already-invalid position permanent. The
   * soak found the player standing inside a shed they had built on their own
   * tile: the centre point failed every test, so every direction failed, and
   * they were wedged there for good on flat open ground.
   *
   * Building on yourself is now refused, but that is only one of the ways to end
   * up somewhere you should not be — a sapling grows, a pruning leaves debris, a
   * save is loaded into a valley generated by different code. So whenever the
   * cell under the body is not somewhere a body may be, movement is unrestricted
   * until it is out. Getting out is always allowed; getting in is what is
   * policed.
   */
  get stuck() {
    const [cx, cz] = this.cell
    return !this.grid.canWade(cx, cz, this.grid.h(cx, cz), STEP_UP)
  }

  update(dt, input, camYaw) {
    const g = this.grid
    const [cx, cz] = this.cell
    const standingH = g.h(cx, cz)

    /**
     * Camera-relative movement.
     *
     * The rig sits at `focus + (sin yaw, *, cos yaw) * d` and looks back at the
     * focus, so the direction INTO the screen is `(-sin yaw, -cos yaw)`. W sends
     * `move.z = -1`, and it has to come out as exactly that vector.
     *
     * The rotation below is the one that does it. The obvious form —
     * `x*cos - z*sin, x*sin + z*cos` — rotates the wrong way for this camera and
     * sends W off at ninety degrees to where the player is looking; at the
     * default 45-degree yaw that reads as the controls being reversed.
     */
    const cos = Math.cos(camYaw)
    const sin = Math.sin(camYaw)
    const mx = input.move.x * cos + input.move.z * sin
    const mz = -input.move.x * sin + input.move.z * cos
    const mag = Math.hypot(mx, mz)

    const swimming = this.swimming
    const speed = (swimming ? SWIM : input.run ? RUN : WALK) * (this.rig.anim.use > 0.15 ? 0.35 : 1)
    // Swimming out of a basin is climbing out of it, so the height you are
    // measuring from is the waterline and not the bed four levels down.
    const fromH = swimming ? WATER_LEVEL : standingH
    const escaping = this.stuck
    if (mag > 0.001) {
      const nx = this.pos.x + mx * speed * dt
      const nz = this.pos.z + mz * speed * dt
      // Axis at a time, so a diagonal into a wall slides along it.
      if (escaping || this._free(nx, this.pos.z, fromH, 'x')) this.pos.x = nx
      if (escaping || this._free(this.pos.x, nz, fromH, 'z')) this.pos.z = nz
      this.pos.x = clamp(this.pos.x, 1, N - 2)
      this.pos.z = clamp(this.pos.z, 1, N - 2)
      this.facing = Math.atan2(mx, mz)
    }
    this.speed = damp(this.speed, mag, 12, dt)

    /**
     * Height.
     *
     * Three cases: floating, climbing, falling.
     *
     * Floating happens whenever the cell under you is below the waterline. You
     * bob at the surface rather than sinking, and getting out is just walking at
     * a bank low enough to climb — there is no drowning and no timer, because
     * this is a game about growing vegetables.
     *
     * Climbing is RATE LIMITED rather than instant. A two-level scramble takes
     * about a fifth of a second and reads as hauling yourself up; snapping the
     * same two levels in one frame reads as a teleport.
     */
    const [nx2, nz2] = this.cell
    this.swimming = g.isWater(nx2, nz2)

    if (this.swimming) {
      const surface = WATER_LEVEL * LEVEL + LEVEL * 0.5
      // A slow bob, out of phase with nothing in particular.
      this.pos.y = damp(this.pos.y, surface - SWIM_DEPTH + Math.sin(this.swimT) * 0.035, 6, dt)
      this.swimT = (this.swimT ?? 0) + dt * 1.6
      this.vy = 0
      this.onGround = false
    } else {
      const groundY = g.sampleY(this.pos.x, this.pos.z)
      if (this.pos.y <= groundY + 0.02) {
        // A step of more than one level is a scramble; the rig squashes for it.
        if (groundY - this.pos.y > LEVEL * 0.6) this.rig.anim.step = 1
        this.pos.y = groundY
        this.vy = 0
        this.onGround = true
        if (input.pressed('jump')) {
          this.vy = 4.6
          this.onGround = false
        }
      } else {
        this.vy -= 18 * dt
        this.pos.y += this.vy * dt
        if (this.pos.y < groundY) {
          this.pos.y = groundY
          this.vy = 0
          this.onGround = true
        } else {
          /**
           * ONLY when the fall did not end this frame.
           *
           * This assignment used to run unconditionally, three lines under the
           * `onGround = true` above it, so the body reported itself airborne on
           * the exact frame it touched down. `renderY` is only smoothed while
           * on the ground, so every single landing in the game handed the player
           * a hard cut instead of a step — which is most of the "bouncing off a
           * box" that dropping down a terrace felt like.
           */
          this.onGround = false
        }
      }
    }

    /**
     * The body stands at the exact cell height; only the PICTURE is smoothed.
     *
     * `sampleY` no longer blends, because the ground it is describing is drawn
     * as flat tops and sheer faces and a blended height put the body inside the
     * step. Damping the rendered y instead gives the same smooth climb without
     * ever placing the collision surface somewhere the terrain is not.
     *
     * Snapped rather than damped when falling or swimming: a damped fall reads
     * as floating down, and in water the y IS the surface.
     */
    if (this.onGround && !this.swimming) {
      /**
       * Damped, then SPEED-CAPPED.
       *
       * Damping alone moves fastest when the gap is biggest, which is exactly
       * the moment that must not be fast: stepping up a terrace opens a gap of a
       * whole level, and at the old rate of 16 the first frame closed 0.24 of it
       * in one go. Worse, the correction was then clamped to half a level, so a
       * one-level step teleported the picture 0.5 instantly — measured, and it
       * is the pop the player reads as being bounced off a box.
       *
       * Capping the per-frame change at `CLIMB_RATE` fixes the big gaps without
       * making the small ones sluggish, because the damp still governs those.
       * At 60fps the cap works out at 0.092 of a unit per frame, against a
       * walking body's 0.07 — so the rise never outruns the walk that caused it,
       * and a full level takes about a fifth of a second.
       *
       * `tools/motion.mjs` walks a staircase and fails if any frame moves the
       * picture more than a tenth of a level.
       */
      const smoothed = damp(this.renderY ?? this.pos.y, this.pos.y, 14, dt)
      const cap = CLIMB_RATE * dt
      this.renderY = (this.renderY ?? this.pos.y) + clamp(smoothed - (this.renderY ?? this.pos.y), -cap, cap)
      // A backstop, not the mechanism: the picture may trail the body by a step
      // and a fraction while it catches up, never by more.
      this.renderY = clamp(this.renderY, this.pos.y - LEVEL * 1.25, this.pos.y + LEVEL * 0.35)
    } else {
      this.renderY = this.pos.y
    }
    this.rig.root.position.set(this.pos.x, this.renderY, this.pos.z)
    this.rig.root.rotation.y = damp(this.rig.root.rotation.y, this.facing, 14, dt)
    // Unwrap, or turning past ±π sends the rig the long way round.
    const d = this.facing - this.rig.root.rotation.y
    if (Math.abs(d) > Math.PI) this.rig.root.rotation.y += Math.sign(d) * Math.PI * 2
    this.rig.anim.speed = this.speed
    this.rig.anim.swimming = this.swimming
    this.rig.update(dt)
  }

  teleport(x, z) {
    this.pos.set(clamp(x, 1, N - 2), this.grid.sampleY(x, z), clamp(z, 1, N - 2))
    this.vy = 0
  }
}
