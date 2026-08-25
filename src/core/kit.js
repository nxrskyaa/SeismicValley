import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { M, UI } from './palette.js'

/**
 * The stone kit.
 *
 * Everything solid in Seismic Valley — Rocky, the pebbles, the cairns, the
 * buildings, the rocks in the field — is cut from the primitives in this file,
 * and that is what makes them look like they come from the same world. A golem
 * built from spheres standing next to a house built from boxes is two art
 * directions in one frame, no matter how well the colours match.
 *
 * The rule is simple and it is the Seismic rule: **six sides, corners cut at
 * 45 degrees, curves only where a thing meets the ground.**
 *
 * ## The one trap, and it has bitten every rig ever built this way
 *
 * three composes a matrix as `T * R * S`, so SCALE IS APPLIED BEFORE ROTATION.
 * A prism whose axis is Z takes its length from `scale.z` no matter how the mesh
 * is rotated afterwards. Rotate a Z-axis prism upright, pass it
 * `[width, length, depth]`, and the length silently lands in `depth` — you get a
 * squat puck where you asked for a limb, with no error anywhere.
 *
 * So the kit ships prisms in BOTH orientations and nothing that uses them is
 * ever given a rotation:
 *
 *   FLAT / POINT    axis on Z, facing the camera. scale = [w, h, thickness]
 *   COLUMN / TAPER  axis on Y, standing up.       scale = [w, LENGTH, d]
 *
 * `tools/checks.js` fails the build if a rig mesh in src/actors takes both a
 * Z-axis geometry and a rotation.
 */

// --- hex prisms -------------------------------------------------------------

/** Facing the camera, flat top — heads, shoulders, feet, slabs. */
export const FLAT = new THREE.CylinderGeometry(0.5, 0.5, 1, 6).rotateX(Math.PI / 2)
/** Facing the camera, turned 30° so a vertex leads — chest, pelvis. Stops a
 *  stack of plates from reading as one extruded column. */
export const POINT = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1, false, Math.PI / 6).rotateX(Math.PI / 2)
/** Standing up. scale = [width, LENGTH, depth]. */
export const COLUMN = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1, false, Math.PI / 6)
/** Standing up, narrowing away from the body — limbs, trunks, spires. */
export const TAPER = new THREE.CylinderGeometry(0.5, 0.34, 1, 6, 1, false, Math.PI / 6)
/** Standing up, widening — plinths, kiln bases, the flare of a cairn foot. */
export const FLARE = new THREE.CylinderGeometry(0.34, 0.5, 1, 6, 1, false, Math.PI / 6)

/** Discs, for eyes. Never spheres: a sphere set into a head bulges out of it,
 *  and a bulging eye reads as a googly eye stuck on. */
export const DISC = new THREE.CylinderGeometry(0.5, 0.5, 1, 18).rotateX(Math.PI / 2)
export const BALL = new THREE.SphereGeometry(0.5, 12, 9)
export const ROD = new THREE.CylinderGeometry(0.5, 0.5, 1, 8)

/**
 * A box with every edge cut back at 45 degrees. This is the workhorse: it is
 * what a quarried block looks like after a few decades of weather, and it is the
 * difference between a wall that reads as masonry and a wall that reads as a
 * cube from a tutorial.
 *
 * Built as an extruded chamfered rectangle rather than by beveling a BoxGeometry
 * so the cut is EXACTLY `cut` units on every axis regardless of the box's aspect
 * — a proportional bevel makes a long thin block look like a lozenge.
 */
export function chamferBox(w, h, d, cut = 0.08) {
  const c = Math.min(cut, w * 0.4, h * 0.4, d * 0.4)
  const shape = new THREE.Shape()
  const hw = w / 2, hh = h / 2
  shape.moveTo(-hw + c, -hh)
  shape.lineTo(hw - c, -hh)
  shape.lineTo(hw, -hh + c)
  shape.lineTo(hw, hh - c)
  shape.lineTo(hw - c, hh)
  shape.lineTo(-hw + c, hh)
  shape.lineTo(-hw, hh - c)
  shape.lineTo(-hw, -hh + c)
  shape.closePath()
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: d - c * 2, bevelEnabled: true, bevelSize: c, bevelThickness: c, bevelSegments: 1, curveSegments: 1,
  })
  geo.translate(0, 0, -(d - c * 2) / 2)
  geo.computeVertexNormals()
  return geo
}

/** A wedge — half a chamfered box cut on the diagonal. Roofs and buttresses. */
export function wedge(w, h, d) {
  const geo = new THREE.BufferGeometry()
  const hw = w / 2, hd = d / 2
  // prettier-ignore
  const v = new Float32Array([
    -hw, 0, -hd,  hw, 0, -hd,  hw, 0, hd,   -hw, 0, -hd,  hw, 0, hd,   -hw, 0, hd,      // floor
    -hw, 0, hd,   hw, 0, hd,   hw, h, 0,    -hw, 0, hd,   hw, h, 0,    -hw, h, 0,       // front slope
    hw, 0, -hd,   -hw, 0, -hd, -hw, h, 0,   hw, 0, -hd,   -hw, h, 0,   hw, h, 0,        // back slope
    hw, 0, hd,    hw, 0, -hd,  hw, h, 0,                                                 // right cap
    -hw, 0, -hd,  -hw, 0, hd,  -hw, h, 0,                                                // left cap
  ])
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
  geo.computeVertexNormals()
  return geo
}

