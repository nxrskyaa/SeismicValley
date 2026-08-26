import * as THREE from 'three'
import { bake, bakedMat, chamferBox, patchShader } from '../core/kit.js'
import { SEASON_NAMES } from '../game/crops.js'
import { rng } from '../core/rng.js'

/**
 * WIND, and the things it carries.
 *
 * A valley of flat plateaus and hard-edged cubes has one weakness and it is that
 * nothing in it moves. The terraces are static, the trees are static, the light
 * changes over fifteen minutes. Stand still for five seconds and the frame is a
 * photograph. Wind is the cheapest possible fix and it works on two levels at
 * once:
 *
 *   THE FIELD    One direction that turns slowly, with gusts on top. Everything
 *                reads from it — the vertex sway on every tree and tuft, the
 *                petals in the air, the flag on the ridge — so all of it agrees.
 *                Two objects blowing different ways is worse than neither
 *                moving at all.
 *   THE DRIFT    A few hundred small flat things in the air, respawned around
 *                the player as they walk so the sky is never empty and never
 *                costs more than one draw call.
 *
 * ## The sway is a vertex shader, not an animation
 *
 * Every prop in the valley is one of eleven InstancedMeshes. Animating them on
 * the CPU means rewriting thirty thousand matrices a frame; animating them in
 * the vertex shader means one uniform. `instanceMatrix[3].xyz` gives each copy
 * its own phase, so a stand of trees ripples instead of swinging in lockstep,
 * and `transformed.y` is already height above the instance origin — so a trunk
 * base is pinned and a canopy moves, for free.
 *
 * ## The drift is seasonal
 *
 * Thaw blows petals, Longlight blows pollen, Rust blows leaves, Still blows ash
 * off the scar. Same system, four palettes and four gravities: a petal falls
 * slower than a leaf and ash barely falls at all.
 */

/**
 * The shared field. `xz` is the unit direction, `t` is a phase in seconds, `s`
 * is strength 0..1 — packed into one vec4 because that is exactly what the
 * shader wants and a uniform per component is three more lookups.
 */
export const WIND = { value: new THREE.Vector4(0.7, 0.7, 0, 0.5) }

/** Patch a material to sway with the field. Idempotent, and composes with the
 *  wrapped light — `onBeforeCompile` is one slot and two systems want it. */
