import * as THREE from 'three'
import { chamferBox, FLAT, glowMat, shardMat, stoneMat } from '../core/kit.js'
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

/**
 * The unit mass every part of him is cut from.
 *
 * A chamfered cube scaled to size, NOT a sphere. The sheet draws him as hard
 * quarried slabs with flat planes and dark seams between them — a rebuild in
 * smooth ellipsoids had the right proportions and still read as a pile of
 * pebbles, because the angularity IS the character.
 */
const BLOCK = chamferBox(1, 1, 1, 0.16)

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
  const inkW = outline ? 0.014 : 0

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

  /**
   * THE FIGURE, MEASURED OFF THE SHEET.
   *
   * Every number below is a fraction of total height, read from the front-on
   * cave drawing rather than remembered. Feet at 0, top of head at 1.
   *
   *   lower leg   0.000 -> 0.155   blunt rounded stump, no separate foot
   *   upper leg   0.155 -> 0.308
   *   hips        0.308 -> 0.385   a wide slab, 0.30 across
   *   waist band  0.385 -> 0.429   the dark joint ring
   *   TORSO       0.429 -> 0.846   0.47 at the shoulders, 0.37 deep
   *   head        0.846 -> 1.000   0.253 wide, 0.154 tall, sitting ON the torso
   *
   * Width across the shoulders including the arm masses is 0.78 of the height.
   * He is SQUAT: a bit over three head-heights, and nearly as wide as he is tall.
   *
   * ## What the previous cut got wrong
   *
   * It was a different character. A trapezoidal chest, enormous flaring
   * pauldrons, a projecting visor brow, big mitts with thumbs, and feet that
   * stuck forward. None of that is on the sheet. What is on the sheet:
   *
   *   - The torso is a ROUNDED BARREL, faceted — not a box and not a trapezoid.
   *     It is the dominant mass, two fifths of his whole height.
   *   - There is NO NECK and no collar. The head sits straight on the torso.
   *   - The arms are rounded capsules hanging off the top outside corners of the
   *     torso, and they end in BLUNT STUMPS. He has no hands and no fingers.
   *   - The legs are short rounded capsules ending in blunt stumps. No feet.
   *   - The eyes are two tiny white SLITS set wide and high, not big ovals, and
   *     there is no brow over them.
   *
   * Every mass here is a low-poly sphere scaled into an ellipsoid, which gives
   * the faceted rounded stone of the drawings for free under `flatShading` —
   * and, incidentally, sidesteps the rig rule entirely, because a sphere has no
   * prism axis to get wrong.
   */
  const body = pivot(root, [0, 0, 0], 'body')

  // --- hips ------------------------------------------------------------------
  plate(body, { geo: BLOCK, at: [0, 0.347, 0], size: [0.3, 0.1, 0.24], mat: MAT.deep })
  // The waist band. One dark ring, and it is what makes the torso read as a
  // separate quarried mass sitting on the hips rather than one carved lump.
  plate(body, { geo: BLOCK, at: [0, 0.407, 0], size: [0.26, 0.05, 0.21], mat: MAT.joint, ink: false })

  // --- the torso -------------------------------------------------------------
  const chestG = pivot(body, [0, 0.429, 0], 'chest')
  // One big faceted barrel. Its centre sits low so the mass reads as bottom
  // heavy, which is what the drawing does.
  plate(chestG, { geo: BLOCK, at: [0, 0.17, 0], size: [0.50, 0.40, 0.385], mat: MAT.stone })
  // A lighter cap across the top, so the shoulder line catches the sun and the
  // barrel does not read as one flat blob.
  plate(chestG, { geo: BLOCK, at: [0, 0.315, -0.015], size: [0.34, 0.10, 0.26], mat: MAT.lit })

  // ------------------------------------------------------------ the badge --
  // Set INTO a cut recess, never laid on top. The recess is the whole difference
  // between a gem and a sticker.
  plate(chestG, { geo: FLAT, at: [0, 0.215, 0.176], size: [0.15, 0.15, 0.025], mat: MAT.stone, ink: false })
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
    mark.scale.setScalar(0.155)
    chestG.add(mark)
    parts.badge = mark
  }

  // The collar. The same band at the waist reads as a belt; up under the jaw it
  // reads as a collar, and the collar is what says "assembled from plates".
  plate(chestG, { geo: FLAT, at: [0, 0.243, 0.005], size: [0.17, 0.035, 0.17], mat: MAT.joint, ink: false })


  // ----------------------------------------------------------------- head --
  //
  // Straight on the torso. There is no neck on the sheet, and adding one is the
  // fastest way to turn a golem into a robot.
  const head = pivot(chestG, [0, 0.445, 0], 'head')
  plate(head, { geo: chamferBox(0.26, 0.175, 0.235, 0.05), at: [0, 0.088, 0], size: [1, 1, 1], mat: MAT.stone })
  // No second plate on the crown. One was there for faceting and its corners
  // poked through the chamfered box below as pale slivers; `flatShading` on the
  // chamfer already gives the head the cut planes the drawing has.

  for (const side of [-1, 1]) {
    /**
     * The eyes are SLITS. Two of them, tiny, set wide and high.
     *
     * On the sheet they are a couple of pixels of white on a brown face — no
     * pupil, no socket, no brow above them. The previous cut had big ivory ovals
     * under a projecting visor, which is a different character's face and it is
     * most of why he did not read as the drawing.
     */
    const eye = new THREE.Mesh(FLAT, MAT.eye)
    eye.position.set(side * 0.05, 0.088, 0.122)
    eye.scale.set(0.024, 0.013, 0.012)
    head.add(eye)
    parts[side < 0 ? 'eyeL' : 'eyeR'] = eye

    // The lid: a plate of head-stone that drops over the eye to blink.
    const lid = new THREE.Mesh(FLAT, MAT.stone)
    lid.position.set(side * 0.05, 0.104, 0.125)
    lid.scale.set(0.03, 0.001, 0.014)
    head.add(lid)
    parts[side < 0 ? 'lidL' : 'lidR'] = lid
  }

  // ----------------------------------------------------------------- arms --
  for (const side of [-1, 1]) {
    const L = side < 0 ? 'L' : 'R'
    /**
     * Rounded capsules off the top outside corner of the barrel.
     *
     * No pauldron. The shoulder on the sheet is a small rounded lump sitting
     * just outside the torso, and the arm hangs straight off it — which is what
     * makes his outline read as a barrel with two sausages either side rather
     * than as armour.
     */
    plate(chestG, { geo: BLOCK, at: [side * 0.252, 0.225, 0], size: [0.15, 0.145, 0.15], mat: MAT.lit })

    const upper = pivot(chestG, [side * 0.262, 0.185, 0], `arm${L}`)
    plate(upper, { geo: BLOCK, at: [0, -0.085, 0], size: [0.108, 0.21, 0.108], mat: MAT.stone })

    const lower = pivot(upper, [0, -0.175, 0], `fore${L}`)
    plate(lower, { geo: BLOCK, at: [0, -0.09, 0], size: [0.112, 0.215, 0.112], mat: MAT.lit })

    /**
     * And it ends there. A blunt rounded stump, no hand.
     *
     * He has no fingers anywhere on the sheet — every drawing that has him
     * carrying something has it wedged against the end of the arm. `hand` and
     * `hold` stay as pivot names so the animation and anything he picks up still
     * have somewhere to attach.
     */
    const hand = pivot(lower, [0, -0.185, 0], `hand${L}`)
    plate(hand, { geo: BLOCK, at: [0, -0.045, 0], size: [0.125, 0.115, 0.122], mat: MAT.stone })
    const socket = pivot(hand, [0, -0.05, 0.05], `hold${L}`)
    socket.rotation.x = -0.3
  }

  // ----------------------------------------------------------------- legs --
  for (const side of [-1, 1]) {
    const L = side < 0 ? 'L' : 'R'
    // Short, thick and splayed a little, straight out of the hip slab.
    const thigh = pivot(body, [side * 0.095, 0.318, 0], `thigh${L}`)
    plate(thigh, { geo: BLOCK, at: [0, -0.075, 0], size: [0.148, 0.185, 0.15], mat: MAT.stone })

    const shin = pivot(thigh, [0, -0.155, 0], `shin${L}`)
    plate(shin, { geo: BLOCK, at: [0, -0.07, 0], size: [0.14, 0.175, 0.142], mat: MAT.lit })

    // A blunt rounded end, not a foot. Nothing on the sheet projects forward.
    const foot = pivot(shin, [0, -0.135, 0], `foot${L}`)
    plate(foot, { geo: BLOCK, at: [0, -0.028, 0.006], size: [0.15, 0.09, 0.155], mat: MAT.stone })
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
    parts.lidL.position.y = 0.142 - lidDrop
    parts.lidR.position.y = 0.142 - lidDrop

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
