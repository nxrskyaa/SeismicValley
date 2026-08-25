import * as THREE from 'three'
import { BALL, chamferBox, COLUMN, DISC, FLAT, POINT, stoneMat, TAPER } from '../core/kit.js'
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
 * human look would be a lie about the setting. An earlier pass put three
 * villagers and a market square in here and it read as a different game.
 *
 * The teal jacket and the rust pack are the only saturated colours a person is
 * allowed to be against a washed-out world. They are how you find yourself in a
 * wide shot.
 */
export const LOOKS = {
  apprentice: {
    skin: C.skin, hair: C.hair,
    coat: C.jacket, coatDark: C.jacketDark,
    trouser: C.trousers, boot: C.boots,
    pack: C.pack, hat: true,
  },
}

export function buildPlayer(lookKey = 'apprentice') {
  const look = typeof lookKey === 'string' ? (LOOKS[lookKey] ?? LOOKS.apprentice) : lookKey
  const MAT = {
    skin: stoneMat(look.skin),
    hair: stoneMat(look.hair),
    coat: stoneMat(look.coat),
    coatDark: stoneMat(look.coatDark),
    trouser: stoneMat(look.trouser),
    boot: stoneMat(look.boot),
    pack: stoneMat(look.pack),
    strap: stoneMat(UI.stoneDark),
    eye: stoneMat(UI.ink),
  }

  const root = new THREE.Group()
  root.name = 'player'
  const parts = { root, materials: MAT }

  const plate = (parent, geo, at, sc, mat) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(...at)
    m.scale.set(...(typeof sc === 'number' ? [sc, sc, sc] : sc))
    m.castShadow = true
    m.receiveShadow = true
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

  // Hips, coat, shoulders. The coat flares below the belt — one extra plate,
  // and it is the difference between a farmer and a mannequin in a shirt.
  plate(body, POINT, [0, 0.86, 0], [0.34, 0.16, 0.24], MAT.trouser)
  plate(body, POINT, [0, 1.02, 0], [0.42, 0.22, 0.28], MAT.coatDark)
  const chest = pivot(body, [0, 1.02, 0], 'chest')
  plate(chest, FLAT, [0, 0.16, 0], [0.44, 0.3, 0.28], MAT.coat)
  plate(chest, FLAT, [0, 0.32, 0.005], [0.46, 0.08, 0.3], MAT.coatDark)
  // The pack. Everything you are carrying is notionally in here.
  plate(chest, chamferBox(0.34, 0.36, 0.2, 0.05), [0, 0.16, -0.2], 1, MAT.pack)
  plate(chest, FLAT, [0, 0.2, 0.15], [0.1, 0.34, 0.06], MAT.strap)

  const head = pivot(chest, [0, 0.4, 0], 'head')
  plate(head, POINT, [0, 0.1, 0], [0.25, 0.22, 0.24], MAT.skin)
  // Brimmed hat, because the sun in Ember is the reason anybody wears one.
  if (look.hat) plate(head, FLAT, [0, 0.2, -0.01], [0.44, 0.04, 0.42], MAT.hair)
  plate(head, POINT, [0, look.hat ? 0.26 : 0.22, -0.01], [0.26, look.hat ? 0.11 : 0.16, 0.25], MAT.hair)
  for (const side of [-1, 1]) {
    plate(head, DISC, [side * 0.062, 0.1, 0.122], [0.036, 0.05, 0.02], MAT.eye)
  }

  for (const side of [-1, 1]) {
    const L = side < 0 ? 'L' : 'R'
    const arm = pivot(chest, [side * 0.24, 0.28, 0], `arm${L}`)
    plate(arm, TAPER, [0, -0.16, 0], [0.11, 0.33, 0.11], MAT.coat)
    const fore = pivot(arm, [0, -0.31, 0], `fore${L}`)
    plate(fore, TAPER, [0, -0.14, 0], [0.1, 0.3, 0.1], MAT.coatDark)
    plate(fore, BALL, [0, -0.31, 0], [0.13, 0.13, 0.13], MAT.skin)
    const hold = pivot(fore, [0, -0.34, 0.04], `hold${L}`)
    hold.rotation.x = -0.4
  }

  for (const side of [-1, 1]) {
    const L = side < 0 ? 'L' : 'R'
    const thigh = pivot(body, [side * 0.12, 0.86, 0], `thigh${L}`)
    plate(thigh, COLUMN, [0, -0.2, 0], [0.16, 0.42, 0.17], MAT.trouser)
    const shin = pivot(thigh, [0, -0.42, 0], `shin${L}`)
    plate(shin, COLUMN, [0, -0.2, 0], [0.14, 0.4, 0.15], MAT.trouser)
    const foot = pivot(shin, [0, -0.42, 0], `foot${L}`)
    plate(foot, chamferBox(0.17, 0.12, 0.3, 0.04), [0, 0.06, 0.06], 1, MAT.boot)
  }

  const A = { t: 0, speed: 0, swing: 0, use: 0, useKind: 'swing', carry: null }
  parts.anim = A
  parts.height = 1.72

  parts.update = (dt) => {
    A.t += dt
    const s = A.speed
    const gait = A.t * (7.2 + s * 2.4)

    parts.thighL.rotation.x = Math.sin(gait) * 0.72 * s
    parts.thighR.rotation.x = -Math.sin(gait) * 0.72 * s
    parts.shinL.rotation.x = Math.max(0, -Math.sin(gait - 0.6)) * 0.95 * s
    parts.shinR.rotation.x = Math.max(0, Math.sin(gait - 0.6)) * 0.95 * s
    parts.footL.rotation.x = -parts.thighL.rotation.x * 0.35
    parts.footR.rotation.x = -parts.thighR.rotation.x * 0.35
    // The bob runs at DOUBLE the stride, because it peaks once per foot. At
    // stride frequency it reads as a limp.
    parts.body.position.y = Math.abs(Math.sin(gait)) * 0.055 * s
    parts.chest.rotation.y = Math.sin(gait) * 0.1 * s
    parts.body.rotation.x = s * 0.07

    // Tool use overrides the arms entirely, and decays on its own clock so the
    // swing finishes even if the player let go of the key mid-stroke.
    A.use = Math.max(0, A.use - dt * 2.6)
    const u = A.use
    if (u > 0) {
      // A chop is an over-the-shoulder arc; a pour is a held tilt. Same channel,
      // different curve, so one number drives both.
      const curve = A.useKind === 'pour'
        ? -1.3 - Math.sin(Math.min(1, u) * Math.PI) * 0.3
        : -2.4 + Math.cos(u * Math.PI * 1.3) * 2.6
      parts.armR.rotation.x = curve
      parts.armL.rotation.x = curve * 0.45
      parts.foreR.rotation.x = A.useKind === 'pour' ? -0.5 : -0.8 + u * 0.6
      parts.chest.rotation.x = A.useKind === 'pour' ? 0.05 : 0.24 * (1 - u)
    } else {
      const swing = Math.sin(gait) * 0.8 * s
      parts.armL.rotation.x = swing
      parts.armR.rotation.x = -swing
      parts.armL.rotation.z = 0.08
      parts.armR.rotation.z = -0.08
      parts.foreL.rotation.x = -0.16 - Math.max(0, swing) * 0.4
      parts.foreR.rotation.x = -0.16 - Math.max(0, -swing) * 0.4
      parts.chest.rotation.x = 0
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

    // Camera-relative movement. The camera only ever sits at one of four yaws,
    // so this is a rotation and never a source of drift.
    const cos = Math.cos(camYaw)
    const sin = Math.sin(camYaw)
    const mx = input.move.x * cos - input.move.z * sin
    const mz = input.move.x * sin + input.move.z * cos
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
