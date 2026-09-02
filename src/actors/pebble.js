import * as THREE from 'three'
import { chamferBox, contactShadow, DISC, shardMat, stoneLump, stoneMat } from '../core/kit.js'
import { shardGeometry } from '../core/mark.js'
import { UI } from '../core/palette.js'
import { damp } from '../core/rng.js'
import { tones } from './rocky.js'

/**
 * PEBBLES — the small Rockies.
 *
 * ## Straight off the reference sheet
 *
 * The little one is not a shrunken adult, it is a different set of proportions,
 * and getting them wrong is the whole difference between "cute" and "a toy of
 * the big one":
 *
 *   HEAD    **Forty-five per cent of total height.** A rounded, faceted stone
 *           dome, wider than it is tall, sitting straight on the body with no
 *           neck at all.
 *   EYES    Big and ROUND — white discs with a large dark pupil filling most of
 *           them, set wide apart. Not the adult's narrow ivory ovals, and not
 *           sparkles: an earlier pass gave them four-point stars and it read as
 *           a completely different character.
 *   MOUTH   One short curved line, barely there.
 *   BODY    Small and chunky under a **black tee**, and on the tee the
 *           **magenta crystal** — the thing the whole design is for.
 *   LIMBS   Short, thick, and visibly FACETED — cut rock, four or five planes
 *           per limb, not smooth prisms.
 *   STONE   Warm tan-brown, `#a97a52`, with lighter facets and a dark outline.
 *
 * They hatch out of geodes, follow the player home, and work a job each morning.
 * Which job is `trait`; it tints the crystal and nothing else, because the
 * silhouette belongs to the character and not to the payroll.
 */

export const TRAITS = {
  waterer: { label: 'Waterer', hint: 'waters four tiles at dawn' },
  harvester: { label: 'Harvester', hint: 'lifts one ripe crop at dawn' },
  forager: { label: 'Forager', hint: 'brings back what the valley drops' },
  surveyor: { label: 'Surveyor', hint: 'reads the Loom a night further out' },
}
export const TRAIT_KEYS = Object.keys(TRAITS)

/** Names, so a pebble is somebody rather than an entity. */
export const PEBBLE_NAMES = [
  'Grit', 'Nub', 'Scree', 'Cobble', 'Flint', 'Tuff', 'Marl', 'Shale', 'Chip', 'Quartz',
  'Gravel', 'Dust', 'Slate', 'Basil', 'Nugget', 'Pumice', 'Clay', 'Ochre', 'Sand', 'Rubble',
]

const INK = new THREE.MeshBasicMaterial({
  color: new THREE.Color().setStyle(UI.ink, THREE.SRGBColorSpace),
  side: THREE.BackSide,
})

