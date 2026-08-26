import * as THREE from 'three'
import { applyWrappedLight, bake, bakedMat, BALL, COLUMN, FLAT, POINT, TAPER } from '../core/kit.js'
import { C } from '../core/palette.js'
import { cropAt, FORM } from '../game/crops.js'
import { LEVEL, N } from './grid.js'
import { applyWindSway } from './weather.js'

/**
 * The crops, as geometry.
 *
 * Thirteen instanced meshes cover twelve crops at five stages: one sprout that
 * every crop shares, one plant per form scaled to three of the stages, and one
 * ripe form per form. Authoring sixty separate meshes would be sixty draw calls
 * and sixty things to keep in step; the stage that actually needs its own shape
 * is the ripe one, because the fruit is the thing the player is scanning for.
 *
 * Colour comes from the instance buffer, not the geometry, which is what lets a
 * field of emberberry and a field of rustbean share a mesh and still be told
 * apart at a glance.
 */

// A young plant, per form. Everything is authored in cream and tinted per
// instance — bake() writes vertex colours, and `instanceColor` multiplies them,
// so a white-ish base is the only way the tint comes out as the tint.
const PALE = '#ffffff'

function plantGeometry(form) {
  const parts = []
  switch (form) {
    case FORM.GRAIN:
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4
        parts.push({ geometry: TAPER, position: [Math.cos(a) * 0.07, 0.3, Math.sin(a) * 0.07], scale: [0.055, 0.6, 0.055], rotation: [Math.sin(a) * 0.12, a, Math.cos(a) * 0.12], color: PALE })
      }
      break
    case FORM.VINE:
      parts.push({ geometry: COLUMN, position: [0, 0.14, 0], scale: [0.05, 0.28, 0.05], color: PALE })
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2
        parts.push({ geometry: FLAT, position: [Math.cos(a) * 0.19, 0.2 + (i % 2) * 0.1, Math.sin(a) * 0.19], scale: [0.24, 0.05, 0.24], color: PALE })
      }
      break
    case FORM.ROOT:
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.7
        parts.push({ geometry: TAPER, position: [Math.cos(a) * 0.09, 0.16, Math.sin(a) * 0.09], scale: [0.075, 0.34, 0.075], rotation: [Math.sin(a) * 0.42, a, Math.cos(a) * 0.42], color: PALE })
      }
      break
    case FORM.FUNGUS:
      parts.push({ geometry: COLUMN, position: [0, 0.09, 0], scale: [0.08, 0.18, 0.08], color: PALE })
      break
    case FORM.BULB:
      parts.push({ geometry: TAPER, position: [0, 0.2, 0], scale: [0.1, 0.4, 0.1], color: PALE })
      parts.push({ geometry: TAPER, position: [0.09, 0.17, 0.03], scale: [0.07, 0.32, 0.07], rotation: [0.1, 0, -0.3], color: PALE })
      break
    default: // LEAFY
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.2
        parts.push({ geometry: FLAT, position: [Math.cos(a) * 0.13, 0.13 + (i % 2) * 0.06, Math.sin(a) * 0.13], scale: [0.26, 0.06, 0.22], rotation: [0, a, 0.3], color: PALE })
      }
  }
  return bake(parts)
}

/** The ripe plant: the young one, plus whatever the player is here for. Fruit
 *  is authored in a second, brighter tone so the instance tint lands on both. */
function ripeGeometry(form) {
  const parts = []
  switch (form) {
    case FORM.GRAIN:
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.4
        const lean = 0.16
        parts.push({ geometry: TAPER, position: [Math.cos(a) * 0.08, 0.34, Math.sin(a) * 0.08], scale: [0.06, 0.68, 0.06], rotation: [Math.sin(a) * lean, a, Math.cos(a) * lean], color: PALE })
        parts.push({ geometry: POINT, position: [Math.cos(a) * 0.15, 0.7, Math.sin(a) * 0.15], scale: [0.1, 0.24, 0.1], color: PALE })
      }
      break
    case FORM.VINE:
      parts.push({ geometry: COLUMN, position: [0, 0.16, 0], scale: [0.06, 0.32, 0.06], color: PALE })
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        parts.push({ geometry: FLAT, position: [Math.cos(a) * 0.21, 0.22 + (i % 2) * 0.1, Math.sin(a) * 0.21], scale: [0.26, 0.05, 0.26], color: PALE })
        if (i % 2 === 0) parts.push({ geometry: BALL, position: [Math.cos(a) * 0.24, 0.34, Math.sin(a) * 0.24], scale: [0.15, 0.15, 0.15], color: PALE })
      }
      break
    case FORM.ROOT:
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.7
        parts.push({ geometry: TAPER, position: [Math.cos(a) * 0.1, 0.2, Math.sin(a) * 0.1], scale: [0.08, 0.42, 0.08], rotation: [Math.sin(a) * 0.42, a, Math.cos(a) * 0.42], color: PALE })
      }
      // The shoulder of the root, breaking the soil. Half of the pleasure of a
      // root crop is seeing it about to be ready.
      parts.push({ geometry: BALL, position: [0, 0.07, 0], scale: [0.3, 0.22, 0.3], color: PALE })
      break
    case FORM.FUNGUS:
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 1.1
        const r = 0.13
        parts.push({ geometry: COLUMN, position: [Math.cos(a) * r, 0.1, Math.sin(a) * r], scale: [0.08, 0.2, 0.08], color: PALE })
        parts.push({ geometry: TAPER, position: [Math.cos(a) * r, 0.23, Math.sin(a) * r], scale: [0.28, 0.13, 0.28], color: PALE })
      }
      break
    case FORM.BULB:
      parts.push({ geometry: TAPER, position: [0, 0.24, 0], scale: [0.11, 0.48, 0.11], color: PALE })
      parts.push({ geometry: TAPER, position: [0.1, 0.2, 0.04], scale: [0.08, 0.38, 0.08], rotation: [0.1, 0, -0.3], color: PALE })
      parts.push({ geometry: POINT, position: [0, 0.52, 0], scale: [0.24, 0.3, 0.24], color: PALE })
      break
    default: // LEAFY
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.2
        parts.push({ geometry: FLAT, position: [Math.cos(a) * 0.16, 0.16 + (i % 2) * 0.07, Math.sin(a) * 0.16], scale: [0.3, 0.06, 0.26], rotation: [0, a, 0.3], color: PALE })
      }
      parts.push({ geometry: POINT, position: [0, 0.32, 0], scale: [0.22, 0.18, 0.22], color: PALE })
  }
  return bake(parts)
}

