import * as THREE from 'three'
import { BALL, chamferBox, COLUMN, DISC, FLAT, FLARE, glowMat, POINT, shardMat, stoneMat, TAPER } from '../core/kit.js'
import { markFlatGeometry, shardGeometry } from '../core/mark.js'
import { mix, shade, sunlit, UI } from '../core/palette.js'
import { damp } from '../core/rng.js'

/**
 * ROCKY — the mascot, rebuilt in code from the reference sheet.
 *
 * ## What the reference actually says
 *
 * Six drawings: on the ridge with the flag, holding a bouquet, arms up on a
 * headland, working a heavy bag, pressing two crystal dumbbells, and one tiny
 * one asleep in a lotus. Read as a set rather than one at a time, they agree on
 * a small number of things, and those things — not the poses — are Rocky:
 *
 *   SILHOUETTE   stocky, about four and a half heads. Wide trapezoidal chest,
 *                narrow waist, short thick legs, oversized mitts. No neck to
 *                speak of, but a visible dark collar where one would be.
 *   HEAD         a hexagonal cap with a brow that projects forward like a
 *                visor, and the eyes set back UNDER it. That overhang is the
 *                single most identifying feature he has; a head without it
 *                reads as a generic robot no matter what else is right.
 *   EYES         two ivory ovals that emit rather than reflect. Wider than
 *                tall. Never spherical — a sphere set into a head bulges out of
 *                it and reads as a googly eye stuck on.
 *   CHEST        an inset panel carrying the brand. Two versions exist in the
 *                reference and BOTH are canon, which is why `chest` is a
 *                parameter here: the incised double-crescent mark, and the rose
 *                shard set into a recess.
 *   JOINTS       near-black bands at neck, waist, shoulders, elbows and knees.
 *                They are what make him read as an assembly of quarried plates
 *                rather than one carved lump.
 *   FACETS       every plate shows two or three tonal planes. The three tones
 *                are DERIVED from one stone colour below, not picked by hand,
 *                so no combination can ever end up with a highlight darker than
 *                its own shadow.
 *   LINE         a heavy dark outline around the whole figure. That is a
 *                drawing convention, not lighting, so it is reproduced as an
 *                inverted hull rather than approximated with a rim term.
 *
 * ## The trap
 *
 * three composes `T * R * S`, so scale is applied BEFORE rotation. Slabs get a
 * Z-axis geometry (FLAT/POINT) and are never rotated; limbs get a Y-axis one
 * (COLUMN/TAPER) and are never rotated. No mesh in this file takes a rotation
 * prop for that reason, and tools/checks.js fails the build if one appears.
 *
 * Everything below is authored in a UNIT rig — 1.0 tall, feet at y = 0 — and
 * scaled at the end. That way a pebble, a villager-sized Rocky and the giant at
 * the gate are the same numbers times a different constant.
 */

/** The three stone tones, derived from one colour. */
export function tones(stone) {
  return {
    stone,
    lit: sunlit(mix(stone, UI.stonePale, 0.28), 0.55),
    deep: shade(mix(stone, UI.stoneShadow, 0.22), 0.7),
  }
}

/** Named cuts. `stone` is what he is quarried from; nothing else changes. */
export const ROCKY_CUTS = {
  // Warm tan-brown, the colour of the whole reference sheet — closer to cut
  // sandstone than to rust. An earlier pass had him a full step too red.
  rocky: { stone: '#a97a52', trim: UI.creamDeep, eye: UI.cream },
  cairn: { stone: '#8d6a4c', trim: UI.creamWarm, eye: UI.cream },
  ember: { stone: '#b98a58', trim: UI.creamDeep, eye: '#ffe6bd' },
  sand: { stone: '#c39a70', trim: UI.stoneDeep, eye: UI.cream },
  basalt: { stone: '#7d5636', trim: UI.creamDeep, eye: UI.cream },
}

const INK = new THREE.MeshBasicMaterial({ color: new THREE.Color().setStyle(UI.ink, THREE.SRGBColorSpace), side: THREE.BackSide })

/**
 * The drawn line, as geometry.
 *
 * An inverted hull: the same shape, scaled up a hair, with only its back faces
 * drawn. Every silhouette edge therefore gets a band of ink and every interior
 * face stays clean — which is exactly what the reference's brush does.
 *
 * Scaling the MESH is wrong for anything non-spherical (a thin plate's outline
 * goes thick on its long axis and invisible on its short one), so the hull is
 * built by pushing vertices along their own normals instead.
 */
