import * as THREE from 'three'
import { chamferBox, FLAT, glowMat, POINT, shardMat, stoneMat, TAPER } from '../core/kit.js'
import { shardGeometry } from '../core/mark.js'
import { UI } from '../core/palette.js'
import { damp } from '../core/rng.js'
import { tones } from './rocky.js'

/**
 * PEBBLES — the mini Rockies.
 *
 * The sixth reference drawing is the whole brief: a tiny rounded stone sitting
 * in a lotus, two sparkles for eyes, one small smile, no neck, no legs to speak
 * of. It is Rocky reduced until only the head is left, and that reduction is
 * exactly what makes it read as his young rather than as a different creature —
 * so the pebble is built from Rocky's own head numbers, scaled, with the brow
 * kept and everything below the collar thrown away.
 *
 * They hatch out of geodes along the fault, follow the player home, and work a
 * job each morning. Which job is `trait`; it changes the badge on the pebble's
 * back and nothing else, because a worker you can only tell apart by reading a
 * tooltip is a worker you will never form an opinion about.
 */

export const TRAITS = {
  waterer: { label: 'Waterer', stone: '#8e6a4e', hint: 'waters four tiles at dawn' },
  harvester: { label: 'Harvester', stone: '#a4653f', hint: 'lifts one ripe crop at dawn' },
  forager: { label: 'Forager', stone: '#7f6a4a', hint: 'brings back what the valley drops' },
  surveyor: { label: 'Surveyor', stone: '#b08050', hint: 'reads the fault a day further out' },
}
export const TRAIT_KEYS = Object.keys(TRAITS)

/** Names, so a pebble is somebody rather than an entity. Drawn in order from a
 *  seeded stream, so the same valley hatches the same names. */
export const PEBBLE_NAMES = [
  'Grit', 'Nub', 'Scree', 'Cobble', 'Flint', 'Tuff', 'Marl', 'Shale', 'Chip', 'Quartz',
  'Gravel', 'Dust', 'Slate', 'Basil', 'Nugget', 'Pumice', 'Clay', 'Ochre', 'Sand', 'Rubble',
]

const INK = new THREE.MeshBasicMaterial({ color: new THREE.Color().setStyle(UI.ink, THREE.SRGBColorSpace), side: THREE.BackSide })

/** A four-point sparkle, flat, facing +Z. The reference draws the eyes as stars
 *  rather than dots and that single choice is most of the charm — a dot-eyed
 *  pebble reads as a rock with a face painted on. */
const SPARKLE = (() => {
  const s = new THREE.Shape()
  const pts = []
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2
    const r = i % 2 === 0 ? 0.5 : 0.13
    pts.push([Math.cos(a) * r, Math.sin(a) * r])
  }
  s.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1])
  s.closePath()
  const geo = new THREE.ShapeGeometry(s)
  geo.center()
  return geo
})()

