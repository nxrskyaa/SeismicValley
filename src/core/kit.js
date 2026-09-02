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
  /**
   * THE SHAPE IS INSET BY THE BEVEL, because the bevel grows OUTWARD.
   *
   * `bevelSize` pushes the extruded outline out by `c` in the shape plane, so a
   * shape drawn at w x h comes back measuring (w + 2c) x (h + 2c). The depth is
   * unaffected — the extrusion is shortened by exactly what the two bevel caps
   * add back. Nobody noticed for the life of the project because it is not a
   * uniform scale: X and Y grew and Z did not.
   *
   * `BLOCK`, the unit cube every rig is plated with, was therefore
   * 1.32 x 1.32 x 1.00 — every part in the game 32% too wide and too tall and
   * the right depth, which is why figures kept reading as bloated side-on and
   * flat front-on however carefully their proportions were measured off the
   * reference. Thin plates had it far worse: a 0.065 seam came back 0.117, near
   * double, since the 2c is a constant and not a fraction.
   *
   * So the outline is drawn inset and the bevel puts it back. `chamferBox(w, h,
   * d)` now measures w x h x d, and the numbers written at every call site are
   * the numbers you get.
   */
  const c = Math.min(cut, w * 0.2, h * 0.2, d * 0.4)
  const shape = new THREE.Shape()
  const hw = w / 2 - c, hh = h / 2 - c
  // The corner cut, kept inside the inset rectangle so the outline stays convex
  // on parts too thin to carry the full chamfer.
  const k = Math.min(c, hw * 0.8, hh * 0.8)
  shape.moveTo(-hw + k, -hh)
  shape.lineTo(hw - k, -hh)
  shape.lineTo(hw, -hh + k)
  shape.lineTo(hw, hh - k)
  shape.lineTo(hw - k, hh)
  shape.lineTo(-hw + k, hh)
  shape.lineTo(-hw, hh - k)
  shape.lineTo(-hw, -hh + k)
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

/**
 * Stack a shader patch onto a material.
 *
 * `onBeforeCompile` is a single slot, and by now two separate systems want it:
 * the wind sway and the wrapped light. Assigning it twice silently drops the
 * first one — the trees stop moving and nothing anywhere says so. This keeps a
 * list and runs all of them, so a material can carry both.
 */
export function patchShader(material, key, fn) {
  const patches = material.userData.patches ?? (material.userData.patches = new Map())
  if (patches.has(key)) return material
  patches.set(key, fn)
  material.onBeforeCompile = (shader, renderer) => {
    for (const patch of patches.values()) patch(shader, renderer)
  }
  material.needsUpdate = true
  return material
}

/**
 * WRAPPED LAMBERT, ported from Velion's voxel shader.
 *
 * Plain Lambert takes a face pointing away from the sun to ambient alone, and in
 * a world built entirely out of cubes that means every riser, trunk and wall on
 * the shaded side crushes into one dark mass — the terraces stop reading as
 * steps and the valley reads as a stain. Wrapping the term keeps the falloff but
 * lifts the floor, so a shaded face is still a face.
 *
 * 0.42 is Velion's number and it is not a small effect: it is most of the
 * difference between that build's terraces and this one's.
 */
export function applyWrappedLight(material, wrap = 0.42) {
  return patchShader(material, 'wrap', (shader) => {
    shader.uniforms.uWrap = { value: wrap }
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uWrap;`)
      .replace(
        'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );',
        `float dotNL = dot( geometryNormal, directLight.direction );
         dotNL = saturate( dotNL * ( 1.0 - uWrap ) + uWrap );`,
      )
  })
}

/** A mesh whose colours came from `bake`. */
export const bakedMat = (extra = {}) => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, ...extra })

/**
 * THE SOFT PATCH OF SHADOW A BODY STANDS IN.
 *
 * The valley's static things are shaded into the terrain itself — see
 * `world/occlusion.js`, and the 0.87 multiplier measured off the reference
 * footage. Things that MOVE cannot be baked into the ground, so they carry one
 * of these instead. There are five of them in the valley, not five hundred, so
 * a transparent quad each costs nothing worth counting.
 *
 * This is not a cast shadow and the shadow map stays off: no direction, no
 * silhouette, no penumbra that swings with the sun. It is the contact darkening
 * that stops a body reading as pasted onto the ground — which is exactly how
 * the player and the dog did read, standing on a flat sheet with nothing under
 * them at all.
 *
 * Parented to a rig's root, which every actor already places at ground level,
 * so it needs no per-frame update and cannot drift out of step with the body.
 */
let SHADOW_TEX = null
function shadowTexture() {
  if (SHADOW_TEX) return SHADOW_TEX
  const size = 64
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  // Solid to nothing over the radius, with the falloff weighted outward so the
  // core reads as contact and the edge never shows a rim.
  g.addColorStop(0, 'rgba(0,0,0,1)')
  g.addColorStop(0.45, 'rgba(0,0,0,0.72)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  SHADOW_TEX = new THREE.CanvasTexture(c)
  SHADOW_TEX.colorSpace = THREE.SRGBColorSpace
  return SHADOW_TEX
}

export function contactShadow(radius = 0.5, strength = 0.13) {
  // No canvas in the headless tools, and a rig has to build without a DOM.
  if (typeof document === 'undefined') return null
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: shadowTexture(),
      transparent: true,
      opacity: strength,
      depthWrite: false,
      // The ground is drawn first and the quad sits a hair above it; without the
      // offset the two z-fight along every terrace lip.
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  )
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = 0.02
  mesh.scale.setScalar(radius * 2)
  mesh.renderOrder = 1
  mesh.name = 'contact-shadow'
  return mesh
}