function inkHull(geometry, width) {
  const g = geometry.clone()
  const pos = g.attributes.position
  const nor = g.attributes.normal
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(
      i,
      pos.getX(i) + nor.getX(i) * width,
      pos.getY(i) + nor.getY(i) * width,
      pos.getZ(i) + nor.getZ(i) * width,
    )
  }
  pos.needsUpdate = true
  g.computeBoundingSphere()
  return g
}

/**
 * Build Rocky.
 *
 * @param cut     a key of ROCKY_CUTS, or an object of the same shape
 * @param chest   'mark' (the incised double-crescent) or 'shard' (the rose stone)
 * @param height  world units, feet to crown
 * @param outline draw the ink hull. On for anything the player will stand next
 *                to; off for a figure in the middle distance, where the hull
 *                doubles the draw calls to add a line nobody can resolve.
 */
export function buildRocky({ cut = 'rocky', chest = 'mark', height = 1.9, outline = true } = {}) {
  const look = typeof cut === 'string' ? (ROCKY_CUTS[cut] ?? ROCKY_CUTS.rocky) : cut
  const T = tones(look.stone)

  const MAT = {
    stone: stoneMat(T.stone),
    lit: stoneMat(T.lit),
    deep: stoneMat(T.deep),
    joint: stoneMat(UI.ink, { flatShading: true }),
    trim: stoneMat(look.trim),
    eye: glowMat(look.eye, 1.15),
    // Inlay, not a lamp. In the reference the mark is CUT into the plate and
    // catches the light like the stone around it; an emissive mark turns the
    // chest into a torch and pulls every eye off his face.
    mark: stoneMat(UI.creamShade),
    shard: shardMat(),
  }

  const root = new THREE.Group()
  root.name = 'rocky'
  const parts = { root, materials: MAT }
  // Outline width is a fraction of the figure so a pebble and the gate golem
  // carry the same weight of line, which is what a drawn set does.
  const inkW = outline ? 0.022 : 0

  /** One plate. `geo` defaults to the slab prism; limbs pass a Y-axis one. */
  const plate = (parent, { geo = FLAT, at = [0, 0, 0], size = [1, 1, 1], mat = MAT.stone, ink = true, name }) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(...at)
    m.scale.set(...size)
    m.castShadow = true
    m.receiveShadow = true
    if (name) m.name = name
    if (ink && inkW) {
      // The hull is a CHILD, so it inherits the plate's animation for free and
      // there is never a frame where the line and the plate disagree.
      const hull = new THREE.Mesh(inkHull(geo, inkW / Math.max(...size)), INK)
      hull.renderOrder = -1
      m.add(hull)
    }
    parent.add(m)
    return m
  }
  /** A pivot: an empty the animation drives, with plates hung off it. */
  const pivot = (parent, at, key) => {
    const g = new THREE.Group()
    g.position.set(...at)
    parent.add(g)
    if (key) parts[key] = g
    return g
  }

  // ---------------------------------------------------------------- torso --
  //
  // Every number below is a fraction of total height, read off the reference:
  //
  //   head        0.79 → 1.00   (0.20 tall, 0.21 wide — as wide as it is tall)
  //   collar      0.775 → 0.80
  //   chest       0.545 → 0.775 (shoulder line at 0.735, span 0.46)
  //   waist band  0.50 → 0.545  (0.26 wide — the pinch that makes the flare read)
  //   pelvis      0.43 → 0.51
  //   thigh       0.27 → 0.45
  //   shin        0.075 → 0.27
  //   foot        0.00 → 0.075, projecting 0.13 forward
  //
  // The first cut had the chest at 0.58 wide and the head 0.10 tall, and the
  // result was a filing cabinet wearing a dinner plate. Width is not the thing
  // that makes him look heavy — the WAIST PINCH is.
  const body = pivot(root, [0, 0, 0], 'body')

  plate(body, { geo: POINT, at: [0, 0.465, 0], size: [0.235, 0.085, 0.185], mat: MAT.deep })
  plate(body, { geo: POINT, at: [0, 0.522, 0], size: [0.2, 0.045, 0.15], mat: MAT.joint, ink: false })

  const chestG = pivot(body, [0, 0.545, 0], 'chest')
  plate(chestG, { geo: POINT, at: [0, 0.05, 0], size: [0.28, 0.1, 0.21], mat: MAT.stone })
  plate(chestG, { geo: FLAT, at: [0, 0.145, 0.005], size: [0.4, 0.13, 0.26], mat: MAT.lit })
  // The shoulder yoke: the widest plate on the figure, and the top of the flare.
  plate(chestG, { geo: FLAT, at: [0, 0.208, -0.005], size: [0.42, 0.085, 0.25], mat: MAT.stone })

  // ------------------------------------------------------------ the badge --
  // Set INTO a cut recess, never laid on top. The recess is the whole difference
  // between a gem and a sticker.
  plate(chestG, { geo: FLAT, at: [0, 0.15, 0.128], size: [0.17, 0.105, 0.025], mat: MAT.stone, ink: false })
  if (chest === 'shard') {
    const shard = new THREE.Mesh(shardGeometry(), MAT.shard)
    shard.position.set(0, 0.15, 0.15)
    shard.scale.set(0.075, 0.095, 0.065)
    shard.castShadow = true
    chestG.add(shard)
    parts.badge = shard
  } else {
    const mark = new THREE.Mesh(markFlatGeometry(), MAT.mark)
    mark.position.set(0, 0.15, 0.143)
    // Uniform: the mark has its own aspect and squashing it to fit a recess is
    // how a logo stops being the logo.
    mark.scale.setScalar(0.115)
    chestG.add(mark)
    parts.badge = mark
  }

  // The collar. The same band at the waist reads as a belt; up under the jaw it
  // reads as a collar, and the collar is what says "assembled from plates".
  plate(chestG, { geo: FLAT, at: [0, 0.243, 0.005], size: [0.17, 0.035, 0.17], mat: MAT.joint, ink: false })

  // ----------------------------------------------------------------- head --
  const head = pivot(chestG, [0, 0.262, 0], 'head')
  plate(head, { geo: POINT, at: [0, 0.04, 0], size: [0.185, 0.075, 0.175], mat: MAT.stone })
  plate(head, { geo: FLAT, at: [0, 0.105, 0], size: [0.205, 0.075, 0.19], mat: MAT.lit })
  // The crown facet — a smaller plate on top, which is what turns a box into a
  // carved cap.
  plate(head, { geo: POINT, at: [0, 0.163, -0.005], size: [0.155, 0.055, 0.145], mat: MAT.lit })
  // THE BROW. It projects forward and the eyes sit back UNDER it. This overhang
  // is Rocky; everything else about the head is negotiable.
  plate(head, { geo: FLAT, at: [0, 0.126, 0.072], size: [0.195, 0.042, 0.08], mat: MAT.deep })
  // The visor recess the eyes are set into.
  plate(head, { geo: FLAT, at: [0, 0.082, 0.086], size: [0.165, 0.055, 0.022], mat: MAT.joint, ink: false })

  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(DISC, MAT.eye)
    eye.position.set(side * 0.04, 0.085, 0.098)
    eye.scale.set(0.038, 0.03, 0.014)
    head.add(eye)
    parts[side < 0 ? 'eyeL' : 'eyeR'] = eye
    // The lid: a plate of head-stone that drops over the eye to blink. Cheaper
    // and far more legible than scaling the eye, which just makes it a slot.
    const lid = new THREE.Mesh(FLAT, MAT.deep)
    lid.position.set(side * 0.04, 0.118, 0.1)
    lid.scale.set(0.046, 0.038, 0.012)
    head.add(lid)
    parts[side < 0 ? 'lidL' : 'lidR'] = lid
  }
  // The mouth: one dark bar. In the reference it is barely a line, and any more
  // than that turns him from a stone that is pleased into a cartoon that grins.
  const mouth = new THREE.Mesh(FLAT, MAT.joint)
  mouth.position.set(0, 0.044, 0.09)
  mouth.scale.set(0.048, 0.011, 0.016)
  head.add(mouth)
  parts.mouth = mouth

  // ----------------------------------------------------------------- arms --
  for (const side of [-1, 1]) {
    const L = side < 0 ? 'L' : 'R'
    // Shoulder cap, parented to the body rather than the arm so it does not
    // swing — a pauldron that swings is a pauldron that leaves a hole.
    plate(chestG, { geo: BALL, at: [side * 0.178, 0.198, 0], size: [0.115, 0.115, 0.115], mat: MAT.stone })
    plate(chestG, { geo: FLAT, at: [side * 0.182, 0.198, 0], size: [0.1, 0.035, 0.1], mat: MAT.joint, ink: false })

    const upper = pivot(chestG, [side * 0.178, 0.188, 0], `arm${L}`)
    plate(upper, { geo: TAPER, at: [0, -0.075, 0], size: [0.1, 0.17, 0.1], mat: MAT.stone })
    plate(upper, { geo: FLAT, at: [0, -0.168, 0], size: [0.085, 0.028, 0.085], mat: MAT.joint, ink: false })

    const lower = pivot(upper, [0, -0.175, 0], `fore${L}`)
    // The forearm is the THICKEST part of the arm and it widens toward the
    // wrist. That inversion is most of what makes him read as heavy rather than
    // as a mannequin.
    plate(lower, { geo: FLARE, at: [0, -0.09, 0], size: [0.11, 0.19, 0.11], mat: MAT.lit })

    const hand = pivot(lower, [0, -0.2, 0], `hand${L}`)
    plate(hand, { geo: chamferBox(0.132, 0.128, 0.128, 0.035), at: [0, -0.05, 0], size: [1, 1, 1], mat: MAT.stone })
    // The thumb ridge. One plate; it is the difference between a mitt that can
    // hold a bouquet and a mitt that is a brick.
    plate(hand, { geo: COLUMN, at: [side * -0.058, -0.032, 0.036], size: [0.038, 0.075, 0.038], mat: MAT.lit })
    // Where anything he carries gets parented.
    const socket = pivot(hand, [0, -0.06, 0.06], `hold${L}`)
    socket.rotation.x = -0.3
  }

  // ----------------------------------------------------------------- legs --
  for (const side of [-1, 1]) {
    const L = side < 0 ? 'L' : 'R'
    const thigh = pivot(body, [side * 0.085, 0.45, 0], `thigh${L}`)
    plate(thigh, { geo: COLUMN, at: [0, -0.075, 0], size: [0.135, 0.17, 0.145], mat: MAT.stone })
    plate(thigh, { geo: FLAT, at: [0, -0.165, 0], size: [0.115, 0.035, 0.12], mat: MAT.joint, ink: false })

    const shin = pivot(thigh, [0, -0.175, 0], `shin${L}`)
    plate(shin, { geo: COLUMN, at: [0, -0.085, 0], size: [0.125, 0.175, 0.135], mat: MAT.lit })
    // The knee plate, on the shin so it leads the bend.
    plate(shin, { geo: FLAT, at: [0, -0.03, 0.055], size: [0.105, 0.075, 0.045], mat: MAT.deep })

    const foot = pivot(shin, [0, -0.185, 0], `foot${L}`)
    // Feet project FORWARD. A foot centred under the ankle makes any biped look
    // like it is about to fall over backwards.
    plate(foot, { geo: chamferBox(0.165, 0.085, 0.23, 0.035), at: [0, -0.045, 0.04], size: [1, 1, 1], mat: MAT.stone })
    plate(foot, { geo: chamferBox(0.15, 0.055, 0.09, 0.028), at: [0, 0.005, 0.085], size: [1, 1, 1], mat: MAT.lit })
  }

  root.scale.setScalar(height)
  parts.height = height

  // ------------------------------------------------------------ animation --
  const A = {
    t: 0,
    blink: 0,
    nextBlink: 1.6 + Math.random() * 3,
    pose: 'idle',
    speed: 0, // 0..1, drives the walk cycle's amplitude
    lookAt: null,
    // Damped channels, so a change of pose is a move rather than a cut.
    armSwing: 0, elbow: 0, lean: 0, headYaw: 0, headPitch: 0,
  }
  parts.anim = A

  const rest = {
    // The arms hang CLEAR of the hips. At a smaller spread the mitts land
    // inside the pelvis and the whole midsection reads as one wide blob with no
    // legs under it — which is what the first three cuts of this rig did.
    armL: [0, 0, 0.26], armR: [0, 0, -0.26],
    foreL: [0, 0, 0.07], foreR: [0, 0, -0.07],
  }

  parts.update = (dt) => {
    A.t += dt
    const t = A.t
    const walking = A.speed > 0.02

    // Breath. Even standing still, a stone that never moves is a prop.
    const breath = Math.sin(t * 1.5) * 0.006
    parts.chest.position.y = 0.545 + breath
    parts.chest.scale.setScalar(1 + breath * 0.35)

    // Blink on its own clock so it keeps happening under every other pose.
    if (t > A.nextBlink) {
      A.blink = 1
      A.nextBlink = t + 2.2 + Math.random() * 3.4
    }
    A.blink = Math.max(0, A.blink - dt * 7)
    const lidDrop = A.blink * 0.058
    parts.lidL.position.y = 0.118 - lidDrop
    parts.lidR.position.y = 0.118 - lidDrop

    // Targets per pose. Nothing is assigned directly — everything is damped
    // toward these, which is what stops a pose change from snapping.
    let armSwing = 0, elbow = 0, lean = 0, armLift = 0, spread = 0
    switch (A.pose) {
      case 'wave': elbow = -0.4; break
      case 'cheer': armLift = -2.5; spread = 0.5; break
      case 'guard': armLift = -1.15; elbow = -1.5; lean = 0.1; break
      case 'lift': armLift = -2.6; elbow = -1.2; break
      case 'work': armLift = -0.5; elbow = -0.9; lean = 0.16; break
      default: break
    }

    A.armSwing = damp(A.armSwing, armSwing, 8, dt)
    A.elbow = damp(A.elbow, elbow, 8, dt)
    A.lean = damp(A.lean, lean, 6, dt)
    A._lift = damp(A._lift ?? 0, armLift, 7, dt)
    A._spread = damp(A._spread ?? 0, spread, 7, dt)

    // Walk. Legs on a sine, arms on the opposite phase, and a small vertical
    // bob at DOUBLE the stride frequency — the bob peaks twice per stride, once
    // per foot, and getting that wrong is what makes a walk look like a limp.
    const gait = t * 6.4
    const s = A.speed
    parts.thighL.rotation.x = Math.sin(gait) * 0.55 * s
    parts.thighR.rotation.x = -Math.sin(gait) * 0.55 * s
    parts.shinL.rotation.x = Math.max(0, -Math.sin(gait - 0.7)) * 0.8 * s
    parts.shinR.rotation.x = Math.max(0, Math.sin(gait - 0.7)) * 0.8 * s
    parts.footL.rotation.x = -parts.thighL.rotation.x * 0.4
    parts.footR.rotation.x = -parts.thighR.rotation.x * 0.4
    parts.body.position.y = Math.abs(Math.sin(gait)) * 0.035 * s

    for (const side of ['L', 'R']) {
      const k = side === 'L' ? -1 : 1
      const arm = parts[`arm${side}`]
      const fore = parts[`fore${side}`]
      const swing = (side === 'L' ? -1 : 1) * Math.sin(gait) * 0.7 * s
      // A wave is ONE arm. Both arms up is a cheer, and the difference between
      // "hello" and "hooray" is entirely which of those you play.
      // A wave is at SHOULDER height with the elbow out, not straight overhead —
      // an arm raised past vertical passes through the head and reads as a salute
      // from a mannequin.
      const solo = A.pose === 'wave' && side === 'R'
      arm.rotation.x = swing + A._lift + (solo ? -1.62 : 0)
      arm.rotation.z = rest[`arm${side}`][2] + k * A._spread + (solo ? -0.42 + Math.sin(t * 6.4) * 0.26 : 0)
      fore.rotation.x = (solo ? -0.95 : A.elbow) - Math.max(0, swing) * 0.4
      fore.rotation.z = rest[`fore${side}`][2]
    }

    parts.body.rotation.x = A.lean + (walking ? 0.06 * s : 0)

    // The head leads. It turns toward whatever it is watching before the body
    // does, which is most of what makes a character look like it has intent.
    let yaw = 0, pitch = 0
    if (A.lookAt) {
      root.worldToLocal(_v.copy(A.lookAt))
      yaw = Math.atan2(_v.x, _v.z)
      // Clamped: a head that can turn 180 degrees is an owl, not a golem.
      yaw = Math.max(-0.85, Math.min(0.85, yaw))
      pitch = Math.max(-0.4, Math.min(0.45, -Math.atan2(_v.y - 0.88, Math.hypot(_v.x, _v.z) + 0.001)))
    } else {
      yaw = Math.sin(t * 0.31) * 0.22
      pitch = Math.sin(t * 0.23 + 1.1) * 0.06
    }
    A.headYaw = damp(A.headYaw, yaw, 5, dt)
    A.headPitch = damp(A.headPitch, pitch, 5, dt)
    parts.head.rotation.y = A.headYaw
    parts.head.rotation.x = A.headPitch

    // The badge answers the light. A shard turns; an incised mark does not, so
    // only the shard gets the motion.
    if (chest === 'shard') parts.badge.rotation.z = Math.sin(t * 0.9) * 0.1
  }

  return parts
}

const _v = new THREE.Vector3()