export function buildPebble({ trait = 'waterer', size = 0.5, outline = true, awake = true } = {}) {
  const T = tones('#a97a52')
  const MAT = {
    stone: stoneMat(T.stone),
    lit: stoneMat(T.lit),
    deep: stoneMat(T.deep),
    tee: stoneMat('#241f22'),
    eye: stoneMat('#f7f2ea'),
    pupil: stoneMat('#17141a'),
    mouth: stoneMat('#5a3f2a'),
    crystal: shardMat(),
  }

  const root = new THREE.Group()
  root.name = `pebble-${trait}`
  const parts = { root, trait, materials: MAT }
  const inkW = outline ? 0.028 : 0

  const piece = (parent, geo, at, sc, mat = MAT.stone, ink = true) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(...at)
    m.scale.set(...(typeof sc === 'number' ? [sc, sc, sc] : sc))
    parent.add(m)
    if (ink && inkW) {
      const g = geo.clone()
      const pos = g.attributes.position
      const nor = g.attributes.normal
      const w = inkW / Math.max(...(typeof sc === 'number' ? [sc] : sc))
      for (let i = 0; i < pos.count; i++) {
        pos.setXYZ(i, pos.getX(i) + nor.getX(i) * w, pos.getY(i) + nor.getY(i) * w, pos.getZ(i) + nor.getZ(i) * w)
      }
      const hull = new THREE.Mesh(g, INK)
      hull.renderOrder = -1
      m.add(hull)
    }
    return m
  }

  const body = new THREE.Group()
  root.add(body)
  parts.body = body

  // --- legs ----------------------------------------------------------------
  // Short, thick, faceted. `stoneLump` gives them the cut-rock planes the
  // drawing has; a smooth prism here reads as plastic.
  for (const side of [-1, 1]) {
    const leg = new THREE.Group()
    leg.position.set(side * 0.16, 0.3, 0)
    body.add(leg)
    parts[side < 0 ? 'legL' : 'legR'] = leg
    piece(leg, stoneLump(side < 0 ? 11 : 23, { radius: 0.5, height: 0.9, jitter: 0.26, sides: 5 }), [0, -0.15, 0], [0.28, 0.38, 0.28], MAT.stone)
    piece(leg, chamferBox(0.3, 0.13, 0.34, 0.04), [0, -0.33, 0.04], 1, MAT.deep)
  }

  // --- torso, tee, crystal --------------------------------------------------
  const torso = new THREE.Group()
  torso.position.set(0, 0.3, 0)
  body.add(torso)
  parts.torso = torso
  piece(torso, stoneLump(7, { radius: 0.5, height: 0.9, jitter: 0.18, sides: 6 }), [0, 0.15, 0], [0.5, 0.42, 0.45], MAT.stone)
  // The black tee, as a slightly larger shell over the torso.
  piece(torso, chamferBox(0.52, 0.38, 0.45, 0.05), [0, 0.16, 0], 1, MAT.tee)

  // THE CRYSTAL. This is what the whole design exists to carry.
  const crystal = new THREE.Mesh(shardGeometry(), MAT.crystal)
  crystal.position.set(0, 0.17, 0.235)
  crystal.scale.set(0.22, 0.27, 0.12)
  torso.add(crystal)
  parts.crystal = crystal

  // --- arms -----------------------------------------------------------------
  for (const side of [-1, 1]) {
    const arm = new THREE.Group()
    arm.position.set(side * 0.35, 0.46, 0.03)
    body.add(arm)
    parts[side < 0 ? 'armL' : 'armR'] = arm
    piece(arm, stoneLump(side < 0 ? 31 : 47, { radius: 0.5, height: 0.9, jitter: 0.28, sides: 5 }), [0, -0.12, 0], [0.24, 0.3, 0.24], MAT.lit)
    piece(arm, stoneLump(side < 0 ? 53 : 61, { radius: 0.5, height: 0.8, jitter: 0.22, sides: 5 }), [0, -0.3, 0], [0.22, 0.2, 0.22], MAT.stone)
  }

  // --- the head -------------------------------------------------------------
  // Forty-five per cent of the figure, and wider than it is tall.
  const head = new THREE.Group()
  head.position.set(0, 0.64, 0)
  body.add(head)
  parts.head = head
  piece(head, stoneLump(3, { radius: 0.5, height: 0.86, jitter: 0.14, sides: 7 }), [0, 0.18, 0], [0.74, 0.54, 0.68], MAT.stone)
  piece(head, stoneLump(5, { radius: 0.5, height: 0.7, jitter: 0.12, sides: 6 }), [0, 0.34, -0.02], [0.6, 0.28, 0.54], MAT.lit)

  for (const side of [-1, 1]) {
    // Round, wide-set, and big. A white disc with a pupil that fills most of it.
    const eye = new THREE.Mesh(DISC, MAT.eye)
    eye.position.set(side * 0.15, 0.21, 0.32)
    eye.scale.set(0.15, 0.17, 0.03)
    head.add(eye)
    parts[side < 0 ? 'eyeL' : 'eyeR'] = eye
    const pupil = new THREE.Mesh(DISC, MAT.pupil)
    pupil.position.set(side * 0.15, 0.205, 0.335)
    pupil.scale.set(0.1, 0.115, 0.03)
    head.add(pupil)
    parts[side < 0 ? 'pupilL' : 'pupilR'] = pupil
  }

  // One short line. Any more and it stops being shy about it.
  const mouth = new THREE.Mesh(chamferBox(0.16, 0.028, 0.03, 0.01), MAT.mouth)
  mouth.position.set(0, 0.085, 0.32)
  head.add(mouth)
  parts.mouth = mouth

  // The patch of shadow the body stands in. See `contactShadow` in core/kit.

  const shadow = contactShadow(0.3)

  if (shadow) root.add(shadow)

  root.scale.setScalar(size)

  const A = { t: 0, hop: 0, speed: 0, sleeping: !awake, blink: 0, nextBlink: 2 + Math.random() * 3 }
  parts.anim = A

  parts.update = (dt) => {
    A.t += dt
    if (A.sleeping) {
      const b = Math.sin(A.t * 1.1) * 0.03
      body.position.y = b * 0.4
      body.scale.set(1 + b, 1 - b * 0.6, 1 + b)
      body.rotation.z = 0
      parts.eyeL.scale.y = parts.eyeR.scale.y = 0.02
      parts.pupilL.visible = parts.pupilR.visible = false
      return
    }
    parts.pupilL.visible = parts.pupilR.visible = true

    // Pebbles hop; they do not walk. `hop` runs on its own clock so the arc is
    // the same height whether it is crossing a field or turning on the spot.
    if (A.speed > 0.05) A.hop += dt * (5.2 + A.speed * 3)
    else A.hop = damp(A.hop % (Math.PI * 2), 0, 6, dt)
    const k = Math.min(1, A.speed * 2.5)
    body.position.y = Math.abs(Math.sin(A.hop)) * 0.22 * k
    // Squash on the way down, stretch at the top. Volume is not conserved on
    // purpose — a pebble that conserves volume does not read as bouncy.
    const squash = 1 - Math.cos(A.hop * 2) * 0.07 * k
    body.scale.set(2 - squash, squash, 2 - squash)
    body.rotation.z = Math.sin(A.hop) * 0.1 * Math.min(1, A.speed)
    parts.armL.rotation.x = Math.sin(A.hop) * 0.7
    parts.armR.rotation.x = -Math.sin(A.hop) * 0.7
    parts.legL.rotation.x = -Math.sin(A.hop) * 0.4
    parts.legR.rotation.x = Math.sin(A.hop) * 0.4
    // The head lags the body by a fraction of a beat. Two lines, and it is most
    // of what makes the hop read as weight rather than as a bouncing prop.
    parts.head.rotation.x = damp(parts.head.rotation.x, Math.sin(A.hop - 0.6) * 0.12 * k, 12, dt)

    if (A.t > A.nextBlink) {
      A.blink = 1
      A.nextBlink = A.t + 2.4 + Math.random() * 3.6
    }
    A.blink = Math.max(0, A.blink - dt * 8)
    const open = 1 - A.blink * 0.92
    parts.eyeL.scale.y = parts.eyeR.scale.y = 0.19 * open
    parts.pupilL.scale.y = parts.pupilR.scale.y = 0.13 * open

    parts.crystal.rotation.z = Math.sin(A.t * 1.3) * 0.1
  }

  return parts
}
