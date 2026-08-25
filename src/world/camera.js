import * as THREE from 'three'
import { damp } from '../core/rng.js'

/**
 * The camera rig.
 *
 * Four yaws, ninety degrees apart, and nothing in between. A free-orbit camera
 * in a game played on a square grid is a camera that will spend the whole game
 * a few degrees off axis, which makes "the tile in front of me" ambiguous every
 * single time the player presses a tool key. Q and R snap; the snap is damped so
 * it reads as a turn rather than a cut.
 *
 * Pitch rises with distance. Zoomed in you are almost level with the settler and
 * can read their face; pulled back you are looking down at the field, which is
 * the view you actually want when planning where to plant.
 */

const YAW_STEP = Math.PI / 2
const MIN_D = 6
const MAX_D = 26

export class CameraRig {
  constructor(camera) {
    this.camera = camera
    this.yawIndex = 0
    this.yaw = 0
    this.distance = 13
    this.targetDistance = 13
    this.focus = new THREE.Vector3()
    this.smoothed = new THREE.Vector3()
    this.shake = 0
    this._first = true
    this._off = new THREE.Vector3()
  }

  /** The yaw the player controller resolves its input against. */
  get inputYaw() { return this.yaw }

  rotate(dir) { this.yawIndex += dir }

  update(dt, target, input) {
    if (input) {
      if (input.pressed('rotL')) this.rotate(1)
      if (input.pressed('rotR')) this.rotate(-1)
      if (input.zoom) this.targetDistance = Math.min(MAX_D, Math.max(MIN_D, this.targetDistance + input.zoom * 1.6))
    }
    this.yaw = damp(this.yaw, this.yawIndex * YAW_STEP, 7, dt)
    this.distance = damp(this.distance, this.targetDistance, 7, dt)

    this.focus.set(target.x, target.y + 1.1, target.z)
    if (this._first) {
      this.smoothed.copy(this.focus)
      this._first = false
    }
    // The focus lags the player, not the other way round. A camera pinned
    // rigidly to a walking body makes the whole world appear to shiver.
    this.smoothed.x = damp(this.smoothed.x, this.focus.x, 9, dt)
    this.smoothed.z = damp(this.smoothed.z, this.focus.z, 9, dt)
    // Vertical lags harder: stepping down a terrace should not throw the camera.
    this.smoothed.y = damp(this.smoothed.y, this.focus.y, 4.5, dt)

    const t = (this.distance - MIN_D) / (MAX_D - MIN_D)
    const pitch = 0.35 + t * 0.42
    this._off.set(
      Math.sin(this.yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(this.yaw) * Math.cos(pitch),
    ).multiplyScalar(this.distance)

    this.shake = Math.max(0, this.shake - dt * 1.6)
    const s = this.shake * this.shake
    this.camera.position.copy(this.smoothed).add(this._off)
    if (s > 0.0001) {
      // Shake the CAMERA, never the world. Shaking the world moves the shadow
      // frustum and the fog with it and the whole frame swims.
      this.camera.position.x += (Math.random() - 0.5) * s * 0.9
      this.camera.position.y += (Math.random() - 0.5) * s * 0.7
      this.camera.position.z += (Math.random() - 0.5) * s * 0.9
    }
    this.camera.lookAt(this.smoothed)
    return this.smoothed
  }

  /** 0..1. A tremor calls this; nothing else should. */
  kick(amount = 1) { this.shake = Math.min(1.4, this.shake + amount) }
}