export function applyWindSway(material, amount = 1) {
  return patchShader(material, 'wind', (shader) => {
    shader.uniforms.uWind = WIND
    shader.uniforms.uSway = { value: amount }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform vec4 uWind;
        uniform float uSway;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          // The instance's own translation, which is all this needs for a phase
          // offset — and it is already in the vertex shader for free.
          #ifdef USE_INSTANCING
            vec3 wio = instanceMatrix[3].xyz;
          #else
            vec3 wio = vec3(0.0);
          #endif
          float wh = max(transformed.y, 0.0);
          // Height to the 1.4 rather than linear: a trunk is nearly rigid at the
          // bottom and the canopy carries almost all of the motion, which is how
          // a tree actually bends and is what stops the whole prop shearing.
          float wamp = pow(wh, 1.4) * 0.026 * uSway * (0.35 + uWind.w * 0.9);
          float wph = uWind.z * 1.5 + wio.x * 0.33 + wio.z * 0.27;
          float ws = sin(wph) * 0.72 + sin(wph * 2.37 + 1.1) * 0.28;
          transformed.x += ws * wamp * uWind.x;
          transformed.z += ws * wamp * uWind.y;
        }`)
  })
}

/**
 * What is in the air, by season. `fall` is metres per second downward, `flutter`
 * how hard it tumbles, `rate` how much of it there is.
 */
const DRIFT = {
  Thaw: {
    tones: ['#e8b9cc', '#f0d2dc', '#e6dcc8', '#d9a8bc'],
    fall: 0.34, flutter: 1.5, rate: 1, size: 1,
  },
  Longlight: {
    tones: ['#e8e2b8', '#f2ecd0', '#d8dca8', '#efe4c2'],
    // Pollen. Barely falls, barely tumbles, and there is a lot of it.
    fall: 0.1, flutter: 0.5, rate: 1.25, size: 0.62,
  },
  Rust: {
    tones: ['#c47a4a', '#a85f3c', '#d9a05a', '#8f5540'],
    // Leaves are heavier and tumble hardest. The most visible weather of the
    // four, and the season most players will remember the look of.
    fall: 0.62, flutter: 2.4, rate: 1.1, size: 1.35,
  },
  Still: {
    tones: ['#c8c4d6', '#d8d4e2', '#b0a8c4', '#e4e0ea'],
    // Ash off the scar. It hangs.
    fall: 0.14, flutter: 0.7, rate: 0.85, size: 0.8,
  },
}

const COUNT = 260
/** The box the drift lives in, centred on wherever the camera is looking. A
 *  particle that leaves it is not moved back — it is re-rolled on the upwind
 *  face, which is the difference between weather and a snow globe. */
const SPAN = 34
const TOP = 13

/** One petal: two thin plates at a slight angle, so it catches the light on one
 *  side and goes nearly edge-on as it tumbles. A single quad reads as a sprite. */
function petalGeometry(tone, size) {
  return bake([
    { geometry: chamferBox(0.19 * size, 0.02 * size, 0.12 * size, 0.01), position: [0, 0, 0], color: tone },
    { geometry: chamferBox(0.13 * size, 0.02 * size, 0.16 * size, 0.01), position: [0.05 * size, 0.012 * size, 0.02 * size], rotation: [0, 0.5, 0.25], color: tone },
  ])
}

export class Weather {
  constructor(grid) {
    this.grid = grid
    this.group = new THREE.Group()
    this.group.name = 'weather'
    this.rand = rng(0x5eed)
    this.t = 0

    // The field's own slow state. Direction turns over minutes; the gust rides
    // on top of it on a much shorter clock.
    this.angle = this.rand() * Math.PI * 2
    this.targetAngle = this.angle
    this.turnIn = 8
    this.gust = 0.4
    this.gustIn = 3

    this.season = SEASON_NAMES[0]
    this.mesh = null
    this.tones = []
    this.build(this.season)

    this.parts = []
    for (let i = 0; i < COUNT; i++) {
      this.parts.push({
        p: new THREE.Vector3(),
        spin: new THREE.Vector3(this.rand() * 6.28, this.rand() * 6.28, this.rand() * 6.28),
        rate: 0.4 + this.rand() * 1.6,
        drag: 0.55 + this.rand() * 0.8,
        size: 0.7 + this.rand() * 0.8,
        tone: i % 4,
        seed: this.rand() * 100,
      })
    }
    // Not scattered yet: the first fill has to happen around wherever the
    // player actually is. Seeding at the origin and letting the field carry
    // them in leaves a visible clump drifting across the valley for a minute.
    this._seeded = false

    this._m = new THREE.Matrix4()
    this._q = new THREE.Quaternion()
    this._e = new THREE.Euler()
    this._s = new THREE.Vector3()
    this._counts = [0, 0, 0, 0]
  }

  /** Four instanced meshes, one per tone — one mesh with a colour attribute
   *  would be one draw call instead of four, and four is already nothing. */
  build(season) {
    for (const m of this.meshes ?? []) {
      m.geometry.dispose()
      this.group.remove(m)
    }
    const spec = DRIFT[season] ?? DRIFT.Thaw
    this.spec = spec
    this.material ??= bakedMat({ transparent: true, opacity: 0.92 })
    this.meshes = spec.tones.map((tone) => {
      const m = new THREE.InstancedMesh(petalGeometry(tone, spec.size), this.material, Math.ceil(COUNT / 2))
      m.count = 0
      m.frustumCulled = false
      m.renderOrder = 8
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      this.group.add(m)
      return m
    })
    this.season = season
  }

  /** Put one particle back in the air. On a respawn it comes in from the upwind
   *  edge; on the first fill it is scattered through the whole volume. */
  _roll(part, focus, scatter = false) {
    const dx = Math.cos(this.angle)
    const dz = Math.sin(this.angle)
    const r = this.rand
    if (scatter) {
      part.p.set(focus.x + (r() - 0.5) * SPAN, focus.y + r() * TOP, focus.z + (r() - 0.5) * SPAN)
    } else {
      const across = (r() - 0.5) * SPAN
      part.p.set(
        focus.x - dx * SPAN * 0.55 - dz * across,
        focus.y + 1.5 + r() * (TOP - 1.5),
        focus.z - dz * SPAN * 0.55 + dx * across,
      )
    }
    part.life = 0
  }

  /** The field, sampled. Everything that wants to know which way the wind is
   *  blowing asks here rather than reading the uniform. */
  get direction() { return { x: Math.cos(this.angle), z: Math.sin(this.angle), strength: this.gust } }

  update(dt, focus, season, sky) {
    this.t += dt
    if (!this._seeded) {
      for (const part of this.parts) this._roll(part, focus, true)
      this._seeded = true
    }
    if (season && season !== this.season) this.build(season)

    // --- the field ----------------------------------------------------------
    this.turnIn -= dt
    if (this.turnIn <= 0) {
      // A new heading within about 50 degrees of the old one. A wind that can
      // reverse in one step is not a wind, it is a bug the player can see.
      this.targetAngle = this.angle + (this.rand() - 0.5) * 1.8
      this.turnIn = 12 + this.rand() * 26
    }
    this.angle += (this.targetAngle - this.angle) * Math.min(1, dt * 0.12)

    this.gustIn -= dt
    if (this.gustIn <= 0) {
      this.gustTarget = 0.18 + this.rand() * this.rand() * 1.1 // biased low: mostly calm, occasionally hard
      this.gustIn = 2.5 + this.rand() * 7
    }
    this.gust += ((this.gustTarget ?? 0.4) - this.gust) * Math.min(1, dt * 0.7)

    WIND.value.set(Math.cos(this.angle), Math.sin(this.angle), this.t, this.gust)

    // --- the drift ----------------------------------------------------------
    const spec = this.spec
    const speed = (1.1 + this.gust * 3.4)
    const dx = Math.cos(this.angle) * speed
    const dz = Math.sin(this.angle) * speed
    this._counts.fill(0)

    for (const part of this.parts) {
      part.life += dt
      const p = part.p
      p.x += dx * part.drag * dt
      p.z += dz * part.drag * dt
      p.y -= spec.fall * part.drag * dt
      // A lateral wobble so nothing travels in a straight line. Two frequencies,
      // because one reads as a sine wave and that is exactly what it is.
      const w = this.t * part.rate + part.seed
      p.x += Math.sin(w * 1.7) * spec.flutter * 0.12 * dt * 6
      p.z += Math.cos(w * 1.3) * spec.flutter * 0.12 * dt * 6
      p.y += Math.sin(w * 0.9) * spec.flutter * 0.05 * dt * 6

      const ground = this.grid.sampleY(p.x, p.z)
      const out = Math.abs(p.x - focus.x) > SPAN * 0.62 || Math.abs(p.z - focus.z) > SPAN * 0.62
      if (p.y < ground + 0.1 || p.y > focus.y + TOP + 4 || out) {
        this._roll(part, focus)
        continue
      }

      const mesh = this.meshes[part.tone]
      const i = this._counts[part.tone]
      if (i >= mesh.instanceMatrix.count) continue
      this._counts[part.tone]++
      // Tumbling. All three axes, at different rates, so no two are ever in the
      // same attitude and the batch never flickers as one.
      this._e.set(
        part.spin.x + w * spec.flutter * 0.9,
        part.spin.y + w * spec.flutter * 0.5,
        part.spin.z + w * spec.flutter * 1.3,
      )
      this._q.setFromEuler(this._e)
      this._s.setScalar(part.size)
      this._m.compose(p, this._q, this._s)
      mesh.setMatrixAt(i, this._m)
    }

    for (let i = 0; i < this.meshes.length; i++) {
      this.meshes[i].count = this._counts[i]
      this.meshes[i].instanceMatrix.needsUpdate = true
    }
    // Petals go out with the light. There is nothing to catch it at 2 a.m.
    this.material.opacity = 0.18 + (sky?.day ?? 1) * 0.76
  }

  dispose() {
    for (const m of this.meshes) {
      m.geometry.dispose()
      m.dispose()
    }
    this.material.dispose()
    this.group.clear()
  }
}

export { DRIFT }