export function buildPebble({ trait = 'waterer', size = 0.42, outline = true, awake = true } = {}) {
  const spec = TRAITS[trait] ?? TRAITS.waterer
  const T = tones(spec.stone)
  const MAT = {
    stone: stoneMat(T.stone),
    lit: stoneMat(T.lit),
    deep: stoneMat(T.deep),
    joint: stoneMat(UI.ink),
    eye: glowMat(UI.cream, 1.2),
    shard: shardMat(),
  }

  const root = new THREE.Group()
  root.name = `pebble-${trait}`
  const parts = { root, trait, materials: MAT }
  const inkW = outline ? 0.03 : 0

  const plate = (parent, geo, at, sc, mat = MAT.stone, ink = true) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(...at)
    m.scale.set(...(typeof sc === 'number' ? [sc, sc, sc] : sc))
    m.castShadow = true
    m.receiveShadow = true
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
    parent.add(m)
    return m
  }

  // Body: Rocky's head, and only Rocky's head. Same three plates, same brow.
  const body = new THREE.Group()
  root.add(body)
  parts.body = body

  plate(body, POINT, [0, 0.24, 0], [0.68, 0.3, 0.62], MAT.stone)
  plate(body, FLAT, [0, 0.5, 0], [0.76, 0.3, 0.7], MAT.lit)
  plate(body, POINT, [0, 0.71, -0.02], [0.58, 0.22, 0.54], MAT.lit)
  // The brow. Kept at full weight even though the body shrank — it is the one
  // feature that has to survive the reduction.
  plate(body, FLAT, [0, 0.6, 0.29], [0.72, 0.16, 0.3], MAT.deep)
  plate(body, FLAT, [0, 0.44, 0.33], [0.6, 0.2, 0.08], MAT.joint, false)

  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(SPARKLE, MAT.eye)
    eye.position.set(side * 0.15, 0.45, 0.375)
    eye.scale.setScalar(0.22)
    body.add(eye)
    parts[side < 0 ? 'eyeL' : 'eyeR'] = eye
    // Stubby arms. Two plates each; a pebble with articulated arms stops being
    // a pebble.
    const arm = new THREE.Group()
    arm.position.set(side * 0.36, 0.34, 0.05)
    body.add(arm)
    parts[side < 0 ? 'armL' : 'armR'] = arm
    plate(arm, TAPER, [0, -0.09, 0], [0.15, 0.22, 0.15], MAT.stone)
    plate(arm, chamferBox(0.17, 0.15, 0.15, 0.04), [0, -0.24, 0], 1, MAT.lit)
  }

  const mouth = new THREE.Mesh(FLAT, MAT.joint)
  mouth.position.set(0, 0.31, 0.33)
  mouth.scale.set(0.18, 0.045, 0.06)
  body.add(mouth)
  parts.mouth = mouth

  // Feet: two chips, not legs. They plant when it lands and that is all.
  for (const side of [-1, 1]) {
    plate(body, chamferBox(0.26, 0.12, 0.3, 0.045), [side * 0.17, 0.06, 0.04], 1, MAT.deep)
  }

  // The trait badge, on the back, so a pebble walking away from you still tells
  // you what it does.
  const badge = new THREE.Mesh(shardGeometry(), MAT.shard)
  badge.position.set(0, 0.48, -0.33)
  badge.scale.set(0.16, 0.2, 0.1)
  badge.rotation.y = Math.PI
  body.add(badge)
  parts.badge = badge

  root.scale.setScalar(size)

  const A = { t: 0, hop: 0, speed: 0, sleeping: !awake, blink: 0, nextBlink: 2 + Math.random() * 3 }
  parts.anim = A

  parts.update = (dt) => {
    A.t += dt
    if (A.sleeping) {
      // Asleep: the lotus pose from the reference. Breathing only.
      const b = Math.sin(A.t * 1.1) * 0.03
      body.position.y = b * 0.4
      body.scale.set(1 + b, 1 - b * 0.6, 1 + b)
      body.rotation.z = 0
      parts.eyeL.scale.set(0.22, 0.03, 0.22)
      parts.eyeR.scale.set(0.22, 0.03, 0.22)
      return
    }
    parts.eyeL.scale.setScalar(0.22)
    parts.eyeR.scale.setScalar(0.22)

    // Pebbles hop; they do not walk. `hop` runs on its own clock so the arc is
    // the same height whether it is crossing a field or turning on the spot.
    if (A.speed > 0.05) A.hop += dt * (5.2 + A.speed * 3)
    else A.hop = damp(A.hop % (Math.PI * 2), 0, 6, dt)
    const arc = Math.abs(Math.sin(A.hop))
    body.position.y = arc * 0.24 * Math.min(1, A.speed * 2.5)
    // Squash on the way down, stretch at the top. Volume is not conserved on
    // purpose — a pebble that conserves volume does not read as bouncy.
    const squash = 1 - Math.cos(A.hop * 2) * 0.06 * Math.min(1, A.speed * 2.5)
    body.scale.set(2 - squash, squash, 2 - squash)
    body.rotation.z = Math.sin(A.hop) * 0.12 * Math.min(1, A.speed)
    parts.armL.rotation.x = Math.sin(A.hop) * 0.6
    parts.armR.rotation.x = -Math.sin(A.hop) * 0.6

    if (A.t > A.nextBlink) {
      A.blink = 1
      A.nextBlink = A.t + 2.4 + Math.random() * 3.6
    }
    A.blink = Math.max(0, A.blink - dt * 8)
    const k = 0.22 * (1 - A.blink * 0.85)
    parts.eyeL.scale.set(0.22, k, 0.22)
    parts.eyeR.scale.set(0.22, k, 0.22)

    parts.badge.rotation.z = Math.sin(A.t * 1.3) * 0.14
  }

  return parts
}
