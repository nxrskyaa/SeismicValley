import * as THREE from 'three'
import { chamferBox, stoneMat } from '../core/kit.js'
import { C, UI } from '../core/palette.js'
import { clamp, damp } from '../core/rng.js'
import { Grid, N } from '../world/grid.js'

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
 * No physics engine. The body is clamped to the height grid, and a step UP is
 * legal only to the next level while a drop is unrestricted. That single rule
 * does three things: "you cannot climb that" reads as a rule rather than as a
 * collision bug, terraces become real navigation, and the whole thing costs four
 * array lookups a frame.
 */

const WALK = 4.2
const RUN = 7.0
const RADIUS = 0.3

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
  }

  const root = new THREE.Group()
  root.name = 'player'
  const parts = { root, materials: MAT }

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
    if (key) parts[key] = g
    return g
  }

  const body = pivot(root, [0, 0, 0], 'body')

  // --- legs ----------------------------------------------------------------
  for (const side of [-1, 1]) {
    const L = side < 0 ? 'L' : 'R'
    const thigh = pivot(body, [side * 0.13, 0.6, 0], `thigh${L}`)
    box(thigh, [0.2, 0.44, 0.22], [0, -0.22, 0], MAT.trouser)
    const shin = pivot(thigh, [0, -0.44, 0], `shin${L}`)
    const foot = pivot(shin, [0, -0.02, 0], `foot${L}`)
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

  // --- head ----------------------------------------------------------------
  // Big, and wider than it is tall. The cap IS the head; there is no separate
  // skull under it at this size.
  const head = pivot(chest, [0, 0.52, 0], 'head')
  box(head, [0.62, 0.42, 0.52], [0, 0.21, 0], MAT.cap, 0.04)
  // The hood roll at the back of the crown — the one piece of asymmetry, and
  // what tells you which way the figure is facing from directly above.
  box(head, [0.32, 0.16, 0.24], [0, 0.44, -0.14], MAT.capDark)
  box(head, [0.44, 0.2, 0.05], [0, 0.13, 0.26], MAT.skin)
  for (const side of [-1, 1]) {
    box(head, [0.07, 0.07, 0.03], [side * 0.1, 0.16, 0.29], MAT.eye, 0.01)
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

  const A = { t: 0, speed: 0, swing: 0, use: 0, useKind: 'swing', carry: null, rod: false }
  parts.anim = A
  parts.height = 1.55

  parts.update = (dt) => {
    A.t += dt
    const s = A.speed
    const gait = A.t * (7.2 + s * 2.4)

    // Stubby legs swing less than long ones or the figure looks like it is
    // running on the spot.
    parts.thighL.rotation.x = Math.sin(gait) * 0.5 * s
    parts.thighR.rotation.x = -Math.sin(gait) * 0.5 * s
    parts.footL.rotation.x = -parts.thighL.rotation.x * 0.3
    parts.footR.rotation.x = -parts.thighR.rotation.x * 0.3
    // The bob runs at DOUBLE the stride, because it peaks once per foot. At
    // stride frequency it reads as a limp.
    parts.body.position.y = Math.abs(Math.sin(gait)) * 0.045 * s
    parts.chest.rotation.y = Math.sin(gait) * 0.08 * s
    // The head counter-rotates a little, so the cap stays level while the body
    // turns under it. It is two lines and it is most of the life in the walk.
    parts.head.rotation.y = -parts.chest.rotation.y * 0.6
    parts.head.rotation.z = Math.sin(gait) * 0.03 * s
    parts.body.rotation.x = s * 0.05

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
      if (A.rod) {
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

  /** Can a body of RADIUS stand centred here? Tested at four points on the
   *  circle rather than at its centre, or the player's shoulders clip walls. */
  _free(x, z, fromH) {
    for (const [ox, oz] of [[RADIUS, 0], [-RADIUS, 0], [0, RADIUS], [0, -RADIUS]]) {
      const cx = Math.floor(x + ox)
      const cz = Math.floor(z + oz)
      if (!Grid.inBounds(cx, cz)) return false
      if (!this.grid.canStand(cx, cz, fromH)) return false
    }
    return true
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

    const speed = (input.run ? RUN : WALK) * (this.rig.anim.use > 0.15 ? 0.35 : 1)
    if (mag > 0.001) {
      const nx = this.pos.x + mx * speed * dt
      const nz = this.pos.z + mz * speed * dt
      // Axis at a time, so a diagonal into a wall slides along it.
      if (this._free(nx, this.pos.z, standingH)) this.pos.x = nx
      if (this._free(this.pos.x, nz, standingH)) this.pos.z = nz
      this.facing = Math.atan2(mx, mz)
    }
    this.speed = damp(this.speed, mag, 12, dt)

    // Height. Rising to a legal step is instant, falling runs under a small
    // hand-rolled gravity so a drop off a terrace has weight to it.
    const groundY = g.sampleY(this.pos.x, this.pos.z)
    if (this.pos.y <= groundY + 0.02) {
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
      }
      this.onGround = false
    }

    this.rig.root.position.copy(this.pos)
    this.rig.root.rotation.y = damp(this.rig.root.rotation.y, this.facing, 14, dt)
    // Unwrap, or turning past ±π sends the rig the long way round.
    const d = this.facing - this.rig.root.rotation.y
    if (Math.abs(d) > Math.PI) this.rig.root.rotation.y += Math.sign(d) * Math.PI * 2
    this.rig.anim.speed = this.speed
    this.rig.update(dt)
  }

  teleport(x, z) {
    this.pos.set(clamp(x, 1, N - 2), this.grid.sampleY(x, z), clamp(z, 1, N - 2))
    this.vy = 0
  }
}