const SPROUT = () => bake([
  { geometry: TAPER, position: [0, 0.05, 0], scale: [0.035, 0.1, 0.035], color: PALE },
  { geometry: FLAT, position: [0.045, 0.1, 0], scale: [0.12, 0.03, 0.09], rotation: [0, 0, 0.35], color: PALE },
  { geometry: FLAT, position: [-0.045, 0.1, 0], scale: [0.12, 0.03, 0.09], rotation: [0, 0, -0.35], color: PALE },
])

const FORMS = [FORM.LEAFY, FORM.GRAIN, FORM.VINE, FORM.ROOT, FORM.FUNGUS, FORM.BULB]
const MAX = 700

export class CropView {
  constructor(grid) {
    this.grid = grid
    this.group = new THREE.Group()
    this.group.name = 'crops'
    this.material = applyWrappedLight(applyWindSway(bakedMat(), 0.75))
    this.dirty = true

    const make = (geo) => {
      const m = new THREE.InstancedMesh(geo, this.material, MAX)
      m.count = 0
      m.castShadow = true
      m.receiveShadow = true
      m.frustumCulled = false
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      // instanceColor has to exist before the first setColorAt or three throws.
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3).fill(1), 3)
      m.instanceColor.setUsage(THREE.DynamicDrawUsage)
      this.group.add(m)
      return m
    }
    this.sprout = make(SPROUT())
    this.plants = FORMS.map((f) => make(plantGeometry(f)))
    this.ripe = FORMS.map((f) => make(ripeGeometry(f)))

    this._m = new THREE.Matrix4()
    this._q = new THREE.Quaternion()
    this._e = new THREE.Euler()
    this._p = new THREE.Vector3()
    this._s = new THREE.Vector3()
    this._c = new THREE.Color()
    this._t = 0
  }

  rebuild(stageFor) {
    const counts = new Map()
    const { grid } = this
    const bump = (mesh) => {
      const n = counts.get(mesh) ?? 0
      counts.set(mesh, n + 1)
      return n
    }
    for (const m of [this.sprout, ...this.plants, ...this.ripe]) counts.set(m, 0)

    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const i = z * N + x
        const cv = grid.crop[i]
        if (!cv) continue
        const c = cropAt(cv)
        if (!c) continue
        const stage = stageFor(c.id, grid.grown[i])
        const y = grid.height[i] * LEVEL
        const form = FORMS.indexOf(c.form)

        let mesh, scale, tint
        if (stage === 0) {
          mesh = this.sprout
          scale = 1
          tint = c.stem
        } else if (stage < 4) {
          mesh = this.plants[form]
          scale = [0.5, 0.74, 1][stage - 1] * (c.height / 0.5)
          tint = c.leaf
        } else {
          mesh = this.ripe[form]
          scale = c.height / 0.5
          tint = c.fruit
        }
        const idx = bump(mesh)
        if (idx >= MAX) continue

        // A per-cell yaw so a planted row is not forty copies of one silhouette.
        const yaw = ((Math.imul(x + 7, 0x27d4eb2d) ^ Math.imul(z + 13, 0x165667b1)) >>> 8) / 16777216 * Math.PI * 2
        this._e.set(0, yaw, 0)
        this._q.setFromEuler(this._e)
        this._p.set(x + 0.5, y, z + 0.5)
        this._s.setScalar(scale)
        this._m.compose(this._p, this._q, this._s)
        mesh.setMatrixAt(idx, this._m)
        mesh.setColorAt(idx, this._c.setStyle(tint, THREE.SRGBColorSpace))
      }
    }

    for (const [mesh, n] of counts) {
      mesh.count = Math.min(n, MAX)
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
    this.dirty = false
  }

  update(dt, stageFor) {
    if (this.dirty) this.rebuild(stageFor)
    // A slow sway on the whole field, from one uniform-free trick: rotate each
    // mesh's group a hair. Real per-plant wind would need a custom shader and
    // nobody would see the difference at this camera height.
    this._t += dt
    this.group.rotation.z = Math.sin(this._t * 0.8) * 0.006
  }

  dispose() {
    for (const m of [this.sprout, ...this.plants, ...this.ripe]) {
      m.geometry.dispose()
      m.dispose()
    }
    this.material.dispose()
    this.group.clear()
  }
}

export const CROP_MATERIAL_TINT = C.shrub