/**
 * A lumpy stone: a hex prism with every vertex pushed out along its own normal
 * by a seeded amount. One function makes every rock, boulder, pebble body and
 * cairn block in the game, which is why they all read as the same rock.
 */
export function stoneLump(seed = 1, { radius = 0.5, height = 0.8, jitter = 0.22, sides = 6 } = {}) {
  const geo = new THREE.CylinderGeometry(radius * 0.82, radius, height, sides, 2)
  const pos = geo.attributes.position
  let s = seed >>> 0
  const rand = () => {
    s = (Math.imul(s ^ (s >>> 15), s | 1) + 0x6d2b79f5) >>> 0
    return ((s ^ (s >>> 14)) >>> 0) / 4294967296
  }
  const v = new THREE.Vector3()
  // Vertices at the same position must move together or the prism splits open
  // along its seam; a hash of the rounded position is what keeps them welded.
  const moved = new Map()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const key = `${v.x.toFixed(3)}|${v.y.toFixed(3)}|${v.z.toFixed(3)}`
    let off = moved.get(key)
    if (!off) {
      off = [(rand() - 0.5) * jitter, (rand() - 0.5) * jitter * 0.6, (rand() - 0.5) * jitter]
      moved.set(key, off)
    }
    pos.setXYZ(i, v.x + off[0], v.y + off[1], v.z + off[2])
  }
  geo.computeVertexNormals()
  return geo
}

// --- materials --------------------------------------------------------------

/** Flat shading everywhere on solid stone. It is not a stylistic tic: the whole
 *  kit is faceted, and smooth normals across a six-sided prism erase the facets
 *  that were the entire reason for using one. */
export const stoneMat = (color, extra = {}) =>
  new THREE.MeshLambertMaterial({ color: new THREE.Color().setStyle(color, THREE.SRGBColorSpace), flatShading: true, ...extra })

export const softMat = (color, extra = {}) =>
  new THREE.MeshLambertMaterial({ color: new THREE.Color().setStyle(color, THREE.SRGBColorSpace), ...extra })

export const glowMat = (color, intensity = 1) => {
  const c = new THREE.Color().setStyle(color, THREE.SRGBColorSpace)
  return new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(intensity) })
}

/** The shard material: the one thing in the valley allowed to look wet. */
export const shardMat = () =>
  new THREE.MeshStandardMaterial({
    color: new THREE.Color().setStyle(UI.rose, THREE.SRGBColorSpace),
    emissive: new THREE.Color().setStyle(UI.roseDeep, THREE.SRGBColorSpace),
    emissiveIntensity: 0.55,
    flatShading: true,
    ...M.shard,
  })

// --- assembly ---------------------------------------------------------------

/**
 * Bake a list of `{ geometry, position, scale, rotation, color }` parts into one
 * geometry with baked vertex colours. This is what turns a twelve-mesh tree into
 * a one-draw-call instanced tree, and it is why a hundred trees cost what one
 * costs.
 */
export function bake(parts) {
  const geos = []
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const col = new THREE.Color()
  for (const p of parts) {
    const g = p.geometry.clone()
    e.set(...(p.rotation ?? [0, 0, 0]))
    q.setFromEuler(e)
    m.compose(
      new THREE.Vector3(...(p.position ?? [0, 0, 0])),
      q,
      new THREE.Vector3(...(typeof p.scale === 'number' ? [p.scale, p.scale, p.scale] : (p.scale ?? [1, 1, 1]))),
    )
    g.applyMatrix4(m)
    // Strip everything that is not position or normal. mergeGeometries refuses a
    // set whose members disagree about which attributes exist, and the kit mixes
    // primitives that carry uv (cylinders, extrusions) with ones that do not
    // (the hand-wound wedge) — so the union has to be forced, not hoped for.
    for (const key of Object.keys(g.attributes)) {
      if (key !== 'position' && key !== 'normal') g.deleteAttribute(key)
    }
    const n = g.attributes.position.count
    col.setStyle(p.color ?? UI.stone, THREE.SRGBColorSpace)
    const rgb = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      rgb[i * 3] = col.r
      rgb[i * 3 + 1] = col.g
      rgb[i * 3 + 2] = col.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(rgb, 3))
    geos.push(g)
  }
  // mergeGeometries refuses a mixed indexed/non-indexed set, and half the kit is
  // indexed and half is not, so everything is flattened first.
  const merged = mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)), false)
  for (const g of geos) g.dispose()
  merged.computeBoundingSphere()
  return merged
}

/** A mesh whose colours came from `bake`. */
export const bakedMat = (extra = {}) => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, ...extra })
