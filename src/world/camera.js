import * as THREE from 'three'
import { damp } from '../core/rng.js'

/**
 * The camera rig — fixed isometric, orthographic, snapping to 45-degree yaws.
 *
 * **Orthographic is not a stylistic accident.** With no perspective divergence
 * the terraces line up into clean stacked slabs, and that stacking is the entire
 * silhouette language of this world. A perspective lens softens it and the
 * valley immediately reads as generic low-poly — which is exactly what happened
 * when an earlier pass swapped this for a 46° perspective camera.
 *
 * The yaws are 45/135/225/315, not 0/90/180/270. On a square grid the diagonal
 * yaws are what put the cell edges at 45° to the screen and give the terraces
 * their zigzag; the axis-aligned ones flatten every cliff into a horizontal
 * band and the depth cue goes with it.
 *
 * Ported from Velion's `CameraRig.gd`, including the numbers, because they were
 * arrived at against reference footage and re-deriving them by eye is how a
 * rebuild loses the thing it was rebuilding.
 */

const PITCH = -37 * (Math.PI / 180)
const YAWS = [45, 135, 225, 315].map((d) => d * (Math.PI / 180))
// Measured off the reference: the character stands about one-eighth of the
// frame height, and at 1.72 units tall that puts the vertical span near 13.
const SIZE_DEFAULT = 13
const SIZE_MIN = 9
const SIZE_MAX = 22
/** How far back the camera sits from the player. Orthographic, so this changes
 *  nothing about the framing — it only decides how much of the world is in
 *  front of the near plane. */
const STANDOFF = 34

export class CameraRig {
  constructor(camera) {
    this.camera = camera
    this.yawIndex = 0
    this.yaw = YAWS[0]
    this.size = SIZE_DEFAULT
    this.targetSize = SIZE_DEFAULT
    this.focus = new THREE.Vector3()
    this.smoothed = new THREE.Vector3()
    this.shake = 0
    this._first = true
    this._off = new THREE.Vector3()
  }

  /** The yaw the player controller resolves its input against. */
  get inputYaw() { return this.yaw }

  /** Keep the orthographic frustum matched to the window. Called on resize and
   *  whenever the zoom changes; an ortho camera does not do this for itself the
   *  way a perspective one does with `aspect`. */
  applyFrustum() {
    const aspect = innerWidth / Math.max(1, innerHeight)
    const half = this.size / 2
    this.camera.left = -half * aspect
    this.camera.right = half * aspect
    this.camera.top = half
    this.camera.bottom = -half
    // The near plane goes NEGATIVE, which is legal for an orthographic camera
    // and is what you want: the camera is a plane, not a point, so a ridge that
    // happens to sit beside it rather than in front of it must not be clipped.
    // With a positive near, a wide zoom slices the near half of the map away.
    this.camera.near = -this.size * 4 - 60
    this.camera.far = this.size * 4 + 300
    this.camera.updateProjectionMatrix()
  }

  rotate(dir) { this.yawIndex += dir }

  update(dt, target, input) {
    if (input) {
      if (input.pressed('rotL')) this.rotate(1)
      if (input.pressed('rotR')) this.rotate(-1)
      if (input.zoom) this.targetSize = Math.min(SIZE_MAX, Math.max(SIZE_MIN, this.targetSize + input.zoom * 1.4))
    }

    // The yaw index is unbounded and the angle is derived from it, so turning
    // four times clockwise keeps turning rather than snapping back through 360.
    const wantYaw = YAWS[0] + this.yawIndex * (Math.PI / 2)
    this.yaw = damp(this.yaw, wantYaw, 7, dt)

    const size = damp(this.size, this.targetSize, 7, dt)
    if (Math.abs(size - this.size) > 1e-4) {
      this.size = size
      this.applyFrustum()
    }

    this.focus.set(target.x, target.y + 1.1, target.z)
    if (this._first) {
      this.smoothed.copy(this.focus)
      this._first = false
    }
    // Trail the player rather than locking to them; the small lag is what makes
    // the world feel like it has weight. Vertical lags harder still, so stepping
    // down a terrace does not throw the whole frame.
    this.smoothed.x = damp(this.smoothed.x, this.focus.x, 5.6, dt)
    this.smoothed.z = damp(this.smoothed.z, this.focus.z, 5.6, dt)
    this.smoothed.y = damp(this.smoothed.y, this.focus.y, 3.4, dt)

    // Pitch is FIXED. It does not open up as you zoom out: a rig whose angle
    // changes with its zoom has no stable read on which cell is in front of the
    // player, which on a grid is the one thing the camera has to preserve.
    this._off.set(
      Math.sin(this.yaw) * Math.cos(PITCH),
      -Math.sin(PITCH),
      Math.cos(this.yaw) * Math.cos(PITCH),
    ).multiplyScalar(STANDOFF)

    this.shake = Math.max(0, this.shake - dt * 1.6)
    this.camera.position.copy(this.smoothed).add(this._off)
    if (this.shake > 0.01) {
      // Shake the CAMERA, never the world. Shaking the world moves the shadow
      // frustum and the fog with it and the whole frame swims.
      const s = this.shake * this.shake * 0.5
      this.camera.position.x += (Math.random() - 0.5) * s
      this.camera.position.y += (Math.random() - 0.5) * s * 0.8
      this.camera.position.z += (Math.random() - 0.5) * s
    }
    this.camera.lookAt(this.smoothed)
    return this.smoothed
  }

  /** 0..1. Pruning and anything else that wants a jolt calls this. */
  kick(amount = 1) { this.shake = Math.min(1.4, this.shake + amount) }
}

export { SIZE_DEFAULT, SIZE_MIN, SIZE_MAX, PITCH, YAWS }
